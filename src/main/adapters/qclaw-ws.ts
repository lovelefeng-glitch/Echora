import { EventEmitter } from 'events'
import WebSocket from 'ws'
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { create, type Logger } from '../utils/console-logger'

const _log: Logger = create('QClawWS')

interface QClawWSConfig {
  port?: number
  token?: string
  host?: string
}

interface PendingRequest {
  resolve: (value: unknown) => void
  reject: (reason: Error) => void
  timeout: ReturnType<typeof setTimeout>
  method: string
}

interface DeviceIdentity {
  deviceId: string
  publicKeyPem: string
  privateKeyPem: string
}

export class QClawWSClient extends EventEmitter {
  public port: number
  public token: string
  public host: string
  public ws: WebSocket | null = null
  public connected = false
  public authenticated = false
  public pendingRequests = new Map<string, PendingRequest>()
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectDelay = 1000
  private maxReconnectDelay = 30000
  private requestId = 0
  private _reconnectCount = 0
  private _maxReconnects = 10
  private _deviceIdentity: DeviceIdentity | null = null
  private _connectReject: ((reason: Error) => void) | null = null

  constructor(config: QClawWSConfig = {}) {
    super()
    this.port = config.port || 28789
    this.token = config.token || ''
    this.host = config.host || '127.0.0.1'
    this._loadDeviceIdentity()
  }

  private _loadDeviceIdentity(): void {
    try {
      const devicePath = path.join(os.homedir(), '.qclaw', 'identity', 'device.json')
      if (fs.existsSync(devicePath)) {
        const raw = JSON.parse(fs.readFileSync(devicePath, 'utf8'))
        if (raw.deviceId && raw.publicKeyPem && raw.privateKeyPem) {
          this._deviceIdentity = raw
          _log.info('Device identity loaded: ' + raw.deviceId.substring(0, 12) + '...')
        }
      }
    } catch (e) {
      _log.warn('Device identity not found:', (e as Error).message)
    }
  }

  private _buildDeviceAuthPayload(nonce: string, signedAtMs: number, scopes: string[]): string {
    const clientId = 'openclaw-control-ui'
    const clientMode = 'webchat'
    const role = 'operator'
    const token = this.token
    const platform = process.platform
    const deviceFamily = ''
    return [
      'v3',
      this._deviceIdentity!.deviceId,
      clientId,
      clientMode,
      role,
      scopes.join(','),
      String(signedAtMs),
      token,
      nonce,
      platform,
      deviceFamily
    ].join('|')
  }

  private _signPayload(payloadStr: string): string {
    const privateKey = crypto.createPrivateKey(this._deviceIdentity!.privateKeyPem)
    const signature = crypto.sign(null, Buffer.from(payloadStr, 'utf8'), privateKey)
    return signature.toString('base64')
  }

  private _publicKeyBase64Url(): string {
    const pubKeyObj = crypto.createPublicKey(this._deviceIdentity!.publicKeyPem)
    const pubKeyDer = pubKeyObj.export({ type: 'spki', format: 'der' }) as Buffer
    const rawPubKey = pubKeyDer.subarray(pubKeyDer.length - 32)
    return rawPubKey.toString('base64url')
  }

  getWsUrl(): string {
    return `ws://${this.host}:${this.port}/ws?apiKey=${this.token}`
  }

  async connect(): Promise<boolean> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return true
    }

    return new Promise<boolean>((_resolve, reject) => {
      try {
        const wsUrl = this.getWsUrl()
        _log.info(`Connecting to ${wsUrl}...`)

        const wsOptions = {
          headers: {
            Origin: `http://${this.host}:${this.port}`
          }
        }
        this.ws = new WebSocket(wsUrl, wsOptions)

        this._connectReject = reject

        this.ws.on('open', () => {
          _log.success('WebSocket connected')
          this.connected = true
          this.reconnectDelay = 1000
        })

        this.ws.on('message', (data) => {
          this._handleMessage(data)
        })

        this.ws.on('close', (code, reason) => {
          const reasonStr = reason?.toString() || ''
          _log.info(`Connection closed: ${code} ${reasonStr}`)
          this.connected = false
          this.authenticated = false
          if (code === 1008 || reasonStr.includes('origin not allowed')) {
            _log.warn('Policy error, not reconnecting.')
            this.emit('disconnected', { code, reason: reasonStr, fatal: true })
            if (this._connectReject) {
              this._connectReject(new Error(reasonStr || 'connection closed'))
              this._connectReject = null
            }
            return
          }
          this.emit('disconnected', { code, reason: reasonStr, fatal: false })
          this._tryReconnect()
        })

        this.ws.on('error', (error) => {
          _log.error('WebSocket error:', error.message)
        })

        let connectTimeout: ReturnType<typeof setTimeout> | null = setTimeout(() => {
          if (this.ws && this.ws.readyState === WebSocket.CONNECTING) {
            try { this.ws.close() } catch (_e) { /* suppress */ }
            reject(new Error('Connection timeout'))
          }
          connectTimeout = null
        }, 10000)

        this.ws.onopen = () => {
          if (connectTimeout) {
            clearTimeout(connectTimeout)
            connectTimeout = null
          }
        }
      } catch (error) {
        reject(error)
      }
    })
  }

  private _handleConnectChallenge(payload: Record<string, unknown>): void {
    const nonce = payload?.nonce as string | undefined
    if (!nonce) {
      _log.error('Missing nonce in connect.challenge')
      this.ws?.close(1008, 'connect challenge missing nonce')
      if (this._connectReject) {
        this._connectReject(new Error('missing nonce'))
        this._connectReject = null
      }
      return
    }

    if (!this._deviceIdentity) {
      _log.warn('No device identity, cannot sign challenge. QClaw requires device auth.')
      this.ws?.close(1008, 'device identity required')
      if (this._connectReject) {
        this._connectReject(new Error('device identity required'))
        this._connectReject = null
      }
      return
    }

    const signedAtMs = Date.now()
    const scopes = ['operator.admin', 'operator.write', 'operator.read']
    const payloadStr = this._buildDeviceAuthPayload(nonce, signedAtMs, scopes)
    const signature = this._signPayload(payloadStr)
    const publicKeyB64Url = this._publicKeyBase64Url()

    const connectFrame = {
      type: 'req',
      id: `connect-${Date.now()}`,
      method: 'connect',
      params: {
        minProtocol: 3,
        maxProtocol: 3,
        client: {
          id: 'openclaw-control-ui',
          displayName: 'Echora',
          version: '0.8.0',
          platform: process.platform,
          mode: 'webchat'
        },
        auth: {
          token: this.token
        },
        caps: ['tool-events'],
        role: 'operator',
        scopes,
        device: {
          id: this._deviceIdentity.deviceId,
          publicKey: publicKeyB64Url,
          signature,
          signedAt: signedAtMs,
          nonce
        }
      }
    }

    this.ws!.send(JSON.stringify(connectFrame))
    _log.info('Sent connect with device signature (v3)')
  }

  async rpc(method: string, params: Record<string, unknown> = {}, timeoutMs = 30000): Promise<unknown> {
    if (!this.connected || !this.authenticated) {
      throw new Error('Not connected or authenticated')
    }

    const id = `rpc-${++this.requestId}-${Date.now()}`
    const request = {
      type: 'req',
      id,
      method,
      params
    }

    return this._sendRequest(request, timeoutMs)
  }

  private _sendRequest(request: Record<string, unknown>, timeoutMs = 30000): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(request.id as string)
        reject(new Error(`Request timeout: ${request.method}`))
      }, timeoutMs)

      this.pendingRequests.set(request.id as string, {
        resolve,
        reject,
        timeout,
        method: request.method as string
      })

      this.ws!.send(JSON.stringify(request))
    })
  }

  private _handleMessage(data: WebSocket.Data): void {
    try {
      const message = JSON.parse(data.toString())

      if (message.type === 'event' && message.event === 'connect.challenge') {
        this._handleConnectChallenge(message.payload)
        return
      }

      if (message.type === 'res') {
        const pending = this.pendingRequests.get(message.id)
        if (pending) {
          clearTimeout(pending.timeout)
          this.pendingRequests.delete(message.id)
          if (message.ok) {
            pending.resolve(message.result || message.payload)
          } else {
            pending.reject(new Error(message.error?.message || 'RPC error'))
          }
        }

        if (message.id?.startsWith('connect-') && message.ok) {
          this.authenticated = true
          this._reconnectCount = 0
          _log.success('Authenticated successfully')
          this.emit('authenticated')
        }
        return
      }

      if (message.type === 'event') {
        if (message.event === 'health' || message.event === 'tick') return

        if (message.event === 'chat') {
          this.emit('chat', message.payload)
        } else if (message.event === 'session') {
          this.emit('session', message.payload)
        } else if (message.event === 'session.tool') {
          _log.event('Tool call event:', message.payload)
          this.emit('tool', message.payload)
        } else if (message.event === 'agent') {
          const payload = message.payload || {}
          if (payload.stream === 'item' && payload.data?.kind === 'tool') {
            _log.event('Tool:', payload.data.name, payload.data.phase)
            this.emit('tool', { data: payload.data })
          }
        } else {
          this.emit(message.event, message.payload)
        }
      }
    } catch (error) {
      _log.error('Message parse error:', (error as Error).message)
    }
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.ws) {
      try { this.ws.close(1000, 'client disconnect') } catch (_e) { /* suppress */ }
      this.ws = null
    }
    this.connected = false
    this.authenticated = false
  }

  private _tryReconnect(): void {
    if (this.reconnectTimer) return

    if (this._reconnectCount >= this._maxReconnects) {
      _log.warn('Max reconnect attempts reached, stopping.')
      return
    }

    this._reconnectCount++
    const delay = Math.min(
      this.reconnectDelay * Math.pow(1.5, this._reconnectCount - 1),
      this.maxReconnectDelay
    )
    _log.info(`Reconnecting in ${delay}ms (attempt ${this._reconnectCount}/${this._maxReconnects})...`)
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.connect()
        .then(() => {
          this._reconnectCount = 0
        })
        .catch((err) => {
          _log.error('Reconnect failed:', err.message)
        })
    }, delay)
  }
}

import { EventEmitter } from 'events'
import WebSocket from 'ws'
import { create, type Logger } from '../utils/console-logger'

const _log: Logger = create('OpenClawWS')

interface PendingRequest {
  resolve: (value: unknown) => void
  reject: (reason: Error) => void
  timeout: ReturnType<typeof setTimeout>
  method: string
}

interface OpenClawWSConfig {
  port?: number
  token?: string
  host?: string
}

export interface ChatMessageData {
  sessionKey: string
  agentId: string
  deltaText: string
  state: string
  finalText: string
  role: string
  content: string
  usage: Record<string, unknown> | null
  payload: Record<string, unknown>
}

export class OpenClawWSClient extends EventEmitter {
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
  private _onChatMessage: ((msg: ChatMessageData) => void) | null = null

  constructor(config: OpenClawWSConfig = {}) {
    super()
    this.port = config.port || 18789
    this.token = config.token || ''
    this.host = config.host || '127.0.0.1'
  }

  onChatMessage(callback: (msg: ChatMessageData) => void): void {
    this._onChatMessage = callback
  }

  getWsUrl(): string {
    return `ws://${this.host}:${this.port}/ws?apiKey=${this.token}`
  }

  async connect(): Promise<boolean> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return true
    }

    return new Promise<boolean>((resolve, reject) => {
      try {
        const wsUrl = this.getWsUrl()
        _log.info(`Connecting to ${wsUrl}...`)

        const wsOptions = {
          headers: {
            Origin: `http://${this.host}:${this.port}`
          }
        }
        this.ws = new WebSocket(wsUrl, wsOptions)

        this.ws.on('open', () => {
          _log.success('WebSocket connected')
          this.connected = true
          this.reconnectDelay = 1000
          this._sendConnectRequest().then(() => resolve(true)).catch(reject)
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
            _log.warn('Policy error, not reconnecting. Fix gateway.controlUi.allowedOrigins config.')
            this.emit('disconnected', { code, reason: reasonStr, fatal: true })
            return
          }
          this._scheduleReconnect()
          this.emit('disconnected', { code, reason: reasonStr })
        })

        this.ws.on('error', (error) => {
          _log.error('WebSocket error:', error.message)
          this.emit('error', error)
          if (!this.connected) {
            reject(error)
          }
        })

        this.ws.on('unexpected-response', (_req, res) => {
          _log.warn(`Server rejected handshake: ${res?.statusCode}`)
          if (this.ws) {
            try { this.ws.close() } catch (_e) { /* suppress */ }
          }
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

  private async _sendConnectRequest(): Promise<unknown> {
    const connectFrame = {
      type: 'req',
      id: `connect-${Date.now()}`,
      method: 'connect',
      params: {
        minProtocol: 4,
        maxProtocol: 4,
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
        scopes: ['operator.admin', 'operator.write', 'operator.read']
      }
    }
    return this._sendRequest(connectFrame)
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

    _log.info('WS RPC sending: %s', JSON.stringify(request).substring(0, 500))
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

      if (message.type === 'res' && typeof message.id === 'string') {
        const pending = this.pendingRequests.get(message.id)
        if (pending) {
          clearTimeout(pending.timeout)
          this.pendingRequests.delete(message.id)

          if (message.ok === false || message.error) {
            pending.reject(new Error(message.error?.message || 'Request failed'))
          } else {
            if (message.id.startsWith('connect-')) {
              this.authenticated = true
              _log.success('Authenticated successfully')
              this.emit('authenticated', message.payload)
            }
            pending.resolve(message.payload)
          }
        }
        return
      }

      if (message.type === 'event' && typeof message.event === 'string') {
        if (message.event !== 'health' && message.event !== 'tick') {
          _log.debug('Event:', message.event, 'state:', message.payload?.state || '-')
        }
        this.emit('event', { event: message.event, payload: message.payload })
        this.emit(message.event, message.payload)

        if (message.event === 'session.tool') {
          _log.event('Tool call event:', message.payload)
          this.emit('tool', message.payload)
        }

        if (
          message.event === 'agent' &&
          message.payload?.stream === 'item' &&
          message.payload?.data?.kind === 'tool'
        ) {
          _log.event('Agent tool event:', message.payload)
          this.emit('tool', message.payload)
        }

        if (
          message.event === 'session.message' &&
          message.payload?.message?.stopReason === 'toolUse'
        ) {
          _log.event('Session message with tool use:', message.payload)
          const content = message.payload.message.content
          if (Array.isArray(content)) {
            for (const block of content) {
              if (block.type === 'tool_use' || block.type === 'toolCall') {
                this.emit('tool', {
                  data: {
                    phase: 'start',
                    name: block.name,
                    toolCallId: block.id,
                    args: block.input || block.arguments
                  },
                  sessionKey: message.payload.sessionKey
                })
              }
            }
          }
        }

        if (message.event === 'chat') {
          const p = message.payload || {}
          const sessionKey: string = p.sessionKey || ''
          const agentId: string = p.agentId || ''
          const deltaText: string = p.deltaText || ''
          const state: string = p.state || ''
          const msg = p.message || {}
          const role: string = msg.role || ''
          let content = ''
          if (Array.isArray(msg.content)) {
            content = msg.content
              .filter((c: Record<string, unknown>) => c.type === 'text')
              .map((c: Record<string, unknown>) => c.text)
              .join('')
          } else if (typeof msg.content === 'string') {
            content = msg.content
          }
          const finalText = state === 'final' ? content : ''
          const usage = p.usage || msg.usage || null
          if (this._onChatMessage) {
            this._onChatMessage({
              sessionKey,
              agentId,
              deltaText,
              state,
              finalText,
              role,
              content,
              usage,
              payload: p
            })
          }
        }

        if (message.event === 'session.message') {
          const p = message.payload || {}
          const sessionKey: string = p.sessionKey || ''
          const msg = p.message || {}
          if (this._onChatMessage && msg.role) {
            this._onChatMessage({
              sessionKey,
              role: msg.role,
              content: msg.content,
              usage: msg.usage || null,
              messageId: p.messageId || msg.id || '',
              payload: p
            } as unknown as ChatMessageData)
          }
        }
        return
      }

      if (typeof message.method === 'string') {
        this.emit('method', { method: message.method, params: message.params })
        this.emit(message.method, message.params)
      }
    } catch (error) {
      _log.error('Message parse error:', (error as Error).message)
    }
  }

  private _handleConnectChallenge(payload: Record<string, unknown>): void {
    if (this.authenticated) return
    const nonce = payload?.nonce as string | undefined
    if (!nonce) {
      _log.error('Missing nonce in connect.challenge')
      return
    }

    const connectFrame = {
      type: 'req',
      id: `connect-${Date.now()}`,
      method: 'connect',
      params: {
        minProtocol: 4,
        maxProtocol: 4,
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
        scopes: ['operator.admin', 'operator.write', 'operator.read']
      }
    }

    this.ws!.send(JSON.stringify(connectFrame))
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }

    if (this.ws) {
      this.ws.close()
      this.ws = null
    }

    this.connected = false
    this.authenticated = false
    this.pendingRequests.clear()
  }

  private _scheduleReconnect(): void {
    if (this.reconnectTimer) return
    if (this._reconnectCount >= 10) {
      _log.warn('Max reconnect attempts reached, stopping.')
      return
    }
    this._reconnectCount++

    const delay = Math.min(
      this.reconnectDelay * Math.pow(1.5, this._reconnectCount - 1),
      this.maxReconnectDelay
    )
    _log.info(`Reconnecting in ${delay}ms (attempt ${this._reconnectCount}/10)...`)
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

  async sendChat(
    message: string,
    options: { sessionKey?: string; idempotencyKey?: string } = {}
  ): Promise<unknown> {
    return this.rpc('chat.send', {
      sessionKey: options.sessionKey || 'echora-main',
      idempotencyKey:
        options.idempotencyKey ||
        `idem-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      message
    })
  }

  async getChatHistory(
    sessionKey: string,
    options: Record<string, unknown> = {}
  ): Promise<unknown> {
    return this.rpc('chat.history', {
      sessionKey,
      ...options
    })
  }

  async abortChat(sessionKey: string, runId: string): Promise<unknown> {
    return this.rpc('chat.abort', {
      sessionKey,
      runId
    })
  }

  async getHealth(): Promise<unknown> {
    return this.rpc('health')
  }

  async getStatus(): Promise<unknown> {
    return this.rpc('status')
  }

  async subscribeSession(sessionKey: string): Promise<unknown> {
    return this.rpc('sessions.messages.subscribe', { key: sessionKey })
  }

  async unsubscribeSession(sessionKey: string): Promise<unknown> {
    return this.rpc('sessions.messages.unsubscribe', { key: sessionKey })
  }

  async subscribeAllSessions(): Promise<unknown> {
    return this.rpc('sessions.subscribe')
  }

  async unsubscribeAllSessions(): Promise<unknown> {
    return this.rpc('sessions.unsubscribe')
  }
}

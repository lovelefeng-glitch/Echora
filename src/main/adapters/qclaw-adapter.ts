import { spawn } from 'child_process'
import path from 'path'
import fs from 'fs'
import http from 'http'
import os from 'os'
import {
  BaseAdapter,
  type AdapterConfig,
  type AdapterAgentItem,
  type AdapterModelInfo,
  type AdapterModelItem,
  type StartResult,
  type StopResult,
  type StatusResult,
  type SendMessageResult,
  type SwitchModelResult,
  type StreamCallbacks
} from './base-adapter'
import { create } from '../utils/console-logger'
import { QClawWSClient } from './qclaw-ws'

const _log = create('QClaw')

interface QClawConfig extends AdapterConfig {
  useWebSocket?: boolean
}

export class QClawAdapter extends BaseAdapter<QClawConfig> {
  public aiType = 'qclaw'
  private token: string
  public baseUrl: string
  private _proc: ReturnType<typeof spawn> | null = null
  private _chatEndpoint: string | null = null
  public _requestTimeout = 300000
  private _currentModel: string | null = null
  private _defaultModel: string | null = null
  private _modelInfoCache = new Map<string, AdapterModelInfo>()
  private _wsClient: QClawWSClient | null = null

  constructor(config: QClawConfig = {}) {
    super(config)
    this.aiType = 'qclaw'
    this.name = 'qclaw'
    this._log = create('QClaw')
    this.token = config.token || ''
    this.baseUrl = config.baseUrl || `http://127.0.0.1:${config.port || 28789}`
    this._loadConfig()
  }

  private _loadConfig(): void {
    try {
      const configPath =
        this.config.configPath || path.join(os.homedir(), '.qclaw', 'openclaw.json')
      if (fs.existsSync(configPath)) {
        const raw = JSON.parse(fs.readFileSync(configPath, 'utf8'))
        this.token = raw.gateway?.auth?.token || this.token
        this.baseUrl = `http://127.0.0.1:${raw.gateway?.port || 28789}`
        const agents = raw.agents?.list || []
        if (agents[0]?.model?.primary) {
          this._defaultModel = agents[0].model.primary
        }
        const timeoutSeconds = raw.agents?.defaults?.timeoutSeconds || 600
        this._requestTimeout = timeoutSeconds * 1000
        _log.info('Config loaded: timeout=%ds', timeoutSeconds)
      }
    } catch (_e) { /* suppress */ }
  }

  async start(): Promise<StartResult> {
    const alive = await this.getStatus()
    if (alive.status === 'running') return { success: true, message: '网关已在运行' }
    const exePath = this.config.exePath || ''
    if (!exePath || !fs.existsSync(exePath)) {
      return { success: false, message: '可执行文件路径未配置或不存在' }
    }
    this._proc = spawn(
      exePath,
      ['gateway', 'start', '--port', String(this.config.port || 28789)],
      { cwd: path.dirname(exePath), detached: true, stdio: ['ignore'] }
    )
    this.status = 'starting'
    try {
      await this._waitForReady(20000)
      return { success: true, message: '网关启动成功' }
    } catch (e) {
      this.status = 'error'
      return { success: false, message: (e as Error).message }
    }
  }

  async stop(): Promise<StopResult> {
    if (this._proc) {
      try { this._proc.kill('SIGTERM') } catch (_e) { /* suppress */ }
      this._proc = null
    }
    this.status = 'offline'
    return { success: true }
  }

  async getStatus(): Promise<StatusResult> {
    try {
      const data = (await this._httpGet('/health')) as Record<string, unknown> | null
      if (data && data.ok) {
        this.status = 'running'
        if (this._chatEndpoint === null) this._chatEndpoint = await this._discoverChatEndpoint()
        this._initWebSocket()
        return {
          status: 'running',
          uptime: (data.uptime as number) || 0,
          hasChatAPI: !!this._chatEndpoint
        }
      }
    } catch (_e) { /* suppress */ }
    this.status = 'offline'
    return { status: 'offline' }
  }

  async listAgents(): Promise<AdapterAgentItem[]> {
    const agents: AdapterAgentItem[] = []
    try {
      const configPath = path.join(os.homedir(), '.qclaw', 'openclaw.json')
      if (fs.existsSync(configPath)) {
        const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'))
        const list = cfg.agents?.list || []
        for (const a of list) {
          agents.push({
            id: a.id,
            name: a.identity?.name || a.name || a.id,
            emoji: a.identity?.emoji || null,
            avatar: a.identity?.avatar || null,
            description: a.description || '',
            model: a.model?.primary || null
          })
        }
      }
    } catch (_e) { /* suppress */ }
    if (agents.length === 0)
      agents.push({ id: 'main', name: 'QClaw', description: '默认 Agent' })
    return agents
  }

  async sendMessage(agentId: string, message: string, userId?: string): Promise<SendMessageResult> {
    if (this._chatEndpoint === null) this._chatEndpoint = await this._discoverChatEndpoint()
    if (!this._chatEndpoint)
      return { success: false, message: 'QClaw 网关不支持 REST 聊天 API' }
    const model = agentId && agentId !== 'main' ? `openclaw/${agentId}` : 'openclaw'
    const body = JSON.stringify({
      model,
      messages: [{ role: 'user', content: message }],
      user: userId || undefined,
      stream: false,
      max_tokens: 4096
    })
    try {
      const data = (await this._httpPost(this._chatEndpoint, body)) as Record<string, unknown>
      if (data && data.choices && (data.choices as unknown[])[0]) {
        const choice = (data.choices as Record<string, unknown>[])[0]
        return {
          success: true,
          content: (choice.message as Record<string, unknown>).content as string,
          messageId: data.id as string
        }
      }
      return { success: false, message: '无效的响应格式' }
    } catch (e) {
      return { success: false, message: (e as Error).message }
    }
  }

  sendMessageStream(
    agentId: string,
    message: string,
    callbacks?: StreamCallbacks,
    userId?: string
  ): void | Promise<void> {
    if (this._wsClient && this._wsClient.authenticated) {
      return this._sendViaWebSocket(agentId, message, callbacks, userId)
    }
    if (this._wsClient && this._wsClient.connected && !this._wsClient.authenticated) {
      _log.info('WebSocket connecting, waiting for auth...')
      return new Promise<void>((resolve, reject) => {
        const waitStart = Date.now()
        const check = setInterval(() => {
          if (this._wsClient?.authenticated) {
            clearInterval(check)
            _log.success('WebSocket authenticated')
            resolve(this._sendViaWebSocket(agentId, message, callbacks, userId))
          } else if (Date.now() - waitStart > 5000) {
            clearInterval(check)
            reject(new Error('WebSocket 认证超时，请检查 QClaw 网关是否运行'))
          }
        }, 200)
      })
    }
    _log.info('WebSocket not ready, initializing...')
    this._initWebSocket()
    return new Promise<void>((resolve, reject) => {
      const waitStart = Date.now()
      const check = setInterval(() => {
        if (this._wsClient?.authenticated) {
          clearInterval(check)
          _log.success('WebSocket connected and authenticated')
          resolve(this._sendViaWebSocket(agentId, message, callbacks, userId))
        } else if (Date.now() - waitStart > 10000) {
          clearInterval(check)
          reject(new Error('WebSocket 连接超时，请检查 QClaw 网关是否运行'))
        }
      }, 300)
    })
  }

  private _initWebSocket(): void {
    if (this._wsClient) return
    try {
      const url = new URL(this.baseUrl)
      this._wsClient = new QClawWSClient({
        port: parseInt(url.port) || 28789,
        token: this.token,
        host: url.hostname
      })
      this._wsClient.connect().then(() => {
        _log.success('WebSocket connected')
      }).catch((e) => {
        _log.warn('WebSocket connection failed, falling back to HTTP SSE:', e.message)
        this._wsClient = null
      })
    } catch (e) {
      _log.warn('WebSocket init failed:', (e as Error).message)
      this._wsClient = null
    }
  }

  private _extractAccumulatedText(payload: Record<string, unknown>): string {
    const msg = payload?.message as Record<string, unknown> | undefined
    const content = msg?.content as Record<string, unknown>[] | undefined
    if (content?.[0]?.text) {
      return content[0].text as string
    }
    if (payload?.deltaText) {
      return payload.deltaText as string
    }
    return ''
  }

  private _isAccumulatedText(payload: Record<string, unknown>): boolean {
    const msg = payload?.message as Record<string, unknown> | undefined
    const content = msg?.content as unknown[] | undefined
    return !!(content?.[0] as Record<string, unknown> | undefined)?.text
  }

  private _sendViaWebSocket(
    agentId: string,
    message: string,
    callbacks?: StreamCallbacks,
    userId?: string
  ): void {
    const { onChunk, onDone, onError, onToolCall, onToolStep } = callbacks || {}
    const idempotencyKey = `qclaw-ws-${Date.now()}`
    let fullContent = ''
    let done = false
    let boundRunId: string | null = null

    const chatHandler = (payload: Record<string, unknown>): void => {
      if (done) return
      if (boundRunId && payload?.runId && payload.runId !== boundRunId) return

      const state = payload?.state as string | undefined
      if (state === 'delta') {
        const text = this._extractAccumulatedText(payload)
        if (text) {
          if (this._isAccumulatedText(payload)) {
            const delta = text.slice(fullContent.length)
            fullContent = text
            if (delta && onChunk) onChunk(delta, fullContent)
          } else {
            fullContent += text
            if (onChunk) onChunk(text, fullContent)
          }
        }
      } else if (state === 'final') {
        done = true
        const finalText = this._extractAccumulatedText(payload)
        if (finalText && finalText.length > fullContent.length) {
          const delta = finalText.slice(fullContent.length)
          fullContent = finalText
          if (delta && onChunk) onChunk(delta, fullContent)
        }
        const rawUsage = (payload?.usage ||
          (payload?.message as Record<string, unknown>)?.usage) as Record<string, unknown> | undefined
        let metrics: Record<string, unknown> | null = null
        if (rawUsage) {
          metrics = {
            usage: {
              prompt_tokens: (rawUsage.input as number) || (rawUsage.prompt_tokens as number) || 0,
              completion_tokens:
                (rawUsage.output as number) || (rawUsage.completion_tokens as number) || 0,
              total_tokens:
                (rawUsage.totalTokens as number) || (rawUsage.total_tokens as number) || 0
            }
          }
        }
        if (onDone) onDone(fullContent, null, metrics)
        cleanup()
      } else if (state === 'error') {
        done = true
        if (onError) onError(new Error((payload?.error as string) || 'Stream error'))
        cleanup()
      }
    }

    const toolHandler = (payload: Record<string, unknown>): void => {
      if (boundRunId && payload?.runId && payload.runId !== boundRunId) return
      const data = (payload?.data || payload) as Record<string, unknown>
      _log.info('Tool event:', data.name, data.phase)
      if (onToolCall)
        onToolCall({
          id: data.toolCallId || data.id,
          name: data.name,
          meta: data.meta || data.title,
          status: data.phase === 'end' ? 'completed' : 'running'
        })
      if (onToolStep)
        onToolStep({
          name: data.name,
          phase: data.phase,
          args: data.meta || data.title || data.args,
          toolCallId: data.toolCallId || data.id
        })
    }

    const cleanup = (): void => {
      if (!this._wsClient) return
      this._wsClient.removeListener('chat', chatHandler)
      this._wsClient.removeListener('tool', toolHandler)
    }

    this._wsClient!.on('chat', chatHandler)
    this._wsClient!.on('tool', toolHandler)

    const sessionKey = userId || agentId || 'main'
    this._wsClient!
      .rpc(
        'chat.send',
        {
          message,
          sessionKey,
          idempotencyKey
        },
        this._requestTimeout
      )
      .then((result) => {
        const r = result as Record<string, unknown> | null
        if (r?.runId) {
          boundRunId = r.runId as string
          _log.info('Chat session bound to runId:', boundRunId)
        }
      })
      .catch((e) => {
        _log.warn('chat.send error:', e.message)
      })

    setTimeout(() => {
      if (!done) {
        done = true
        cleanup()
        if (fullContent) {
          _log.warn('Response timeout, using collected:', fullContent.substring(0, 100))
          if (onDone) onDone(fullContent)
        } else {
          _log.warn('Response timeout, no content received')
          if (onError) onError(new Error('响应超时（无内容返回）'))
        }
      }
    }, this._requestTimeout)
  }

  async getModelInfo(): Promise<AdapterModelInfo> {
    const cacheKey = this._currentModel || 'default'
    if (this._modelInfoCache.has(cacheKey)) return this._modelInfoCache.get(cacheKey)!
    const info = await this._fetchModelInfo()
    this._modelInfoCache.set(cacheKey, info)
    return info
  }

  private async _fetchModelInfo(): Promise<AdapterModelInfo> {
    const configPath = path.join(os.homedir(), '.qclaw', 'openclaw.json')
    let modelName = this._currentModel || this._defaultModel || null
    let contextWindow: number | null = null
    try {
      if (fs.existsSync(configPath)) {
        const raw = JSON.parse(fs.readFileSync(configPath, 'utf8'))
        const agents = raw.agents?.list || []
        if (agents[0]?.model?.primary) modelName = agents[0].model.primary
        const providers = raw.models?.providers || {}
        for (const [, p] of Object.entries(providers) as [string, Record<string, unknown>][]) {
          if (p.models) {
            for (const m of p.models as Record<string, unknown>[]) {
              const fullPath = `${(p as unknown as { id?: string }).id}/${m.id}`
              if (fullPath === modelName && m.contextWindow)
                contextWindow = m.contextWindow as number
            }
          }
        }
      }
    } catch (_e) { /* suppress */ }
    return { model: modelName, contextWindow, contextUsed: null, usagePct: null }
  }

  async listModels(): Promise<AdapterModelItem[]> {
    const models: AdapterModelItem[] = []
    const configPath = path.join(os.homedir(), '.qclaw', 'openclaw.json')
    try {
      if (fs.existsSync(configPath)) {
        const raw = JSON.parse(fs.readFileSync(configPath, 'utf8'))
        const providers = raw.models?.providers || {}
        for (const [providerId, provider] of Object.entries(providers) as [
          string,
          Record<string, unknown>
        ][]) {
          if (provider.models) {
            for (const m of provider.models as Record<string, unknown>[]) {
              const fullPath = `${providerId}/${m.id}`
              models.push({
                id: m.id as string,
                name: (m.name as string) || (m.id as string),
                provider: providerId,
                fullPath,
                contextWindow: (m.contextWindow as number) || null,
                isDefault: fullPath === this._defaultModel
              })
            }
          }
        }
      }
    } catch (_e) { /* suppress */ }
    return models
  }

  async switchModel(modelId: string | null): Promise<SwitchModelResult> {
    const configPath = path.join(os.homedir(), '.qclaw', 'openclaw.json')
    try {
      const raw = JSON.parse(fs.readFileSync(configPath, 'utf8'))
      if (!raw.agents?.list?.[0])
        return { success: false, needsRestart: false, message: '配置中无 agents.list' }
      raw.agents.list[0].model = raw.agents.list[0].model || {}
      raw.agents.list[0].model.primary = modelId
      fs.writeFileSync(configPath, JSON.stringify(raw, null, 2), 'utf8')
      this._currentModel = modelId
      this._modelInfoCache.clear()
      return { success: true, needsRestart: true, model: modelId }
    } catch (e) {
      return { success: false, needsRestart: false, message: (e as Error).message }
    }
  }

  getCurrentModel(): string | null {
    return this._currentModel || this._defaultModel || null
  }

  private async _discoverChatEndpoint(): Promise<string | null> {
    const candidates = ['/v1/chat/completions', '/api/chat', '/chat/completions']
    for (const ep of candidates) {
      try {
        const result = await this._httpHead(ep)
        if (result >= 200 && result < 500 && result !== 404) return ep
      } catch (_e) { /* suppress */ }
    }
    return null
  }

  private async _waitForReady(timeoutMs: number): Promise<void> {
    const start = Date.now()
    while (Date.now() - start < timeoutMs) {
      try {
        const data = (await this._httpGet('/health')) as Record<string, unknown> | null
        if (data && data.ok) {
          this.status = 'running'
          return
        }
      } catch (_e) { /* suppress */ }
      await new Promise((r) => setTimeout(r, 1000))
    }
    throw new Error('网关启动超时')
  }

  private _httpHead(p: string): Promise<number> {
    return new Promise((resolve, reject) => {
      const url = new URL(p, this.baseUrl)
      const req = http.request(
        {
          hostname: url.hostname,
          port: url.port,
          path: url.pathname,
          method: 'HEAD',
          timeout: 3000
        },
        (res) => {
          res.resume()
          resolve(res.statusCode!)
        }
      )
      req.setTimeout(3000, () => {
        req.destroy()
        reject(new Error('timeout'))
      })
      req.on('error', reject)
      req.end()
    })
  }

  private _httpGet(p: string): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const url = new URL(p, this.baseUrl)
      http.get(
        {
          hostname: url.hostname,
          port: url.port,
          path: url.pathname,
          method: 'GET',
          timeout: this._requestTimeout,
          headers: {
            Authorization: `Bearer ${this.token}`,
            Accept: 'application/json'
          }
        },
        (res) => {
          let data = ''
          res.on('data', (c) => (data += c))
          res.on('end', () => {
            try {
              resolve(JSON.parse(data))
            } catch (_e) {
              reject(new Error(`解析失败: ${data.substring(0, 100)}`))
            }
          })
        }
      )
        .on('error', reject)
        .setTimeout(this._requestTimeout, function (this: http.ClientRequest) {
          this.destroy()
          reject(new Error('请求超时'))
        })
    })
  }

  private _httpPost(p: string, bodyString: string): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const url = new URL(p, this.baseUrl)
      const req = http.request(
        {
          hostname: url.hostname,
          port: url.port,
          path: url.pathname,
          method: 'POST',
          timeout: this._requestTimeout,
          headers: {
            Authorization: `Bearer ${this.token}`,
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(bodyString)
          }
        },
        (res) => {
          let data = ''
          res.on('data', (c) => (data += c))
          res.on('end', () => {
            if (res.statusCode! >= 400) {
              reject(new Error(`${res.statusCode} ${data.substring(0, 100)}`))
              return
            }
            try {
              resolve(JSON.parse(data))
            } catch (_e) {
              reject(new Error('解析失败'))
            }
          })
        }
      )
      req.setTimeout(this._requestTimeout, () => {
        req.destroy()
        reject(new Error('请求超时'))
      })
      req.on('error', reject)
      req.end(bodyString)
    })
  }
}

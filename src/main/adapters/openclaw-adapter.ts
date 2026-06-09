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
import { OpenClawWSClient, type ChatMessageData } from './openclaw-ws'

interface OpenClawConfig extends AdapterConfig {
  useWebSocket?: boolean
}

interface ActiveRequest {
  agentId: string
  userId?: string
  done: boolean
}

interface OpenClawUsage {
  input: number
  output: number
  totalTokens: number
  cacheRead: number
  cacheWrite: number
  cost: number | null
}

export class OpenClawAdapter extends BaseAdapter<OpenClawConfig> {
  public aiType = 'openclaw'
  private token: string
  public baseUrl: string
  private _proc: ReturnType<typeof spawn> | null = null
  private _chatEndpoint: string | null = null
  public _requestTimeout = 300000
  private _currentModel: string | null = null
  private _defaultModel: string | null = null
  private _currentAgentId: string | undefined
  private _wsClient: OpenClawWSClient | null = null
  private _useWebSocket: boolean
  public _lastUsage: OpenClawUsage | null = null
  private _lastSessionKey: string | null = null
  private _activeRequests = new Map<string, ActiveRequest>()
  private _echoraActiveRequests = new Set<string>()

  constructor(config: OpenClawConfig = {}) {
    super(config)
    this.aiType = 'openclaw'
    this.name = 'openclaw'
    this._log = create('OpenClaw')
    this.token = config.token || ''
    this.baseUrl = config.baseUrl || `http://127.0.0.1:${config.port || 18789}`
    this._useWebSocket = config.useWebSocket !== false
    this._loadConfig()
  }

  private _loadConfig(): void {
    try {
      const configPath =
        this.config.configPath || path.join(os.homedir(), '.openclaw', 'openclaw.json')
      if (fs.existsSync(configPath)) {
        const raw = JSON.parse(fs.readFileSync(configPath, 'utf8'))
        this.token = raw.gateway?.auth?.token || this.token
        this.baseUrl = `http://127.0.0.1:${raw.gateway?.port || 18789}`
        const agents = raw.agents?.list || []
        if (agents[0]?.model?.primary) this._defaultModel = agents[0].model.primary
        const timeoutSeconds = raw.agents?.defaults?.timeoutSeconds || 600
        this._requestTimeout = timeoutSeconds * 1000
        this._log.info(
          'Config loaded: token=%s... baseUrl=%s timeout=%ds',
          this.token?.substring(0, 8),
          this.baseUrl,
          timeoutSeconds
        )
      } else {
        this._log.warn('Config not found:', configPath)
      }
    } catch (e) {
      this._log.error('Config load error:', (e as Error).message)
    }
  }

  async start(): Promise<StartResult> {
    const alive = await this.getStatus()
    if (alive.status === 'running') return { success: true, message: '网关已在运行' }
    const exePath = this.config.exePath || ''
    if (!exePath || !fs.existsSync(exePath))
      return { success: false, message: '可执行文件路径未配置或不存在' }
    this._proc = spawn(
      exePath,
      ['gateway', 'start', '--port', String(this.config.port || 18789)],
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
    if (this._wsClient) {
      this._wsClient.disconnect()
      this._wsClient = null
    }
    if (this._proc) {
      try {
        this._proc.kill('SIGTERM')
      } catch (_e) { /* suppress */ }
      this._proc = null
    }
    this.status = 'offline'
    return { success: true }
  }

  private async _connectWebSocket(): Promise<boolean> {
    if (!this._useWebSocket) return false
    if (this._wsClient && this._wsClient.connected && this._wsClient.authenticated) {
      return true
    }
    try {
      const port = parseInt(this.baseUrl.split(':').pop()!) || 18789
      this._wsClient = new OpenClawWSClient({
        port,
        token: this.token
      })
      await this._wsClient.connect()
      this._log.success('WebSocket connected')
      this._wsClient.onChatMessage((chatMsg: ChatMessageData) => {
        if (chatMsg.sessionKey && this._echoraActiveRequests.has(chatMsg.sessionKey)) {
          this._log.debug('Skipping own response for sessionKey=%s', chatMsg.sessionKey)
          return
        }
        if (this._onMessageCallback) {
          this._onMessageCallback({
            aiType: this.aiType,
            ...chatMsg,
            agentId: chatMsg.agentId || ''
          } as unknown as Record<string, unknown>)
        }
      })
      this._wsClient.on('tool', (payload: Record<string, unknown>) => {
        const data = (payload.data || payload) as Record<string, unknown> | undefined
        const sessionKey =
          (payload.sessionKey as string) ||
          (payload.key as string) ||
          (data?.sessionKey as string) ||
          (data?.key as string) ||
          ''
        if (!sessionKey) return
        if (this._echoraActiveRequests.has(sessionKey)) return
        if (!data) return
        if (this._onMessageCallback) {
          this._onMessageCallback({
            aiType: this.aiType,
            type: 'toolStep',
            sessionKey,
            name: data.name || 'unknown',
            phase: data.phase || 'start',
            meta: data.meta || data.title || '',
            toolCallId: data.toolCallId || ''
          })
        }
      })
      this._wsClient.on('agent', (payload: Record<string, unknown>) => {
        if (!payload || payload.stream !== 'lifecycle') return
        const sessionKey =
          (payload.data as Record<string, unknown>)?.sessionKey as string ||
          (payload.sessionKey as string) ||
          ''
        if (sessionKey && this._echoraActiveRequests.has(sessionKey)) return
        if (this._onMessageCallback) {
          this._onMessageCallback({
            aiType: this.aiType,
            type: 'thinking',
            sessionKey: sessionKey || '',
            status:
              (payload.data as Record<string, unknown>)?.phase === 'start'
                ? 'thinking'
                : 'idle'
          })
        }
      })
      return true
    } catch (e) {
      this._log.warn('WebSocket connection failed, falling back to HTTP:', (e as Error).message)
      this._wsClient = null
      return false
    }
  }

  get wsClient(): OpenClawWSClient | null {
    return this._wsClient
  }

  async getStatus(): Promise<StatusResult> {
    try {
      const data = (await this._httpGet('/health')) as Record<string, unknown> | null
      if (data && data.ok) {
        this.status = 'running'
        if (this._chatEndpoint === null) this._chatEndpoint = await this._discoverChatEndpoint()
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
      const configPath = path.join(os.homedir(), '.openclaw', 'openclaw.json')
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
    try {
      const agentsDir = path.join(os.homedir(), '.openclaw', 'agents')
      if (fs.existsSync(agentsDir)) {
        for (const agent of agents) {
          try {
            for (const fname of ['agent/IDENTITY.md', 'IDENTITY.md']) {
              const p = path.join(agentsDir, agent.id, fname)
              if (fs.existsSync(p)) {
                const content = fs.readFileSync(p, 'utf8')
                const nameMatch = content.match(/Name:\s*(.+)/i)
                const emojiMatch = content.match(/Emoji:\s*(.+)/i)
                if (nameMatch && !agent.name) agent.name = nameMatch[1].trim()
                if (emojiMatch && !agent.emoji) agent.emoji = emojiMatch[1].trim()
                break
              }
            }
          } catch (_e) { /* suppress */ }
        }
      }
    } catch (_e) { /* suppress */ }
    if (agents.length === 0)
      agents.push({ id: 'main', name: 'OpenClaw', description: '默认 Agent' })
    return agents
  }

  async sendMessage(agentId: string, message: string, userId?: string): Promise<SendMessageResult> {
    this._currentAgentId = agentId
    if (this._chatEndpoint === null) this._chatEndpoint = await this._discoverChatEndpoint()
    if (!this._chatEndpoint)
      return { success: false, message: 'OpenClaw 网关不支持 REST 聊天 API' }
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

  async sendMessageStream(
    agentId: string,
    message: string,
    callbacks?: StreamCallbacks,
    userId?: string,
    attachments?: Array<{ name: string; content: string; mimeType: string }>
  ): Promise<void | http.ClientRequest> {
    const { onChunk, onDone, onError, onToolCall, onThinking, onToolStep, onUsage } =
      callbacks || {}
    this._currentAgentId = agentId
    const model = agentId && agentId !== 'main' ? `openclaw/${agentId}` : 'openclaw'
    const ocSessionKey = `agent:${agentId}:${userId || 'echora-user'}`
    const requestId = `req-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`

    for (const [, req] of this._activeRequests) {
      if (req.userId === userId && !req.done) req.done = true
    }
    this._activeRequests.set(requestId, { agentId, userId, done: false })
    this._log.info(
      'sendMessageStream: agentId=%s model=%s sessionKey=%s requestId=%s',
      agentId,
      model,
      ocSessionKey,
      requestId
    )

    const wsConnected = await this._connectWebSocket()
    if (wsConnected && this._wsClient) {
      this._log.info('Using WebSocket for streaming')

      let fullContent = ''
      let done = false
      let lastSessionKey: string | null = null

      const chatHandler = (payload: Record<string, unknown>): void => {
        if (!payload) return
        const req = this._activeRequests.get(requestId)
        if (!req || req.done) return
        const eventKey =
          (payload.sessionKey as string) || (payload.key as string) || ''
        if (eventKey && !eventKey.includes(userId || '')) return

        const deltaText =
          (payload.deltaText as string) ||
          (payload.delta as Record<string, unknown>)?.text as string ||
          (payload.text as string) ||
          (typeof payload.content === 'string' ? payload.content : '') ||
          ''

        if (deltaText) {
          if (payload.replace) {
            fullContent = deltaText
          } else {
            fullContent += deltaText
          }
          if (onChunk) onChunk(deltaText, fullContent)
        }

        if (payload.state === 'final' && payload.message) {
          const msg = payload.message as Record<string, unknown>
          const finalText =
            (msg.text as string) ||
            (msg.content as string) ||
            (typeof payload.message === 'string' ? (payload.message as string) : '')
          if (finalText && !fullContent) {
            fullContent = finalText
            if (onChunk) onChunk(finalText, fullContent)
          }
        }
      }

      const toolHandler = (payload: Record<string, unknown>): void => {
        if (!onToolCall || !payload) return
        const req = this._activeRequests.get(requestId)
        if (!req || req.done) return
        if (lastSessionKey) {
          const eventKey =
            (payload.sessionKey as string) || (payload.key as string) || ''
          if (eventKey && eventKey !== lastSessionKey) return
        }

        if (payload.type === 'tool_use' || payload.type === 'toolCall') {
          onToolCall({
            id: payload.id || payload.name || '',
            name: payload.name || 'unknown',
            arguments: payload.input || payload.arguments || '',
            status: 'running'
          })
          return
        }

        if (Array.isArray(payload.tool_calls)) {
          for (const tc of payload.tool_calls as Record<string, unknown>[]) {
            const fn = (tc.function || tc) as Record<string, unknown>
            onToolCall({
              id: tc.id || fn.name || '',
              name: fn.name || 'unknown',
              arguments: fn.arguments || '',
              status: 'running'
            })
          }
          return
        }

        if (payload.data && payload.stream === 'tool') {
          const toolData = payload.data as Record<string, unknown>
          onToolCall({
            id: toolData.toolCallId || toolData.name || '',
            name: toolData.name || 'unknown',
            arguments: toolData.args || toolData.input || '',
            status: toolData.phase === 'end' ? 'completed' : 'running'
          })
          return
        }

        if (payload.tool || payload.name) {
          onToolCall({
            id: payload.toolCallId || payload.id || payload.name || '',
            name: payload.tool || payload.name || 'unknown',
            arguments: payload.input || payload.arguments || payload.label || '',
            status: payload.status || 'running'
          })
          return
        }
      }

      const toolResultHandler = (payload: Record<string, unknown>): void => {
        if (onToolCall && payload) {
          onToolCall({
            id: payload.toolCallId || payload.id || '',
            name: payload.name || 'unknown',
            status: payload.status || 'completed',
            result: payload.result || payload.content || ''
          })
        }
      }

      this._wsClient.on('chat', chatHandler)
      this._wsClient.on('session', chatHandler)
      this._wsClient.on('tool', toolHandler)
      this._wsClient.on('toolResult', toolResultHandler)

      const agentHandler = (payload: Record<string, unknown>): void => {
        if (!payload) return
        const req = this._activeRequests.get(requestId)
        if (!req || req.done) return
        const { stream, data } = payload as {
          stream?: string
          data?: Record<string, unknown>
        }

        if (stream === 'lifecycle') {
          if (data?.phase === 'start' && onThinking) {
            onThinking({ status: 'thinking', agentId })
          } else if (data?.phase === 'end' && onThinking) {
            onThinking({ status: 'idle', agentId })
          }
        } else if (stream === 'item' && data?.kind === 'tool') {
          if (onToolStep) {
            onToolStep({
              name: data.name || 'unknown',
              phase: data.phase || 'start',
              meta: data.meta || data.title || '',
              toolCallId: data.toolCallId || '',
              agentId
            })
          }
          if (onToolCall) {
            onToolCall({
              id: data.toolCallId || data.name || '',
              name: data.name || 'unknown',
              meta: data.meta || data.title || '',
              status: data.phase === 'end' ? 'completed' : 'running'
            })
          }
        }
      }
      this._wsClient.on('agent', agentHandler)

      const sessionToolHandler = (payload: Record<string, unknown>): void => {
        if (!payload) return
        const req = this._activeRequests.get(requestId)
        if (!req || req.done) return
        if (lastSessionKey) {
          const eventKey =
            (payload.sessionKey as string) || (payload.key as string) || ''
          if (eventKey && eventKey !== lastSessionKey) return
        }
        const data = payload.data as Record<string, unknown> | undefined
        if (!data) return

        const rawArgs = data.args || data.input || data.arguments || data.params || data.parameters
        const meta = (data.meta as string) || (data.title as string) || ''
        this._log.debug(
          '[Tool]',
          data.name,
          'meta:',
          meta.substring(0, 100),
          'args:',
          JSON.stringify(rawArgs || '(none)').substring(0, 100)
        )

        const toolInfo: Record<string, unknown> = {
          id: data.toolCallId || data.name || '',
          name: data.name || 'unknown',
          phase: data.phase || 'start',
          args: rawArgs || meta || '',
          meta,
          status: data.phase === 'end' ? 'completed' : 'running',
          agentId
        }

        if (onToolCall) onToolCall(toolInfo)
        if (onToolStep) onToolStep(toolInfo)
      }
      this._wsClient.on('tool', sessionToolHandler)

      const cleanup = (): void => {
        const req = this._activeRequests.get(requestId)
        if (req) req.done = true
        this._activeRequests.delete(requestId)
        if (lastSessionKey) {
          this._echoraActiveRequests.delete(lastSessionKey)
          this._log.debug('Unregistered active request for sessionKey=%s', lastSessionKey)
        }
        if (!this._wsClient) return
        this._wsClient.removeListener('chat', chatHandler)
        this._wsClient.removeListener('session', chatHandler)
        this._wsClient.removeListener('chat', finalHandler)
        this._wsClient.removeListener('session', finalHandler)
        this._wsClient.removeListener('tool', toolHandler)
        this._wsClient.removeListener('toolResult', toolResultHandler)
        this._wsClient.removeListener('agent', agentHandler)
        this._wsClient.removeListener('tool', sessionToolHandler)
      }

      const finalHandler = (payload: Record<string, unknown>): void => {
        if (done) return
        const req = this._activeRequests.get(requestId)
        if (!req || req.done) return
        if (lastSessionKey) {
          const eventKey =
            (payload?.sessionKey as string) || (payload?.key as string) || ''
          if (eventKey && eventKey !== lastSessionKey) return
        }
        this._log.debug('FINAL payload keys:', Object.keys(payload || {}).join(','))
        this._log.debug(
          'FINAL state:',
          payload?.state,
          'hasUsage:',
          !!(payload?.usage || (payload?.message as Record<string, unknown>)?.usage)
        )
        if (payload?.state === 'final' || payload?.state === 'error') {
          done = true
          if (payload.sessionKey) {
            lastSessionKey = payload.sessionKey as string
            this._lastSessionKey = payload.sessionKey as string
            this._log.info('finalHandler: captured sessionKey=%s', payload.sessionKey)
          }
          const msg = payload.message as Record<string, unknown> | undefined
          const finalText =
            (msg?.text as string) ||
            (msg?.content as string) ||
            (typeof payload.message === 'string' ? (payload.message as string) : '')
          if (finalText && !fullContent) fullContent = finalText
          const rawUsage = (payload.usage || msg?.usage || null) as Record<string, unknown> | null
          const normalized: OpenClawUsage | null = rawUsage
            ? {
                input: (rawUsage.input as number) || 0,
                output: (rawUsage.output as number) || 0,
                totalTokens: (rawUsage.totalTokens as number) || 0,
                cacheRead: (rawUsage.cacheRead as number) || 0,
                cacheWrite: (rawUsage.cacheWrite as number) || 0,
                cost: (rawUsage.cost as number) || null
              }
            : null
          if (normalized) this._lastUsage = normalized
          const metrics = normalized ? { usage: normalized } : null
          this._log.debug(
            'WS onDone usage:',
            JSON.stringify(normalized || '(none)').substring(0, 300)
          )
          cleanup()
          if (onDone) onDone(fullContent, null, metrics, lastSessionKey || undefined)
          if (onUsage && normalized) {
            onUsage(normalized as unknown as Record<string, unknown>)
          } else if (onUsage && !normalized && this._lastSessionKey) {
            this._wsClient
              ?.rpc('chat.history', { sessionKey: this._lastSessionKey, limit: 1 })
              .then((history) => {
                const h = history as Record<string, unknown>
                const msgs = (h?.messages || h || []) as Record<string, unknown>[]
                for (let i = msgs.length - 1; i >= 0; i--) {
                  const msg = msgs[i] as Record<string, unknown>
                  const u = msg?.usage as Record<string, unknown> | undefined
                  if (u && ((u.input as number) > 0 || (u.totalTokens as number) > 0)) {
                    const usageData = {
                      input: (u.input as number) || 0,
                      output: (u.output as number) || 0,
                      totalTokens: (u.totalTokens as number) || 0,
                      cacheRead: (u.cacheRead as number) || 0,
                      cacheWrite: (u.cacheWrite as number) || 0,
                      cost: (u.cost as number) || null
                    }
                    this._lastUsage = usageData
                    onUsage(usageData as unknown as Record<string, unknown>)
                    break
                  }
                }
              })
              .catch((e) => this._log.warn('Usage fetch failed:', e.message))
          }
        }
      }
      this._wsClient.on('chat', finalHandler)
      this._wsClient.on('session', finalHandler)

      try {
        const idempotencyKey = `idem-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
        try {
          const rpcParams: Record<string, unknown> = {
            sessionKey: ocSessionKey,
            idempotencyKey,
            message
          }
          if (attachments && attachments.length > 0) {
            rpcParams.attachments = attachments.map(a => ({
              name: a.name,
              content: a.content,
              mimeType: a.mimeType
            }))
          }
          this._log.info('chat.send params: %s', JSON.stringify(rpcParams).substring(0, 300))
          this._log.info('chat.send message type=%s value=%s', typeof message, String(message).substring(0, 100))
          const rpcResult = (await this._wsClient.rpc('chat.send', rpcParams)) as Record<string, unknown> | null
          this._log.info('chat.send OK: sessionKey=%s result=%s', ocSessionKey, JSON.stringify(rpcResult || {}).substring(0, 500))
          if (rpcResult?.sessionKey) {
            lastSessionKey = rpcResult.sessionKey as string
            this._lastSessionKey = rpcResult.sessionKey as string
            this._log.info('chat.send: using returned sessionKey=%s', rpcResult.sessionKey)
          } else {
            lastSessionKey = ocSessionKey
            this._lastSessionKey = ocSessionKey
          }
          if (lastSessionKey) {
            this._echoraActiveRequests.add(lastSessionKey)
            this._log.debug('Registered active request for sessionKey=%s', lastSessionKey)
          }

          // ── Slash command response: only check if message starts with / ──
          if (rpcResult && !done && typeof message === 'string' && message.startsWith('/')) {
            this._log.info('Slash command detected, checking rpcResult for direct response')
            const allKeys = Object.keys(rpcResult)
            this._log.info('RPC result keys: [%s]', allKeys.join(', '))
            // Check for response content in common fields (exclude status/sessionKey/idempotencyKey)
            const slashResponse =
              (rpcResult.response as string) ||
              (rpcResult.content as string) ||
              (rpcResult.message as string) ||
              (rpcResult.text as string) ||
              (rpcResult.output as string) ||
              (rpcResult.reply as string) ||
              (rpcResult.result as string)
            // Also check nested result object
            const nestedResult = rpcResult.result as Record<string, unknown> | undefined
            const nestedResponse = nestedResult &&
              (nestedResult.response as string || nestedResult.content as string || nestedResult.message as string)
            const finalResponse = slashResponse || nestedResponse
            if (finalResponse && typeof finalResponse === 'string' && finalResponse.trim()) {
              this._log.info('Slash command response DETECTED: %s', finalResponse.substring(0, 300))
              done = true
              cleanup()
              if (onDone) onDone(finalResponse, null, null, lastSessionKey || undefined)
              return
            }
            this._log.info('No slash response found in RPC result, waiting for streaming events')
          }
        } catch (rpcError) {
          this._log.warn('chat.send error (may still be sent):', (rpcError as Error).message)
        }

        await new Promise<void>((resolve) => {
          const timeout = setTimeout(() => {
            if (!done) {
              done = true
              cleanup()
              if (fullContent) {
                this._log.warn('WS response timeout, using collected:', fullContent.substring(0, 100))
                if (onDone) onDone(fullContent, null, null, lastSessionKey || undefined)
              } else {
                this._log.warn('WS response timeout, no content received')
                if (onError) onError(new Error('响应超时（无内容返回）'))
              }
            }
            resolve()
          }, this._requestTimeout)
          void timeout
        })
      } catch (e) {
        if (onError) onError(e as Error)
      }
      return
    }

    this._log.info('Falling back to HTTP SSE')
    const bodyObj: Record<string, unknown> = {
      model,
      messages: [{ role: 'user', content: message }],
      user: userId || undefined,
      stream: true,
      max_tokens: 4096
    }
    if (attachments && attachments.length > 0) {
      bodyObj.attachments = attachments.map(a => ({
        name: a.name,
        content: a.content,
        mimeType: a.mimeType
      }))
    }
    const body = JSON.stringify(bodyObj)
    this._log.debug(
      'sendMessageStream: model=%s, endpoint=%s, token=%s...',
      model,
      this._chatEndpoint || '/v1/chat/completions',
      this.token?.substring(0, 8)
    )
    const url = new URL(this.baseUrl)
    const endpoint = this._chatEndpoint || '/v1/chat/completions'
    const options: http.RequestOptions = {
      hostname: url.hostname,
      port: url.port,
      path: endpoint,
      method: 'POST',
      timeout: this._requestTimeout,
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        Accept: 'text/event-stream'
      }
    }
    let fullContent = ''
    let usage: Record<string, unknown> | null = null
    const req = http.request(options, (res) => {
      if (res.statusCode! >= 400) {
        let errBody = ''
        res.on('data', (c) => (errBody += c))
        res.on('end', () => {
          if (onError) onError(new Error(`${res.statusCode} ${res.statusMessage}`))
        })
        return
      }
      let buffer = ''
      res.on('data', (chunk) => {
        buffer += chunk.toString()
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed.startsWith('data: ')) continue
          const payload = trimmed.slice(6).trim()
          if (payload === '[DONE]') {
            if (onDone) onDone(fullContent, null, usage ? { usage } : null)
            return
          }
          try {
            const parsed = JSON.parse(payload)
            const delta = parsed.choices?.[0]?.delta
            if (delta?.content) {
              fullContent += delta.content
              if (onChunk) onChunk(delta.content, fullContent)
            }
            if (delta?.tool_calls && onToolCall) {
              for (const tc of delta.tool_calls) {
                onToolCall({
                  id: tc.id,
                  type: 'function',
                  name: tc.function?.name || 'unknown',
                  arguments: tc.function?.arguments || '',
                  status: 'running'
                })
              }
            }
            if (parsed.usage) usage = parsed.usage
          } catch (_e) { /* suppress */ }
        }
      })
      res.on('end', () => {
        if (onDone) onDone(fullContent, null, usage ? { usage } : null)
      })
    })
    req.setTimeout(this._requestTimeout, () => {
      req.destroy()
      if (onError) onError(new Error('请求超时'))
    })
    req.on('error', (err) => {
      if (onError) onError(err)
    })
    req.end(body)
    return req
  }

  async getModelInfo(agentId?: string): Promise<AdapterModelInfo> {
    const configPath = path.join(os.homedir(), '.openclaw', 'openclaw.json')
    let modelName = this._currentModel || this._defaultModel || null
    let contextWindow: number | null = null
    try {
      if (fs.existsSync(configPath)) {
        const raw = JSON.parse(fs.readFileSync(configPath, 'utf8'))
        const agents = raw.agents?.list || []
        const targetId = agentId || this._currentAgentId || null
        const targetAgent = targetId
          ? agents.find((a: Record<string, unknown>) => a.id === targetId)
          : agents[0]
        if (targetAgent?.model?.primary) modelName = targetAgent.model.primary
        const providers = raw.models?.providers || {}
        for (const [providerId, p] of Object.entries(providers) as [string, Record<string, unknown>][]) {
          if (p.models) {
            for (const m of p.models as Record<string, unknown>[]) {
              const fullPath = `${providerId}/${m.id}`
              if (fullPath === modelName && m.contextWindow)
                contextWindow = m.contextWindow as number
            }
          }
        }
      }
    } catch (_e) { /* suppress */ }

    let contextUsed: number | null = null
    let usagePct: number | null = null
    if (this._lastUsage) {
      contextUsed = this._lastUsage.totalTokens || this._lastUsage.input || null
    }

    if (!contextUsed) {
      try {
        if (this._wsClient && this._wsClient.connected && this._wsClient.authenticated) {
          try {
            const usageResult = (await this._wsClient.rpc('sessions.usage', {})) as Record<
              string,
              unknown
            > | null
            this._log.debug('sessions.usage:', JSON.stringify(usageResult).substring(0, 300))
            if (usageResult) {
              const sessions = (usageResult.sessions || usageResult) as Record<
                string,
                Record<string, number>
              >
              if (typeof sessions === 'object') {
                let totalPrompt = 0
                for (const [, val] of Object.entries(sessions)) {
                  if (val && typeof val === 'object') {
                    totalPrompt +=
                      val.promptTokens ||
                      val.prompt_tokens ||
                      val.inputTokens ||
                      val.input_tokens ||
                      val.input ||
                      0
                  }
                }
                if (totalPrompt > 0) contextUsed = totalPrompt
              }
            }
          } catch (e2) {
            this._log.warn('sessions.usage failed:', (e2 as Error).message)
          }
          if (!contextUsed && this._lastSessionKey) {
            try {
              const history = (await this._wsClient.rpc('chat.history', {
                sessionKey: this._lastSessionKey,
                limit: 1
              })) as Record<string, unknown>
              this._log.debug('chat.history:', JSON.stringify(history).substring(0, 500))
              const msgs = (history?.messages || history || []) as Record<string, unknown>[]
              for (let i = msgs.length - 1; i >= 0; i--) {
                const msg = msgs[i] as Record<string, unknown>
                const u = msg?.usage as Record<string, number> | undefined
                if (u && (u.input > 0 || u.totalTokens > 0)) {
                  contextUsed = u.totalTokens || u.input || null
                  this._lastUsage = {
                    input: u.input || 0,
                    output: u.output || 0,
                    totalTokens: u.totalTokens || 0,
                    cacheRead: u.cacheRead || 0,
                    cacheWrite: u.cacheWrite || 0,
                    cost: u.cost || null
                  }
                  break
                }
              }
            } catch (e3) {
              this._log.warn('chat.history failed:', (e3 as Error).message)
            }
          }
        }
      } catch (e) {
        this._log.warn('getModelInfo usage failed:', (e as Error).message)
      }
    }

    if (contextUsed != null && contextUsed >= 0 && contextWindow! > 0) {
      usagePct = Math.round((contextUsed / contextWindow!) * 100 * 10) / 10
    }

    this._log.info('getModelInfo:', { modelName, contextWindow, contextUsed, usagePct })
    return { model: modelName, contextWindow, contextUsed, usagePct }
  }

  async listModels(): Promise<AdapterModelItem[]> {
    const models: AdapterModelItem[] = []
    const configPath = path.join(os.homedir(), '.openclaw', 'openclaw.json')
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
    const configPath = path.join(os.homedir(), '.openclaw', 'openclaw.json')
    try {
      const raw = JSON.parse(fs.readFileSync(configPath, 'utf8'))
      const agents = raw.agents?.list
      if (!Array.isArray(agents) || agents.length === 0)
        return { success: false, needsRestart: false, message: '配置中无 agents.list' }

      // Find the correct agent: by _currentAgentId → by default flag → first agent
      let agent = agents.find((a: Record<string, unknown>) => a.id === this._currentAgentId)
      if (!agent) agent = agents.find((a: Record<string, unknown>) => a.default === true)
      if (!agent) agent = agents[0]

      agent.model = agent.model || {}
      agent.model.primary = modelId
      fs.writeFileSync(configPath, JSON.stringify(raw, null, 2), 'utf8')
      this._currentModel = modelId
      this._log.info('switchModel: agent=%s model=%s', agent.id || agent.name, modelId)
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
              reject(new Error('解析失败'))
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

  async listSessions(opts: Record<string, unknown> = {}): Promise<unknown[]> {
    const wsConnected = await this._connectWebSocket()
    if (!wsConnected || !this._wsClient) throw new Error('WebSocket 未连接')
    const result = (await this._wsClient.rpc('sessions.list', opts)) as Record<string, unknown>
    const sessions = (result?.sessions || []) as unknown[]
    this._log.info(
      'listSessions: %d sessions fetched (opts: %s)',
      sessions.length,
      JSON.stringify(opts)
    )
    return sessions
  }

  async getSessionHistory(sessionKey: string, limit = 50): Promise<unknown> {
    const wsConnected = await this._connectWebSocket()
    if (!wsConnected || !this._wsClient) throw new Error('WebSocket 未连接')
    const result = (await this._wsClient.rpc('chat.history', {
      sessionKey,
      limit
    })) as Record<string, unknown>
    const msgs = (result?.messages || result || []) as Record<string, unknown>[]
    const userCount = msgs.filter((m) => m?.role === 'user').length
    const assistantCount = msgs.filter((m) => m?.role === 'assistant').length
    this._log.info(
      'getSessionHistory: key=%s total=%d users=%d assistants=%d',
      sessionKey,
      msgs.length,
      userCount,
      assistantCount
    )
    if (msgs.length > 0) {
      const m0 = msgs[0]
      this._log.debug(
        'First msg:',
        JSON.stringify({
          role: m0?.role,
          content: m0?.content,
          timestamp: m0?.timestamp
        }).substring(0, 300)
      )
    }
    return result
  }

  async createSession(params: Record<string, unknown> = {}): Promise<unknown> {
    const wsConnected = await this._connectWebSocket()
    if (!wsConnected || !this._wsClient) throw new Error('WebSocket 未连接')
    const result = await this._wsClient.rpc('sessions.create', params)
    this._log.info('createSession:', JSON.stringify(result || {}).substring(0, 200))
    return result
  }

  async deleteSession(sessionKey: string): Promise<unknown> {
    const wsConnected = await this._connectWebSocket()
    if (!wsConnected || !this._wsClient) throw new Error('WebSocket 未连接')
    const result = await this._wsClient.rpc('sessions.delete', { sessionKey })
    this._log.info('deleteSession: key=%s', sessionKey)
    return result
  }

  async resetSession(sessionKey: string): Promise<unknown> {
    const wsConnected = await this._connectWebSocket()
    if (!wsConnected || !this._wsClient) throw new Error('WebSocket 未连接')
    const result = await this._wsClient.rpc('sessions.reset', { sessionKey })
    this._log.info('resetSession: key=%s', sessionKey)
    return result
  }
}

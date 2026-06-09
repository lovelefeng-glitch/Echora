import { spawn, execSync } from 'child_process'
import path from 'path'
import fs from 'fs'
import http from 'http'
import net from 'net'
import yaml from 'js-yaml'
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
  type SetModelResult,
  type StreamCallbacks
} from './base-adapter'
import { create, type Logger } from '../utils/console-logger'

const LOG_DIR = path.join(os.homedir(), 'AppData', 'Local', 'Echora', 'logs')
const _log: Logger = create('Hermes')

function logAdapter(level: string, msg: string, data?: unknown): void {
  try {
    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true })
    const ts = new Date().toISOString()
    const line =
      '[' + ts + '] [' + level + '] ' + msg + (data ? ' ' + JSON.stringify(data) : '') + '\n'
    fs.appendFileSync(path.join(LOG_DIR, 'hermes-adapter.log'), line)
  } catch (_e) { /* suppress */ }
}

const PROXY_PORT = 8085
export const DIRECT_PORT = 8083
const DEFAULT_API_PORT = DIRECT_PORT  // Proxy 已停用，直连 Hermes
const API_KEY = '[REDACTED]'

interface HermesConfig extends AdapterConfig {
  hermesRoot?: string
  apiPort?: number
  apiKey?: string
  execPath?: string
}

interface HermesModelInfo {
  model: string | null
  promptTokens: number | null
  completionTokens: number | null
  totalTokens: number | null
}

interface HermesConfigYaml {
  model?: Record<string, unknown> | string
  agent?: { gateway_timeout?: number; max_turns?: number }
  custom_providers?: Array<{
    name?: string
    base_url?: string
    api_key?: string
    model?: string
    models?: Record<string, { context_length?: number }>
  }>
  [key: string]: unknown
}

export class HermesAdapter extends BaseAdapter<HermesConfig> {
  public aiType = 'hermes'
  public apiPort: number
  public baseUrl: string
  private apiKey: string
  private _procs: Map<string, ReturnType<typeof spawn>> = new Map()
  private _hermesConfig: HermesConfigYaml | null = null
  private _configParams: { gatewayTimeout: number; maxTurns: number } | null = null
  private _lastModelInfo: HermesModelInfo | null = null
  private _currentModel: string | null = null
  private _promptTokensStateFile: string | null = null
  private _lastPromptTokensBySession: Map<string, number>
  private _streamStartTime = 0
  private _lastLatency: number | null = null
  private _lastToolCalls: Record<string, unknown>[] = []
  private _tokensCaptured = false
  private _lastFirstChunkTime: number | null = null
  private _capabilities: Record<string, unknown> | null = null

  constructor(config: HermesConfig = {}) {
    super(config)
    this.name = 'hermes'
    this._log = create('Hermes')
    this.apiPort = config.port || config.apiPort || DEFAULT_API_PORT
    this.baseUrl = config.baseUrl || `http://127.0.0.1:${this.apiPort}`
    this.apiKey = config.apiKey || API_KEY
    this._lastPromptTokensBySession = this._loadPromptTokensState()
  }

  private _loadHermesConfig(): boolean {
    if (this._hermesConfig) return true
    const hermesRoot =
      this.config.hermesRoot || path.join(os.homedir(), 'AppData', 'Local', 'hermes')
    const configPath = path.join(hermesRoot, 'config.yaml')
    if (!fs.existsSync(configPath)) return false
    try {
      this._hermesConfig = yaml.load(fs.readFileSync(configPath, 'utf8')) as HermesConfigYaml
      this._configParams = {
        gatewayTimeout: ((this._hermesConfig?.agent?.gateway_timeout as number) || 1800) * 1000,
        maxTurns: (this._hermesConfig?.agent?.max_turns as number) || 90
      }
      return true
    } catch (e) {
      _log.warn('config.yaml 读取失败:', (e as Error).message)
      return false
    }
  }

  private _getStateFilePath(): string {
    if (this._promptTokensStateFile) return this._promptTokensStateFile
    this._loadHermesConfig()
    const hermesRoot =
      this.config.hermesRoot || path.join(os.homedir(), 'AppData', 'Local', 'hermes')
    this._promptTokensStateFile = path.join(hermesRoot, 'echora_session_state.json')
    return this._promptTokensStateFile
  }

  private _loadPromptTokensState(): Map<string, number> {
    try {
      const p = this._getStateFilePath()
      if (fs.existsSync(p)) {
        const data = JSON.parse(fs.readFileSync(p, 'utf8'))
        return new Map(Object.entries(data) as [string, number][])
      }
    } catch (e) {
      _log.warn('无法读取 session state:', (e as Error).message)
    }
    return new Map()
  }

  private _savePromptTokensState(): void {
    try {
      const p = this._getStateFilePath()
      const obj = Object.fromEntries(this._lastPromptTokensBySession)
      fs.writeFileSync(p, JSON.stringify(obj, null, 2), 'utf8')
    } catch (e) {
      _log.warn('无法保存 session state:', (e as Error).message)
    }
  }

  private _getHermesExe(): string | null {
    const exePath = this.config.exePath || this.config.execPath
    if (exePath && fs.existsSync(exePath)) return exePath
    const candidates = [
      path.join(os.homedir(), 'AppData', 'Local', 'hermes', 'hermes-agent', 'venv', 'Scripts', 'hermes.exe'),
      path.join(os.homedir(), 'AppData', 'Local', 'hermes', 'hermes.exe')
    ]
    for (const c of candidates) {
      if (fs.existsSync(c)) return c
    }
    return null
  }

  async start(profileName?: string): Promise<StartResult> {
    const procKey = profileName || '__main__'
    const checkPort = profileName ? this._getProfilePort(profileName) : DIRECT_PORT
    const label = profileName ? `profile ${profileName}` : 'main'
    const alive = await this._checkPortStatus(checkPort)
    if (alive)
      return { success: true, message: `Hermes ${label} 已在运行 (port ${checkPort})` }

    this._loadHermesConfig()
    const hermesExe = this._getHermesExe()
    if (!hermesExe) return { success: false, message: '未找到 Hermes 可执行文件' }

    const args = profileName
      ? ['-p', profileName, 'gateway', 'run', '--replace']
      : ['gateway', 'run', '--replace']

    const env = { ...process.env }
    if (profileName) {
      const profilePort = this._getProfilePort(profileName)
      this._ensureProfileApiConfig(profileName, profilePort)
      logAdapter('INFO', `Starting ${label} on port ${profilePort}`)
    } else {
      logAdapter('INFO', `Starting ${label}`)
    }

    const proc = spawn(hermesExe, args, {
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      env
    })
    proc.stdout?.on('data', (d) => _log.raw(d.toString().trim()))
    proc.stderr?.on('data', (d) => _log.warn('stderr:', d.toString().trim()))
    this._procs.set(procKey, proc)

    // 只在主 agent 启动时修改 adapter 状态
    if (!profileName) {
      this.status = 'starting'
    }
    if (this._configParams) this._requestTimeout = this._configParams.gatewayTimeout

    try {
      await this._waitForReady(30000, profileName)
      logAdapter('INFO', `Hermes ${label} started (port ${checkPort})`)
      return { success: true, message: `Hermes ${label} 启动成功` }
    } catch (e) {
      if (!profileName) {
        this.status = 'error'
      }
      logAdapter('ERROR', `${label} start failed`, { error: (e as Error).message })
      return { success: false, message: (e as Error).message }
    }
  }

  async stop(): Promise<StopResult> {
    // 停止主 agent 进程
    const mainProc = this._procs.get('__main__')
    if (mainProc) {
      try {
        if (process.platform === 'win32' && mainProc.pid) {
          execSync(`taskkill /T /F /PID ${mainProc.pid}`, { stdio: 'ignore' })
        } else {
          mainProc.kill('SIGTERM')
        }
      } catch (_e) { /* suppress */ }
      this._procs.delete('__main__')
    }
    try {
      const netstat = execSync('netstat -ano', { encoding: 'utf-8', timeout: 3000 })
      const lines = netstat.split('\n')
      const portsToKill = new Set([DIRECT_PORT])
      for (const line of lines) {
        for (const port of portsToKill) {
          const m = line.match(
            new RegExp(`TCP\\s+127\\.0\\.0\\.1:${port}\\s+\\S+\\s+LISTENING\\s+(\\d+)`)
          )
          if (m) {
            const pid = parseInt(m[1], 10)
            if (pid && pid !== process.pid) {
              execSync(`taskkill /T /F /PID ${pid}`, { stdio: 'ignore' })
              logAdapter('INFO', 'stop: killed process on port', { port, pid })
            }
          }
        }
      }
    } catch (_e) { /* suppress */ }
    this.status = 'offline'
    return { success: true }
  }

  async stopProfile(profileName: string): Promise<StopResult> {
    const port = this._getProfilePort(profileName)
    logAdapter('INFO', `Stopping profile ${profileName} on port ${port}`)

    // 优先从 _procs Map 取进程引用
    const proc = this._procs.get(profileName)
    if (proc) {
      try {
        if (process.platform === 'win32' && proc.pid) {
          execSync(`taskkill /T /F /PID ${proc.pid}`, { stdio: 'ignore' })
        } else {
          proc.kill('SIGTERM')
        }
        logAdapter('INFO', `stopProfile: killed ${profileName} via _procs`, { pid: proc.pid })
      } catch (e) {
        logAdapter('WARN', `stopProfile: _procs kill failed: ${(e as Error).message}`)
      }
      this._procs.delete(profileName)
    }

    // Fallback: 通过 netstat 查端口杀进程
    try {
      const netstat = execSync('netstat -ano', { encoding: 'utf-8', timeout: 3000 })
      for (const line of netstat.split('\n')) {
        const m = line.match(
          new RegExp(`TCP\\s+127\\.0\\.0\\.1:${port}\\s+\\S+\\s+LISTENING\\s+(\\d+)`)
        )
        if (m) {
          const pid = parseInt(m[1], 10)
          if (pid && pid !== process.pid) {
            execSync(`taskkill /T /F /PID ${pid}`, { stdio: 'ignore' })
            logAdapter('INFO', `stopProfile: killed ${profileName} via netstat`, { port, pid })
          }
        }
      }
    } catch (e) {
      logAdapter('WARN', `stopProfile netstat fallback failed: ${(e as Error).message}`)
    }
    return { success: true }
  }

  async getStatus(): Promise<StatusResult> {
    try {
      await this._testPort(DIRECT_PORT)
      this.status = 'running'
      logAdapter('INFO', 'getStatus: running (via direct port)', { port: DIRECT_PORT })
      return { status: 'running', hasChatAPI: true, capabilities: [], fastCheck: true }
    } catch (e) {
      logAdapter('DEBUG', 'getStatus: DIRECT_PORT not reachable', {
        port: DIRECT_PORT,
        error: (e as Error).message
      })
    }

    try {
      const hermesRoot =
        this.config.hermesRoot || path.join(os.homedir(), 'AppData', 'Local', 'hermes')
      const statePath = path.join(hermesRoot, 'gateway_state.json')
      if (fs.existsSync(statePath)) {
        const stateData = JSON.parse(fs.readFileSync(statePath, 'utf8'))
        if (stateData.gateway_state === 'running' && stateData.pid) {
          try {
            process.kill(stateData.pid, 0)
            logAdapter('WARN', 'getStatus: PID alive but DIRECT_PORT dead (needs restart)', {
              pid: stateData.pid,
              directPort: DIRECT_PORT
            })
            this.status = 'needs_restart'
            return {
              status: 'needs_restart',
              hasChatAPI: false,
              pid: stateData.pid,
              message: 'Hermes 进程在跑但 API Server 端口未监听，建议点击重启'
            }
          } catch (_e) {
            logAdapter('WARN', 'getStatus: PID dead but state says running', {
              pid: stateData.pid
            })
          }
        }
      }
    } catch (e) {
      logAdapter('DEBUG', 'getStatus: gateway_state.json read failed', {
        error: (e as Error).message
      })
    }

    try {
      const data = (await this._httpGet('/health/detailed')) as Record<string, unknown> | null
      if (data && (data.status === 'ok' || data.status === 'running' || data.ok)) {
        this.status = 'running'
        logAdapter('INFO', 'getStatus: running (via /health/detailed)')
        return {
          status: 'running',
          hasChatAPI: true,
          capabilities: (data.capabilities as string[]) || [],
          pid: data.pid as number,
          gatewayState: data.gateway_state as string,
          activeAgents: data.active_agents as number,
          platforms: data.platforms as Record<string, unknown>,
        }
      }
    } catch (_e) { /* suppress */ }

    this.status = 'offline'
    return { status: 'offline' }
  }

  async listAgents(): Promise<AdapterAgentItem[]> {
    this._loadHermesConfig()
    const agents: AdapterAgentItem[] = [
      { id: 'hermes-agent', name: 'Hermes Agent', description: '完整 Hermes agent（工具/记忆/技能）' }
    ]
    try {
      const hermesRoot =
        this.config.hermesRoot || path.join(os.homedir(), 'AppData', 'Local', 'hermes')
      const profilesDir = path.join(hermesRoot, 'profiles')
      if (fs.existsSync(profilesDir)) {
        const profiles = fs
          .readdirSync(profilesDir)
          .filter((f) => {
            try {
              const dirPath = path.join(profilesDir, f)
              return fs.statSync(dirPath).isDirectory() &&
                fs.existsSync(path.join(dirPath, 'config.yaml'))
            } catch { return false }
          })
        for (const p of profiles) {
          agents.push({
            id: p,
            name: `Hermes (${p})`,
            description: `Profile: ${p}`
          })
        }
      }
    } catch (_e) { /* suppress */ }
    return agents
  }

  async sendMessage(agentId: string, messages: string | unknown[], userId?: string): Promise<SendMessageResult> {
    logAdapter('INFO', 'sendMessage called', {
      agentId,
      userId,
      messageCount: Array.isArray(messages) ? messages.length : 1
    })
    let latestMessage: string
    if (Array.isArray(messages)) {
      latestMessage = (messages[messages.length - 1] as Record<string, unknown>)?.content as string || ''
    } else {
      latestMessage = messages || ''
    }

    let model = this._currentModel
    if (!model) {
      if (agentId && agentId !== 'main' && agentId !== 'hermes-agent') {
        model = this._getProfileModel(agentId) || agentId
      } else {
        this._loadHermesConfig()
        const m = this._hermesConfig?.model as Record<string, unknown> | undefined
        model = ((m?.default as string) || (m?.main as string)) || 'deepseek-ai/deepseek-v4-pro'
      }
    }

    logAdapter('DEBUG', 'sendMessage model dispatch', {
      _currentModel: this._currentModel,
      resolvedModel: model,
      agentId
    })

    const body = JSON.stringify({
      model,
      messages: [{ role: 'user', content: latestMessage }],
      stream: false,
      max_tokens: 16384
    })

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body).toString(),
      Authorization: `Bearer ${this.apiKey}`
    }
    if (userId) headers['X-Hermes-Session-Id'] = userId
    logAdapter('DEBUG', 'sendMessage headers', {
      hasSessionId: !!headers['X-Hermes-Session-Id'],
      sessionId: headers['X-Hermes-Session-Id'] || 'NONE',
      model,
      bodyPreview: latestMessage.substring(0, 200)
    })

    // Profile agent 直连对应端口（与 sendMessageStream 逻辑一致）
    let profilePort: number | undefined
    if (agentId && agentId !== 'main' && agentId !== 'hermes-agent') {
      profilePort = this._getProfilePort(agentId)
      logAdapter('DEBUG', `sendMessage: Profile ${agentId} → direct port ${profilePort}`)
    }

    try {
      const data = (await this._httpPost('/v1/chat/completions', body, headers, profilePort)) as Record<string, unknown>
      const choices = data?.choices as Record<string, unknown>[] | undefined
      if (choices?.[0]) {
        logAdapter('INFO', 'sendMessage success', {
          messageId: data.id,
          requestId: (data._requestId as string) || 'N/A',
          returnedSessionId: (data._sessionId as string) || 'N/A',
          sentSessionId: userId || 'N/A'
        })
        if (data.usage) {
          const usage = data.usage as Record<string, number>
          this._lastModelInfo = {
            model: (data.model as string) || 'hermes-agent',
            promptTokens: usage.prompt_tokens || 0,
            completionTokens: usage.completion_tokens || 0,
            totalTokens: usage.total_tokens || 0
          }
          const sessionKey = userId || '_default'
          this._lastPromptTokensBySession.set(sessionKey, usage.prompt_tokens || 0)
          this._savePromptTokensState()
        } else if (data.model) {
          this._lastModelInfo = {
            model: data.model as string,
            promptTokens: null,
            completionTokens: null,
            totalTokens: null
          }
        }
        return {
          success: true,
          content: (choices![0].message as Record<string, unknown>).content as string,
          messageId: data.id as string,
          sessionId: (data._sessionId as string) || userId,
          finishReason: (choices![0] as Record<string, unknown>).finish_reason as string,
          created: data.created as number,
          model: (data.model as string) || model
        }
      }
      return { success: false, message: '无效响应格式' }
    } catch (e) {
      if ((e as Error).message && (e as Error).message.includes('502')) {
        logAdapter('WARN', '502 fallback to stream')
        return this._sendViaStream(model!, latestMessage, userId)
      }
      logAdapter('ERROR', 'sendMessage failed', { error: (e as Error).message })
      return { success: false, message: (e as Error).message }
    }
  }

  private _sendViaStream(
    model: string,
    message: string,
    userId?: string
  ): Promise<SendMessageResult> {
    return new Promise((resolve) => {
      const body = JSON.stringify({
        model,
        messages: [{ role: 'user', content: message }],
        stream: true,
        max_tokens: 16384
      })

      const url = new URL(this.baseUrl)
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body).toString(),
        Accept: 'text/event-stream',
        Authorization: `Bearer ${this.apiKey}`
      }
      if (userId) headers['X-Hermes-Session-Id'] = userId

      const options: http.RequestOptions = {
        hostname: url.hostname,
        port: url.port,
        path: '/v1/chat/completions',
        method: 'POST',
        timeout: this._requestTimeout,
        headers
      }

      let fullContent = ''
      let returnedSessionId: string | null = null

      const req = http.request(options, (res) => {
        returnedSessionId = (res.headers['x-hermes-session-id'] as string) || null
        logAdapter('DEBUG', '_sendViaStream response headers', {
          statusCode: res.statusCode,
          returnedSessionId: returnedSessionId || 'N/A',
          sentSessionId: userId || 'N/A'
        })

        if (res.statusCode! >= 400) {
          let errBody = ''
          res.on('data', (c) => (errBody += c))
          res.on('end', () =>
            resolve({ success: false, message: `${res.statusCode}: ${errBody.substring(0, 200)}` })
          )
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
              resolve({ success: true, content: fullContent, sessionId: returnedSessionId ?? undefined })
              return
            }
            try {
              const parsed = JSON.parse(payload)
              const delta = parsed.choices?.[0]?.delta?.content || ''
              if (delta) fullContent += delta
            } catch (_e) { /* suppress */ }
          }
        })
        res.on('end', () =>
          resolve({ success: true, content: fullContent, sessionId: returnedSessionId ?? undefined })
        )
      })
      req.setTimeout(this._requestTimeout, () => {
        req.destroy()
        resolve({ success: false, message: '流式请求超时' })
      })
      req.on('error', (err) => resolve({ success: false, message: err.message }))
      req.end(body)
    })
  }

  sendMessageStream(
    agentId: string,
    messages: string | unknown[],
    callbacks?: StreamCallbacks,
    userId?: string
  ): http.ClientRequest {
    logAdapter('INFO', 'sendMessageStream ENTER', { agentId, userId })
    const { onChunk, onDone, onError, onToolCall, onUsage } = callbacks || {}

    this._streamStartTime = Date.now()
    this._lastLatency = null
    this._lastToolCalls = []
    this._tokensCaptured = false
    this._lastFirstChunkTime = null

    let latestMessage: string
    if (Array.isArray(messages)) {
      latestMessage = (messages[messages.length - 1] as Record<string, unknown>)?.content as string || ''
    } else {
      latestMessage = messages || ''
    }

    let model = this._currentModel
    if (!model) {
      if (agentId && agentId !== 'main' && agentId !== 'hermes-agent') {
        model = this._getProfileModel(agentId) || agentId
      } else {
        this._loadHermesConfig()
        const m = this._hermesConfig?.model as Record<string, unknown> | undefined
        model = ((m?.default as string) || (m?.main as string)) || 'deepseek-ai/deepseek-v4-pro'
      }
    }

    const body = JSON.stringify({
      model,
      messages: [{ role: 'user', content: latestMessage }],
      stream: true,
      max_tokens: 16384
    })

    logAdapter('DEBUG', 'sendMessageStream called', {
      agentId,
      userId: userId || 'NONE',
      model,
      baseUrl: this.baseUrl,
      bodyPreview: latestMessage.substring(0, 200)
    })

    let targetUrl = this.baseUrl
    if (agentId && agentId !== 'main' && agentId !== 'hermes-agent') {
      const profilePort = this._getProfilePort(agentId)
      targetUrl = `http://127.0.0.1:${profilePort}`
      logAdapter('DEBUG', `Profile ${agentId} → direct port ${profilePort}`)
    }

    const url = new URL(targetUrl)
    logAdapter('INFO', 'sendMessageStream HTTP request', {
      url: `${targetUrl}/v1/chat/completions`,
      model,
      agentId,
      profilePort: targetUrl !== this.baseUrl ? url.port : 'default',
      stream: true
    })
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body).toString(),
      Accept: 'text/event-stream',
      Authorization: `Bearer ${this.apiKey}`
    }
    if (userId) headers['X-Hermes-Session-Id'] = userId

    const options: http.RequestOptions = {
      hostname: url.hostname,
      port: url.port,
      path: '/v1/chat/completions',
      method: 'POST',
      timeout: this._requestTimeout,
      headers
    }

    let fullContent = ''
    let returnedSessionId: string | null = null

    const req = http.request(options, (res) => {
      returnedSessionId = (res.headers['x-hermes-session-id'] as string) || null
      logAdapter('DEBUG', 'sendMessageStream response headers', {
        statusCode: res.statusCode,
        returnedSessionId: returnedSessionId || 'N/A',
        sentSessionId: userId || 'N/A'
      })

      if (res.statusCode! >= 400) {
        let errBody = ''
        res.on('data', (c) => (errBody += c))
        res.on('end', () => {
          if (onError) onError(new Error(`${res.statusCode}: ${errBody.substring(0, 200)}`))
        })
        return
      }

      let buffer = ''
      let lastMessage: string | null = null
      let currentEvent = ''
      res.on('data', (chunk) => {
        buffer += chunk.toString()
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        for (const line of lines) {
          const trimmed = line.trim()

          if (trimmed.startsWith('event:')) {
            currentEvent = trimmed.slice(6).trim()
            continue
          }

          if (!trimmed) {
            currentEvent = ''
            continue
          }

          if (!trimmed.startsWith('data: ')) continue
          const payload = trimmed.slice(6).trim()
          if (payload === '[DONE]') {
            return
          }
          try {
            const parsed = JSON.parse(payload)

            if (currentEvent === 'hermes.tool.progress' && onToolCall) {
              _log.debug('Received tool event:', JSON.stringify(parsed, null, 2))
              logAdapter('DEBUG', 'Hermes tool.progress', {
                tool: parsed.tool,
                label: parsed.label,
                status: parsed.status
              })
              const toolInfo: Record<string, unknown> = {
                name: parsed.tool || parsed.name || 'unknown',
                emoji: parsed.emoji || '',
                label: parsed.label || '',
                status: parsed.status || 'running',
                id: parsed.toolCallId || ''
              }
              const existingIdx = this._lastToolCalls.findIndex(
                (t) => toolInfo.id && t.id === toolInfo.id
              )
              let mergedInfo = toolInfo
              if (existingIdx >= 0) {
                const prev = this._lastToolCalls[existingIdx]
                mergedInfo = {
                  name: toolInfo.name !== 'unknown' ? toolInfo.name : prev.name,
                  emoji: toolInfo.emoji || prev.emoji,
                  label: toolInfo.label || prev.label,
                  status: toolInfo.status !== 'running' ? toolInfo.status : prev.status,
                  id: toolInfo.id || prev.id
                }
                this._lastToolCalls[existingIdx] = mergedInfo
              } else {
                this._lastToolCalls.push(toolInfo)
              }
              onToolCall(mergedInfo)
              currentEvent = ''
              continue
            }
            if (currentEvent === 'echora.metrics') {
              logAdapter('DEBUG', 'Echora metrics', {
                usage: parsed.usage,
                latency: parsed.latency,
                toolCalls: parsed.toolCalls
              })
              if (parsed.usage && parsed.usage.prompt_tokens > 0) {
                this._lastModelInfo = {
                  model: parsed.model || this._lastModelInfo?.model || null,
                  promptTokens: parsed.usage.prompt_tokens || 0,
                  completionTokens: parsed.usage.completion_tokens || 0,
                  totalTokens: parsed.usage.total_tokens || 0
                }
                this._tokensCaptured = true
              }
              currentEvent = ''
              continue
            }
            if (currentEvent === 'hermes.token_usage') {
              logAdapter('DEBUG', 'Hermes token_usage', parsed)
              if (!this._tokensCaptured && (parsed.prompt || parsed.prompt_tokens)) {
                this._lastModelInfo = {
                  model: this._lastModelInfo?.model || null,
                  promptTokens: parsed.prompt || parsed.prompt_tokens || 0,
                  completionTokens: parsed.completion || parsed.completion_tokens || 0,
                  totalTokens: parsed.total || parsed.total_tokens || 0
                }
              }
              currentEvent = ''
              continue
            }
            if (currentEvent.startsWith('hermes.')) {
              currentEvent = ''
              continue
            }

            const delta = parsed.choices?.[0]?.delta?.content || ''
            if (delta) {
              if (!this._lastFirstChunkTime) this._lastFirstChunkTime = Date.now()
              fullContent += delta
              if (onChunk) onChunk(delta, fullContent)
            }
            const msg = parsed.choices?.[0]?.message?.content
            if (msg) lastMessage = msg
            if (parsed.usage) {
              this._lastModelInfo = {
                model: parsed.model || this._lastModelInfo?.model || null,
                promptTokens: parsed.usage.prompt_tokens || 0,
                completionTokens: parsed.usage.completion_tokens || 0,
                totalTokens: parsed.usage.total_tokens || 0
              }
              this._tokensCaptured = true
            }
            const toolCalls = parsed.choices?.[0]?.delta?.tool_calls
            if (Array.isArray(toolCalls) && onToolCall) {
              for (const tc of toolCalls) {
                if (tc.function?.name) {
                  onToolCall({
                    name: tc.function.name,
                    arguments: tc.function.arguments || '',
                    id: tc.id || '',
                    index: tc.index ?? 0
                  })
                }
              }
            }
          } catch (_e) { /* suppress */ }
        }
      })
      res.on('end', () => {
        const finalContent = fullContent || lastMessage || ''
        this._lastLatency = Date.now() - (this._streamStartTime || Date.now())
        const firstChunkLatency = this._lastFirstChunkTime
          ? this._lastFirstChunkTime - (this._streamStartTime || Date.now())
          : null
        const curPrompt = this._lastModelInfo?.promptTokens || 0
        const sessionKey = userId || '_default'
        const lastPrompt = this._lastPromptTokensBySession.get(sessionKey) || 0
        const deltaPrompt =
          lastPrompt > 0 && curPrompt > lastPrompt ? curPrompt - lastPrompt : curPrompt
        this._lastPromptTokensBySession.set(sessionKey, curPrompt)
        this._savePromptTokensState()
        const metrics = {
          usage: this._lastModelInfo
            ? {
                prompt_tokens: curPrompt,
                completion_tokens: this._lastModelInfo.completionTokens || 0,
                total_tokens: this._lastModelInfo.totalTokens || 0,
                delta_prompt_tokens: deltaPrompt
              }
            : null,
          latency: this._lastLatency,
          firstChunkLatency,
          toolCalls: this._lastToolCalls,
          model: this._lastModelInfo?.model || null
        }
        // 调用 onUsage 传递 token 信息
        if (onUsage && this._lastModelInfo) {
          onUsage({
            input: this._lastModelInfo.promptTokens || 0,
            output: this._lastModelInfo.completionTokens || 0,
            totalTokens: this._lastModelInfo.totalTokens || 0,
          })
        }
        if (finalContent && onDone) onDone(finalContent, null, metrics)
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

  private _findContextLength(modelId: string, config?: HermesConfigYaml): number | null {
    if (!modelId) return null
    const cfg = config || this._hermesConfig
    try {
      // 从 custom_providers 中查找
      const providers = cfg?.custom_providers
      if (Array.isArray(providers)) {
        for (const p of providers) {
          if (p.models && p.models[modelId]) {
            return p.models[modelId].context_length || null
          }
        }
      }
    } catch (_e) { /* suppress */ }
    // 从 model 对象中查找
    const model = cfg?.model as Record<string, unknown> | undefined
    if (model?.context_length) return model.context_length as number
    if (model?.context_window) return model.context_window as number
    if (model?.max_tokens) return model.max_tokens as number
    return null
  }

  async getModelInfo(agentId?: string): Promise<AdapterModelInfo> {
    // Load config based on agentId
    const hermesRoot =
      this.config.hermesRoot || path.join(os.homedir(), 'AppData', 'Local', 'hermes')
    let configToUse: HermesConfigYaml | null = null

    if (agentId && agentId !== 'main' && agentId !== 'hermes-agent') {
      const profileConfigPath = path.join(hermesRoot, 'profiles', agentId, 'config.yaml')
      if (fs.existsSync(profileConfigPath)) {
        try {
          configToUse = yaml.load(fs.readFileSync(profileConfigPath, 'utf8')) as HermesConfigYaml
        } catch (_e) { /* suppress */ }
      }
    }
    if (!configToUse) {
      this._loadHermesConfig()
      configToUse = this._hermesConfig
    }

    // For profile agents, always read from config (not shared _currentModel)
    // For main agent, use _currentModel if set, otherwise read from config
    const isProfileAgent = agentId && agentId !== 'main' && agentId !== 'hermes-agent'
    let modelName = isProfileAgent ? null : (this._currentModel || null)
    let contextWindow: number | null = null
    let contextUsed: number | null = null
    let usagePct: number | null = null

    if (configToUse) {
      if (!modelName) {
        const m = configToUse.model
        modelName =
          m && typeof m === 'object'
            ? ((m.default as string) || (m.main as string))
            : typeof m === 'string'
              ? m
              : null
      }

      if (!contextWindow) {
        const targetModel =
          modelName ||
          (configToUse.model as Record<string, unknown>)?.default as string ||
          (configToUse.model as Record<string, unknown>)?.main as string
        contextWindow =
          this._findContextLength(targetModel) ||
          ((configToUse.model as Record<string, unknown>)?.context_length as number) ||
          ((configToUse.model as Record<string, unknown>)?.context_window as number) ||
          null
      }
    }

    if (this._lastModelInfo) {
      const lastInfo = this._lastModelInfo
      contextUsed =
        lastInfo.promptTokens! > 0 ? lastInfo.promptTokens : null
      if (!modelName && lastInfo.model) modelName = lastInfo.model
    }

    if (!contextUsed) {
      if (this._lastPromptTokensBySession.size > 0) {
        const vals = [...this._lastPromptTokensBySession.values()]
        contextUsed = vals.find((v) => v > 0) || null
      } else {
        contextUsed = 0
      }
    }

    if (!modelName) {
      try {
        const modelsData = (await this._httpGet('/v1/models')) as Record<string, unknown>
        if (modelsData?.data && (modelsData.data as unknown[])[0]) {
          modelName = ((modelsData.data as Record<string, unknown>[])[0].id as string) || null
        }
      } catch (_e) { /* suppress */ }
    }

    if (contextUsed != null && contextUsed >= 0 && contextWindow! > 0) {
      usagePct = Math.round((contextUsed / contextWindow!) * 100 * 10) / 10
    }

    return { model: modelName, contextWindow, contextUsed, usagePct }
  }

  async listModels(agentId?: string): Promise<AdapterModelItem[]> {
    const models: AdapterModelItem[] = []
    const seen = new Set<string>()

    // Load config: profile agent gets its own config.yaml, main agent gets root config
    const hermesRoot =
      this.config.hermesRoot || path.join(os.homedir(), 'AppData', 'Local', 'hermes')
    let configToUse: HermesConfigYaml | null = null

    if (agentId && agentId !== 'main' && agentId !== 'hermes-agent') {
      // Profile agent — read profile's config.yaml
      const profileConfigPath = path.join(hermesRoot, 'profiles', agentId, 'config.yaml')
      if (fs.existsSync(profileConfigPath)) {
        try {
          configToUse = yaml.load(fs.readFileSync(profileConfigPath, 'utf8')) as HermesConfigYaml
        } catch (_e) { /* suppress */ }
      }
    }

    // Fallback to main config
    if (!configToUse) {
      this._loadHermesConfig()
      configToUse = this._hermesConfig
    }

    if (configToUse) {
      const m = configToUse.model
      const defaultModel =
        m && typeof m === 'object'
          ? ((m.default as string) || (m.main as string))
          : (m as string)
      if (typeof defaultModel === 'string' && !seen.has(defaultModel)) {
        seen.add(defaultModel)
        models.push({
          id: defaultModel,
          name: defaultModel.split('/').pop()!,
          isDefault: true,
          source: agentId && agentId !== 'main' && agentId !== 'hermes-agent' ? 'profile' : 'config',
          base_url: (m as Record<string, unknown>)?.base_url as string || '',
          api_key: (m as Record<string, unknown>)?.api_key as string || ''
        })
      }
    }

    try {
      const providers = configToUse?.custom_providers
      if (Array.isArray(providers)) {
        for (const p of providers) {
          const pModels = p.models
          if (pModels && typeof pModels === 'object') {
            for (const modelId of Object.keys(pModels)) {
              if (!seen.has(modelId)) {
                seen.add(modelId)
                models.push({
                  id: modelId,
                  name: modelId.split('/').pop()!,
                  isDefault: false,
                  source: 'custom_provider',
                  provider: p.name || '',
                  base_url: p.base_url || '',
                  api_key: p.api_key || ''
                })
              }
            }
          }
          const pSingle = p.model
          if (typeof pSingle === 'string' && !seen.has(pSingle)) {
            seen.add(pSingle)
            models.push({
              id: pSingle,
              name: pSingle,
              isDefault: false,
              source: 'custom_provider',
              provider: p.name || '',
              base_url: p.base_url || '',
              api_key: p.api_key || ''
            })
          }
        }
      }
    } catch (_e) { /* suppress */ }

    try {
      const hermesRoot =
        this.config.hermesRoot || path.join(os.homedir(), 'AppData', 'Local', 'hermes')
      const profilesDir = path.join(hermesRoot, 'profiles')
      if (fs.existsSync(profilesDir)) {
        const profiles = fs
          .readdirSync(profilesDir)
          .filter((f) => {
            try {
              const dirPath = path.join(profilesDir, f)
              return fs.statSync(dirPath).isDirectory() &&
                fs.existsSync(path.join(dirPath, 'config.yaml'))
            } catch { return false }
          })
        for (const p of profiles) {
          const pConfigPath = path.join(profilesDir, p, 'config.yaml')
          if (!fs.existsSync(pConfigPath)) continue
          try {
            const pConfig = yaml.load(fs.readFileSync(pConfigPath, 'utf8')) as HermesConfigYaml
            const pModel = (pConfig.model as Record<string, unknown>)?.id || pConfig.model
            if (typeof pModel === 'string' && !seen.has(pModel)) {
              seen.add(pModel)
              models.push({
                id: pModel,
                name: `${pModel.split('/').pop()} (${p})`,
                isDefault: false,
                source: 'profile',
                profile: p
              })
            }
          } catch (_e) { /* suppress */ }
        }
      }
    } catch (_e) { /* suppress */ }

    try {
      const modelsData = (await this._httpGet('/v1/models')) as Record<string, unknown>
      if (modelsData?.data && Array.isArray(modelsData.data)) {
        for (const m of modelsData.data as Record<string, unknown>[]) {
          if (!seen.has(m.id as string)) {
            seen.add(m.id as string)
            models.push({
              id: m.id as string,
              name: (m.id as string).split('/').pop()!,
              isDefault: false,
              source: 'api'
            })
          }
        }
      }
    } catch (_e) { /* suppress */ }

    return models
  }

  setModel(modelId: string | null): SetModelResult {
    const prev = this._currentModel
    this._currentModel = modelId || null
    logAdapter('INFO', 'setModel', {
      from: prev || '(default)',
      to: this._currentModel || '(default)'
    })
    if (modelId && modelId !== prev) {
      this._lastPromptTokensBySession.clear()
      this._savePromptTokensState()
      logAdapter('INFO', 'setModel: cleared prompt token state for all sessions')
    }
    return { success: true, model: this._currentModel }
  }

  async switchModel(modelId: string | null, agentId?: string): Promise<SwitchModelResult> {
    const hermesRoot =
      this.config.hermesRoot || path.join(os.homedir(), 'AppData', 'Local', 'hermes')

    // Find the correct config path based on agentId
    let configPath: string
    if (agentId && agentId !== 'main' && agentId !== 'hermes-agent') {
      // Profile agent — each profile has its own config.yaml
      configPath = path.join(hermesRoot, 'profiles', agentId, 'config.yaml')
    } else {
      // Main agent
      configPath = path.join(hermesRoot, 'config.yaml')
    }

    if (!fs.existsSync(configPath)) {
      logAdapter('ERROR', 'switchModel: config.yaml not found', { configPath, agentId })
      return { success: false, needsRestart: false, message: '找不到 config.yaml: ' + configPath }
    }

    let config: HermesConfigYaml
    try {
      config = yaml.load(fs.readFileSync(configPath, 'utf8')) as HermesConfigYaml
    } catch (e) {
      logAdapter('ERROR', 'switchModel: config.yaml parse failed', { error: (e as Error).message })
      return { success: false, needsRestart: false, message: '配置文件解析失败: ' + (e as Error).message }
    }

    if (!config.model) config.model = {}
    const modelObj = config.model as Record<string, unknown>
    const oldModel = modelObj.default as string
    const newModel =
      modelId || (modelObj.main as string) || 'deepseek-ai/deepseek-v4-pro'

    // Strip provider prefix from model ID (e.g. "Integrate.api.nvidia.com/deepseek-ai/deepseek-v4-pro" → "deepseek-ai/deepseek-v4-pro")
    const lookupModel = newModel.includes('/') && newModel.split('/')[0].includes('.')
      ? newModel.split('/').slice(1).join('/')
      : newModel

    // Save old model info to custom_providers (so it can be switched back later)
    if (oldModel && oldModel !== newModel) {
      const oldProvider = modelObj.provider as string || ''
      const oldBaseUrl = modelObj.base_url as string || ''
      const oldApiKey = modelObj.api_key as string || ''
      if (oldProvider || oldBaseUrl) {
        if (!Array.isArray(config.custom_providers)) config.custom_providers = []
        const existing = config.custom_providers.find((p) => p.name === oldProvider)
        if (existing) {
          // Add old model to existing provider
          if (!existing.models) existing.models = {}
          if (!existing.models[oldModel]) {
            existing.models[oldModel] = { context_length: (modelObj.max_tokens as number) || 16384 }
          }
        } else {
          // Create new provider entry for old model
          config.custom_providers.push({
            name: oldProvider || `saved-${oldModel.split('/').pop()}`,
            base_url: oldBaseUrl,
            api_key: oldApiKey,
            models: { [oldModel]: { context_length: (modelObj.max_tokens as number) || 16384 } }
          })
        }
        logAdapter('INFO', 'switchModel: saved old model to custom_providers', { oldModel, oldProvider })
      }
    }

    // Find provider info from custom_providers
    let newProvider: string | null = null
    let newBaseUrl: string | null = null
    let newApiKey: string | null = null
    let newContextLength: number | null = null

    const providers = config.custom_providers
    if (Array.isArray(providers)) {
      for (const p of providers) {
        // Match by full ID or stripped ID
        if (p.models && typeof p.models === 'object') {
          if (p.models[newModel] || p.models[lookupModel]) {
            const matchedKey = p.models[newModel] ? newModel : lookupModel
            newProvider = p.name || null
            newBaseUrl = p.base_url || null
            newApiKey = p.api_key || null
            newContextLength = p.models[matchedKey].context_length || null
            break
          }
        }
        if (p.model === newModel || p.model === lookupModel) {
          newProvider = p.name || null
          newBaseUrl = p.base_url || null
          newApiKey = p.api_key || null
          break
        }
      }
    }

    // Write ALL model fields — use stripped ID for default
    modelObj.default = lookupModel
    if (newProvider) modelObj.provider = newProvider
    if (newBaseUrl) modelObj.base_url = newBaseUrl
    if (newApiKey) modelObj.api_key = newApiKey
    if (newContextLength) {
      modelObj.max_tokens = newContextLength
      modelObj.context_length = newContextLength
    }
    // Remove main field (it's a fallback, not the active model)
    delete modelObj.main

    this._currentModel = modelId || null

    this._lastModelInfo = null
    this._lastPromptTokensBySession.clear()
    this._savePromptTokensState()

    logAdapter('INFO', 'switchModel: updating config', {
      configPath,
      agentId,
      oldModel,
      newModel,
      provider: newProvider || '(unchanged)',
      base_url: newBaseUrl || '(unchanged)',
      max_tokens: newContextLength || '(unchanged)'
    })

    try {
      const yamlStr = yaml.dump(config, {
        indent: 2,
        lineWidth: -1,
        noRefs: true,
        sortKeys: false,
        quotingType: '"'
      })
      fs.writeFileSync(configPath, yamlStr, 'utf8')
      // Clear config cache so next read gets fresh data
      this._hermesConfig = null
    } catch (e) {
      logAdapter('ERROR', 'switchModel: config.yaml write failed', { error: (e as Error).message })
      return { success: false, needsRestart: false, message: '配置文件写入失败: ' + (e as Error).message }
    }

    // Return immediately, restart async in background
    logAdapter('INFO', 'switchModel: config written, restarting Gateway async', { newModel })
    this._asyncRestart().catch((e) => {
      logAdapter('ERROR', 'switchModel: async restart failed', { error: (e as Error).message })
    })

    return {
      success: true,
      needsRestart: true,
      message: `已切换至 ${newModel}，正在重启网关…`,
      model: newModel
    }
  }

  private async _asyncRestart(): Promise<void> {
    try {
      await this.stop()
      await new Promise((r) => setTimeout(r, 1000))
      await this.start()
      logAdapter('INFO', 'switchModel: Gateway restarted successfully')
    } catch (e) {
      logAdapter('ERROR', 'switchModel: Gateway restart failed', { error: (e as Error).message })
    }
  }

  private _testPort(port: number, timeoutMs = 100): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const socket = new net.Socket()
      socket.setTimeout(timeoutMs)
      socket.connect(port, '127.0.0.1', () => {
        socket.destroy()
        resolve(true)
      })
      socket.on('error', () => {
        socket.destroy()
        reject(new Error('port not reachable'))
      })
      socket.on('timeout', () => {
        socket.destroy()
        reject(new Error('timeout'))
      })
    })
  }

  getCurrentModel(): string {
    if (this._currentModel) return this._currentModel
    this._loadHermesConfig()
    return (
      (this._hermesConfig?.model as Record<string, unknown>)?.id as string ||
      (this._hermesConfig?.model as string) ||
      'hermes-agent'
    )
  }

  private _getProfilePort(profileName: string): number {
    try {
      const hermesRoot =
        this.config.hermesRoot || path.join(os.homedir(), 'AppData', 'Local', 'hermes')
      const profileDir = path.join(hermesRoot, 'profiles', profileName)
      // 必须有 config.yaml 才认为是有效 profile
      if (!fs.existsSync(path.join(profileDir, 'config.yaml'))) return 8086
      const envPath = path.join(profileDir, '.env')
      if (fs.existsSync(envPath)) {
        const match = fs.readFileSync(envPath, 'utf8').match(/API_SERVER_PORT\s*=\s*(\d+)/)
        if (match) return parseInt(match[1])
      }
    } catch (_e) { /* suppress */ }

    for (let port = 8086; port <= 8090; port++) {
      try {
        const result = execSync(
          `curl -s -m 1 -H "Authorization: Bearer ${this.apiKey}" http://127.0.0.1:${port}/v1/models`,
          { encoding: 'utf8', timeout: 1500, stdio: ['pipe', 'pipe', 'pipe'] }
        )
        if (
          result &&
          result.includes(`"${profileName}"`)
        ) {
          logAdapter('DEBUG', `Profile ${profileName} found on port ${port}`)
          return port
        }
      } catch (_e) { /* suppress */ }
    }

    return 8086
  }

  /**
   * 从 profile 的 config.yaml 读取模型配置
   */
  private _getProfileModel(profileName: string): string | null {
    try {
      const hermesRoot =
        this.config.hermesRoot || path.join(os.homedir(), 'AppData', 'Local', 'hermes')
      const configPath = path.join(hermesRoot, 'profiles', profileName, 'config.yaml')
      if (!fs.existsSync(configPath)) return null
      const config = yaml.load(fs.readFileSync(configPath, 'utf8')) as Record<string, unknown>
      const model = config?.model as Record<string, unknown> | undefined
      return (model?.default as string) || (model?.main as string) || null
    } catch {
      return null
    }
  }

  /**
   * 公开端口查询（_getProfilePort 是 private）
   */
  getProfilePortNum(profileName: string): number {
    return this._getProfilePort(profileName)
  }

  /**
   * 独立检测单个 profile 的在线状态（不依赖主 agent）
   */
  async getProfileStatus(profileName: string): Promise<StatusResult> {
    const port = this._getProfilePort(profileName)
    try {
      await this._testPort(port, 1000)
      const data = (await this._httpGet('/health', port)) as Record<string, unknown> | null
      if (data && (data.status === 'ok' || data.status === 'running' || data.ok)) {
        logAdapter('DEBUG', `getProfileStatus: ${profileName} running on port ${port}`)
        return { status: 'running', hasChatAPI: true, capabilities: [] }
      }
    } catch (_e) { /* suppress */ }
    logAdapter('DEBUG', `getProfileStatus: ${profileName} offline (port ${port})`)
    return { status: 'offline' }
  }

  /**
   * 发现所有已知 profiles（独立于主 agent 状态）
   */
  getDiscoveredProfiles(): Array<{ name: string }> {
    try {
      const hermesRoot =
        this.config.hermesRoot || path.join(os.homedir(), 'AppData', 'Local', 'hermes')
      const profilesDir = path.join(hermesRoot, 'profiles')
      if (!fs.existsSync(profilesDir)) return []
      return fs
        .readdirSync(profilesDir)
        .filter((f) => {
          try {
            const dirPath = path.join(profilesDir, f)
            return fs.statSync(dirPath).isDirectory() &&
              fs.existsSync(path.join(dirPath, 'config.yaml'))
          } catch {
            return false
          }
        })
        .map((name) => ({ name }))
    } catch {
      return []
    }
  }

  /**
   * 获取 Hermes capabilities（缓存）
   */
  async getCapabilities(): Promise<Record<string, unknown> | null> {
    if (this._capabilities) return this._capabilities
    try {
      const data = (await this._httpGet('/v1/capabilities')) as Record<string, unknown> | null
      if (data) this._capabilities = data
      return this._capabilities
    } catch {
      return null
    }
  }

  /**
   * 获取详细健康状态（/health/detailed）
   */
  async getDetailedHealth(): Promise<Record<string, unknown> | null> {
    try {
      return (await this._httpGet('/health/detailed')) as Record<string, unknown> | null
    } catch {
      return null
    }
  }

  /**
   * 预留：获取已安装技能列表
   */
  async listSkills(): Promise<unknown[]> {
    try {
      const data = (await this._httpGet('/v1/skills')) as Record<string, unknown> | null
      return (data?.skills as unknown[]) || []
    } catch {
      return []
    }
  }

  /**
   * 预留：获取可用工具集
   */
  async listToolsets(): Promise<unknown[]> {
    try {
      const data = (await this._httpGet('/v1/toolsets')) as Record<string, unknown> | null
      return (data?.toolsets as unknown[]) || []
    } catch {
      return []
    }
  }

  /**
   * 预留：获取会话列表
   */
  async listSessions(): Promise<unknown[]> {
    try {
      const data = (await this._httpGet('/api/sessions')) as Record<string, unknown> | null
      return (data?.sessions as unknown[]) || []
    } catch {
      return []
    }
  }

  private _ensureProfileApiConfig(profileName: string, port: number): void {
    try {
      const hermesRoot =
        this.config.hermesRoot || path.join(os.homedir(), 'AppData', 'Local', 'hermes')
      const profileDir = path.join(hermesRoot, 'profiles', profileName)
      // 禁止创建目录 — 只修改已存在的 profile
      if (!fs.existsSync(profileDir)) return
      const envPath = path.join(profileDir, '.env')

      if (!fs.existsSync(envPath)) {
        fs.writeFileSync(envPath, '', 'utf8')
      }

      let content = fs.readFileSync(envPath, 'utf8')
      let modified = false

      if (!content.includes('API_SERVER_ENABLED')) {
        content += '\nAPI_SERVER_ENABLED=true\n'
        modified = true
      }

      if (!content.includes('API_SERVER_KEY')) {
        content += '\nAPI_SERVER_KEY=[REDACTED]\n'
        modified = true
      }

      if (!content.includes('API_SERVER_PORT')) {
        content += `\nAPI_SERVER_PORT=${port}\n`
        modified = true
      }

      if (modified) {
        fs.writeFileSync(envPath, content, 'utf8')
        logAdapter('INFO', `Updated ${envPath} with API_SERVER config`)
      }
    } catch (e) {
      logAdapter('WARN', `Failed to update profile .env: ${(e as Error).message}`)
    }
  }

  private async _checkPortStatus(port: number): Promise<boolean> {
    try {
      await this._testPort(port, 2000)
      return true
    } catch (_e) {
      return false
    }
  }

  private async _waitForReady(timeoutMs: number, profileName?: string): Promise<void> {
    const checkPort = profileName ? this._getProfilePort(profileName) : DIRECT_PORT
    const label = profileName ? `profile ${profileName}` : 'main'
    logAdapter('INFO', `_waitForReady: waiting for ${label} on port ${checkPort} (timeout ${timeoutMs}ms)`)
    const start = Date.now()
    while (Date.now() - start < timeoutMs) {
      try {
        await this._testPort(checkPort, 3000)
        const data = (await this._httpGet('/health', checkPort)) as Record<string, unknown> | null
        if (data && (data.status === 'ok' || data.status === 'running' || data.ok)) {
          // 只在主 agent 就绪时修改 adapter 状态
          if (!profileName) {
            this.status = 'running'
          }
          logAdapter('INFO', `_waitForReady: ${label} ready on port ${checkPort}`)
          return
        }
      } catch (_e) { /* suppress */ }
      await new Promise((r) => setTimeout(r, 2000))
    }
    throw new Error(`Hermes ${label} 启动超时 (port ${checkPort}, ${timeoutMs}ms)`)
  }

  private _httpGet(p: string, port?: number): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const url = new URL(p, this.baseUrl)
      const targetPort = port || url.port
      http.get(
        {
          hostname: url.hostname,
          port: targetPort,
          path: url.pathname,
          method: 'GET',
          timeout: 5000,
          headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${this.apiKey}`
          }
        },
        (res) => {
          let data = ''
          res.on('data', (c) => (data += c))
          res.on('end', () => {
            try {
              resolve(JSON.parse(data))
            } catch (_e) {
              resolve({ raw: data })
            }
          })
        }
      )
        .on('error', reject)
        .setTimeout(5000, function (this: http.ClientRequest) {
          this.destroy()
          reject(new Error('超时'))
        })
    })
  }

  private _httpPost(
    p: string,
    bodyString: string,
    extraHeaders: Record<string, string> = {},
    port?: number
  ): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const url = new URL(p, this.baseUrl)
      const targetPort = port || url.port
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyString).toString(),
        Authorization: `Bearer ${this.apiKey}`,
        ...extraHeaders
      }
      logAdapter('DEBUG', '_httpPost request', {
        url: `${url.hostname}:${url.port}${url.pathname}`,
        headers: { ...headers, Authorization: 'Bearer ***' },
        bodyPreview: bodyString.substring(0, 500),
        hasSessionId: !!extraHeaders['X-Hermes-Session-Id'],
        sessionId: extraHeaders['X-Hermes-Session-Id'] || 'NONE'
      })
      const req = http.request(
        {
          hostname: url.hostname,
          port: targetPort,
          path: url.pathname,
          method: 'POST',
          timeout: this._requestTimeout,
          headers
        },
        (res) => {
          let data = ''
          res.on('data', (c) => (data += c))
          res.on('end', () => {
            if (res.statusCode! >= 400) {
              reject(new Error(`${res.statusCode}: ${data.substring(0, 300)}`))
              return
            }
            try {
              const parsed = JSON.parse(data)
              parsed._sessionId = res.headers['x-hermes-session-id'] || null
              resolve(parsed)
            } catch (_e) {
              reject(new Error('解析失败'))
            }
          })
        }
      )
      req.setTimeout(this._requestTimeout, () => {
        req.destroy()
        reject(new Error('超时'))
      })
      req.on('error', (err) => {
        logAdapter('ERROR', '_httpPost error', { error: err.message })
        reject(err)
      })
      req.end(bodyString)
    })
  }
}

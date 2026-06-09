import { create, type Logger } from '../utils/console-logger'

export type AdapterStatus = 'offline' | 'starting' | 'running' | 'error' | 'needs_restart' | 'stopped'

export interface AdapterAttachment {
  name: string
  content: string
  mimeType: string
}

export interface AdapterConfig {
  exePath?: string
  port?: number
  token?: string
  baseUrl?: string
  configPath?: string
  useWebSocket?: boolean
  hermesRoot?: string
  apiPort?: number
  apiKey?: string
  execPath?: string
  [key: string]: unknown
}

export interface AdapterAgentItem {
  id: string
  name: string
  emoji?: string | null
  avatar?: string | null
  description?: string
  model?: string | null
}

export interface AdapterModelInfo {
  model: string | null
  contextWindow: number | null
  contextUsed: number | null
  usagePct: number | null
}

export interface AdapterModelItem {
  id: string
  name: string
  provider?: string
  fullPath?: string
  contextWindow?: number | null
  isDefault: boolean
  base_url?: string
  api_key?: string
  source?: string
  profile?: string
}

export interface StartResult {
  success: boolean
  message?: string
  pid?: number
}

export interface StopResult {
  success: boolean
}

export interface StatusResult {
  status: AdapterStatus
  pid?: number
  uptime?: number
  hasChatAPI?: boolean
  capabilities?: string[]
  fastCheck?: boolean
  message?: string
  // 丰富的网关信息（来自 /health/detailed）
  gatewayState?: string
  activeAgents?: number
  platforms?: Record<string, unknown>
}

export interface SendMessageResult {
  success: boolean
  content?: string
  messageId?: string
  message?: string
  sessionId?: string
  finishReason?: string
  created?: number
  model?: string
}

export interface SwitchModelResult {
  success: boolean
  needsRestart: boolean
  model?: string | null
  message?: string
}

export interface SetModelResult {
  success: boolean
  model: string | null
}

export interface StreamCallbacks {
  onChunk?: (delta: string, fullContent: string) => void
  onDone?: (
    fullContent: string,
    error?: Error | null,
    metrics?: Record<string, unknown> | null,
    sessionKey?: string
  ) => void
  onError?: (error: Error) => void
  onToolCall?: (toolInfo: Record<string, unknown>) => void
  onThinking?: (info: Record<string, unknown>) => void
  onToolStep?: (info: Record<string, unknown>) => void
  onUsage?: (usageInfo: Record<string, unknown>) => void
}

export type MessageCallback = (msg: Record<string, unknown>) => void

export abstract class BaseAdapter<C extends AdapterConfig = AdapterConfig> {
  public config: C
  public name: string
  public status: AdapterStatus
  public baseUrl = ''
  public _requestTimeout = 300000
  protected _log: Logger
  protected _onMessageCallback: MessageCallback | null = null

  constructor(config: C = {} as C) {
    this.config = config
    this.name = 'base'
    this.status = 'offline'
    this._log = create(this.name)
  }

  abstract start(): Promise<StartResult>
  abstract stop(): Promise<StopResult>
  abstract getStatus(): Promise<StatusResult>
  abstract listAgents(): Promise<AdapterAgentItem[]>
  abstract sendMessage(agentId: string, message: string, userId?: string): Promise<SendMessageResult>

  async getModelInfo(_agentId?: string): Promise<AdapterModelInfo> {
    return { model: null, contextWindow: null, contextUsed: null, usagePct: null }
  }

  async listModels(): Promise<AdapterModelItem[]> {
    return []
  }

  setModel(_modelId: string | null): SetModelResult {
    return { success: false, model: null }
  }

  async switchModel(modelId: string | null): Promise<SwitchModelResult> {
    const result = this.setModel(modelId)
    return { success: result.success, needsRestart: false, model: result.model }
  }

  getCurrentModel(): string | null {
    return null
  }

  sendMessageStream(
    _agentId: string,
    _message: string,
    _callbacks?: StreamCallbacks,
    _userId?: string,
    _attachments?: AdapterAttachment[]
  ): unknown {
    return null
  }

  onMessage(callback: MessageCallback): void {
    this._onMessageCallback = callback
  }

  _emitMessage(msg: Record<string, unknown>): void {
    if (this._onMessageCallback) {
      this._onMessageCallback(msg)
    }
  }
}

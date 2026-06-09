import type { OpenDialogReturnValue } from 'electron'

export interface EnvDetail {
  installed: boolean
  version?: string
  path?: string
}

export interface GatewayStatus {
  status: 'running' | 'offline' | 'starting' | 'error' | 'stopped'
  pid?: number
  port?: number
  url?: string
  uptime?: number
  alive?: boolean
  owned?: boolean
}

export type GatewayStatusMap = Record<string, GatewayStatus>

export interface AIDetectedItem {
  name: string
  category: string
  found: boolean
  path: string
  source: string
  verified: boolean
}

export type AIDetected = Record<string, AIDetectedItem>

export interface AgentListItem {
  id: string
  name: string
  emoji?: string
  avatar?: string
  description?: string
}

/** Agent 会话元数据 */
export interface AgentSessionMeta {
  id: string
  title: string
  agentId?: string
  createdAt: number
  updatedAt: number
  tokenUsage: { promptTokens: number; completionTokens: number; totalTokens: number }
  messageCount: number
}

/** Agent 会话消息记录 */
export interface AgentSessionMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  timestamp: number
  model?: string
  tokenUsage?: { promptTokens: number; completionTokens: number; totalTokens: number }
}

/** Agent 完整会话（元数据 + 消息） */
export interface AgentSession extends AgentSessionMeta {
  messages: AgentSessionMessage[]
}

export interface ModelInfo {
  model: string | null
  contextWindow?: number | null
  usedTokens?: number | null
  usagePct?: number | null
}

export interface ModelListItem {
  id: string
  name: string
  provider?: string
}

export interface SetModelResult {
  success: boolean
  needsRestart?: boolean
  model?: string | null
  message?: string
  error?: string
}

export interface SendMessageResult {
  success: boolean
  content?: string
  messageId?: string
  error?: string
}

export interface StreamCallbacks {
  onChunk?: (delta: string, fullContent: string) => void
  onDone?: (fullContent: string, error?: Error, metrics?: StreamMetrics, sessionKey?: string) => void
  onError?: (error: Error) => void
  onToolCall?: (toolInfo: ToolCallInfo) => void
  onUsage?: (usageInfo: UsageInfo) => void
  onThinking?: (info: ThinkingInfo) => void
  onToolStep?: (info: ToolStepInfo) => void
}

export interface StreamMetrics {
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
  duration?: number
  latency?: number
  firstChunkLatency?: number
  model?: string
  toolCalls?: unknown[]
}

export interface ToolCallInfo {
  name: string
  emoji?: string
  label?: string
  status?: string
  id?: string
}

export interface UsageInfo {
  input?: number
  output?: number
  totalTokens?: number
  cacheRead?: number
  cacheWrite?: number
  cost?: number
  aiType?: string
  agentId?: string
  /** 模型返回的实际上下文占用 token 数（会话级别） */
  contextUsed?: number
}

export interface ThinkingInfo {
  phase?: string
  message?: string
}

export interface ToolStepInfo {
  name?: string
  status?: string
  phase?: string
  detail?: string
  meta?: string
  args?: string
}

export interface NormalizedConfig {
  gateway?: Record<string, unknown>
  agents?: Record<string, unknown>[]
  models?: Record<string, unknown>[]
  session?: Record<string, unknown>
  tools?: Record<string, unknown>
  browser?: Record<string, unknown>
  port?: number
  [key: string]: unknown
}

export interface NormalizedHermesConfig extends NormalizedConfig {
  model?: Record<string, unknown>
  agent?: Record<string, unknown>
  memory?: Record<string, unknown>
  compression?: Record<string, unknown>
  delegation?: Record<string, unknown>
  security?: Record<string, unknown>
  display?: Record<string, unknown>
  approvals?: Record<string, unknown>
  sessions?: Record<string, unknown>
  cron?: Record<string, unknown>
  toolsets?: Record<string, unknown>
  apiServer?: Record<string, unknown>
  profiles?: Record<string, unknown>
}

export interface DirectApiProviderModel {
  id: string
  name: string
  contextWindow?: number
}

export interface DirectApiProvider {
  id: string
  name: string
  baseUrl: string
  hasApiKey: boolean
  models: DirectApiProviderModel[]
  status: 'online' | 'offline' | 'error' | 'checking'
  error?: string
}

export interface DirectApiConnectionResult {
  success: boolean
  providerId: string
  latencyMs?: number
  error?: string
}

export interface AppConfig {
  firstRun?: boolean
  aiPaths?: Record<string, string>
  gatewayConfigs?: Record<string, { port?: number; exePath?: string }>
  autoRecordedPaths?: Record<string, string>
  lastActive?: string
  settings?: AppSettings
  aiConfigPaths?: Record<string, string>
  [key: string]: unknown
}

export interface AppSettings {
  autoStartOnBoot?: boolean
  minimizeToTray?: boolean
  checkUpdates?: boolean
  timeout?: number
  timeoutPerAI?: number
  pollInterval?: number
  gatewayScanInterval?: number
  maxMessages?: number
}

export interface GatewayStartParams {
  aiType: string
  exePath?: string
  config?: object
  profileName?: string
}

export interface GatewayStartResult {
  success: boolean
  pid?: number
  message?: string
}

export interface MessageSendParams {
  aiType: string
  agentId: string
  text: string
  history?: Array<{ role: string; content: string }>
  userId?: string
  conversationId?: string
  attachments?: Attachment[]
}

export interface MessageStreamParams {
  aiType: string
  agentId: string
  text: string
  userId: string
  msgId: string
  conversationId?: string
  attachments?: Attachment[]
}

export interface MessageAbortParams {
  msgId: string
}

export interface MessageChunkData {
  msgId: string
  delta: string
  content: string
}

export interface MessageDoneData {
  msgId: string
  content?: string
  error?: string
  metrics?: StreamMetrics | null
  sessionKey?: string | null
}

export interface MessageUsageData extends UsageInfo {
  msgId: string
}

export interface MessageToolCallData {
  msgId?: string
  id?: string
  name?: string
  meta?: string
  status?: string
  emoji?: string
  label?: string
  tool?: ToolCallInfo
}

export interface GatewayStatusChangeData {
  aiType: string
  status: string
  pid?: number
  port?: number
}

export interface GatewayStatusAllData extends GatewayStatusMap {}

export interface GatewayMessageData {
  aiType: string
  agentId: string
  role: string
  content: string
}

export interface StartupEnvCheckData {
  node: EnvDetail
  python: EnvDetail
  git: EnvDetail
  npm: EnvDetail
}

export interface AiProbePortResult {
  alive: boolean
  aiType?: string
  port?: number
  name?: string
}

export interface AiScanFullResult {
  discovered: AIDetected[]
  configured: AIDetected[]
}

export interface DraftPathsResult {
  qclaw: { original: string; draft: string }
  openclaw: { original: string; draft: string }
  hermes: { original: string; draft: string }
}

export interface AiConfigListResult {
  [aiType: string]: {
    path: string
    status: 'ok' | 'error'
    preview: NormalizedConfig | null
    error: string | null
  }
}

export interface AiConfigDiscoverResult {
  qclaw: string | null
  openclaw: string | null
  hermes: string | null
}

export interface HermesProfile {
  name: string
  configPath: string | null
}

export interface OcSession {
  sessionKey: string
  title?: string
  createdAt?: string
  updatedAt?: string
  messageCount?: number
  [key: string]: unknown
}

export interface OcSessionHistoryMessage {
  role: string
  content: string
  timestamp?: string
}

export interface ConvData {
  id: string
  title: string
  messages: Array<{
    role: string
    content: string
    timestamp?: number
    model?: string
    usage?: UsageInfo
    toolCalls?: Array<{
      name: string
      emoji?: string
      status?: string
      detail?: string
    }>
  }>
  createdAt?: number
  updatedAt?: number
}

export interface SkillsListResult {
  success: boolean
  skills: Array<{
    name: string
    category: string
    description: string
    path: string
    enabled?: boolean
  }>
  categories: string[]
  error?: string
}

export interface Attachment {
  name: string
  content: string  // base64 encoded
  mimeType: string
  previewUrl?: string  // for UI preview (data URL)
}

export interface AiAddDiscoveredParams {
  aiType: string
  name?: string
  port?: number
  exePath?: string
}

export interface MessageUsageResult {
  usage: UsageInfo | null
}

export interface WindowMaximizedData {
  maximized: boolean
}

export interface ConvListResult {
  [agentKey: string]: {
    [convId: string]: ConvData
  }
}

export interface ConversationsBulkSaveParams {
  conversations: ConvListResult
}

export type IpcHandleChannels = {
  'gateway:refresh': {
    request: void
    response: { detected: AIDetected; gateways: GatewayStatusMap }
  }
  'gateway:attach': {
    request: [aiType: string, port: number]
    response: GatewayStatusMap
  }
  'gateway:start': {
    request: [params: GatewayStartParams]
    response: GatewayStartResult
  }
  'gateway:stop': {
    request: [aiType: string, profileName?: string]
    response: { success: boolean }
  }
  'gateway:restart': {
    request: [aiType: string]
    response: { success: boolean; message?: string }
  }
  'gateway:status': {
    request: void
    response: GatewayStatusMap
  }

  'agent:list': {
    request: [aiType: string]
    response: AgentListItem[]
  }
  'agent:modelInfo': {
    request: [aiType: string, agentId?: string]
    response: ModelInfo
  }
  'agent:listModels': {
    request: [aiType: string]
    response: ModelListItem[]
  }
  'agent:setModel': {
    request: [aiType: string, modelId: string]
    response: SetModelResult
  }

  'message:send': {
    request: [params: MessageSendParams]
    response: SendMessageResult
  }
  'message:status': {
    request: [aiType: string]
    response: { status: string }
  }
  'message:usage': {
    request: [params: { aiType: string; sessionKey?: string }]
    response: UsageInfo | null
  }

  'config:get': {
    request: [key: string]
    response: unknown
  }
  'config:set': {
    request: [key: string, value: unknown]
    response: boolean
  }
  'config:getAll': {
    request: void
    response: AppConfig
  }

  'draft:read': {
    request: [aiType: string]
    response: { success: boolean; data?: NormalizedConfig; error?: string }
  }
  'draft:write': {
    request: [aiType: string, data: NormalizedConfig]
    response: { success: boolean }
  }
  'draft:save': {
    request: [aiType: string]
    response: { success: boolean; error?: string }
  }
  'draft:reset': {
    request: [aiType: string]
    response: { success: boolean; error?: string }
  }
  'draft:backups': {
    request: [aiType: string]
    response: string[]
  }
  'draft:paths': {
    request: void
    response: DraftPathsResult
  }

  'ai-config:set-path': {
    request: [aiType: string, filePath: string]
    response: boolean
  }
  'ai-config:read': {
    request: [aiType: string]
    response: { success: boolean; data?: NormalizedConfig; error?: string }
  }
  'ai-config:discover': {
    request: void
    response: AiConfigDiscoverResult
  }
  'ai-config:list': {
    request: void
    response: AiConfigListResult
  }

  'hermes:profiles': {
    request: void
    response: HermesProfile[]
  }
  'hermes:config': {
    request: void
    response: { success: boolean; data?: NormalizedHermesConfig; error?: string }
  }

  'env:check': {
    request: void
    response: StartupEnvCheckData
  }
  'env:install': {
    request: [tool: string]
    response: { success: boolean; message: string }
  }

  'ai:setPath': {
    request: [aiType: string, exePath: string]
    response: boolean
  }
  'ai:removePath': {
    request: [aiType: string]
    response: boolean
  }
  'ai:rescan': {
    request: void
    response: AIDetected
  }
  'ai:scan': {
    request: void
    response: AIDetected
  }
  'ai:scanFull': {
    request: void
    response: AiScanFullResult
  }
  'ai:probePort': {
    request: [port: number]
    response: AiProbePortResult
  }
  'ai:addDiscovered': {
    request: [params: AiAddDiscoveredParams]
    response: { success: boolean }
  }

  'dialog:openFile': {
    request: [options?: Electron.OpenDialogOptions]
    response: OpenDialogReturnValue
  }
  'dialog:openDir': {
    request: [options?: Electron.OpenDialogOptions]
    response: OpenDialogReturnValue
  }

  'conv:list': {
    request: [agentKey?: string]
    response: ConvListResult
  }
  'conv:get': {
    request: [agentKey: string, convId: string]
    response: ConvData | null
  }
  'conv:save': {
    request: [agentKey: string, convId: string, conv: ConvData]
    response: boolean
  }
  'conv:delete': {
    request: [agentKey: string, convId: string]
    response: boolean
  }
  'conv:deleteAll': {
    request: [agentKey: string]
    response: boolean
  }

  'conversations:save': {
    request: [params: ConversationsBulkSaveParams]
    response: boolean
  }
  'conversations:load': {
    request: void
    response: ConvListResult
  }

  'oc-sessions:list': {
    request: [aiType: string, opts?: Record<string, unknown>]
    response: OcSession[]
  }
  'oc-sessions:history': {
    request: [sessionKey: string, limit?: number]
    response: OcSessionHistoryMessage[]
  }
  'oc-sessions:create': {
    request: [params: Record<string, unknown>]
    response: unknown
  }
  'oc-sessions:delete': {
    request: [sessionKey: string]
    response: boolean
  }
  'oc-sessions:reset': {
    request: [sessionKey: string]
    response: boolean
  }

  'skills:list': {
    request: [aiType: string]
    response: SkillsListResult
  }

  'direct-api:send': {
    request: [params: {
      providerId?: string
      model: string
      message: string
      userId?: string
    }]
    response: SendMessageResult
  }
  'direct-api:listModels': {
    request: void
    response: ModelListItem[]
  }
  'direct-api:listProviders': {
    request: void
    response: DirectApiProvider[]
  }
  'direct-api:testConnection': {
    request: [providerId: string]
    response: DirectApiConnectionResult
  }

  // Agent IPC通道
  'agent:run': {
    request: [params: { providerId: string; model: string; message: string; systemPrompt?: string }]
    response: { success: boolean; content?: string; error?: string }
  }
  'agent:runStream': {
    request: [params: { providerId: string; model: string; message: string; systemPrompt?: string; msgId: string; sessionId?: string }]
    response: { success: boolean }
  }
  'agent:cancel': {
    request: void
    response: { success: boolean }
  }
  'agent:clearHistory': {
    request: [sessionId: string]
    response: { success: boolean; error?: string }
  }
  'agent:getStatus': {
    request: void
    response: { state: string; currentStep: number; totalSteps: number }
  }

  // Agent 会话管理
  'agent:sessions:list': {
    request: [agentId?: string]
    response: AgentSessionMeta[]
  }
  'agent:sessions:load': {
    request: [sessionId: string]
    response: AgentSession | null
  }
  'agent:sessions:delete': {
    request: [sessionId: string]
    response: { success: boolean; error?: string }
  }

  'window:minimize': {
    request: void
    response: void
  }
  'window:maximize': {
    request: void
    response: void
  }
  'window:close': {
    request: void
    response: void
  }
  'window:isMaximized': {
    request: void
    response: boolean
  }
  'window:setTheme': {
    request: [isLight: boolean]
    response: void
  }
}

export type IpcOnChannels = {
  'message:sendStream': {
    params: MessageStreamParams
  }
  'message:abortStream': {
    params: MessageAbortParams
  }
  'direct-api:sendStream': {
    params: {
      providerId?: string
      model: string
      message: string
      userId: string
      msgId: string
    }
  }
  'direct-api:abortStream': {
    params: MessageAbortParams
  }

  // Agent流式通道
  'agent:runStream': {
    params: { providerId: string; model: string; message: string; systemPrompt?: string; msgId: string; sessionId?: string }
  }
  'agent:abortStream': {
    params: { msgId: string }
  }
}

export type IpcPushChannels = {
  'startup:env-check': StartupEnvCheckData
  'startup:ai-detected': AIDetected
  'gateway:statusAll': GatewayStatusMap
  'gateway:message': GatewayMessageData
  'gateway:messageChunk': MessageChunkData
  'gateway:messageDone': MessageDoneData
  'gateway:statusChange': GatewayStatusChangeData
  'gateway:messageToolCall': MessageToolCallData
  'gateway:messageUsage': MessageUsageData
  'gateway:messageThinking': { msgId: string } & ThinkingInfo
  'gateway:messageToolStep': { msgId: string } & ToolStepInfo
  'window:maximized': WindowMaximizedData

  // Agent流式推送通道
  'agent:messageChunk': { msgId: string; delta: string; fullContent: string }
  'agent:messageDone': { msgId: string; fullContent: string; usage?: UsageInfo }
  'agent:messageError': { msgId: string; error: string }
  'agent:toolCall': { msgId: string } & ToolCallInfo
  'agent:stepUpdate': { msgId: string; stepNumber: number; type: string; content: string }
}

export type IpcChannelName = keyof IpcHandleChannels | keyof IpcOnChannels

export type ExtractRequest<T extends IpcChannelName> = T extends keyof IpcHandleChannels
  ? IpcHandleChannels[T]['request']
  : T extends keyof IpcOnChannels
    ? IpcOnChannels[T]['params']
    : never

export type ExtractResponse<T extends IpcChannelName> = T extends keyof IpcHandleChannels
  ? IpcHandleChannels[T]['response']
  : never

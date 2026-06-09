export interface AppConfig {
  firstRun: boolean
  lastActive: string | null
  aiPaths: Record<string, string>
  gatewayConfigs: Record<string, GatewayConfig>
  theme: 'dark' | 'light'
  directApiConfigs: DirectApiConfig[]
  agentProviders: DirectApiConfig[]
  agent?: {
    enabled: boolean
    toolsEnabled: boolean
    kbEnabled: boolean
    reasoningEnabled: boolean
    defaultProvider: string
    defaultModel: string
    maxSteps: number
    temperature: number
  }
  fileWhitelistDirs?: string[]
}

export interface GatewayConfig {
  exePath: string
  aiType: string
  gatewayPort?: number
}

export interface DirectApiConfig {
  id: string
  name: string
  baseUrl: string
  apiKey: string
  models: string[]
  defaultModel: string
  /** 模型上下文窗口大小（token数），用户手动填写 */
  contextWindow?: number
  /** 上下文压缩配置 */
  contextCompression?: {
    /** 是否启用上下文压缩 */
    enabled?: boolean
    /** 压缩阈值百分比（默认80），当上下文占用超过此比例时触发压缩 */
    thresholdPct?: number
    /** 压缩目标百分比（默认50），压缩后上下文占用目标比例 */
    targetPct?: number
  }
}

export interface AgentInfo {
  key: string
  name: string
  aiType: string
  status: AgentStatus
  gatewayPort?: number
  owned: boolean
}

export type AgentStatus = 'running' | 'offline' | 'starting' | 'error' | 'stopped'

export interface Conversation {
  id: string
  agentKey: string
  title: string
  messages: Message[]
  createdAt: number
  updatedAt: number
}

export interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
  model?: string
  tokenUsage?: TokenUsage
  isStreaming?: boolean
}

export interface TokenUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

export interface ChatRequest {
  agentKey: string
  conversationId: string
  message: string
  model?: string
}

export interface StreamChunk {
  type: 'token' | 'done' | 'error' | 'tool_call'
  content?: string
  error?: string
  usage?: TokenUsage
}

/**
 * LLM Provider 类型定义
 * 基于 OpenAI 兼容协议，支持多服务商
 */

/** Provider 配置 */
export interface ProviderConfig {
  id: string
  name: string
  baseUrl: string
  apiKey: string
  models: string[]
  defaultModel: string
  type?: 'openai' | 'anthropic' | 'gemini' | 'custom'
}

/** 聊天消息格式 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  name?: string
  tool_call_id?: string
  tool_calls?: ToolCall[]
}

/** 工具调用 */
export interface ToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

/** 工具定义 */
export interface ToolDefinition {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

/** 聊天请求 */
export interface ChatRequest {
  model: string
  messages: ChatMessage[]
  stream?: boolean
  temperature?: number
  max_tokens?: number
  tools?: ToolDefinition[]
  tool_choice?: 'auto' | 'none' | { type: 'function'; function: { name: string } }
}

/** 流式事件类型 */
export type StreamEventType = 'token' | 'done' | 'error' | 'tool_call' | 'usage'

/** 流式事件 */
export interface StreamEvent {
  type: StreamEventType
  content?: string
  error?: string
  toolCall?: ToolCall
  usage?: TokenUsage
  finishReason?: string
}

/** Token 使用量 */
export interface TokenUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

/** 模型信息 */
export interface ModelInfo {
  id: string
  name: string
  owned_by?: string
  created?: number
}

/** Provider 状态 */
export type ProviderStatus = 'idle' | 'connecting' | 'connected' | 'error'

/** Provider 连接验证结果 */
export interface ConnectionResult {
  success: boolean
  message?: string
  models?: ModelInfo[]
}

/** Embedding 请求 */
export interface EmbeddingRequest {
  model: string
  input: string | string[]
}

/** Embedding 响应 */
export interface EmbeddingResponse {
  data: Array<{
    embedding: number[]
    index: number
  }>
  usage?: TokenUsage
}

/** 请求缓存键 */
export interface CacheKey {
  model: string
  messages: ChatMessage[]
  temperature?: number
}

/** 缓存条目 */
export interface CacheEntry {
  response: string
  timestamp: number
  usage?: TokenUsage
}

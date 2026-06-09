/**
 * LLM 模块入口
 * 导出所有 Provider 相关的类型、接口和实现
 */

// 类型定义
export type {
  ProviderConfig,
  ChatMessage,
  ChatRequest,
  StreamEvent,
  StreamEventType,
  TokenUsage,
  ModelInfo,
  ProviderStatus,
  ConnectionResult,
  EmbeddingRequest,
  EmbeddingResponse,
  ToolCall,
  ToolDefinition
} from './types'

// 接口定义
export type {
  LLMProvider,
  ProviderFactory,
  ProviderRegistration
} from './provider-interface'

// 实现
export { OpenAIProvider, createOpenAIProvider } from './openai-provider'
export { ProviderRegistry, getProviderRegistry } from './provider-registry'
export { LLMCache, getLLMCache } from './cache'
export type { CacheConfig } from './cache'

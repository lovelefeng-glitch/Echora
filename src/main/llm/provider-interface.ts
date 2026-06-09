/**
 * LLM Provider 接口定义
 * 所有 Provider 实现必须遵循此接口
 */

import type {
  ProviderConfig,
  ChatRequest,
  ChatMessage,
  StreamEvent,
  ModelInfo,
  ConnectionResult,
  EmbeddingRequest,
  EmbeddingResponse,
  ProviderStatus
} from './types'

/**
 * Provider 接口
 * 定义与 LLM 服务商交互的标准方法
 */
export interface LLMProvider {
  /** Provider 唯一标识 */
  readonly id: string

  /** Provider 名称 */
  readonly name: string

  /** Provider 类型 */
  readonly type: string

  /** 当前状态 */
  readonly status: ProviderStatus

  /** 配置信息 */
  readonly config: ProviderConfig

  /**
   * 连接验证
   * 验证 API Key 和连接是否有效
   */
  validate(): Promise<ConnectionResult>

  /**
   * 获取可用模型列表
   */
  listModels(): Promise<ModelInfo[]>

  /**
   * 聊天补全（非流式）
   * @param request 聊天请求
   * @returns 助手回复内容
   */
  chat(request: ChatRequest): Promise<string>

  /**
   * 聊天补全（流式）
   * @param request 聊天请求
   * @param onEvent 流式事件回调
   * @returns AbortController 用于取消请求
   */
  chatStream(
    request: ChatRequest,
    onEvent: (event: StreamEvent) => void
  ): AbortController

  /**
   * 文本嵌入（可选）
   * @param request 嵌入请求
   * @returns 嵌入向量
   */
  embed?(request: EmbeddingRequest): Promise<EmbeddingResponse>

  /**
   * 更新配置
   * @param config 新配置
   */
  updateConfig(config: Partial<ProviderConfig>): void

  /**
   * 销毁 Provider，释放资源
   */
  destroy(): void
}

/**
 * Provider 工厂函数类型
 */
export type ProviderFactory = (config: ProviderConfig) => LLMProvider

/**
 * Provider 注册信息
 */
export interface ProviderRegistration {
  /** Provider 类型标识 */
  type: string
  /** Provider 名称 */
  name: string
  /** 工厂函数 */
  factory: ProviderFactory
  /** 是否默认 */
  isDefault?: boolean
}

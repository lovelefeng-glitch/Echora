/**
 * Agent 类型定义
 * 基于 ReAct 框架的 Agent 运行时类型
 */

import type { ChatMessage, StreamEvent, TokenUsage } from '../llm/types'

/** Agent 状态 */
export type AgentState =
  | 'idle'         // 空闲
  | 'observing'    // 观察中
  | 'thinking'     // 思考中
  | 'acting'       // 行动中
  | 'completed'    // 完成
  | 'error'        // 错误
  | 'cancelled'    // 已取消

/** 上下文压缩配置 */
export interface ContextCompressionConfig {
  /** 是否启用上下文压缩 */
  enabled?: boolean
  /** 压缩阈值百分比（默认80），当上下文占用超过此比例时触发压缩 */
  thresholdPct?: number
  /** 压缩目标百分比（默认50），压缩后上下文占用目标比例 */
  targetPct?: number
}

/** Agent 配置 */
export interface AgentConfig {
  /** Agent 唯一标识 */
  id: string
  /** Agent 名称 */
  name: string
  /** 使用的 Provider ID */
  providerId: string
  /** 使用的模型 */
  model: string
  /** 系统提示词 */
  systemPrompt?: string
  /** 最大步数限制 */
  maxSteps?: number
  /** 温度参数 */
  temperature?: number
  /** 最大 token 数 */
  maxTokens?: number
  /** 启用的工具列表 */
  tools?: string[]
  /** 启用工具系统 */
  enableTools?: boolean
  /** 记忆上下文（注入系统提示） */
  memoryContext?: string
  /** 模型上下文窗口大小（token数） */
  contextWindow?: number
  /** 上下文压缩配置 */
  contextCompression?: ContextCompressionConfig
}

/** Agent 步骤记录 */
export interface AgentStep {
  /** 步骤序号 */
  stepNumber: number
  /** 步骤类型 */
  type: 'thought' | 'action' | 'observation'
  /** 步骤内容 */
  content: string
  /** 时间戳 */
  timestamp: number
  /** 工具调用信息（如果是 action） */
  toolCall?: {
    name: string
    arguments: Record<string, unknown>
    result?: string
  }
  /** Token 使用量 */
  usage?: TokenUsage
  /** 耗时（毫秒） */
  duration?: number
}

/** Agent 执行结果 */
export interface AgentResult {
  /** 是否成功 */
  success: boolean
  /** 最终回复 */
  content: string
  /** 执行步骤记录 */
  steps: AgentStep[]
  /** 总 Token 使用量 */
  totalUsage: TokenUsage
  /** 总耗时（毫秒） */
  totalDuration: number
  /** 错误信息（如果失败） */
  error?: string
  /** 终止原因 */
  finishReason: 'completed' | 'max_steps' | 'cancelled' | 'error' | 'timeout'
}

/** Agent 事件类型 */
export type AgentEventType =
  | 'state_change'
  | 'step'
  | 'token'
  | 'tool_call'
  | 'error'
  | 'complete'

/** Agent 事件 */
export interface AgentEvent {
  type: AgentEventType
  state?: AgentState
  step?: AgentStep
  token?: string
  error?: string
  result?: AgentResult
}

/** Agent 事件回调 */
export type AgentEventCallback = (event: AgentEvent) => void

/** Agent 运行时接口 */
export interface AgentRuntime {
  /** Agent 配置 */
  readonly config: AgentConfig
  /** 当前状态 */
  readonly state: AgentState
  /** 当前步数 */
  readonly currentStep: number
  /** 执行步骤记录 */
  readonly steps: AgentStep[]

  /**
   * 执行 Agent 任务
   * @param message 用户消息
   * @param onEvent 事件回调
   * @returns 执行结果
   */
  run(message: string, onEvent?: AgentEventCallback): Promise<AgentResult>

  /**
   * 流式执行 Agent 任务
   * @param message 用户消息
   * @param onEvent 事件回调
   * @returns AbortController 用于取消
   */
  runStream(message: string, onEvent: AgentEventCallback): AbortController

  /**
   * 取消当前执行
   */
  cancel(): void

  /**
   * 重置 Agent 状态
   */
  reset(): void

  /**
   * 销毁 Agent
   */
  destroy(): void

  /**
   * 设置记忆上下文（注入系统提示）
   */
  setMemoryContext(context: string): void
}

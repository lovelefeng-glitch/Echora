/**
 * Trace 类型定义
 * Agent 执行追踪与可观测性
 */

import type { TokenUsage } from '../llm/types'

/** Trace 级别 */
export type TraceLevel = 'debug' | 'info' | 'warn' | 'error'

/** Trace 事件类型 */
export type TraceEventType =
  | 'agent_start'
  | 'agent_end'
  | 'agent_error'
  | 'llm_call'
  | 'llm_response'
  | 'tool_call'
  | 'tool_result'
  | 'step_start'
  | 'step_end'
  | 'state_change'
  | 'custom'

/** Trace 事件 */
export interface TraceEvent {
  /** 事件 ID */
  id: string
  /** Trace ID（同一执行链） */
  traceId: string
  /** 事件类型 */
  type: TraceEventType
  /** 事件级别 */
  level: TraceLevel
  /** 时间戳 */
  timestamp: number
  /** 事件来源 */
  source: string
  /** 事件消息 */
  message: string
  /** 事件数据 */
  data?: Record<string, unknown>
  /** Token 使用量 */
  usage?: TokenUsage
  /** 耗时（毫秒） */
  duration?: number
  /** 错误信息 */
  error?: string
  /** 父事件 ID（用于嵌套） */
  parentId?: string
}

/** Trace 记录 */
export interface TraceRecord {
  /** Trace ID */
  id: string
  /** Agent ID */
  agentId: string
  /** 开始时间 */
  startTime: number
  /** 结束时间 */
  endTime?: number
  /** 状态 */
  status: 'running' | 'completed' | 'error' | 'cancelled'
  /** 事件列表 */
  events: TraceEvent[]
  /** 总 Token 使用量 */
  totalUsage: TokenUsage
  /** 错误信息 */
  error?: string
  /** 元数据 */
  metadata?: Record<string, unknown>
}

/** Trace 配置 */
export interface TraceConfig {
  /** 是否启用 */
  enabled: boolean
  /** 日志级别 */
  level: TraceLevel
  /** 最大保留条数 */
  maxRecords: number
  /** 持久化路径 */
  persistPath?: string
  /** 是否输出到控制台 */
  consoleOutput: boolean
}

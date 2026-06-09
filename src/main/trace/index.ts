/**
 * Trace 模块入口
 * 导出所有 Trace 相关的类型和实现
 */

// 类型定义
export type {
  TraceLevel,
  TraceEventType,
  TraceEvent,
  TraceRecord,
  TraceConfig
} from './types'

// 实现
export { TraceManager, getTraceManager } from './trace-manager'

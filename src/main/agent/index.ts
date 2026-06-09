/**
 * Agent 模块入口
 * 导出所有 Agent 相关的类型和实现
 */

// 类型定义
export type {
  AgentState,
  AgentConfig,
  AgentStep,
  AgentResult,
  AgentEvent,
  AgentEventType,
  AgentEventCallback,
  AgentRuntime
} from './types'

export type { AgentManagerConfig } from './agent-manager'

// 实现
export { AgentLoop, createAgentLoop } from './agent-loop'
export { AgentManager, getAgentManager } from './agent-manager'
export { SessionManager, getSessionManager } from './session-manager'
export type { SessionMeta, SessionMessage, Session, SessionManagerConfig } from './session-manager'

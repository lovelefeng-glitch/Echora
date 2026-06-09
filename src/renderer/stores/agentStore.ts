/**
 * Agent Store
 * 独立的 Zustand Store，与 Chat Store 完全隔离
 * 包含会话管理：会话列表、当前会话切换、新建/删除会话
 */

import { create } from 'zustand'

/** Agent 消息 */
export interface AgentMessage {
  id: string
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  timestamp: number
  toolCalls?: AgentToolCall[]
  isStreaming?: boolean
}

/** 工具调用 */
export interface AgentToolCall {
  id: string
  name: string
  arguments: Record<string, unknown>
  result?: string
  status: 'pending' | 'running' | 'completed' | 'error'
  duration?: number
}

/** Agent 执行步骤 */
export interface AgentStep {
  stepNumber: number
  type: 'thought' | 'action' | 'observation'
  content: string
  timestamp: number
  toolCall?: AgentToolCall
}

/** Agent 状态 */
export type AgentState = 'idle' | 'thinking' | 'acting' | 'completed' | 'error'

/** Agent 会话元数据 */
export interface AgentSessionItem {
  id: string
  title: string
  agentId?: string
  createdAt: number
  updatedAt: number
  tokenUsage: { promptTokens: number; completionTokens: number; totalTokens: number }
  messageCount: number
}

/** Agent Store 状态 */
interface AgentStoreState {
  /** 当前 Agent ID */
  agentId: string | null
  /** Agent 状态 */
  state: AgentState
  /** 消息列表（当前会话） */
  messages: AgentMessage[]
  /** 执行步骤 */
  steps: AgentStep[]
  /** 是否正在流式输出 */
  isStreaming: boolean
  /** 当前 Provider */
  providerId: string | null
  /** 当前模型 */
  model: string | null
  /** 错误信息 */
  error: string | null

  /** 会话列表（元数据） */
  sessions: AgentSessionItem[]
  /** 当前选中的会话 ID */
  currentSessionId: string | null
  /** 会话列表加载中 */
  sessionsLoading: boolean
  /** 侧边栏折叠状态 */
  sidebarCollapsed: boolean

  // Actions
  setAgentId: (id: string | null) => void
  setState: (state: AgentState) => void
  addMessage: (message: AgentMessage) => void
  updateMessage: (id: string, updates: Partial<AgentMessage>) => void
  clearMessages: () => void
  addStep: (step: AgentStep) => void
  clearSteps: () => void
  setStreaming: (streaming: boolean) => void
  setProvider: (providerId: string, model: string) => void
  setError: (error: string | null) => void
  reset: () => void

  /** 设置会话列表 */
  setSessions: (sessions: AgentSessionItem[]) => void
  /** 设置当前会话 ID */
  setCurrentSessionId: (id: string | null) => void
  /** 设置会话加载状态 */
  setSessionsLoading: (loading: boolean) => void
  /** 切换侧边栏折叠 */
  toggleSidebar: () => void
}

/** 初始状态 */
const initialState: Omit<AgentStoreState,
  'setAgentId' | 'setState' | 'addMessage' | 'updateMessage' | 'clearMessages' |
  'addStep' | 'clearSteps' | 'setStreaming' | 'setProvider' | 'setError' | 'reset' |
  'setSessions' | 'setCurrentSessionId' | 'setSessionsLoading' | 'toggleSidebar'
> = {
  agentId: null,
  state: 'idle',
  messages: [],
  steps: [],
  isStreaming: false,
  providerId: null,
  model: null,
  error: null,
  sessions: [],
  currentSessionId: null,
  sessionsLoading: false,
  sidebarCollapsed: false
}

/**
 * Agent Store
 * 使用 Zustand 创建，与 Chat Store 完全隔离
 */
export const useAgentStore = create<AgentStoreState>((set) => ({
  ...initialState,

  setAgentId: (id) => set({ agentId: id }),

  setState: (state) => set({ state }),

  addMessage: (message) => set((s) => ({
    messages: [...s.messages, message]
  })),

  updateMessage: (id, updates) => set((s) => ({
    messages: s.messages.map(m =>
      m.id === id ? { ...m, ...updates } : m
    )
  })),

  clearMessages: () => set({ messages: [] }),

  addStep: (step) => set((s) => ({
    steps: [...s.steps, step]
  })),

  clearSteps: () => set({ steps: [] }),

  setStreaming: (streaming) => set({ isStreaming: streaming }),

  setProvider: (providerId, model) => set({ providerId, model }),

  setError: (error) => set({ error }),

  reset: () => set(initialState),

  setSessions: (sessions) => set({ sessions }),

  setCurrentSessionId: (id) => set({ currentSessionId: id }),

  setSessionsLoading: (loading) => set({ sessionsLoading: loading }),

  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed }))
}))

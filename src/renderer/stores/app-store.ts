import { create } from 'zustand'
import type {
  AgentListItem,
  GatewayStatus,
  GatewayStatusMap,
  AIDetected,
  AIDetectedItem,
  UsageInfo,
  AppSettings,
  DirectApiProvider
} from '../../shared/ipc-types'
import type { DirectApiConfig } from '../../shared/types'

export type View = 'chat' | 'settings' | 'ai-mgmt' | 'skills' | 'direct-api-settings' | 'agent' | 'agent-settings' | 'groupchat'

export type StreamPhase = 'idle' | 'thinking' | 'streaming' | 'tool' | 'done' | 'error'

// Preview panel types
export type PreviewType = 'url' | 'file' | 'console' | 'html' | 'explorer' | 'image'

export interface PreviewTarget {
  type: PreviewType
  url?: string
  path?: string
  content?: string
  language?: string
  title?: string
  html?: string
  logs?: Array<{ level: string; message: string; timestamp: number }>
}

// Persist agent sorting state to disk config
function persistAgentSorting() {
  const { lastAgentActivity, pendingNotifications } = useAppStore.getState()
  try {
    window.echora?.config?.set('agentSorting', {
      lastAgentActivity,
      pendingNotifications: Array.from(pendingNotifications)
    })
  } catch { /* ignore */ }
}

export interface ActiveStreamState {
  phase: StreamPhase
  statusText: string
  content: string
  msgId: string
  error: string | null
  usage: UsageInfo | null
  toolCalls: Array<{ name: string; emoji?: string; status?: string }>
  startTime: number
  duration: number
  agentKey: string
  convId: string
}

export interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
  isStreaming?: boolean
  usage?: UsageInfo
  toolCalls?: Array<{
    name: string
    emoji?: string
    status?: string
    detail?: string
    error?: string
  }>
  // Persistent streaming state for background streaming
  streamPhase?: 'idle' | 'thinking' | 'streaming' | 'tool' | 'done' | 'error'
  streamStatus?: string
  streamError?: string
  streamStartTime?: number
  streamDuration?: number
  // Hermes 响应元数据
  latency?: number
  firstChunkLatency?: number
  finishReason?: string
  // Attachments (user messages only, lightweight metadata)
  attachments?: Array<{ name: string; mimeType: string }>
}

export interface Conversation {
  id: string
  title: string
  messages: Message[]
  createdAt: number
  updatedAt: number
}

export interface AgentInfo extends AgentListItem {
  aiType: string
  model?: string | null
  contextWindow?: number | null
  usedTokens?: number | null
  usagePct?: number | null
}

interface AppState {
  currentView: View
  sidebarCollapsed: boolean

  agents: Map<string, AgentInfo>
  activeAgentKey: string | null

  conversations: Record<string, Record<string, Conversation>>
  activeConversationId: Record<string, string | null>

  gatewayStatus: GatewayStatusMap
  detectedAI: AIDetected

  settings: AppSettings
  theme: 'dark' | 'light'

  directApiConfigs: DirectApiConfig[]
  directApiProviders: DirectApiProvider[]
  directApiExpanded: Record<string, boolean>

  // Active streaming state per agent:conv (key: "agentKey:convId")
  activeStreams: Record<string, ActiveStreamState>
  // Pending input draft per agent:conv (key: "agentKey:convId")
  pendingInputs: Record<string, string>

  // Agent activity tracking for sidebar sorting
  lastAgentActivity: Record<string, number>  // agentKey → last active timestamp
  pendingNotifications: Set<string>          // agentKeys with unread shimmer notifications

  // Agent list refresh trigger (incremented by AIManagementPanel after add/remove)
  agentListVersion: number

  // Preview panel state
  previewVisible: boolean
  previewTarget: PreviewTarget | null
  previewWidth: number

  setView: (view: View) => void
  toggleSidebar: () => void

  addAgent: (agent: AgentInfo) => void
  removeAgent: (key: string) => void
  setActiveAgent: (key: string) => void
  updateAgent: (key: string, updates: Partial<AgentInfo>) => void
  setAgents: (agents: AgentInfo[]) => void

  addConversation: (agentKey: string, conv: Conversation) => void
  removeConversation: (agentKey: string, convId: string) => void
  setActiveConversation: (agentKey: string, convId: string) => void
  updateConversation: (agentKey: string, convId: string, updates: Partial<Conversation>) => void

  addMessage: (agentKey: string, convId: string, message: Message) => void
  updateMessage: (agentKey: string, convId: string, msgId: string, updates: Partial<Message>) => void
  appendToMessage: (agentKey: string, convId: string, msgId: string, delta: string) => void

  setGatewayStatus: (status: GatewayStatusMap) => void
  updateGatewayStatus: (aiType: string, status: GatewayStatus) => void
  setDetectedAI: (detected: AIDetected) => void
  updateDetectedAI: (key: string, item: AIDetectedItem) => void
  removedAIs: Set<string>
  markAIRemoved: (aiType: string) => void

  setTheme: (theme: 'dark' | 'light') => void
  updateSettings: (settings: Partial<AppSettings>) => void

  addDirectApiProvider: (config: DirectApiConfig) => void
  removeDirectApiProvider: (id: string) => void
  updateDirectApiProvider: (id: string, updates: Partial<DirectApiConfig>) => void
  setDirectApiConfigs: (configs: DirectApiConfig[]) => void

  setDirectApiProviders: (providers: DirectApiProvider[]) => void
  updateDirectApiProviderStatus: (id: string, status: DirectApiProvider['status'], error?: string) => void
  toggleDirectApiExpanded: (id: string) => void

  setActiveStream: (key: string, state: ActiveStreamState) => void
  updateActiveStream: (key: string, updates: Partial<ActiveStreamState>) => void
  removeActiveStream: (key: string) => void
  setPendingInput: (key: string, text: string) => void

  touchAgentActivity: (agentKey: string) => void
  notifyAgent: (agentKey: string) => void
  clearAgentNotification: (agentKey: string) => void
  restoreAgentSorting: (data: { lastAgentActivity?: Record<string, number>; pendingNotifications?: string[] }) => void
  bumpAgentListVersion: () => void

  // Preview panel methods
  showPreview: (target: PreviewTarget) => void
  hidePreview: () => void
  setPreviewWidth: (width: number) => void
  updatePreviewTarget: (target: Partial<PreviewTarget>) => void
}

export const useAppStore = create<AppState>((set) => ({
  currentView: 'chat',
  sidebarCollapsed: false,

  agents: new Map(),
  activeAgentKey: null,

  conversations: {},
  activeConversationId: {},

  gatewayStatus: {},
  detectedAI: {},
  removedAIs: new Set<string>(),

  settings: {
    autoStartOnBoot: false,
    minimizeToTray: true,
    checkUpdates: true,
    timeout: 30000,
    pollInterval: 5000,
    maxMessages: 100
  },
  theme: 'dark',

  directApiConfigs: [],
  directApiProviders: [],
  directApiExpanded: {},

  activeStreams: {},
  pendingInputs: {},

  lastAgentActivity: {},
  pendingNotifications: new Set<string>(),
  agentListVersion: 0,

  // Preview panel initial state
  previewVisible: false,
  previewTarget: null,
  previewWidth: 40,

  setView: (view) => set({ currentView: view }),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),

  addAgent: (agent) => set((s) => {
    const agents = new Map(s.agents)
    agents.set(`${agent.aiType}:${agent.id}`, agent)
    return { agents }
  }),

  removeAgent: (key) => set((s) => {
    const agents = new Map(s.agents)
    agents.delete(key)
    const activeAgentKey = s.activeAgentKey === key ? (agents.keys().next().value ?? null) : s.activeAgentKey
    return { agents, activeAgentKey }
  }),

  setActiveAgent: (key) => {
    set({ activeAgentKey: key })
    // Persist to config for restoration on restart
    try { window.echora?.config?.set('lastActiveAgent', key) } catch { /* ignore */ }
  },

  updateAgent: (key, updates) => set((s) => {
    const agents = new Map(s.agents)
    const existing = agents.get(key)
    console.log('[Store] updateAgent:', key, 'existing:', existing ? 'found' : 'NOT FOUND', 'updates:', JSON.stringify(updates))
    if (existing) {
      agents.set(key, { ...existing, ...updates })
    }
    return { agents }
  }),

  setAgents: (agentList) => set((s) => {
    const agents = new Map<string, AgentInfo>()
    for (const agent of agentList) {
      agents.set(`${agent.aiType}:${agent.id}`, agent)
    }
    // Always preserve Echora Agent (not from gateway)
    const echoraKey = 'echora:echora-agent'
    if (!agents.has(echoraKey)) {
      const prev = s.agents.get(echoraKey)
      if (prev) {
        agents.set(echoraKey, prev)
      } else {
        agents.set(echoraKey, {
          id: 'echora-agent',
          name: 'Echora Agent',
          aiType: 'echora',
          emoji: '🤖',
          description: 'Echora 内置 Agent',
          model: null,
          contextWindow: null,
          usedTokens: null,
          usagePct: null
        })
      }
    }
    return { agents }
  }),

  addConversation: (agentKey, conv) => set((s) => ({
    conversations: {
      ...s.conversations,
      [agentKey]: {
        ...s.conversations[agentKey],
        [conv.id]: conv
      }
    }
  })),

  removeConversation: (agentKey, convId) => set((s) => {
    const agentConvs = s.conversations[agentKey]
    if (!agentConvs) return s
    const { [convId]: _, ...rest } = agentConvs
    const conversations = { ...s.conversations, [agentKey]: rest }
    const activeConversationId = s.activeConversationId[agentKey] === convId
      ? { ...s.activeConversationId, [agentKey]: null }
      : s.activeConversationId
    return { conversations, activeConversationId }
  }),

  setActiveConversation: (agentKey, convId) => {
    set((s) => ({
      activeConversationId: { ...s.activeConversationId, [agentKey]: convId }
    }))
    // Persist per-agent active conversation for restoration on restart
    try {
      const current = useAppStore.getState().activeConversationId
      window.echora?.config?.set('lastActiveConversations', current)
    } catch { /* ignore */ }
  },

  updateConversation: (agentKey, convId, updates) => set((s) => {
    const existing = s.conversations[agentKey]?.[convId]
    if (!existing) return s
    return {
      conversations: {
        ...s.conversations,
        [agentKey]: {
          ...s.conversations[agentKey],
          [convId]: { ...existing, ...updates }
        }
      }
    }
  }),

  addMessage: (agentKey, convId, message) => set((s) => {
    const conv = s.conversations[agentKey]?.[convId]
    if (!conv) return s
    return {
      conversations: {
        ...s.conversations,
        [agentKey]: {
          ...s.conversations[agentKey],
          [convId]: {
            ...conv,
            messages: [...conv.messages, message],
            updatedAt: Date.now()
          }
        }
      }
    }
  }),

  updateMessage: (agentKey, convId, msgId, updates) => set((s) => {
    const conv = s.conversations[agentKey]?.[convId]
    if (!conv) return s
    return {
      conversations: {
        ...s.conversations,
        [agentKey]: {
          ...s.conversations[agentKey],
          [convId]: {
            ...conv,
            messages: conv.messages.map((msg) =>
              msg.id === msgId ? { ...msg, ...updates } : msg
            )
          }
        }
      }
    }
  }),

  appendToMessage: (agentKey, convId, msgId, delta) => set((s) => {
    const conv = s.conversations[agentKey]?.[convId]
    if (!conv) return s
    return {
      conversations: {
        ...s.conversations,
        [agentKey]: {
          ...s.conversations[agentKey],
          [convId]: {
            ...conv,
            messages: conv.messages.map((msg) =>
              msg.id === msgId ? { ...msg, content: msg.content + delta } : msg
            )
          }
        }
      }
    }
  }),

  setGatewayStatus: (status) => set((s) => {
    // 合并模式：保留 hermes:* profile 状态，防止被不含 profile 的全量替换覆盖
    const merged = { ...status }
    for (const [key, val] of Object.entries(s.gatewayStatus)) {
      if (key.startsWith('hermes:') && !(key in merged)) {
        merged[key] = val
      }
    }
    return { gatewayStatus: merged }
  }),

  updateGatewayStatus: (aiType, status) => set((s) => ({
    gatewayStatus: { ...s.gatewayStatus, [aiType]: status }
  })),

  setDetectedAI: (detected) => set({ detectedAI: detected }),

  updateDetectedAI: (key, item) => set((s) => ({
    detectedAI: { ...s.detectedAI, [key]: item }
  })),

  markAIRemoved: (aiType) => set((s) => {
    const next = new Set(s.removedAIs)
    next.add(aiType)
    return { removedAIs: next }
  }),

  setTheme: (theme) => set({ theme }),

  updateSettings: (settings) => set((s) => ({
    settings: { ...s.settings, ...settings }
  })),

  addDirectApiProvider: (config) => set((s) => ({
    directApiConfigs: [...s.directApiConfigs, config]
  })),

  removeDirectApiProvider: (id) => set((s) => ({
    directApiConfigs: s.directApiConfigs.filter((c) => c.id !== id)
  })),

  updateDirectApiProvider: (id, updates) => set((s) => ({
    directApiConfigs: s.directApiConfigs.map((c) =>
      c.id === id ? { ...c, ...updates } : c
    )
  })),

  setDirectApiConfigs: (configs) => set({ directApiConfigs: configs }),

  setDirectApiProviders: (providers) => set({ directApiProviders: providers }),

  updateDirectApiProviderStatus: (id, status, error) => set((s) => ({
    directApiProviders: s.directApiProviders.map((p) =>
      p.id === id ? { ...p, status, error } : p
    )
  })),

  toggleDirectApiExpanded: (id) => set((s) => ({
    directApiExpanded: { ...s.directApiExpanded, [id]: !s.directApiExpanded[id] }
  })),

  setActiveStream: (key, streamState) => set((s) => ({
    activeStreams: { ...s.activeStreams, [key]: streamState }
  })),

  updateActiveStream: (key, updates) => set((s) => {
    const existing = s.activeStreams[key]
    if (!existing) return s
    return {
      activeStreams: { ...s.activeStreams, [key]: { ...existing, ...updates } }
    }
  }),

  removeActiveStream: (key) => set((s) => {
    const { [key]: _, ...rest } = s.activeStreams
    return { activeStreams: rest }
  }),

  setPendingInput: (key, text) => set((s) => ({
    pendingInputs: { ...s.pendingInputs, [key]: text }
  })),

  touchAgentActivity: (agentKey) => {
    set((s) => ({
      lastAgentActivity: { ...s.lastAgentActivity, [agentKey]: Date.now() }
    }))
    persistAgentSorting()
  },

  notifyAgent: (agentKey) => {
    set((s) => {
      if (s.pendingNotifications.has(agentKey)) return s
      const next = new Set(s.pendingNotifications)
      next.add(agentKey)
      return {
        pendingNotifications: next,
        lastAgentActivity: { ...s.lastAgentActivity, [agentKey]: Date.now() }
      }
    })
    persistAgentSorting()
  },

  clearAgentNotification: (agentKey) => {
    set((s) => {
      if (!s.pendingNotifications.has(agentKey)) return s
      const next = new Set(s.pendingNotifications)
      next.delete(agentKey)
      return { pendingNotifications: next }
    })
    persistAgentSorting()
  },

  restoreAgentSorting: (data) => set(() => ({
    lastAgentActivity: data.lastAgentActivity ?? {},
    pendingNotifications: new Set(data.pendingNotifications ?? [])
  })),

  bumpAgentListVersion: () => set((s) => ({ agentListVersion: s.agentListVersion + 1 })),

  // Preview panel methods
  showPreview: (target) => set({ previewVisible: true, previewTarget: target }),
  hidePreview: () => set({ previewVisible: false }),
  setPreviewWidth: (width) => set({ previewWidth: Math.max(20, Math.min(60, width)) }),
  updatePreviewTarget: (updates) => set((s) => ({
    previewTarget: s.previewTarget ? { ...s.previewTarget, ...updates } : null
  }))
}))

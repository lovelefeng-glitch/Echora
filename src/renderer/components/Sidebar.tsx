import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { useAppStore, type View } from '../stores/app-store'
import { useEchora } from '../hooks/use-echora'
import { validateAndFallbackAgent } from '../hooks/use-agent-fallback'
import type { AIDetected, AIDetectedItem, GatewayStatusMap, DirectApiProvider, DirectApiConnectionResult } from '../../shared/ipc-types'
import type { DirectApiConfig } from '../../shared/types'

const DRAWER_ITEMS: Array<{ id: View | string; icon: string; label: string }> = [
  { id: 'chat', icon: '🗣️', label: 'AI 对话' },
  { id: 'agent-settings', icon: '🤖', label: 'Agent 设置' },
  { id: 'ai-mgmt', icon: '🖥️', label: 'AI 管理' },
  { id: 'conv-mgmt', icon: '💬', label: '会话管理' },
  { id: 'skills', icon: '🧩', label: 'Skill' },
  { id: 'groupchat', icon: '👥', label: '群聊管理' },
  { id: 'cron', icon: '⏰', label: '定时任务' },
  { id: 'env', icon: '💻', label: '运行环境' },
  { id: 'settings', icon: '⚙️', label: '系统设置' }
]

const AVATAR_COLORS = ['#4A90D9', '#E85D75', '#7C5CBF', '#F5A623', '#50C878', '#FF6B6B', '#45B7D1', '#FFD93D', '#6C5B7B', '#00B4D8']

function getAvatarColor(key: string): string {
  let hash = 0
  for (let i = 0; i < key.length; i++) {
    hash = ((hash << 5) - hash) + key.charCodeAt(i)
    hash |= 0
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

function getStatusClass(status: string | undefined): string {
  switch (status) {
    case 'running': return 'bg-[var(--success)] shadow-[0_0_6px_var(--success)]'
    case 'stopped': return 'bg-[var(--error)]'
    case 'starting': return 'bg-[var(--warning)] animate-[pulse_1.2s_infinite]'
    default: return 'bg-[var(--inactive)]'
  }
}

const SIDEBAR_TW = {
  sidebar: 'w-[var(--sidebar-width)] bg-transparent flex flex-col shrink-0 overflow-hidden select-none dark:bg-[var(--bg-primary)]',
  header: 'h-20 px-5 flex items-center shrink-0 [-webkit-app-region:drag]',
  logoImg: 'h-20 w-auto object-contain [-webkit-app-region:drag] pointer-events-none',
  searchBox: 'py-2 px-4 pb-3.5',
  searchInput: 'w-full h-9 px-3 bg-[var(--bg-search)] border border-[#D1D5DB] rounded-[var(--radius-sm)] text-[var(--text-primary)] text-[13px] outline-none transition-colors duration-200 font-[inherit] placeholder:text-[var(--text-hint)] focus:border-[var(--accent)] focus:bg-white dark:bg-[#494949] dark:border-[#656565] dark:focus:bg-[#494949]',
  agentList: 'flex-1 overflow-y-auto py-1 px-0.5 pl-2.5 min-h-0 [scrollbar-gutter:stable]',
  agentItem: 'flex items-center gap-2.5 py-[9px] px-2.5 rounded-[var(--radius-md)] cursor-pointer transition-all duration-[0.12s] relative mb-0 border border-transparent hover:bg-[#E0E5EC] dark:hover:bg-[#404040]',
  agentActive: 'bg-white border-white dark:bg-[#292929] dark:border-[#292929]',
  agentNotified: 'relative',
  agentNotifiedBadge: 'absolute top-1.5 left-[calc(-2px+var(--avatar-size))] pointer-events-none animate-[badgeBlink_1.2s_ease-in-out_infinite] z-2',
  avatar: 'w-[var(--avatar-size)] h-[var(--avatar-size)] rounded-[var(--radius-full)] flex items-center justify-center text-[13px] font-semibold bg-[var(--bg-tertiary)] text-white shrink-0 select-none',
  agentInfo: 'flex-1 min-w-0',
  agentName: 'text-[13px] font-semibold text-[var(--text-primary)] whitespace-nowrap overflow-hidden text-ellipsis',
  agentMeta: 'flex items-center gap-1.5 mt-0.5',
  agentAIBadge: 'inline-block text-[10px] text-[var(--text-hint)]',
  statusDot: 'w-2 h-2 rounded-full shrink-0',
  agentDivider: 'h-px bg-[var(--border)] mx-2.5 ml-[54px] shrink-0 opacity-50',
  divider: 'h-0 mx-3 shrink-0',
  drawer: 'shrink-0 relative',
  drawerToggle: 'w-full flex items-center justify-between py-2.5 px-4 bg-transparent border-none text-[var(--text-secondary)] text-[13px] font-[inherit] cursor-pointer transition-colors duration-150 relative z-5 hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] dark:text-white dark:hover:text-white',
  drawerLabel: 'font-medium',
  drawerArrow: 'text-[10px] transition-transform duration-250 ease-[ease]',
  drawerContent: 'overflow-hidden transition-[max-height,opacity] duration-300 ease-[ease] max-h-0 opacity-0 px-2 absolute bottom-full left-2 right-2 bg-[var(--bg-primary)] rounded-[var(--radius-lg)] shadow-[0_-8px_24px_rgba(0,0,0,0.15)] z-10 dark:bg-[var(--bg-secondary)] dark:shadow-[0_-8px_24px_rgba(0,0,0,0.3)]',
  drawerContentOpen: 'max-h-[999px] opacity-100 p-3',
  drawerMenu: 'grid grid-cols-2 gap-2',
  drawerMenuItem: 'flex flex-col items-center gap-1 py-2.5 px-2 bg-[var(--bg-card)] border border-[var(--border-light)] rounded-[var(--radius-md)] text-[var(--text-secondary)] text-xs font-[inherit] cursor-pointer transition-all duration-[0.12s] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] hover:border-[var(--border)]',
  drawerMenuItemActive: 'bg-[var(--accent-light)] border-[var(--accent)] text-[var(--accent)]',
  menuIcon: 'text-[22px] leading-none',
  menuLabel: 'text-[11px] font-medium whitespace-nowrap overflow-hidden text-ellipsis',
  emptyState: 'flex flex-col items-center justify-center py-8 px-4 text-center gap-1.5',
  emptyIcon: 'text-[28px] opacity-40',
  emptyText: 'text-xs text-[var(--text-hint)]',
  footer: 'py-2 px-4 flex items-center justify-between gap-2.5 min-h-10',
  footerLabel: 'text-[11px] text-[var(--text-hint)] flex items-center gap-2',
}

export function Sidebar() {
  const currentView = useAppStore((s) => s.currentView)
  const setView = useAppStore((s) => s.setView)
  const setAgents = useAppStore((s) => s.setAgents)
  const setDetectedAI = useAppStore((s) => s.setDetectedAI)
  const setGatewayStatus = useAppStore((s) => s.setGatewayStatus)
  const directApiConfigs = useAppStore((s) => s.directApiConfigs)
  const directApiProviders = useAppStore((s) => s.directApiProviders)
  const directApiExpanded = useAppStore((s) => s.directApiExpanded)
  const setDirectApiProviders = useAppStore((s) => s.setDirectApiProviders)
  const updateDirectApiProviderStatus = useAppStore((s) => s.updateDirectApiProviderStatus)
  const toggleDirectApiExpanded = useAppStore((s) => s.toggleDirectApiExpanded)
  const setActiveAgent = useAppStore((s) => s.setActiveAgent)
  const addAgent = useAppStore((s) => s.addAgent)
  const agents = useAppStore((s) => s.agents)
  const activeAgentKey = useAppStore((s) => s.activeAgentKey)
  const gatewayStatus = useAppStore((s) => s.gatewayStatus)
  const lastAgentActivity = useAppStore((s) => s.lastAgentActivity)
  const pendingNotifications = useAppStore((s) => s.pendingNotifications)
  const clearAgentNotification = useAppStore((s) => s.clearAgentNotification)
  const agentListVersion = useAppStore((s) => s.agentListVersion)
  const removedAIs = useAppStore((s) => s.removedAIs)
  const api = useEchora()

  const [search, setSearch] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)

  const loadDirectApiProviders = useCallback(async () => {
    try {
      // 优先从 agentProviders 配置加载（与 DirectApiAdapter 使用相同数据源）
      const allConfig = await api.config.getAll() as Record<string, unknown>
      const agentProviders = (allConfig['agentProviders'] as Array<Record<string, unknown>>) || []
      if (agentProviders.length > 0) {
        const mapped: DirectApiProvider[] = agentProviders.map((p) => ({
          id: p.id as string,
          name: p.name as string,
          baseUrl: p.baseUrl as string,
          hasApiKey: Boolean(p.apiKey),
          models: ((p.models as string[]) || []).map((m: string) => ({ id: m, name: m })),
          status: 'offline' as const
        }))
        setDirectApiProviders(mapped)
        return
      }
    } catch {
      // fall through to legacy directApiConfigs
    }
    // 回退到旧的 directApiConfigs
    if (directApiConfigs.length > 0) {
      const mapped: DirectApiProvider[] = directApiConfigs.map((cfg: DirectApiConfig) => ({
        id: cfg.id,
        name: cfg.name,
        baseUrl: cfg.baseUrl,
        hasApiKey: Boolean(cfg.apiKey),
        models: (cfg.models || []).map((m: string) => ({ id: m, name: m })),
        status: 'offline' as const
      }))
      setDirectApiProviders(mapped)
    }
  }, [api, directApiConfigs, setDirectApiProviders])

  const handleTestProvider = useCallback(async (providerId: string) => {
    updateDirectApiProviderStatus(providerId, 'checking')
    try {
      const result = await api.directApi.testConnection(providerId) as DirectApiConnectionResult
      updateDirectApiProviderStatus(providerId, result.success ? 'online' : 'error', result.error)
    } catch {
      updateDirectApiProviderStatus(providerId, 'error', '连接失败')
    }
  }, [api, updateDirectApiProviderStatus])

  const handleModelSelect = useCallback((providerId: string, modelId: string, providerName: string) => {
    const agentKey = `direct-api:${providerId}:${modelId}`
    const existing = agents.get(agentKey)
    if (!existing) {
      addAgent({
        id: `${providerId}:${modelId}`,
        name: `${providerName} · ${modelId.split('/').pop() ?? modelId}`,
        aiType: 'direct-api',
        emoji: '☁️',
        description: `${providerId}:${modelId}`,
        model: modelId,
        contextWindow: null,
        usedTokens: null,
        usagePct: null
      })
    }
    setActiveAgent(agentKey)
    setView('chat')
  }, [agents, addAgent, setActiveAgent, setView])

  const handleRefresh = useCallback(async () => {
    if (refreshing) return
    setRefreshing(true)
    try {
      const result = await api.gateway.refresh() as {
        detected?: AIDetected
        gateways?: GatewayStatusMap
      } | null
      if (result) {
        const detected: AIDetected = result.detected ?? {}
        const gateways: GatewayStatusMap = result.gateways ?? {}
        setDetectedAI(detected)
        setGatewayStatus(gateways)

        const agentList: Array<{
          id: string; name: string; aiType: string; emoji?: string; description?: string
          model?: string | null; contextWindow?: number | null
        }> = []
        for (const [aiType, info] of Object.entries(detected) as Array<[string, AIDetectedItem]>) {
          if (removedAIs.has(aiType)) continue
          if (!info.found && !info.path) continue
          try {
            const rawAgents = await api.agent.list(aiType) as Array<{
              id: string; name: string; emoji?: string; description?: string
            }>
            for (const a of rawAgents) {
              agentList.push({ ...a, aiType })
            }
          } catch {
            // skip agents that fail to load
          }
        }
        const uniqueMap = new Map<string, typeof agentList[0]>()
        for (const a of agentList) {
          const key = `${a.aiType}:${a.id}`
          if (!uniqueMap.has(key)) {
            uniqueMap.set(key, a)
          }
        }
        // Inject Echora Agent into results (always present, not from gateway)
        if (!uniqueMap.has('echora:echora-agent')) {
          uniqueMap.set('echora:echora-agent', {
            id: 'echora-agent',
            name: 'Echora Agent',
            aiType: 'echora',
            emoji: '🤖',
            description: 'Echora 内置 Agent'
          })
        }

        const existingAgents = useAppStore.getState().agents
        setAgents(Array.from(uniqueMap.values()).map((a) => {
          const key = `${a.aiType}:${a.id}`
          const existing = existingAgents.get(key)
          return {
            ...a,
            aiType: a.aiType,
            model: existing?.model ?? null,
            contextWindow: existing?.contextWindow ?? null,
            usagePct: null,
            usedTokens: null
          }
        }))

        // 校验 activeAgentKey 是否仍有效：如果 agent 被移除，自动切换到首位在线 agent
        validateAndFallbackAgent(uniqueMap, gateways)
      }

      await loadDirectApiProviders()
    } catch (err) {
      console.error('Refresh failed:', err)
    } finally {
      setRefreshing(false)
    }
  }, [refreshing, api, setDetectedAI, setGatewayStatus, setAgents, loadDirectApiProviders, removedAIs])

  // Initial load only — manual refresh is triggered by the button click
  const initialLoadDone = useRef(false)
  useEffect(() => {
    if (initialLoadDone.current) return
    initialLoadDone.current = true
    loadDirectApiProviders()
    handleRefresh()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Ensure Echora Agent exists as fallback before first refresh completes
  useEffect(() => {
    if (initialLoadDone.current) return
    const store = useAppStore.getState()
    if (!store.agents.has('echora:echora-agent') && store.agents.size === 0) {
      store.addAgent({
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
    // Ensure Echora Agent has activity timestamp so sorting works
    if (!store.lastAgentActivity['echora:echora-agent']) {
      store.touchAgentActivity('echora:echora-agent')
    }
    if (!store.activeAgentKey) {
      store.setActiveAgent('echora:echora-agent')
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-refresh agent list when AIManagementPanel triggers a version bump
  const prevVersionRef = useRef(agentListVersion)
  useEffect(() => {
    if (agentListVersion > 0 && agentListVersion !== prevVersionRef.current) {
      handleRefresh()
    }
    prevVersionRef.current = agentListVersion
  }, [agentListVersion, handleRefresh])

  const handleDrawerItemClick = (id: string) => {
    if (['chat', 'ai-mgmt', 'skills', 'settings', 'agent-settings', 'groupchat'].includes(id)) {
      // 切回对话时校验当前 agent 是否仍然有效
      if (id === 'chat') {
        const store = useAppStore.getState()
        validateAndFallbackAgent(store.agents, store.gatewayStatus)
      }
      setView(id as View)
      setDrawerOpen(false)
    }
  }

  // Filter agents by search, then sort by activity priority
  const agentEntries = useMemo(() => {
    const entries = Array.from(agents.entries()).filter(([, agent]) => {
      if (!search) return true
      const q = search.toLowerCase()
      return (
        agent.name.toLowerCase().includes(q) ||
        agent.aiType.toLowerCase().includes(q)
      )
    })

    // Sort by last activity timestamp (new messages update timestamp via notifyAgent)
    entries.sort((a, b) => {
      const [keyA] = a
      const [keyB] = b
      const activityA = lastAgentActivity[keyA] ?? 0
      const activityB = lastAgentActivity[keyB] ?? 0
      if (activityA !== activityB) return activityB - activityA

      return 0
    })

    return entries
  }, [agents, search, lastAgentActivity, pendingNotifications])

  return (
    <aside className={SIDEBAR_TW.sidebar}>
      {/* Logo */}
      <div className={SIDEBAR_TW.header}>
        <img
          src="/icon/Echora-logo-1.png"
          alt="Echora"
          className={SIDEBAR_TW.logoImg}
        />
      </div>

      {/* Search */}
      <div className={SIDEBAR_TW.searchBox}>
        <input
          className={SIDEBAR_TW.searchInput}
          type="text"
          placeholder="🔍 搜索 Agent..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoComplete="off"
        />
      </div>

      {/* Agent List */}
      <div className={SIDEBAR_TW.agentList}>
        {agentEntries.length === 0 ? (
          <div className={SIDEBAR_TW.emptyState}>
            <div className={SIDEBAR_TW.emptyIcon}>🌊</div>
            <div className={SIDEBAR_TW.emptyText}>点击刷新扫描 AI 软件</div>
          </div>
        ) : (
          agentEntries.map(([key, agent], index) => {
            const isActive = activeAgentKey === key
            const isNotified = pendingNotifications.has(key)
            let statusKey = agent.aiType
            if (agent.aiType === 'hermes' && agent.id !== 'hermes-agent') {
              statusKey = `hermes:${agent.id}`
            }
            let status: string
            if (agent.aiType === 'echora') {
              // Echora Agent 使用直连 API，绿灯基于 API 配置状态
              if (directApiProviders.length === 0) {
                status = 'offline'
              } else {
                // 配置成功（至少一个 provider 有 API Key）时显示绿灯
                const configured = directApiProviders.some(p => p.hasApiKey)
                status = configured ? 'running' : 'offline'
              }
            } else {
              const aiStatus = gatewayStatus[statusKey]
              status = aiStatus?.status ?? 'offline'
            }
            const initial = agent.emoji || agent.name.charAt(0)
            const avatarUrl = agent.avatar || (initial && (initial.startsWith('http') || initial.startsWith('/') || initial.startsWith('data:') || /\.(png|jpg|jpeg|gif|svg|webp)$/i.test(initial)) ? initial : null)
            const isEchoraAgent = key === 'echora:echora-agent'
            const color = isEchoraAgent ? '#FF6B6B' : getAvatarColor(key)

            return (
              <div key={key}>
                {index > 0 && <div className={SIDEBAR_TW.agentDivider} />}
                <div
                  className={`${SIDEBAR_TW.agentItem} ${isActive ? SIDEBAR_TW.agentActive : ''} ${isNotified ? SIDEBAR_TW.agentNotified : ''}`}
                  onClick={() => {
                    if (isNotified) clearAgentNotification(key)
                    setActiveAgent(key)
                    setView('chat')
                  }}
                >
                  {isNotified && (
                    <img src="/icon/new_101.png" alt="new" className={SIDEBAR_TW.agentNotifiedBadge} />
                  )}
                  <div
                    className={SIDEBAR_TW.avatar}
                    style={avatarUrl ? { backgroundImage: `url('${avatarUrl}')`, backgroundSize: 'cover', backgroundPosition: 'center' } : { background: color }}
                    data-initial={avatarUrl ? '' : initial}
                  >
                    {!avatarUrl && initial}
                  </div>
                  <div className={SIDEBAR_TW.agentInfo}>
                    <div className={SIDEBAR_TW.agentName}>{agent.name}</div>
                    <div className={SIDEBAR_TW.agentMeta}>
                      <span className={SIDEBAR_TW.agentAIBadge}>{agent.aiType}</span>
                    </div>
                  </div>
                  <div className={`${SIDEBAR_TW.statusDot} ${getStatusClass(status)}`} />
                </div>
              </div>
            )
          })
        )}

        {/* Direct API Providers */}
        {directApiProviders.length > 0 && (
          <>
            {directApiProviders.map((provider) => {
              const expanded = directApiExpanded[provider.id] ?? false
              return (
                <div key={provider.id}>
                  <div
                    className={SIDEBAR_TW.agentItem}
                    onClick={() => toggleDirectApiExpanded(provider.id)}
                  >
                    <div className={SIDEBAR_TW.avatar} style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
                      ☁️
                    </div>
                    <div className={SIDEBAR_TW.agentInfo}>
                      <div className={SIDEBAR_TW.agentName}>{provider.name}</div>
                      <div className={SIDEBAR_TW.agentMeta}>
                        <span className={SIDEBAR_TW.agentAIBadge}>API · {provider.models.length} 模型</span>
                      </div>
                    </div>
                    <div
                      className={`${SIDEBAR_TW.statusDot} ${
                        provider.status === 'online' ? 'bg-[var(--success)] shadow-[0_0_6px_var(--success)]' :
                        provider.status === 'checking' ? 'bg-[var(--warning)] animate-[pulse_1.2s_infinite]' :
                        provider.status === 'error' ? 'bg-[var(--error)]' :
                        'bg-[var(--inactive)]'
                      }`}
                      onClick={(e) => { e.stopPropagation(); handleTestProvider(provider.id) }}
                      title="点击测试连接"
                    />
                  </div>
                  {expanded && provider.models.length > 0 && (
                    <div style={{ paddingLeft: 44 }}>
                      {provider.models.map((model) => {
                        const agentKey = `direct-api:${provider.id}:${model.id}`
                        const isModelActive = activeAgentKey === agentKey
                        return (
                          <div
                            key={model.id}
                            className={`${SIDEBAR_TW.agentItem} ${isModelActive ? 'active' : ''}`}
                            style={{ padding: '6px 10px' }}
                            onClick={() => handleModelSelect(provider.id, model.id, provider.name)}
                          >
                            <span style={{ fontSize: 11, opacity: 0.6 }}>◇</span>
                            <span className={SIDEBAR_TW.agentName} style={{ fontSize: 12 }}>{model.name}</span>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </>
        )}
      </div>

      {/* Divider */}
      <div className={SIDEBAR_TW.divider} />

      {/* Drawer Menu */}
      <div className={SIDEBAR_TW.drawer}>
        <button
          className={SIDEBAR_TW.drawerToggle}
          onClick={() => setDrawerOpen(!drawerOpen)}
        >
          <span className={SIDEBAR_TW.drawerLabel}>🧭 功能菜单</span>
          <span className={`${SIDEBAR_TW.drawerArrow} ${drawerOpen ? 'rotate-180' : ''}`}>▼</span>
        </button>
        <div className={`${SIDEBAR_TW.drawerContent} ${drawerOpen ? SIDEBAR_TW.drawerContentOpen : ''}`}>
          <nav className={SIDEBAR_TW.drawerMenu}>
            {DRAWER_ITEMS.map((item) => {
              const isActive = currentView === item.id
              const isClickable = ['chat', 'ai-mgmt', 'skills', 'settings', 'agent-settings', 'groupchat'].includes(item.id)
              return (
                <button
                  key={item.id}
                  className={`${SIDEBAR_TW.drawerMenuItem} ${isActive ? SIDEBAR_TW.drawerMenuItemActive : ''}`}
                  onClick={() => isClickable ? handleDrawerItemClick(item.id) : undefined}
                  style={{ opacity: isClickable ? 1 : 0.5, cursor: isClickable ? 'pointer' : 'default' }}
                >
                  <span className={SIDEBAR_TW.menuIcon}>{item.icon}</span>
                  <span className={SIDEBAR_TW.menuLabel}>{item.label}</span>
                </button>
              )
            })}
          </nav>
        </div>
      </div>
    </aside>
  )
}

import { useMemo, useCallback } from 'react'
import { useAppStore, type AgentInfo } from '../stores/app-store'
import { useEchora } from '../hooks/use-echora'
import type { GatewayStatus, DirectApiProvider } from '../../shared/ipc-types'

const TW = {
  emptyState: 'flex flex-col items-center justify-center py-8 px-4 text-center gap-1.5',
  emptyIcon: 'text-[28px] opacity-40',
  emptyText: 'text-xs text-[var(--text-hint)]',
  emptyHint: 'text-[11px] text-[var(--text-hint)] opacity-70',
  agentSection: 'flex flex-col',
  agentItem: 'flex items-center gap-2.5 py-[9px] px-2.5 rounded-[var(--radius-md)] cursor-pointer transition-all duration-[0.12s] relative mb-0 border border-transparent hover:bg-[#E0E5EC] dark:hover:bg-[#404040]',
  agentActive: 'bg-white border-white dark:bg-[#292929] dark:border-[#292929]',
  avatar: 'w-[var(--avatar-size)] h-[var(--avatar-size)] rounded-[var(--radius-full)] flex items-center justify-center text-[13px] font-semibold bg-[var(--bg-tertiary)] text-white shrink-0 select-none',
  avatarEmoji: 'text-base leading-none',
  avatarFallback: 'text-[13px] font-semibold',
  agentInfo: 'flex-1 min-w-0',
  agentName: 'text-[13px] font-semibold text-[var(--text-primary)] whitespace-nowrap overflow-hidden text-ellipsis',
  agentMeta: 'flex items-center gap-1.5 mt-0.5',
  cloudBadge: 'inline-block text-[10px] text-[var(--accent)]',
  aiBadge: 'inline-block text-[10px] text-[var(--text-hint)]',
  portInfo: 'text-[10px] text-[var(--text-hint)] opacity-70',
  statusDot: 'w-2 h-2 rounded-full shrink-0',
}

interface AgentListProps {
  filter?: string
}

const STATUS_ORDER: Record<string, number> = {
  running: 0,
  online: 0,
  starting: 1,
  checking: 1,
  error: 2,
  stopped: 3,
  offline: 4
}

function getStatusClass(status: string): string {
  switch (status) {
    case 'running': return 'bg-[var(--success)] shadow-[0_0_6px_var(--success)]'
    case 'online': return 'bg-[var(--success)] shadow-[0_0_6px_var(--success)]'
    case 'starting': return 'bg-[var(--warning)] animate-[pulse_1.2s_infinite]'
    case 'checking': return 'bg-[var(--warning)] animate-[pulse_1.2s_infinite]'
    case 'error': return 'bg-[var(--error)]'
    case 'stopped': return 'bg-[var(--error)]'
    default: return 'bg-[var(--inactive)]'
  }
}

function getAgentStatus(
  agent: AgentInfo,
  gatewayStatus: Record<string, GatewayStatus>,
  providers: DirectApiProvider[]
): string {
  // Echora built-in agent uses direct API, not a gateway
  if (agent.aiType === 'direct-api' || agent.aiType === 'echora') {
    if (agent.aiType === 'direct-api') {
      const providerId = agent.description?.split(':')[0]
      const provider = providers.find((p) => p.id === providerId)
      if (!provider) return 'offline'
      return provider.status === 'online' ? 'running' : provider.status
    }
    // Echora Agent: 绿灯基于 API 配置状态（至少一个 provider 有 API Key）
    if (providers.length === 0) return 'offline'
    const configured = providers.some(p => p.hasApiKey)
    return configured ? 'running' : 'offline'
  }
  // Hermes profile agent：用 hermes:profileName 作为 key 查找独立状态
  let statusKey = agent.aiType
  if (agent.aiType === 'hermes' && agent.id !== 'hermes-agent') {
    statusKey = `hermes:${agent.id}`
  }
  const gw = gatewayStatus[statusKey]
  if (!gw) return 'offline'
  return gw.status ?? 'offline'
}

export function AgentList({ filter = '' }: AgentListProps) {
  const agents = useAppStore((s) => s.agents)
  const activeAgentKey = useAppStore((s) => s.activeAgentKey)
  const gatewayStatus = useAppStore((s) => s.gatewayStatus)
  const directApiProviders = useAppStore((s) => s.directApiProviders)
  const setActiveAgent = useAppStore((s) => s.setActiveAgent)
  const setView = useAppStore((s) => s.setView)
  const api = useEchora()

  const agentEntries = useMemo(() => {
    const entries = Array.from(agents.entries()).map(([key, agent]) => ({
      key,
      agent,
      isDirectApi: agent.aiType === 'direct-api',
      status: getAgentStatus(agent, gatewayStatus, directApiProviders)
    }))

    const lowerFilter = filter.toLowerCase()
    const filtered = lowerFilter
      ? entries.filter(
          (e) =>
            e.agent.name.toLowerCase().includes(lowerFilter) ||
            e.agent.aiType.toLowerCase().includes(lowerFilter) ||
            (e.agent.description?.toLowerCase().includes(lowerFilter) ?? false) ||
            (e.agent.model?.toLowerCase().includes(lowerFilter) ?? false)
        )
      : entries

    return filtered.sort((a, b) => {
      const orderA = STATUS_ORDER[a.status] ?? 5
      const orderB = STATUS_ORDER[b.status] ?? 5
      if (orderA !== orderB) return orderA - orderB
      return a.agent.name.localeCompare(b.agent.name)
    })
  }, [agents, gatewayStatus, directApiProviders, filter])

  const handleSelect = useCallback(
    async (key: string) => {
      // Force save current conversation before switching agent
      if (activeAgentKey && activeAgentKey !== key) {
        try {
          const state = useAppStore.getState()
          const currentConvId = state.activeConversationId[activeAgentKey]
          if (currentConvId) {
            const conv = state.conversations[activeAgentKey]?.[currentConvId]
            if (conv) {
              await api.conv.save(activeAgentKey, currentConvId, {
                id: conv.id,
                title: conv.title,
                messages: conv.messages.map((m) => ({
                  role: m.role,
                  content: m.content,
                  timestamp: m.timestamp
                })),
                createdAt: conv.createdAt,
                updatedAt: conv.updatedAt
              })
            }
          }
        } catch (err) {
          console.error('Failed to save conversation before switching agent:', err)
        }
      }
      setActiveAgent(key)
      setView('chat')
    },
    [setActiveAgent, setView, activeAgentKey, api]
  )

  if (agentEntries.length === 0) {
    return (
      <div className={TW.emptyState}>
        <div className={TW.emptyIcon}>🤖</div>
        <div className={TW.emptyText}>暂无 Agent</div>
        <div className={TW.emptyHint}>
          {filter ? '无匹配结果' : '前往 AI 管理添加'}
        </div>
      </div>
    )
  }

  return (
    <div className={TW.agentSection}>
      {agentEntries.map(({ key, agent, isDirectApi, status }) => {
        const isActive = activeAgentKey === key
        const gw = gatewayStatus[agent.aiType]
        const port = gw?.port

        return (
          <div
            key={key}
            className={`${TW.agentItem} ${isActive ? TW.agentActive : ''}`}
            onClick={() => handleSelect(key)}
            title={isDirectApi
              ? `${agent.name} · ${agent.model ?? 'cloud'}`
              : `${agent.name} · ${agent.aiType}`
            }
          >
            <div className={TW.avatar}>
              {(() => {
                const emoji = agent.emoji || ''
                const avatarUrl = agent.avatar || (emoji && (emoji.startsWith('http') || emoji.startsWith('/') || emoji.startsWith('data:')) ? emoji : null)
                return avatarUrl ? (
                  <div style={{ width: '100%', height: '100%', borderRadius: '50%', backgroundImage: `url('${avatarUrl}')`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
                ) : emoji ? (
                  <span className={TW.avatarEmoji}>{emoji}</span>
                ) : (
                  <span className={TW.avatarFallback}>{agent.name.slice(0, 1)}</span>
                )
              })()}
            </div>

            <div className={TW.agentInfo}>
              <div className={TW.agentName}>{agent.name}</div>
              <div className={TW.agentMeta}>
                {isDirectApi ? (
                  <span className={TW.cloudBadge}>☁️ API</span>
                ) : (
                  <span className={TW.aiBadge}>{agent.aiType}</span>
                )}
                {port != null && (
                  <span className={TW.portInfo}>:{port}</span>
                )}
                {agent.model && (
                  <span className={TW.portInfo}>
                    {agent.model.split('/').pop()}
                  </span>
                )}
              </div>
            </div>

            <span
              className={`${TW.statusDot} ${getStatusClass(status)}`}
            />
          </div>
        )
      })}
    </div>
  )
}

﻿﻿﻿﻿﻿﻿import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { useAppStore } from '../stores/app-store'
import { useConversations } from '../hooks/use-conversations'
import { useStreaming } from '../hooks/use-streaming'
import { useTokenInfo } from '../hooks/use-token-info'
import { useEchora } from '../hooks/use-echora'
import { ChatTopbar } from './chat/ChatTopbar'
import { ChatMessageList } from './chat/ChatMessageList'
import { ChatInputArea, type GatewayRestartStatus } from './chat/ChatInputArea'
import { ToolDetailModal } from './chat/ToolDetailModal'
import { EmptyState } from './chat/EmptyState'
import type { Attachment } from '../../shared/ipc-types'

interface ChatAreaProps {
  onToggleTheme: () => void
}

export function ChatArea({ onToggleTheme }: ChatAreaProps) {
  const activeAgentKey = useAppStore((s) => s.activeAgentKey)
  const agents = useAppStore((s) => s.agents)
  const gatewayStatus = useAppStore((s) => s.gatewayStatus)
  const detectedAI = useAppStore((s) => s.detectedAI)
  const theme = useAppStore((s) => s.theme)
  const pendingInputs = useAppStore((s) => s.pendingInputs)
  const setPendingInput = useAppStore((s) => s.setPendingInput)
  const updateAgent = useAppStore((s) => s.updateAgent)
  const setDetectedAI = useAppStore((s) => s.setDetectedAI)
  const setGatewayStatus = useAppStore((s) => s.setGatewayStatus)
  const showPreview = useAppStore((s) => s.showPreview)
  const previewVisible = useAppStore((s) => s.previewVisible)
  const hidePreview = useAppStore((s) => s.hidePreview)
  const api = useEchora()

  const handleShowPreview = useCallback(() => {
    if (previewVisible) {
      hidePreview()
    } else {
      showPreview({ type: 'url', title: '工具面板' })
    }
  }, [previewVisible, showPreview, hidePreview])

  const agent = activeAgentKey ? agents.get(activeAgentKey) ?? null : null

  const [refreshing, setRefreshing] = useState(false)

  const handleRefresh = useCallback(async () => {
    if (refreshing) return
    setRefreshing(true)
    try {
      const result = await api.gateway.refresh() as { detected?: Record<string, unknown>; gateways?: Record<string, unknown> } | null
      if (result?.detected) setDetectedAI(result.detected as never)
      if (result?.gateways) setGatewayStatus(result.gateways as never)
    } catch (err) {
      console.error('Refresh failed:', err)
    } finally {
      setRefreshing(false)
    }
  }, [refreshing, api, setDetectedAI, setGatewayStatus])

  // Fetch model info and update agent
  const fetchModelInfo = useCallback(async (key: string) => {
    try {
      const parts = key.split(':')
      const aiType = parts[0] || ''
      const agentId = parts.slice(1).join(':') || 'main'

      console.log('[ChatArea] fetchModelInfo:', aiType, agentId)
      ;(window as any).__fetchModelInfoCalled = true
      ;(window as any).__fetchModelInfoKey = key
      
      const modelInfo = await api.agent.modelInfo(aiType, agentId) as {
        model?: string | null
        contextWindow?: number | null
      }
      console.log('[ChatArea] modelInfo result:', JSON.stringify(modelInfo))
      ;(window as any).__modelInfoResult = modelInfo

      if (modelInfo) {
        updateAgent(key, {
          model: modelInfo.model,
          contextWindow: modelInfo.contextWindow,
          usedTokens: 0,
          usagePct: 0
        })
      }
    } catch (err) {
      console.error('Failed to fetch model info:', err)
    }
  }, [api, updateAgent])

  // 切换 agent 时 + 重启完成后，调用 modelInfo 获取上下文长度
  useEffect(() => {
    console.log('[ChatArea] useEffect activeAgentKey changed:', activeAgentKey)
    if (!activeAgentKey) return
    fetchModelInfo(activeAgentKey)
  }, [activeAgentKey, fetchModelInfo])

  // 初始化时也调用一次，确保首次进入时获取contextWindow
  useEffect(() => {
    console.log('[ChatArea] useEffect init, activeAgentKey:', activeAgentKey)
    if (activeAgentKey) {
      fetchModelInfo(activeAgentKey)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const {
    conversations,
    currentConversationId,
    currentConversation,
    createConversation,
    switchConversation,
    saveConversation
  } = useConversations(activeAgentKey)

  const convId = currentConversationId

  const pendingKey = activeAgentKey && convId ? `${activeAgentKey}:${convId}` : ''

  const {
    state: streamState,
    isStreaming,
    sendMessage: streamSend,
    abort
  } = useStreaming(activeAgentKey, convId)

  const messages = useMemo(() => currentConversation?.messages ?? [], [currentConversation])

  // 计算当前会话的 token 信息
  // contextWindow 是模型级别的，从 agent 获取
  // usedTokens 是会话级别的，从当前会话的消息中获取
  const tokenInfo = useTokenInfo(messages, agent?.contextWindow ?? null)

  // Track which message's tool detail panel is expanded
  const [expandedToolsMsgId, setExpandedToolsMsgId] = useState<string | null>(null)
  const toggleToolDetail = useCallback((msgId: string) => {
    setExpandedToolsMsgId((prev) => prev === msgId ? null : msgId)
  }, [])

  // Gateway restart status — per-agent, keyed by agentKey
  const [restartStatusMap, setRestartStatusMap] = useState<Record<string, GatewayRestartStatus>>({})
  const restartTimerRefs = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const restartTimeoutRefs = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  const currentRestartStatus = activeAgentKey ? (restartStatusMap[activeAgentKey] || 'idle') : 'idle'

  const setRestartStatus = useCallback((key: string, status: GatewayRestartStatus) => {
    setRestartStatusMap((prev) => ({ ...prev, [key]: status }))
  }, [])

  const handleModelSwitch = useCallback((needsRestart: boolean, newModelId?: string) => {
    if (!needsRestart || !activeAgentKey) return
    setRestartStatus(activeAgentKey, 'restarting')
    // Immediately update agent's model and reset token info
    if (newModelId) {
      updateAgent(activeAgentKey, {
        model: newModelId,
        usedTokens: 0,
        usagePct: 0
      })
    }
    // Fetch full model info (including contextWindow) immediately
    fetchModelInfo(activeAgentKey)
    // Clear existing timers for this agent
    const doneTimer = restartTimerRefs.current.get(activeAgentKey)
    if (doneTimer) { clearTimeout(doneTimer); restartTimerRefs.current.delete(activeAgentKey) }
    const timeoutTimer = restartTimeoutRefs.current.get(activeAgentKey)
    if (timeoutTimer) { clearTimeout(timeoutTimer); restartTimeoutRefs.current.delete(activeAgentKey) }
    // 30s timeout — mark as error if gateway hasn't recovered
    const timer = setTimeout(() => {
      setRestartStatusMap((prev) => {
        if (prev[activeAgentKey] === 'restarting') {
          return { ...prev, [activeAgentKey]: 'error' }
        }
        return prev
      })
      restartTimeoutRefs.current.delete(activeAgentKey)
    }, 30000)
    restartTimeoutRefs.current.set(activeAgentKey, timer)
  }, [activeAgentKey, setRestartStatus])

  // Listen for gateway status changes to detect restart completion
  useEffect(() => {
    if (!activeAgentKey) return
    const status = restartStatusMap[activeAgentKey]
    if (status !== 'restarting') return
    const aiType = activeAgentKey.split(':')[0]
    const gwStatus = gatewayStatus[aiType]
    if (!gwStatus) return
    if (gwStatus.status === 'running') {
      setRestartStatus(activeAgentKey, 'done')
      // Refresh model info after restart
      fetchModelInfo(activeAgentKey)
      // Clear timeout timer
      const timeoutTimer = restartTimeoutRefs.current.get(activeAgentKey)
      if (timeoutTimer) { clearTimeout(timeoutTimer); restartTimeoutRefs.current.delete(activeAgentKey) }
      // Auto-clear after 1.5s
      const timer = setTimeout(() => {
        setRestartStatusMap((prev) => {
          const next = { ...prev }
          delete next[activeAgentKey]
          return next
        })
        restartTimerRefs.current.delete(activeAgentKey)
      }, 1500)
      restartTimerRefs.current.set(activeAgentKey, timer)
    } else if (gwStatus.status === 'error' || gwStatus.status === 'offline') {
      setRestartStatus(activeAgentKey, 'error')
      const timeoutTimer = restartTimeoutRefs.current.get(activeAgentKey)
      if (timeoutTimer) { clearTimeout(timeoutTimer); restartTimeoutRefs.current.delete(activeAgentKey) }
      const timer = setTimeout(() => {
        setRestartStatusMap((prev) => {
          const next = { ...prev }
          delete next[activeAgentKey]
          return next
        })
        restartTimerRefs.current.delete(activeAgentKey)
      }, 3000)
      restartTimerRefs.current.set(activeAgentKey, timer)
    }
  }, [restartStatusMap, gatewayStatus, activeAgentKey, setRestartStatus])

  const handleSendMessage = useCallback(async (text: string, attachments?: Attachment[]) => {
    if (!activeAgentKey) return

    if (!convId) {
      const conv = await createConversation(text)
      if (!conv) return
    }

    streamSend(text, attachments)

    // Auto-rename conversation based on first message
    if (currentConversation && currentConversation.messages.length === 0) {
      const trimmed = text.trim().replace(/\n/g, ' ')
      const title = trimmed.length > 40 ? trimmed.slice(0, 40) + '...' : trimmed
      const store = useAppStore.getState()
      store.updateConversation(activeAgentKey, currentConversation.id, { title })
      saveConversation(currentConversation.id)
    }
  }, [activeAgentKey, convId, currentConversation, createConversation, streamSend, saveConversation])

  const handlePendingInputChange = useCallback((key: string, value: string) => {
    setPendingInput(key, value)
  }, [setPendingInput])

  const handleNewConv = useCallback(() => {
    createConversation()
  }, [createConversation])

  const handleStartGateway = useCallback(async () => {
    if (!activeAgentKey) return
    const parts = activeAgentKey.split(':')
    const aiType = parts[0]
    if (!aiType || aiType === 'direct-api') return
    // 提取 profileName：hermes:minmin → profileName='minmin'，hermes:hermes-agent → 不传
    const agentId = parts.slice(1).join(':')
    const profileName = (aiType === 'hermes' && agentId && agentId !== 'hermes-agent')
      ? agentId
      : undefined
    try {
      const exePath = detectedAI[aiType]?.path || undefined
      await api.gateway.start(aiType, exePath, undefined, profileName)
    } catch (err) {
      console.error('Failed to start gateway:', err)
    }
  }, [activeAgentKey, api, detectedAI])

  const convTitle = currentConversation?.title || '选择一个 Agent 开始对话'

  // No agent selected: show welcome screen
  if (!activeAgentKey) {
    return (
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        <ChatTopbar
          title="选择一个 Agent 开始对话"
          theme={theme}
          onToggleTheme={onToggleTheme}
          onShowPreview={handleShowPreview}
          showDropdown={false}
          onRefresh={handleRefresh}
          isRefreshing={refreshing}
        />
        <div className="flex-1 flex flex-col bg-[var(--bg-card)] rounded-2xl px-2 pt-4 pb-4 min-h-0 relative overflow-visible">
          <div className="flex-1 min-h-0 overflow-y-auto pb-2 scrollbar-gutter-stable">
            <div className="w-full relative flex flex-col">
              <EmptyState agent={null} mode="no-agent" />
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Agent selected but gateway not running: show gateway-stopped guide
  const currentAiType = activeAgentKey.split(':')[0]
  const isDirectApi = activeAgentKey.startsWith('direct-api:') || currentAiType === 'echora'
  // Hermes profile agent：用 activeAgentKey 作为状态 key（如 'hermes:minmin'）
  const gwStatusKey = (currentAiType === 'hermes' && !activeAgentKey.endsWith(':hermes-agent'))
    ? activeAgentKey
    : currentAiType
  const gwStatus = gatewayStatus[gwStatusKey]?.status
  const isGatewayRunning = gwStatus === 'running'

  if (!isDirectApi && !isGatewayRunning) {
    const disabledTokenInfo = { usedTokens: 0, contextWindow: null, usagePct: 0, isVisible: false }
    return (
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        <ChatTopbar
          title={agent?.name || 'Agent'}
          theme={theme}
          onToggleTheme={onToggleTheme}
          onShowPreview={handleShowPreview}
          showDropdown={false}
          onRefresh={handleRefresh}
          isRefreshing={refreshing}
        />
        <div className="flex-1 flex flex-col bg-[var(--bg-card)] rounded-2xl px-2 pt-4 pb-4 min-h-0 relative overflow-visible">
          <div className="flex-1 min-h-0 overflow-y-auto pb-2 scrollbar-gutter-stable">
            <div className="w-full relative flex flex-col">
              <EmptyState
                agent={agent}
                mode="gateway-stopped"
                onStartGateway={handleStartGateway}
                gatewayStarting={gwStatus === 'starting'}
              />
            </div>
          </div>
          <ChatInputArea
            agent={agent}
            isStreaming={false}
            tokenInfo={disabledTokenInfo}
            pendingKey=""
            pendingInputs={pendingInputs}
            onSend={() => {}}
            onStop={() => {}}
            onPendingInputChange={() => {}}
            disabled
          />
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0" data-context-window={agent?.contextWindow ?? 'null'}>
      <ChatTopbar
        title={convTitle}
        theme={theme}
        onToggleTheme={onToggleTheme}
        onShowPreview={handleShowPreview}
        conversations={conversations}
        currentConversationId={currentConversationId}
        onSelectConversation={switchConversation}
        onCreateConversation={handleNewConv}
        hasActiveConversation={!!currentConversation}
        onRefresh={handleRefresh}
        isRefreshing={refreshing}
      />

      <div className="flex-1 flex flex-col bg-[var(--bg-card)] rounded-2xl px-2 pt-4 pb-4 min-h-0 relative overflow-visible">
        <ChatMessageList
          messages={messages}
          isStreaming={isStreaming}
          streamState={streamState}
          agent={agent ?? null}
          activeAgentKey={activeAgentKey}
          onToggleToolDetail={toggleToolDetail}
        />

        <ChatInputArea
          agent={agent ?? null}
          isStreaming={isStreaming}
          tokenInfo={tokenInfo}
          pendingKey={pendingKey}
          pendingInputs={pendingInputs}
          onSend={handleSendMessage}
          onStop={abort}
          onPendingInputChange={handlePendingInputChange}
          disabled={currentRestartStatus === 'restarting'}
          gatewayRestartStatus={currentRestartStatus}
          onModelSwitch={handleModelSwitch}
        />
      </div>

      <ToolDetailModal
        open={expandedToolsMsgId !== null}
        onClose={() => setExpandedToolsMsgId(null)}
        messages={messages}
        expandedMsgId={expandedToolsMsgId}
      />
    </div>
  )
}

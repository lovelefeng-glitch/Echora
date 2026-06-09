import { useState, useRef, useCallback, useEffect } from 'react'
import { useEchora } from './use-echora'
import { useAppStore, type Message, type ActiveStreamState } from '../stores/app-store'
import type {
  MessageChunkData,
  MessageDoneData,
  MessageToolCallData,
  MessageUsageData,
  ThinkingInfo,
  ToolStepInfo,
  Attachment
} from '../../shared/ipc-types'

export type StreamPhase = 'idle' | 'thinking' | 'streaming' | 'tool' | 'done' | 'error'

export interface StreamingState {
  phase: StreamPhase
  statusText: string
  content: string
  msgId: string | null
  error: string | null
  usage: MessageUsageData | null
  toolCalls: Message['toolCalls']
  startTime: number
  duration: number
}

const INITIAL_STATE: StreamingState = {
  phase: 'idle',
  statusText: '',
  content: '',
  msgId: null,
  error: null,
  usage: null,
  toolCalls: undefined,
  startTime: 0,
  duration: 0
}

export interface UseStreamingReturn {
  state: StreamingState
  isStreaming: boolean
  sendMessage: (text: string, attachments?: Attachment[]) => void
  abort: () => void
  reset: () => void
}

function storeStreamKey(agentKey: string, convId: string): string {
  return `${agentKey}:${convId}`
}

function storeStateToStreamingState(stored: ActiveStreamState): StreamingState {
  return {
    phase: stored.phase,
    statusText: stored.statusText,
    content: stored.content,
    msgId: stored.msgId,
    error: stored.error,
    usage: stored.usage as MessageUsageData | null,
    toolCalls: stored.toolCalls as Message['toolCalls'],
    startTime: stored.startTime,
    duration: stored.duration
  }
}

// Vivid Chinese action descriptions with emoji (ported from 1.0)
const ACTION_MAP: Record<string, { run: string; done: string; fail: string; emoji: string }> = {
  read:         { run: '正在阅读', done: '已阅读', fail: '阅读失败', emoji: '📄' },
  write:        { run: '正在写入', done: '已写入', fail: '写入失败', emoji: '✍️' },
  edit:         { run: '正在编辑', done: '已编辑', fail: '编辑失败', emoji: '✏️' },
  exec:         { run: '正在执行命令', done: '已执行命令', fail: '执行失败', emoji: '💻' },
  terminal:     { run: '正在执行命令', done: '已执行命令', fail: '执行失败', emoji: '💻' },
  bash:         { run: '正在执行命令', done: '已执行命令', fail: '执行失败', emoji: '💻' },
  shell:        { run: '正在执行命令', done: '已执行命令', fail: '执行失败', emoji: '💻' },
  file_read:    { run: '正在阅读文件', done: '已阅读文件', fail: '阅读失败', emoji: '📄' },
  file_write:   { run: '正在写入文件', done: '已写入文件', fail: '写入失败', emoji: '✍️' },
  code_edit:    { run: '正在编辑代码', done: '已编辑代码', fail: '编辑失败', emoji: '✏️' },
  read_file:    { run: '正在阅读文件', done: '已阅读文件', fail: '阅读失败', emoji: '📄' },
  write_file:   { run: '正在写入文件', done: '已写入文件', fail: '写入失败', emoji: '✍️' },
  grep:         { run: '正在搜索代码', done: '已搜索代码', fail: '搜索失败', emoji: '🔎' },
  web_search:   { run: '正在搜索', done: '已搜索', fail: '搜索失败', emoji: '🔍' },
  web_fetch:    { run: '正在抓取网页', done: '已抓取网页', fail: '抓取失败', emoji: '🌐' },
  fetch:        { run: '正在获取', done: '已获取', fail: '获取失败', emoji: '📡' },
  list_files:   { run: '正在列出目录', done: '已列出目录', fail: '列出失败', emoji: '📂' },
  search_file:  { run: '正在搜索文件', done: '已搜索文件', fail: '搜索失败', emoji: '🔎' },
  browser:      { run: '正在操作浏览器', done: '已操作浏览器', fail: '操作失败', emoji: '🌍' },
  message:      { run: '正在发送消息', done: '已发送消息', fail: '发送失败', emoji: '💬' },
  cron:         { run: '正在管理定时任务', done: '已管理定时任务', fail: '管理失败', emoji: '⏰' },
  memory_search:{ run: '正在搜索记忆', done: '已搜索记忆', fail: '搜索失败', emoji: '🧠' },
  wiki_search:  { run: '正在搜索 Wiki', done: '已搜索 Wiki', fail: '搜索失败', emoji: '📚' },
  workboard:    { run: '正在操作工作板', done: '已操作工作板', fail: '操作失败', emoji: '📋' },
}

// ============================================================
// Module-level stream registry + global IPC listener
// Ensures background agents' stream events are routed correctly
// regardless of which agent is currently active in the UI.
// ============================================================
interface StreamRegistryEntry {
  agentKey: string
  convId: string
}

const streamRegistry = new Map<string, StreamRegistryEntry>()
const safetyTimers = new Map<string, ReturnType<typeof setTimeout>>()

let globalListenerInitialized = false

function ensureGlobalStreamListener(): void {
  if (globalListenerInitialized) return
  globalListenerInitialized = true

  const getHelpers = () => {
    const s = useAppStore.getState()
    return {
      appendToMessage: s.appendToMessage,
      updateMessage: s.updateMessage,
      updateActiveStream: s.updateActiveStream,
      removeActiveStream: s.removeActiveStream,
      touchAgentActivity: s.touchAgentActivity,
      notifyAgent: s.notifyAgent,
    }
  }

  const api = window.echora

  // onChunk
  api.onStream.onChunk((data: MessageChunkData) => {
    const entry = streamRegistry.get(data.msgId)
    if (!entry) return
    const { appendToMessage, updateMessage, updateActiveStream } = getHelpers()
    const { agentKey: ak, convId: cid } = entry
    appendToMessage(ak, cid, data.msgId, data.delta)
    updateMessage(ak, cid, data.msgId, {
      streamPhase: 'streaming',
      streamStatus: '💬 正在组织语言...'
    })
    updateActiveStream(storeStreamKey(ak, cid), {
      phase: 'streaming',
      statusText: '💬 正在组织语言...',
      content: data.content
    })
  })

  // onDone
  api.onStream.onDone((data: MessageDoneData) => {
    const entry = streamRegistry.get(data.msgId)
    if (!entry) return
    const { agentKey: ak, convId: cid } = entry
    const { updateMessage, removeActiveStream, touchAgentActivity, notifyAgent } = getHelpers()
    const s = useAppStore.getState()
    const key = storeStreamKey(ak, cid)
    const currentActive = s.activeStreams[key]
    const content = data.error ? '' : (data.content || currentActive?.content || '')
    const updates: Partial<Message> = { isStreaming: false, content }
    // v1.1 - 2026-06-09: 修复 0 值不显示的 bug，使用 != null 替代 truthy 判断
    if (currentActive?.usage != null) updates.usage = currentActive.usage
    if (currentActive?.toolCalls?.length) updates.toolCalls = currentActive.toolCalls as Message['toolCalls']
    if (data.metrics?.latency) updates.latency = data.metrics.latency
    if (data.metrics?.firstChunkLatency) updates.firstChunkLatency = data.metrics.firstChunkLatency
    // 从 metrics 提取 token 信息
    if (!updates.usage && data.metrics) {
      const m = data.metrics as Record<string, unknown>
      if (m.usage) {
        // Hermes 格式: metrics.usage = { prompt_tokens / promptTokens, completion_tokens / completionTokens, total_tokens / totalTokens }
        const u = m.usage as Record<string, number>
        updates.usage = {
          input: u.prompt_tokens ?? u.promptTokens ?? 0,
          output: u.completion_tokens ?? u.completionTokens ?? 0,
          totalTokens: u.total_tokens ?? u.totalTokens ?? 0
        }
      } else if (m.input !== undefined || m.output !== undefined || m.totalTokens !== undefined) {
        // DirectApi 扁平格式: metrics = { input, output, totalTokens }
        updates.usage = { input: m.input as number, output: m.output as number, totalTokens: m.totalTokens as number }
      }
    }
    updateMessage(ak, cid, data.msgId, updates)
    touchAgentActivity(ak)
    if (s.activeAgentKey !== ak) notifyAgent(ak)
    removeActiveStream(key)
    // Clear safety timer if exists
    const timer = safetyTimers.get(data.msgId)
    if (timer) {
      clearTimeout(timer)
      safetyTimers.delete(data.msgId)
    }
    streamRegistry.delete(data.msgId)
  })

  // onThinking
  api.onStream.onThinking((data: { msgId: string } & ThinkingInfo) => {
    const entry = streamRegistry.get(data.msgId)
    if (!entry) return
    const { updateMessage, updateActiveStream } = getHelpers()
    const { agentKey: ak, convId: cid } = entry
    let text: string
    if (data.phase === 'thinking') {
      text = data.message ? `🧠 ${data.message}` : '🧠 正在思考如何回答...'
    } else {
      text = data.message ? `💬 ${data.message}` : '💬 正在组织语言...'
    }
    const phase = data.phase === 'thinking' ? 'thinking' as const : 'streaming' as const
    updateMessage(ak, cid, data.msgId, { streamPhase: phase, streamStatus: text })
    updateActiveStream(storeStreamKey(ak, cid), { phase, statusText: text })
  })

  // onToolCall
  api.onStream.onToolCall((data: MessageToolCallData) => {
    const msgId = data.msgId
    if (!msgId) return
    const entry = streamRegistry.get(msgId)
    if (!entry) return
    const { updateMessage, updateActiveStream } = getHelpers()
    const { agentKey: ak, convId: cid } = entry

    const toolName = data.name || data.tool?.name || 'tool'
    const toolEmoji = data.emoji || data.tool?.emoji || ''
    const toolLabel = data.label || data.tool?.label || data.meta || ''
    const rawStatus = data.status || data.tool?.status || ''
    const isCompleted = rawStatus === 'completed' || rawStatus === 'done'
    const isFailed = rawStatus === 'error' || rawStatus === 'failed'
    const toolStatus = isCompleted ? 'done' : isFailed ? 'failed' : 'running'

    const newToolEntry = { name: toolName, emoji: toolEmoji, status: toolStatus, detail: toolLabel }
    const actionMapEntry = ACTION_MAP[toolName]
    const statusEmoji = actionMapEntry?.emoji || '🔧'
    const verb = isCompleted ? '完成' : isFailed ? '失败' : '正在使用'
    const statusText = `${statusEmoji} ${verb} ${toolName}...`

    // Read current toolCalls from activeStream
    const key = storeStreamKey(ak, cid)
    const currentActive = useAppStore.getState().activeStreams[key]
    const currentToolCalls = (currentActive?.toolCalls ?? []) as Array<{ name: string; emoji?: string; status?: string; detail?: string }>
    const existingIdx = currentToolCalls.findIndex((tc) => tc.name === toolName)
    const newToolCalls = existingIdx >= 0
      ? currentToolCalls.map((tc, idx) => idx === existingIdx ? { ...tc, emoji: toolEmoji || tc.emoji, status: toolStatus, detail: toolLabel || tc.detail } : tc)
      : [...currentToolCalls, newToolEntry]

    updateMessage(ak, cid, msgId, { toolCalls: newToolCalls })
    updateActiveStream(key, { phase: 'tool', toolCalls: newToolCalls, statusText })
  })

  // onToolStep
  api.onStream.onToolStep((data: { msgId: string } & ToolStepInfo) => {
    const entry = streamRegistry.get(data.msgId)
    if (!entry) return
    const { updateMessage, updateActiveStream } = getHelpers()
    const { agentKey: ak, convId: cid } = entry

    const rawStatus = data.status || data.phase || ''
    const isEnd = rawStatus === 'end'
    const isFailed = rawStatus === 'error' || rawStatus === 'failed'
    const toolName = data.name || 'tool'
    const action = ACTION_MAP[toolName]
    const emoji = action ? action.emoji : (isFailed ? '❌' : isEnd ? '✅' : '⏳')
    const verb = action ? (isFailed ? action.fail : isEnd ? action.done : action.run) : (isFailed ? '调用失败' : isEnd ? '完成' : '调用中')
    const rawDetail = data.meta || data.detail || data.args || ''
    const detail = rawDetail.length > 80 ? rawDetail.substring(0, 80) + '…' : rawDetail
    const statusText = detail ? `${emoji} ${verb} ${detail}` : `${emoji} ${verb} ${toolName}`

    // Merge step detail into the matching tool call entry
    const key = storeStreamKey(ak, cid)
    const currentActive = useAppStore.getState().activeStreams[key]
    const currentToolCalls = (currentActive?.toolCalls ?? []) as Array<{ name: string; emoji?: string; status?: string; detail?: string; error?: string }>
    const mergedToolCalls = currentToolCalls.map((tc) => {
      if (tc.name === data.name) {
        const mergedDetail = data.meta || data.detail || data.args || tc.detail
        const newStatus = isFailed ? 'failed' : isEnd ? 'done' : 'running'
        return { ...tc, status: newStatus, detail: mergedDetail, ...(isFailed && rawDetail ? { error: rawDetail } : {}) }
      }
      return tc
    })

    updateMessage(ak, cid, data.msgId, { streamPhase: 'tool', streamStatus: statusText, toolCalls: mergedToolCalls })
    updateActiveStream(key, { phase: 'tool', statusText, toolCalls: mergedToolCalls })
  })

  // onUsage
  api.onStream.onUsage((data: MessageUsageData) => {
    const entry = streamRegistry.get(data.msgId)
    if (!entry) return
    const { updateMessage, updateActiveStream } = getHelpers()
    const { agentKey: ak, convId: cid } = entry
    updateMessage(ak, cid, data.msgId, { usage: data })
    updateActiveStream(storeStreamKey(ak, cid), { usage: data })
  })
}

export function useStreaming(agentKey: string | null, convId: string | null): UseStreamingReturn {
  const api = useEchora()

  // Restore from Store activeStreams if available
  const getInitialState = useCallback((): StreamingState => {
    if (!agentKey || !convId) return INITIAL_STATE
    const stored = useAppStore.getState().activeStreams[storeStreamKey(agentKey, convId)]
    if (stored && (stored.phase === 'thinking' || stored.phase === 'streaming' || stored.phase === 'tool')) {
      return storeStateToStreamingState(stored)
    }
    return INITIAL_STATE
  }, [agentKey, convId])

  const [state, setState] = useState<StreamingState>(getInitialState)
  const stateRef = useRef(state)
  stateRef.current = state

  const agentKeyRef = useRef(agentKey)
  const convIdRef = useRef(convId)
  agentKeyRef.current = agentKey
  convIdRef.current = convId

  const {
    addMessage,
    updateMessage,
    setActiveStream,
    removeActiveStream
  } = useAppStore.getState()

  const reset = useCallback(() => {
    const msgId = stateRef.current.msgId
    if (msgId) {
      const timer = safetyTimers.get(msgId)
      if (timer) { clearTimeout(timer); safetyTimers.delete(msgId) }
    }
    setState(INITIAL_STATE)
  }, [])

  const finalize = useCallback((msgId: string, content: string, error?: string) => {
    // Clear safety timer
    const timer = safetyTimers.get(msgId)
    if (timer) { clearTimeout(timer); safetyTimers.delete(msgId) }
    // Use registry to find the correct agent/conv for this msgId (supports background agents)
    const entry = streamRegistry.get(msgId)
    const ak = entry?.agentKey || agentKeyRef.current
    const cid = entry?.convId || convIdRef.current
    if (ak && cid) {
      const updates: Partial<Message> = {
        isStreaming: false,
        content: error ? content : (content || stateRef.current.content)
      }
      if (stateRef.current.usage) {
        updates.usage = stateRef.current.usage
      }
      if (stateRef.current.toolCalls && stateRef.current.toolCalls.length > 0) {
        updates.toolCalls = stateRef.current.toolCalls
      }
      updateMessage(ak, cid, msgId, updates)

      // Notify sidebar: if this is a background agent completing, trigger pin + shimmer
      const { activeAgentKey, touchAgentActivity, notifyAgent } = useAppStore.getState()
      touchAgentActivity(ak)
      if (activeAgentKey !== ak) {
        notifyAgent(ak)
      }

      // Remove from active streams on completion/error
      removeActiveStream(storeStreamKey(ak, cid))
    }
    streamRegistry.delete(msgId)

    setState((prev) => ({
      ...prev,
      phase: error ? 'error' : 'done',
      content: content || prev.content,
      error: error || null,
      duration: Date.now() - prev.startTime
    }))
  }, [updateMessage, removeActiveStream])

  const sendMessage = useCallback((text: string, attachments?: Attachment[]) => {
    if (!agentKeyRef.current || !convIdRef.current) return

    // Track user activity for sidebar sorting
    useAppStore.getState().touchAgentActivity(agentKeyRef.current)

    const parts = agentKeyRef.current.split(':')
    const aiType = parts[0] || ''
    const agentId = parts.slice(1).join(':') || 'main'
    const msgId = 'msg-stream-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6)
    const userId = 'echora-' + agentKeyRef.current

    const userMsg: Message = {
      id: 'msg-user-' + Date.now(),
      role: 'user',
      content: text,
      timestamp: Date.now(),
      attachments: attachments?.map(a => ({ name: a.name, mimeType: a.mimeType }))
    }
    addMessage(agentKeyRef.current, convIdRef.current, userMsg)

    const assistantMsg: Message = {
      id: msgId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      isStreaming: true
    }
    addMessage(agentKeyRef.current, convIdRef.current, assistantMsg)

    // Register msgId → {agentKey, convId} for global stream routing
    streamRegistry.set(msgId, { agentKey: agentKeyRef.current, convId: convIdRef.current })
    ensureGlobalStreamListener()

    const startTime = Date.now()
    setState({
      phase: 'thinking',
      statusText: '🧠 正在思考如何回答...',
      content: '',
      msgId,
      error: null,
      usage: null,
      toolCalls: undefined,
      startTime,
      duration: 0
    })

    // Create activeStreams entry for cross-agent visibility
    setActiveStream(storeStreamKey(agentKeyRef.current, convIdRef.current), {
      phase: 'thinking',
      statusText: '🧠 正在思考如何回答...',
      content: '',
      msgId,
      error: null,
      usage: null,
      toolCalls: [],
      startTime,
      duration: 0,
      agentKey: agentKeyRef.current,
      convId: convIdRef.current
    })

    // Echora Agent 使用 agent:runStream（走 AgentManager 路径）
    if (aiType === 'echora') {
      // 从 store 中获取第一个 provider ID 和模型（使用 directApiProviders，它从 agentProviders 配置加载）
      const store = useAppStore.getState()
      let providerId = 'default'
      let model = 'gpt-3.5-turbo'
      const directApiProviders = store.directApiProviders || []
      if (directApiProviders.length > 0 && directApiProviders[0].id) {
        providerId = directApiProviders[0].id as string
        const providerModels = directApiProviders[0].models
        if (providerModels && providerModels.length > 0 && providerModels[0].id) {
          model = providerModels[0].id
        }
      }
      
      api.agent.runStream({
        providerId,
        model,
        message: text,
        msgId
      })
    } else {
      api.message.sendStream({
        aiType,
        agentId,
        text,
        userId,
        msgId,
        conversationId: convIdRef.current,
        attachments: attachments?.length ? attachments : undefined
      })
    }

    const timeout = 120000
    safetyTimers.set(msgId, setTimeout(() => {
      finalize(msgId, '', '⏱️ 请求超时')
    }, timeout))
  }, [api, addMessage, finalize, setActiveStream])

  const abort = useCallback(() => {
    const msgId = stateRef.current.msgId
    if (msgId) {
      api.message.abortStream({ msgId })
      finalize(msgId, stateRef.current.content, '⛔ 已中止')
    }
  }, [api, finalize])

  useEffect(() => {
    return () => {
      const msgId = stateRef.current.msgId
      if (msgId) {
        const timer = safetyTimers.get(msgId)
        if (timer) { clearTimeout(timer); safetyTimers.delete(msgId) }
      }
    }
  }, [])

  // Sync local state when activeStreams changes (global listener updates Store)
  useEffect(() => {
    if (!agentKey || !convId) return
    const key = storeStreamKey(agentKey, convId)

    const unsubscribe = useAppStore.subscribe((state) => {
      const entry = state.activeStreams[key]
      const currentPhase = stateRef.current.phase

      // Only care about active phases
      if (currentPhase !== 'thinking' && currentPhase !== 'streaming' && currentPhase !== 'tool') return

      if (!entry) {
        // Stream completed while we were away (global listener removed it)
        const msgs = state.conversations[agentKey]?.[convId]?.messages
        const lastMsg = msgs?.[msgs.length - 1]
        const content = lastMsg?.content || stateRef.current.content

        setState((prev) => ({
          ...prev,
          phase: 'done',
          content,
          error: null,
          duration: Date.now() - prev.startTime
        }))
      } else if (entry.phase !== currentPhase || entry.statusText !== stateRef.current.statusText) {
        // Stream still active, sync phase/status from store
        setState((prev) => ({
          ...prev,
          phase: entry.phase as StreamPhase,
          statusText: entry.statusText,
          content: entry.content || prev.content,
        }))
      }
    })

    return unsubscribe
  }, [agentKey, convId])

  return {
    state,
    isStreaming: state.phase !== 'idle' && state.phase !== 'done' && state.phase !== 'error',
    sendMessage,
    abort,
    reset
  }
}
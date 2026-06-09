/**
 * Agent 视图
 * 独立的 Agent 聊天界面，与 Chat 视图隔离
 * 集成IPC通信，支持流式响应、工具调用、会话管理
 * 布局：左侧会话列表 | 右侧（状态行 + 消息区 + 输入框）
 */

import React, { useState, useRef, useEffect, useCallback } from 'react'
import { useAgentStore } from '../../stores/agentStore'
import type { AgentMessage, AgentToolCall, AgentSessionItem } from '../../stores/agentStore'
import type { DirectApiConfig } from '../../../shared/types'

/** Agent配置 */
interface AgentConfig {
  enabled: boolean
  toolsEnabled: boolean
  kbEnabled: boolean
  reasoningEnabled: boolean
  defaultProvider: string
  defaultModel: string
  maxSteps: number
  temperature: number
}

/** 默认配置 */
const DEFAULT_AGENT_CONFIG: AgentConfig = {
  enabled: false,
  toolsEnabled: false,
  kbEnabled: false,
  reasoningEnabled: false,
  defaultProvider: 'default',
  defaultModel: 'gpt-3.5-turbo',
  maxSteps: 8,
  temperature: 0.7
}

/** 格式化时间为相对时间或简短格式 */
function formatTime(ts: number): string {
  const now = Date.now()
  const diff = now - ts
  const minute = 60 * 1000
  const hour = 60 * minute
  const day = 24 * hour

  if (diff < minute) return '刚刚'
  if (diff < hour) return `${Math.floor(diff / minute)}分钟前`
  if (diff < day) return `${Math.floor(diff / hour)}小时前`
  if (diff < 7 * day) return `${Math.floor(diff / day)}天前`
  return new Date(ts).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}

/** 格式化 token 数量 */
function formatTokens(n: number): string {
  if (n === 0) return '0'
  if (n < 1000) return String(n)
  return `${(n / 1000).toFixed(1)}k`
}

/** Agent 视图组件 */
export const AgentView: React.FC = () => {
  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const currentMsgIdRef = useRef<string>('')

  // 从配置中读取Provider设置
  const [agentConfig, setAgentConfig] = useState<AgentConfig>(DEFAULT_AGENT_CONFIG)
  const [providers, setProviders] = useState<DirectApiConfig[]>([])

  const {
    messages,
    state,
    isStreaming,
    steps,
    sessions,
    currentSessionId,
    sidebarCollapsed,
    addMessage,
    updateMessage,
    setState,
    setStreaming,
    addStep,
    clearSteps,
    setError,
    clearMessages,
    setSessions,
    setCurrentSessionId,
    setSessionsLoading,
    toggleSidebar
  } = useAgentStore()

  // ─── 配置加载 ────────────────────────────────────────────

  const loadConfig = useCallback(async () => {
    try {
      const api = window.echora?.config
      if (!api) return

      const config = await api.get('agent') as AgentConfig | null
      if (config) {
        setAgentConfig({ ...DEFAULT_AGENT_CONFIG, ...config })
      }

      const agentProviders = await api.get('agentProviders') as DirectApiConfig[] | null
      if (agentProviders) {
        setProviders(agentProviders)
      }
    } catch (err) {
      console.error('加载Agent配置失败:', err)
    }
  }, [])

  useEffect(() => {
    loadConfig()
  }, [loadConfig])

  // 获取当前使用的Provider ID和模型
  const getProviderAndModel = useCallback(() => {
    let providerId = agentConfig.defaultProvider
    let model = agentConfig.defaultModel

    if (providerId === 'default' && providers.length > 0) {
      providerId = providers[0].id
      model = providers[0].defaultModel || providers[0].models[0] || model
    }

    const selectedProvider = providers.find(p => p.id === providerId)
    if (selectedProvider) {
      if (selectedProvider.defaultModel) {
        model = selectedProvider.defaultModel
      } else if (selectedProvider.models.length > 0) {
        model = selectedProvider.models[0]
      }
    }

    return { providerId, model }
  }, [agentConfig, providers])

  // ─── 会话管理 ────────────────────────────────────────────

  /** 加载会话列表 */
  const loadSessions = useCallback(async () => {
    setSessionsLoading(true)
    try {
      const api = window.echora?.sessions
      if (!api) return
      const list = await api.list() as AgentSessionItem[]
      setSessions(list || [])
    } catch (err) {
      console.error('加载会话列表失败:', err)
    } finally {
      setSessionsLoading(false)
    }
  }, [setSessions, setSessionsLoading])

  useEffect(() => {
    loadSessions()
  }, [loadSessions])

  /** 新建会话 */
  const handleNewSession = useCallback(async () => {
    if (isStreaming) return
    clearMessages()
    setCurrentSessionId(null)
    clearSteps()
    setState('idle')
    setError(null)
  }, [isStreaming, clearMessages, setCurrentSessionId, clearSteps, setState, setError])

  /** 切换会话 */
  const handleSwitchSession = useCallback(async (sessionId: string) => {
    if (isStreaming) return
    if (sessionId === currentSessionId) return

    try {
      const api = window.echora?.sessions
      if (!api) return
      const session = await api.load(sessionId)
      if (!session) return

      // 将持久化消息转换为 AgentMessage
      const loadedMessages: AgentMessage[] = session.messages.map((m, idx) => ({
        id: `loaded_${sessionId}_${idx}`,
        role: m.role as AgentMessage['role'],
        content: m.content,
        timestamp: m.timestamp
      }))

      clearMessages()
      for (const msg of loadedMessages) {
        addMessage(msg)
      }
      setCurrentSessionId(sessionId)
      clearSteps()
      setState('idle')
      setError(null)
    } catch (err) {
      console.error('加载会话失败:', err)
    }
  }, [isStreaming, currentSessionId, clearMessages, addMessage, setCurrentSessionId, clearSteps, setState, setError])

  /** 删除会话 */
  const handleDeleteSession = useCallback(async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation()
    try {
      const api = window.echora?.sessions
      if (!api) return
      await api.delete(sessionId)
      // 从列表中移除
      const updated = sessions.filter(s => s.id !== sessionId)
      setSessions(updated)
      // 如果删除的是当前会话，切换到最新会话或新建
      if (sessionId === currentSessionId) {
        if (updated.length > 0) {
          handleSwitchSession(updated[0].id)
        } else {
          handleNewSession()
        }
      }
    } catch (err) {
      console.error('删除会话失败:', err)
    }
  }, [sessions, currentSessionId, setSessions, handleSwitchSession, handleNewSession])

  // ─── 滚动 & IPC ─────────────────────────────────────────

  // 滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, steps])

  // 注册IPC事件监听
  useEffect(() => {
    const api = window.echora?.agent
    if (!api) return

    const unsubs: Array<() => void> = []

    // 监听流式消息块
    unsubs.push(api.onMessageChunk((data) => {
      console.log('[AgentView] 收到消息块:', data.msgId, data.delta?.substring(0, 50))
      if (data.msgId !== currentMsgIdRef.current) return
      const msgs = useAgentStore.getState().messages
      const lastMsg = msgs[msgs.length - 1]
      if (lastMsg && lastMsg.role === 'assistant') {
        updateMessage(lastMsg.id, {
          content: lastMsg.content + data.delta
        })
      }
    }))

    // 监听消息完成
    unsubs.push(api.onMessageDone((data) => {
      console.log('[AgentView] 消息完成:', data.msgId)
      if (data.msgId !== currentMsgIdRef.current) return
      setStreaming(false)
      setState('completed')
      // 消息完成后刷新会话列表
      loadSessions()
    }))

    // 监听消息错误
    unsubs.push(api.onMessageError((data) => {
      console.log('[AgentView] 收到错误:', data.msgId, data.error)
      if (data.msgId !== currentMsgIdRef.current) return
      setStreaming(false)
      setState('error')
      setError(data.error)
      const msgs = useAgentStore.getState().messages
      const lastMsg = msgs[msgs.length - 1]
      if (lastMsg && lastMsg.role === 'assistant') {
        updateMessage(lastMsg.id, {
          content: `错误: ${data.error}`,
          isStreaming: false
        })
      }
    }))

    // 监听工具调用
    unsubs.push(api.onToolCall((data) => {
      if (data.msgId !== currentMsgIdRef.current) return
      const toolCall: AgentToolCall = {
        id: `tc_${Date.now()}`,
        name: data.name,
        arguments: {},
        status: 'running'
      }
      const msgs = useAgentStore.getState().messages
      const lastMsg = msgs[msgs.length - 1]
      if (lastMsg && lastMsg.role === 'assistant') {
        updateMessage(lastMsg.id, {
          toolCalls: [...(lastMsg.toolCalls || []), toolCall]
        })
      }
    }))

    // 监听步骤更新
    unsubs.push(api.onStepUpdate((data) => {
      if (data.msgId !== currentMsgIdRef.current) return
      addStep({
        stepNumber: data.stepNumber,
        type: data.type as any,
        content: data.content,
        timestamp: Date.now()
      })
    }))

    return () => {
      unsubs.forEach(unsub => unsub())
    }
  }, [loadSessions])

  // ─── 发送消息 ────────────────────────────────────────────

  const handleSend = useCallback(async () => {
    if (!input.trim() || isStreaming) return

    const { providerId, model } = getProviderAndModel()

    const userMessage: AgentMessage = {
      id: `msg_${Date.now()}`,
      role: 'user',
      content: input.trim(),
      timestamp: Date.now()
    }

    addMessage(userMessage)
    setInput('')
    setStreaming(true)
    setState('thinking')
    clearSteps()

    const assistantMsgId = `msg_${Date.now()}_assistant`
    const assistantMessage: AgentMessage = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      isStreaming: true
    }
    addMessage(assistantMessage)

    const msgId = `stream_${Date.now()}`
    currentMsgIdRef.current = msgId

    try {
      const api = window.echora?.agent
      if (!api) {
        throw new Error('Agent API 不可用')
      }

      api.runStream({
        providerId,
        model,
        message: input.trim(),
        msgId
      })
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : '发送失败'
      setError(errorMsg)
      setState('error')
      setStreaming(false)
      updateMessage(assistantMsgId, {
        content: `错误: ${errorMsg}`,
        isStreaming: false
      })
    }
  }, [input, isStreaming, getProviderAndModel, addMessage, setStreaming, setState, clearSteps, setError, updateMessage])

  const handleCancel = useCallback(async () => {
    const api = window.echora?.agent
    if (api) {
      await api.cancel()
    }
    setStreaming(false)
    setState('idle')
  }, [setStreaming, setState])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // ─── 渲染辅助 ────────────────────────────────────────────

  const renderToolCall = (toolCall: AgentToolCall) => {
    const statusIcons: Record<string, string> = {
      pending: '⏳',
      running: '🔄',
      completed: '✅',
      error: '❌'
    }

    return (
      <div key={toolCall.id} style={{
        border: '1px solid #e8e8e8',
        borderRadius: '6px',
        padding: '8px 12px',
        margin: '4px 0',
        backgroundColor: '#fafafa',
        fontSize: '13px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span>{statusIcons[toolCall.status] || '🔧'}</span>
          <span style={{ fontWeight: 'bold' }}>{toolCall.name}</span>
          {toolCall.duration && (
            <span style={{ color: '#999', fontSize: '12px' }}>{toolCall.duration}ms</span>
          )}
        </div>
        {toolCall.result && (
          <div style={{ marginTop: '4px', fontSize: '12px', color: '#666' }}>
            {toolCall.result.substring(0, 100)}...
          </div>
        )}
      </div>
    )
  }

  const renderSteps = () => {
    if (steps.length === 0) return null

    return (
      <div style={{
        backgroundColor: '#f9f9f9',
        borderRadius: '8px',
        padding: '12px',
        margin: '8px 0'
      }}>
        <div style={{ fontWeight: 'bold', marginBottom: '8px', fontSize: '13px' }}>
          执行步骤
        </div>
        {steps.map((step, index) => (
          <div key={index} style={{
            display: 'flex',
            gap: '8px',
            padding: '4px 0',
            fontSize: '12px',
            borderBottom: index < steps.length - 1 ? '1px solid #eee' : 'none'
          }}>
            <span style={{ color: '#999' }}>#{step.stepNumber}</span>
            <span style={{ color: '#1890ff' }}>[{step.type}]</span>
            <span>{step.content}</span>
          </div>
        ))}
      </div>
    )
  }

  const renderMessage = (message: AgentMessage) => {
    const isUser = message.role === 'user'

    return (
      <div key={message.id} style={{
        display: 'flex',
        gap: '12px',
        padding: '12px',
        backgroundColor: isUser ? '#e6f7ff' : '#fff',
        borderRadius: '8px',
        margin: '8px 0'
      }}>
        <div style={{
          width: '32px',
          height: '32px',
          borderRadius: '50%',
          backgroundColor: isUser ? '#1890ff' : '#52c41a',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '16px',
          flexShrink: 0
        }}>
          {isUser ? '👤' : '🤖'}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginBottom: '4px'
          }}>
            <span style={{ fontWeight: 'bold', fontSize: '13px' }}>
              {isUser ? '用户' : 'Agent'}
            </span>
            <span style={{ color: '#999', fontSize: '12px' }}>
              {new Date(message.timestamp).toLocaleTimeString()}
            </span>
          </div>
          <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {message.content || (message.isStreaming ? '思考中...' : '')}
          </div>
          {message.toolCalls && message.toolCalls.length > 0 && (
            <div style={{ marginTop: '8px' }}>
              {message.toolCalls.map(renderToolCall)}
            </div>
          )}
        </div>
      </div>
    )
  }

  // ─── 派生数据 ────────────────────────────────────────────

  const currentProvider = providers.find(p => p.id === agentConfig.defaultProvider)
  const displayModel = currentProvider?.defaultModel || currentProvider?.models[0] || agentConfig.defaultModel
  const currentSession = sessions.find(s => s.id === currentSessionId)
  const totalTokens = currentSession?.tokenUsage?.totalTokens || 0

  const stateLabel: Record<string, string> = {
    idle: '就绪',
    thinking: '思考中...',
    acting: '执行中...',
    completed: '完成',
    error: '错误'
  }
  const stateColor: Record<string, { bg: string; fg: string }> = {
    idle: { bg: '#f5f5f5', fg: '#666' },
    thinking: { bg: '#e6f7ff', fg: '#1890ff' },
    acting: { bg: '#fff7e6', fg: '#faad14' },
    completed: { bg: '#f6ffed', fg: '#52c41a' },
    error: { bg: '#fff2f0', fg: '#ff4d4f' }
  }
  const sc = stateColor[state] || stateColor.idle

  const displayTitle = currentSession?.title || '新会话'

  // ─── 样式常量 ────────────────────────────────────────────

  const SIDEBAR_WIDTH = 240
  const COLORS = {
    border: '#e8e8e8',
    bgSidebar: '#fafafa',
    bgHover: '#f0f0f0',
    bgActive: '#e6f7ff',
    textPrimary: '#333',
    textSecondary: '#999',
    textTertiary: '#bbb',
    accent: '#1890ff',
    danger: '#ff4d4f'
  }

  // ─── 主渲染 ──────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* ═══ 左侧：会话列表侧边栏 ═══ */}
      {!sidebarCollapsed && (
        <div style={{
          width: SIDEBAR_WIDTH,
          minWidth: SIDEBAR_WIDTH,
          display: 'flex',
          flexDirection: 'column',
          borderRight: `1px solid ${COLORS.border}`,
          backgroundColor: COLORS.bgSidebar
        }}>
          {/* 侧边栏头部 */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 16px',
            borderBottom: `1px solid ${COLORS.border}`
          }}>
            <span style={{ fontWeight: 600, fontSize: '14px', color: COLORS.textPrimary }}>
              会话列表
            </span>
            <button
              onClick={handleNewSession}
              disabled={isStreaming}
              title="新建会话"
              style={{
                width: '28px',
                height: '28px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: `1px solid ${COLORS.border}`,
                borderRadius: '6px',
                backgroundColor: '#fff',
                cursor: isStreaming ? 'not-allowed' : 'pointer',
                fontSize: '16px',
                color: isStreaming ? COLORS.textTertiary : COLORS.accent,
                lineHeight: 1,
                padding: 0
              }}
            >
              +
            </button>
          </div>

          {/* 会话列表 */}
          <div style={{ flex: 1, overflow: 'auto', padding: '4px 0' }}>
            {sessions.length === 0 ? (
              <div style={{
                padding: '32px 16px',
                textAlign: 'center',
                color: COLORS.textSecondary,
                fontSize: '13px'
              }}>
                暂无会话
              </div>
            ) : (
              sessions.map(session => {
                const isActive = session.id === currentSessionId
                return (
                  <div
                    key={session.id}
                    onClick={() => handleSwitchSession(session.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      padding: '10px 16px',
                      cursor: 'pointer',
                      backgroundColor: isActive ? COLORS.bgActive : 'transparent',
                      borderLeft: isActive ? `3px solid ${COLORS.accent}` : '3px solid transparent',
                      transition: 'background-color 0.15s'
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) e.currentTarget.style.backgroundColor = COLORS.bgHover
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) e.currentTarget.style.backgroundColor = 'transparent'
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: '13px',
                        color: COLORS.textPrimary,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        fontWeight: isActive ? 600 : 400
                      }}>
                        {session.title || '未命名会话'}
                      </div>
                      <div style={{
                        fontSize: '11px',
                        color: COLORS.textSecondary,
                        marginTop: '3px',
                        display: 'flex',
                        gap: '8px'
                      }}>
                        <span>{formatTime(session.updatedAt)}</span>
                        {session.tokenUsage?.totalTokens > 0 && (
                          <span>{formatTokens(session.tokenUsage.totalTokens)} tokens</span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={(e) => handleDeleteSession(e, session.id)}
                      title="删除会话"
                      style={{
                        width: '22px',
                        height: '22px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        border: 'none',
                        borderRadius: '4px',
                        backgroundColor: 'transparent',
                        cursor: 'pointer',
                        fontSize: '14px',
                        color: COLORS.textTertiary,
                        flexShrink: 0,
                        opacity: 0.6,
                        padding: 0
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.color = COLORS.danger
                        e.currentTarget.style.opacity = '1'
                        e.currentTarget.style.backgroundColor = '#fff2f0'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.color = COLORS.textTertiary
                        e.currentTarget.style.opacity = '0.6'
                        e.currentTarget.style.backgroundColor = 'transparent'
                      }}
                    >
                      ✕
                    </button>
                  </div>
                )
              })
            )}
          </div>

          {/* 侧边栏底部：折叠按钮 */}
          <div style={{
            padding: '8px 16px',
            borderTop: `1px solid ${COLORS.border}`,
            textAlign: 'center'
          }}>
            <button
              onClick={toggleSidebar}
              style={{
                border: 'none',
                backgroundColor: 'transparent',
                cursor: 'pointer',
                color: COLORS.textSecondary,
                fontSize: '12px',
                padding: '4px 8px'
              }}
            >
              ◀ 收起侧栏
            </button>
          </div>
        </div>
      )}

      {/* ═══ 右侧：主区域 ═══ */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* ── 状态行 ── */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          padding: '8px 16px',
          borderBottom: `1px solid ${COLORS.border}`,
          gap: '12px',
          minHeight: '40px',
          backgroundColor: '#fff'
        }}>
          {/* 侧栏展开/折叠按钮 */}
          {sidebarCollapsed && (
            <button
              onClick={toggleSidebar}
              title="展开侧栏"
              style={{
                border: 'none',
                backgroundColor: 'transparent',
                cursor: 'pointer',
                fontSize: '16px',
                color: COLORS.textSecondary,
                padding: '2px 6px',
                borderRadius: '4px',
                flexShrink: 0
              }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = COLORS.bgHover }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent' }}
            >
              ☰
            </button>
          )}

          {/* 当前会话标题 */}
          <span style={{
            fontWeight: 600,
            fontSize: '14px',
            color: COLORS.textPrimary,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis'
          }}>
            {displayTitle}
          </span>

          <span style={{ flex: 1 }} />

          {/* Token 使用量 */}
          {totalTokens > 0 && (
            <span style={{
              fontSize: '12px',
              color: COLORS.textSecondary,
              whiteSpace: 'nowrap'
            }}>
              {formatTokens(totalTokens)} tokens
            </span>
          )}

          {/* Provider / 模型 */}
          <span style={{
            fontSize: '12px',
            color: COLORS.textSecondary,
            whiteSpace: 'nowrap'
          }}>
            {currentProvider ? `${currentProvider.name} / ${displayModel}` : '未配置Provider'}
          </span>

          {/* 状态标签 */}
          <span style={{
            padding: '2px 8px',
            borderRadius: '4px',
            backgroundColor: sc.bg,
            color: sc.fg,
            fontSize: '12px',
            whiteSpace: 'nowrap'
          }}>
            {stateLabel[state] || '就绪'}
          </span>

          {/* 取消按钮 */}
          {isStreaming && (
            <button onClick={handleCancel} style={{
              padding: '4px 12px',
              backgroundColor: COLORS.danger,
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '12px',
              whiteSpace: 'nowrap'
            }}>
              取消
            </button>
          )}
        </div>

        {/* ── 消息列表 ── */}
        <div style={{
          flex: 1,
          overflow: 'auto',
          padding: '16px 24px'
        }}>
          {messages.length === 0 ? (
            <div style={{
              textAlign: 'center',
              padding: '48px',
              color: COLORS.textSecondary
            }}>
              <div style={{ fontSize: '48px', marginBottom: '16px' }}>🤖</div>
              <div style={{ fontSize: '16px', marginBottom: '8px' }}>
                你好！我是 Echora Agent
              </div>
              <div style={{ fontSize: '14px' }}>
                可以帮你完成复杂任务，支持多步推理、工具调用、知识库检索等功能
              </div>
              {providers.length === 0 && (
                <div style={{ marginTop: '16px', color: COLORS.danger }}>
                  请先在「系统设置 → Agent」中配置 Provider
                </div>
              )}
            </div>
          ) : (
            <>
              {messages.map(renderMessage)}
              {renderSteps()}
              {isStreaming && (
                <div style={{ textAlign: 'center', padding: '8px', color: COLORS.textSecondary }}>
                  <span style={{ animation: 'blink 1s infinite' }}>...</span>
                </div>
              )}
            </>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* ── 输入区域 ── */}
        <div style={{
          padding: '12px 24px 16px',
          borderTop: `1px solid ${COLORS.border}`,
          backgroundColor: '#fff'
        }}>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end' }}>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={providers.length === 0 ? '请先配置 Provider...' : '输入消息... (Enter 发送，Shift+Enter 换行)'}
              disabled={isStreaming || providers.length === 0}
              style={{
                flex: 1,
                padding: '10px 12px',
                borderRadius: '8px',
                border: `1px solid ${COLORS.border}`,
                resize: 'none',
                minHeight: '40px',
                maxHeight: '120px',
                fontSize: '14px',
                lineHeight: '1.5',
                outline: 'none',
                fontFamily: 'inherit'
              }}
              rows={1}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || isStreaming || providers.length === 0}
              style={{
                padding: '10px 20px',
                backgroundColor: !input.trim() || isStreaming || providers.length === 0 ? COLORS.textTertiary : COLORS.accent,
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: !input.trim() || isStreaming || providers.length === 0 ? 'not-allowed' : 'pointer',
                fontSize: '14px',
                whiteSpace: 'nowrap',
                flexShrink: 0
              }}
            >
              {isStreaming ? '发送中...' : '发送'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default AgentView

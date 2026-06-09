import { useState, useRef, useEffect, useCallback, type ChangeEvent, type KeyboardEvent } from 'react'
import { useAppStore } from '../stores/app-store'
import { useEchora } from '../hooks/use-echora'
import type { ModelListItem } from '../../shared/ipc-types'

interface ChatInputProps {
  disabled: boolean
  isStreaming: boolean
  onSend: (text: string) => void
  onAbort: () => void
  statusText?: string
}

export function ChatInput({ disabled, isStreaming, onSend, onAbort, statusText }: ChatInputProps) {
  const [text, setText] = useState('')
  const [models, setModels] = useState<ModelListItem[]>([])
  const [selectedModel, setSelectedModel] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const api = useEchora()

  const activeAgentKey = useAppStore((s) => s.activeAgentKey)
  const agents = useAppStore((s) => s.agents)
  const gatewayStatus = useAppStore((s) => s.gatewayStatus)
  const activeAgent = activeAgentKey ? agents.get(activeAgentKey) : null
  const agentStatus = activeAgent ? gatewayStatus[activeAgent.aiType]?.status : undefined

  const adjustHeight = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 160) + 'px'
  }, [])

  useEffect(() => {
    adjustHeight()
  }, [text, adjustHeight])

  useEffect(() => {
    if (!activeAgent || agentStatus !== 'running') {
      setModels([])
      setSelectedModel('')
      return
    }
    let cancelled = false
    const loadModels = async () => {
      try {
        const list = await api.agent.listModels(activeAgent.aiType) as ModelListItem[] | null
        if (cancelled || !list || list.length === 0) return
        setModels(list)
        if (!selectedModel) {
          const current = activeAgent.model || list[0].id
          setSelectedModel(current)
        }
      } catch {
        // ignore
      }
    }
    loadModels()
    return () => { cancelled = true }
  }, [activeAgent?.aiType, agentStatus])

  const handleModelChange = async (e: ChangeEvent<HTMLSelectElement>) => {
    const modelId = e.target.value
    setSelectedModel(modelId)
    if (activeAgent) {
      try {
        await api.agent.setModel(activeAgent.aiType, modelId)
      } catch {
        // ignore
      }
    }
  }

  const handleSend = () => {
    const trimmed = text.trim()
    if (!trimmed || disabled) return
    onSend(trimmed)
    setText('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const placeholder = activeAgent
    ? agentStatus === 'running'
      ? `与 ${activeAgent.name || activeAgent.id} 对话...`
      : `${activeAgent.name || activeAgent.id} 未运行...`
    : '选择一个 AI 和 Agent 开始对话'

  const contextTokens = activeAgent?.usedTokens
  const contextWindow = activeAgent?.contextWindow
  const usagePct = activeAgent?.usagePct

  return (
    <div className="px-2 pt-2 pb-0 mt-0 flex-shrink-0 block">
      <div className="flex gap-0 items-end relative">
        <textarea
          ref={textareaRef}
          className="w-full h-[42px] min-h-[42px] max-h-[160px] pt-2.5 pb-2.5 pl-5 pr-14 bg-transparent border-none text-[var(--text-primary)] text-sm font-[inherit] resize-none outline-none leading-6 block placeholder:text-[var(--text-hint)] focus:bg-white disabled:opacity-50"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          rows={1}
        />

        {isStreaming ? (
          <button
            className="absolute bottom-[5px] right-[10px] w-8 h-8 rounded-[var(--radius-full)] bg-[var(--error)] text-white border-none text-sm cursor-pointer flex items-center justify-center"
            onClick={onAbort}
            title="停止生成"
          >
            ■
          </button>
        ) : (
          <button
            className="absolute bottom-[5px] right-[10px] w-8 h-8 rounded-[var(--radius-full)] bg-[var(--accent)] text-white border-none text-sm cursor-pointer flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed"
            onClick={handleSend}
            disabled={disabled || !text.trim()}
            title="发送 (Enter)"
          >
            ▶
          </button>
        )}
      </div>

      <div className="text-[11px] text-[var(--text-hint)] mb-1 min-h-4 flex items-center gap-2">
        <span className="text-[var(--text-secondary)]">
          {isStreaming && statusText
            ? statusText
            : contextTokens
              ? `上下文 ${contextTokens >= 1000 ? (contextTokens / 1000).toFixed(1) + 'K' : contextTokens}${contextWindow ? '/' + (contextWindow >= 1000 ? (contextWindow / 1000).toFixed(0) + 'K' : contextWindow) : ''}${usagePct != null ? ' · ' + usagePct + '%' : ''}`
              : 'Shift+Enter 换行'}
        </span>

        {models.length > 1 && (
          <select
            className="text-xs bg-[var(--bg-tertiary)] border-none rounded-[var(--radius-sm)] outline-none cursor-pointer"
            value={selectedModel}
            onChange={handleModelChange}
            disabled={isStreaming}
          >
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        )}
      </div>
    </div>
  )
}

import { useState, useRef, useCallback, useEffect } from 'react'
import type { AgentInfo } from '../../stores/app-store'
import type { TokenInfo } from '../../hooks/use-token-info'
import { formatTokenCount } from '../../hooks/use-token-info'
import { useEchora } from '../../hooks/use-echora'
import type { Attachment, ModelListItem, SkillsListResult } from '../../../shared/ipc-types'

const inputAnimStyle = `
@keyframes streamPulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.45; }
}
`

export type GatewayRestartStatus = 'idle' | 'restarting' | 'done' | 'error'

interface ChatInputAreaProps {
  agent: AgentInfo | null
  isStreaming: boolean
  tokenInfo: TokenInfo
  pendingKey: string
  pendingInputs: Record<string, string>
  onSend: (text: string, attachments?: Attachment[]) => void
  onStop: () => void
  onPendingInputChange: (key: string, value: string) => void
  disabled?: boolean
  gatewayRestartStatus?: GatewayRestartStatus
  onModelSwitch?: (needsRestart: boolean, newModelId?: string) => void
}

export function ChatInputArea({
  agent,
  isStreaming,
  tokenInfo,
  pendingKey,
  pendingInputs,
  onSend,
  onStop,
  onPendingInputChange,
  disabled = false,
    gatewayRestartStatus = 'idle',
    onModelSwitch
  }: ChatInputAreaProps) {
  const api = useEchora()
  const [inputText, setInputText] = useState(() => {
    if (pendingKey && pendingInputs[pendingKey]) return pendingInputs[pendingKey]
    return ''
  })
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Attachment state ──
  const [attachments, setAttachments] = useState<Array<{
    name: string
    content: string
    mimeType: string
    previewUrl?: string
  }>>([])

  // ── Model popup state ──
  const [showModelPopup, setShowModelPopup] = useState(false)
  const [models, setModels] = useState<ModelListItem[]>([])
  const [popupPos, setPopupPos] = useState<{ left: number; top: number }>({ left: 0, top: 0 })
  const modelBtnRef = useRef<HTMLButtonElement>(null)
  const modelPopupRef = useRef<HTMLDivElement>(null)

  // ── Skills popup state ──
  const [showSkillsPopup, setShowSkillsPopup] = useState(false)
  const [skills, setSkills] = useState<SkillsListResult['skills']>([])
  const skillsBtnRef = useRef<HTMLButtonElement>(null)
  const skillsPopupRef = useRef<HTMLDivElement>(null)

  // Restore inputText when pendingKey changes
  useEffect(() => {
    if (pendingKey && pendingInputs[pendingKey] !== undefined) {
      setInputText(pendingInputs[pendingKey])
    } else {
      setInputText('')
    }
  }, [pendingKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // Save inputText to pendingInputs when it changes (debounced)
  useEffect(() => {
    if (!pendingKey) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      onPendingInputChange(pendingKey, inputText)
    }, 300)
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [inputText, pendingKey, onPendingInputChange])

  // ── Close popups on outside click ──
  useEffect(() => {
    if (!showModelPopup && !showSkillsPopup) return
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node
      if (showModelPopup) {
        const inBtn = modelBtnRef.current?.contains(target)
        const inPopup = modelPopupRef.current?.contains(target)
        if (!inBtn && !inPopup) setShowModelPopup(false)
      }
      if (showSkillsPopup) {
        const inBtn = skillsBtnRef.current?.contains(target)
        const inPopup = skillsPopupRef.current?.contains(target)
        if (!inBtn && !inPopup) setShowSkillsPopup(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showModelPopup, showSkillsPopup])

  // ── Attachment handler ──
  const handleAddAttachment = useCallback(async () => {
    if (isStreaming) return
    try {
      const result = await api.dialog.openFile({
        filters: [
          { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] },
          { name: 'Text', extensions: ['txt', 'md', 'json', 'csv', 'log'] },
          { name: 'All Files', extensions: ['*'] }
        ],
        properties: ['openFile']
      }) as { canceled: boolean; filePaths: string[] }

      if (result.canceled || !result.filePaths?.length) return

      const filePath = result.filePaths[0]
      const fileName = filePath.split(/[/\\]/).pop() || 'file'

      const normalizedPath = filePath.replace(/\\/g, '/')
      const response = await fetch(`file:///${normalizedPath}`)
      const blob = await response.blob()

      const MAX_FILE_SIZE = 10 * 1024 * 1024
      if (blob.size > MAX_FILE_SIZE) {
        console.warn('Attachment too large:', blob.size)
        return
      }

      const reader = new FileReader()
      reader.onload = () => {
        const dataUrl = reader.result as string
        const base64 = dataUrl.split(',')[1] || ''
        const mimeType = blob.type || 'application/octet-stream'
        const isImage = mimeType.startsWith('image/')
        setAttachments(prev => [...prev, {
          name: fileName,
          content: base64,
          mimeType,
          previewUrl: isImage ? dataUrl : undefined
        }])
      }
      reader.readAsDataURL(blob)
    } catch (err) {
      console.error('Failed to add attachment:', err)
    }
  }, [api, isStreaming])

  const handleRemoveAttachment = useCallback((index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index))
  }, [])

  // ── Position popup above the clicked button ──
  const positionPopup = useCallback((btnEl: HTMLElement | null) => {
    if (!btnEl) return { left: 0, top: 0 }
    const rect = btnEl.getBoundingClientRect()
    return { left: rect.left, top: rect.top - 4 }
  }, [])

  // ── Model popup handler ──
  const handleModelClick = useCallback(async () => {
    if (!agent) return
    if (showModelPopup) { setShowModelPopup(false); return }
    setShowSkillsPopup(false)
    setPopupPos(positionPopup(modelBtnRef.current))
    setShowModelPopup(true)
    try {
      const list = await api.agent.listModels(agent.aiType, agent.id) as ModelListItem[] | null
      if (list && list.length > 0) setModels(list)
    } catch (err) {
      console.error('Failed to load models:', err)
    }
  }, [agent, showModelPopup, api, positionPopup])

  const handleSelectModel = useCallback(async (modelId: string) => {
    if (!agent) return
    try {
      const result = await api.agent.setModel(agent.aiType, modelId, agent.id) as { needsRestart?: boolean; success?: boolean }
      setShowModelPopup(false)
      if (result?.needsRestart && onModelSwitch) {
        onModelSwitch(true, modelId)
      }
    } catch (err) {
      console.error('Failed to set model:', err)
    }
  }, [agent, api, onModelSwitch])

  const handleQuickSwitch = useCallback((modelId: string) => {
    setShowModelPopup(false)
    onSend(`/model ${modelId}`)
  }, [onSend])

  // ── Skills popup handler ──
  const handleSkillsClick = useCallback(async () => {
    if (!agent) return
    if (showSkillsPopup) { setShowSkillsPopup(false); return }
    setShowModelPopup(false)
    setPopupPos(positionPopup(skillsBtnRef.current))
    setShowSkillsPopup(true)
    try {
      const result = await api.skills.list(agent.aiType) as SkillsListResult | null
      setSkills(result?.success ? (result.skills || []) : [])
    } catch (err) {
      console.error('Failed to load skills:', err)
      setSkills([])
    }
  }, [agent, showSkillsPopup, api, positionPopup])

  // ── Send handler ──
  const handleSend = useCallback(() => {
    const text = inputText.trim()
    if (!text && attachments.length === 0) return
    onSend(text, attachments.length > 0 ? attachments : undefined)
    setInputText('')
    setAttachments([])
  }, [inputText, attachments, onSend])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }, [handleSend])

  const handleInput = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputText(e.target.value)
    const el = textareaRef.current
    if (el) {
      el.style.height = 'auto'
      el.style.height = Math.min(el.scrollHeight, 120) + 'px'
    }
  }, [])

  const canSend = inputText.trim() || attachments.length > 0

  const activePopup = showModelPopup ? 'model' : showSkillsPopup ? 'skills' : null

  return (
    <div className="px-2 pt-2 pb-0 mt-0 flex-shrink-0 block">
      <style>{inputAnimStyle}</style>
      {/* ── Fixed-position popups (rendered outside overflow containers) ── */}
      {activePopup === 'model' && (
        <div
          ref={modelPopupRef}
          style={{
            position: 'fixed',
            left: popupPos.left,
            top: popupPos.top,
            transform: 'translateY(-100%)',
            zIndex: 10000
          }}
        >
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-[var(--radius-lg)] shadow-[0_4px_16px_rgba(0,0,0,0.15)] py-2 min-w-[220px] max-h-[300px] overflow-y-auto dark:bg-[var(--bg-secondary)] dark:border-[var(--border)]">
            <div className="px-3.5 py-2 text-xs font-semibold text-[var(--text-secondary)] border-b border-[var(--border)] mb-1">
              当前模型：{agent?.model || '未知'}
            </div>
            {models.length > 0 ? models.map(m => (
              <div
                key={`${m.provider || 'unknown'}/${m.id}`}
                className={`flex items-center gap-2 px-3.5 py-1.5 text-[13px] text-[var(--text-primary)] cursor-pointer transition-[background] duration-[0.12s] ${agent?.model === m.id ? 'bg-[var(--accent-light)] text-[var(--accent)] font-medium' : ''}`}
              >
                {agent?.model === m.id && <span className="text-[var(--accent)] text-sm flex-shrink-0">✓</span>}
                <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap">{m.name || m.id}</span>
                {m.provider && <span className="text-[11px] text-[var(--text-hint)] flex-shrink-0">{m.provider}</span>}
                {agent?.model !== m.id && (
                  <div className="flex gap-1 flex-shrink-0 ml-1">
                    {agent?.aiType === 'openclaw' && (
                      <button
                        className="w-[22px] h-[22px] border border-[var(--border)] rounded-[var(--radius-sm)] bg-[var(--bg-tertiary)] text-[var(--text-secondary)] text-[11px] cursor-pointer flex items-center justify-center p-0 transition-all duration-150 hover:bg-[var(--accent-light)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
                        onClick={(e) => { e.stopPropagation(); handleQuickSwitch(m.id) }}
                        title="当前会话热切换"
                      >
                        ⚡
                      </button>
                    )}
                    <button
                      className="w-[22px] h-[22px] border border-[var(--border)] rounded-[var(--radius-sm)] bg-[var(--bg-tertiary)] text-[var(--text-secondary)] text-[11px] cursor-pointer flex items-center justify-center p-0 transition-all duration-150 hover:bg-[var(--bg-hover)] hover:border-[var(--text-secondary)]"
                      onClick={(e) => { e.stopPropagation(); handleSelectModel(m.id) }}
                      title={agent?.aiType === 'hermes' ? '切换模型并重启网关' : '全局切换（需重启网关）'}
                    >
                      ↻
                    </button>
                  </div>
                )}
              </div>
            )) : (
              <div className="flex items-center gap-2 px-3.5 py-1.5 text-[13px] text-[var(--text-primary)] cursor-default text-[var(--text-hint)]">
                暂无可用模型
              </div>
            )}
            <div className="px-3.5 py-1.5 text-[11px] text-[var(--text-hint)] border-t border-[var(--border)] mt-1">
              {agent?.aiType === 'hermes'
                ? '↻ 切换模型后自动重启网关'
                : '⚡ 当前会话热切换 · ↻ 全局切换（需重启网关）'}
            </div>
          </div>
        </div>
      )}

      {activePopup === 'skills' && (
        <div
          ref={skillsPopupRef}
          style={{
            position: 'fixed',
            left: popupPos.left,
            top: popupPos.top,
            transform: 'translateY(-100%)',
            zIndex: 10000
          }}
        >
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-[var(--radius-lg)] shadow-[0_4px_16px_rgba(0,0,0,0.15)] py-2 min-w-[220px] max-h-[300px] overflow-y-auto dark:bg-[var(--bg-secondary)] dark:border-[var(--border)]">
            <div className="px-3.5 py-2 text-xs font-semibold text-[var(--text-secondary)] border-b border-[var(--border)] mb-1">已加载技能</div>
            {skills.length > 0 ? skills.map((skill, idx) => (
              <div key={`skill-${skill.name}-${skill.category}-${idx}`} className="flex items-center gap-2 px-3.5 py-1.5 text-[13px] text-[var(--text-primary)] cursor-default">
                <span
                  className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${skill.enabled !== false ? 'bg-[var(--success)]' : 'bg-[var(--text-hint)]'}`}
                />
                <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap">{skill.name}</span>
                <span className="text-[11px] text-[var(--text-hint)] flex-shrink-0">{skill.category}</span>
              </div>
            )) : (
              <div className="flex items-center gap-2 px-3.5 py-1.5 text-[13px] text-[var(--text-primary)] cursor-default text-[var(--text-hint)]">
                暂无已安装技能
              </div>
            )}
          </div>
        </div>
      )}

      {/* 重启状态 — 独立行，靠左 */}
      {gatewayRestartStatus !== 'idle' && (
        <div className="text-[11px] text-[var(--text-hint)] mb-1.5 min-h-4 flex items-center justify-center gap-2">
          <span className={
            gatewayRestartStatus === 'restarting' ? 'text-[var(--accent)] text-[11px] font-medium' :
            gatewayRestartStatus === 'done' ? 'text-[var(--success)] text-[11px] font-medium' :
            'text-[var(--error)] text-[11px] font-medium'
          } style={gatewayRestartStatus === 'restarting' ? { animation: 'streamPulse 1.2s ease-in-out infinite' } : undefined}>
            {gatewayRestartStatus === 'restarting' && '⟳ 正在重启网关…'}
            {gatewayRestartStatus === 'done' && '✓ 重启完成'}
            {gatewayRestartStatus === 'error' && '✗ 重启失败'}
          </span>
        </div>
      )}

      {/* Token 信息 — 居中 */}
      {tokenInfo.isVisible && (
        <div className="text-[11px] text-[var(--text-hint)] mb-1.5 min-h-4 flex items-center justify-center gap-2">
          <span className="text-[var(--text-secondary)]">上下文:</span>
          <span className="font-[var(--font-mono)] text-[var(--text-primary)]">
            {formatTokenCount(tokenInfo.usedTokens)} / {formatTokenCount(tokenInfo.contextWindow)}
          </span>
          <span className="text-[var(--accent)] font-medium">({tokenInfo.usagePct.toFixed(1)}%)</span>
        </div>
      )}

      {/* Attachment preview area */}
      {attachments.length > 0 && (
        <div className="flex gap-2 py-1.5 flex-wrap">
          {attachments.map((att, i) => (
            <div key={i} className="flex items-center gap-1.5 px-2 py-1 bg-[var(--bg-tertiary)] rounded-[var(--radius-md)] text-xs text-[var(--text-secondary)] max-w-[200px]">
              {att.previewUrl ? (
                <img src={att.previewUrl} alt={att.name} className="w-8 h-8 rounded object-cover" />
              ) : (
                <span>📄</span>
              )}
              <span className="overflow-hidden text-ellipsis whitespace-nowrap max-w-[120px]">{att.name}</span>
              <button
                className="border-none bg-none text-[var(--text-hint)] cursor-pointer text-sm px-0.5 py-0 leading-none hover:text-[var(--error)]"
                onClick={() => handleRemoveAttachment(i)}
                title="移除"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-0 items-end relative">
        <div className="relative bg-[var(--bg-input-field)] border border-[#D1D5DB] rounded-[var(--radius-lg)] overflow-hidden w-full dark:bg-[var(--bg-tertiary)] dark:border-[var(--border)] focus-within:border-[var(--accent)] focus-within:bg-white dark:focus-within:bg-[var(--bg-tertiary)]">
          <textarea
            ref={textareaRef}
            className="w-full h-[42px] min-h-[42px] max-h-[120px] pt-2.5 pb-2.5 pl-5 pr-14 bg-transparent border-none text-[var(--text-primary)] text-sm font-[inherit] resize-none outline-none leading-6 block placeholder:text-[var(--text-hint)] focus:bg-white dark:focus:bg-[var(--bg-tertiary)] disabled:opacity-50"
            value={inputText}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder={disabled ? '请先启动 AI 网关...' : '输入消息...'}
            rows={1}
            disabled={isStreaming || disabled}
          />
          <div className="relative flex items-center h-[42px] px-4 gap-1.5 border-t border-t-[var(--border-input)] mx-2">
            <div className="flex items-center gap-1 flex-1 min-w-0 overflow-x-auto">
              <button
                className="inline-flex items-center gap-1 px-2.5 py-1 border-none rounded-[var(--radius-md)] bg-[var(--bg-tertiary)] text-[var(--text-secondary)] text-xs cursor-pointer transition-all duration-150 whitespace-nowrap hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-[var(--bg-tertiary)] disabled:hover:text-[var(--text-secondary)]"
                title="添加附件"
                disabled={disabled || isStreaming}
                onClick={handleAddAttachment}
              >
                <span>📎</span>
                <span className="text-xs">附件</span>
              </button>
              <button
                ref={modelBtnRef}
                className="inline-flex items-center gap-1 px-2.5 py-1 border-none rounded-[var(--radius-md)] bg-[var(--bg-tertiary)] text-[var(--text-secondary)] text-xs cursor-pointer transition-all duration-150 whitespace-nowrap hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-[var(--bg-tertiary)] disabled:hover:text-[var(--text-secondary)]"
                title="当前模型"
                disabled={disabled || isStreaming}
                onClick={handleModelClick}
              >
                <span>🤖</span>
                <span className="text-xs">{agent?.model || '模型'}</span>
              </button>
              <button
                ref={skillsBtnRef}
                className="inline-flex items-center gap-1 px-2.5 py-1 border-none rounded-[var(--radius-md)] bg-[var(--bg-tertiary)] text-[var(--text-secondary)] text-xs cursor-pointer transition-all duration-150 whitespace-nowrap hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-[var(--bg-tertiary)] disabled:hover:text-[var(--text-secondary)]"
                title="技能"
                disabled={disabled || isStreaming}
                onClick={handleSkillsClick}
              >
                <span>⚡</span>
                <span className="text-xs">技能</span>
              </button>
            </div>
          </div>
          {isStreaming ? (
            <button className="absolute bottom-[5px] right-[10px] w-8 h-8 leading-[42px] rounded-full bg-[#EF4444] text-white border-none text-sm cursor-pointer flex items-center justify-center flex-shrink-0 transition-[background] duration-150 hover:bg-[#d32f2f]" onClick={onStop} title="停止生成">
              <img src="/icon/stop_101.png" alt="停止" className="w-5 h-5 object-contain pointer-events-none" />
            </button>
          ) : (
            <button
              className="absolute bottom-[5px] right-[10px] w-8 h-8 leading-[42px] rounded-full bg-[#3B82F6] text-white border-none text-sm cursor-pointer flex items-center justify-center flex-shrink-0 transition-[background] duration-150 hover:bg-[#2563EB] disabled:opacity-40 disabled:cursor-not-allowed"
              onClick={handleSend}
              disabled={!canSend || disabled}
            >
              <img src="/icon/into_101.png" alt="发送" className="w-5 h-5 object-contain pointer-events-none" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

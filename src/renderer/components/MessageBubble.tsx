import { useMemo } from 'react'
import { marked } from 'marked'
import type { Message } from '../stores/app-store'
import type { UsageInfo } from '../../shared/ipc-types'

marked.setOptions({
  breaks: true,
  gfm: true
})

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function formatUsage(usage: UsageInfo): string[] {
  const parts: string[] = []
  // v1.1 - 2026-06-09: 修复 0 值不显示的 bug
  // 原因: || 0 会把 0 当作 falsy 使用默认值，> 0 会跳过 0
  const input = usage.input ?? 0
  const output = usage.output ?? 0
  const cacheRead = usage.cacheRead ?? 0
  const total = usage.totalTokens ?? 0

  if (input > -1) parts.push(`↑${input >= 10000 ? (input / 1000).toFixed(1) + 'k' : input}`)
  if (output > -1) parts.push(`↓${output >= 10000 ? (output / 1000).toFixed(1) + 'k' : output}`)
  if (cacheRead > -1) parts.push(`R${cacheRead >= 1000 ? (cacheRead / 1000).toFixed(1) + 'k' : cacheRead}`)
  if (total > -1) parts.push(`Σ${total >= 1000 ? (total / 1000).toFixed(1) + 'k' : total}`)
  return parts
}

function buildUsageTitle(usage: UsageInfo): string {
  const parts: string[] = []
  // v1.1 - 2026-06-09: 修复 0 值不显示的 bug
  if (usage.input != null) parts.push(`input: ${usage.input}`)
  if (usage.output != null) parts.push(`output: ${usage.output}`)
  if (usage.cacheRead != null) parts.push(`cacheRead: ${usage.cacheRead}`)
  if (usage.totalTokens != null) parts.push(`context: ${usage.totalTokens}`)
  if (usage.cacheWrite != null) parts.push(`cacheWrite: ${usage.cacheWrite}`)
  if (usage.cost != null) parts.push(`cost: $${usage.cost}`)
  return parts.join(' / ')
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  const h = String(d.getHours()).padStart(2, '0')
  const m = String(d.getMinutes()).padStart(2, '0')
  return `${h}:${m}`
}

interface MessageBubbleProps {
  message: Message
  isStreaming?: boolean
  statusText?: string
}

export function MessageBubble({ message, isStreaming, statusText }: MessageBubbleProps) {
  const { role, content, timestamp, usage, toolCalls } = message

  const renderedContent = useMemo(() => {
    if (role === 'user' || role === 'system') {
      return escapeHtml(content)
    }
    if (!content) return ''
    let normalized = content
    normalized = normalized.replace(/([^\n])\n(#{1,6} )/g, '$1\n\n$2')
    normalized = normalized.replace(/(^|[^~])~([^~]|$)/g, '$1\\~$2')
    return marked.parse(normalized) as string
  }, [content, role])

  const avatar = role === 'user' ? '👤' : role === 'system' ? '⚙️' : '🤖'
  const senderLabel = role === 'user' ? '你' : role === 'system' ? '系统' : 'AI'

  return (
    <div
      className={`flex gap-2 mb-4 items-end w-full ${
        role === 'user'
          ? 'flex-row-reverse justify-start self-end'
          : role === 'system'
            ? 'self-start'
            : 'self-start'
      }`}
    >
      <div
        className={`w-8 h-8 rounded-[var(--radius-full)] bg-[var(--bg-tertiary)] flex items-center justify-center text-[13px] font-semibold flex-shrink-0 text-white ${role === 'user' ? 'bg-[var(--bg-tag)]' : ''}`}
      >
        {avatar}
      </div>

      <div className="max-w-[70%] px-3.5 py-2.5 rounded-[var(--radius-lg)] text-sm leading-6">
        {role !== 'system' && (
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-medium text-[var(--text-primary)]">{senderLabel}</span>
            <span className="text-[10px] text-[var(--text-hint)]">{formatTime(timestamp)}</span>
          </div>
        )}

        {isStreaming && !content ? (
          <div className={`overflow-wrap-break-word break-words ${role === 'assistant' ? 'bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-primary)]' : ''}`}>
            <div className="inline-flex items-center gap-1.5 text-[var(--text-hint)] text-sm break-all" style={{ animation: 'streamPulse 1.2s ease-in-out infinite' }}>
              <span>{statusText || '⏳ 思考中'}</span>
              <span className="inline-flex gap-[3px]" style={{ animation: 'pulse 1.2s infinite' }}>
                <span /><span /><span />
              </span>
            </div>
          </div>
        ) : (
          <div
            className={`overflow-wrap-break-word break-words ${
              role === 'user'
                ? 'bg-[var(--bg-tag)] text-[var(--bg-tag-text)]'
                : role === 'system'
                  ? ''
                  : 'bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-primary)]'
            }`}
          >
            {role === 'user' || role === 'system' ? (
              <span>{content}</span>
            ) : (
              <span dangerouslySetInnerHTML={{ __html: renderedContent }} />
            )}
            {isStreaming && content && (
              <span className="inline-block w-1.5 h-3.5 bg-[var(--accent)] rounded-[1px] ml-0.5 align-text-bottom" style={{ animation: 'blink 0.8s ease-in-out infinite' }} />
            )}
          </div>
        )}

        <div className="flex items-center justify-between flex-wrap gap-1 mt-2 pt-1.5 border-t border-t-[var(--border-msg)]">
          <div className="flex items-center gap-1.5">
            {toolCalls && toolCalls.length > 0 && (
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 border border-[var(--border)] rounded-[var(--radius-sm)] bg-[var(--bg-tertiary)] text-[var(--text-secondary)] text-[11px] select-none whitespace-nowrap"
                title={toolCalls.map((t) => t.name).join(', ')}
              >
                🔧 {toolCalls.length}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            {usage && formatUsage(usage).length > 0 && (
              <span
                className="inline-block text-[10px] text-[var(--text-secondary)] bg-[var(--bg-secondary)] px-1 py-px rounded-[3px] break-words max-w-[120px] overflow-hidden text-ellipsis whitespace-nowrap"
                title={buildUsageTitle(usage)}
              >
                {formatUsage(usage).join(' ')}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

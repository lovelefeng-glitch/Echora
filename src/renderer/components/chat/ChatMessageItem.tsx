import { useCallback } from 'react'
import type { Message, AgentInfo } from '../../stores/app-store'
import type { StreamingState } from '../../hooks/use-streaming'
import { getAvatarColor, renderMarkdown, formatTime, formatUsage, formatLatency } from '../../utils/chat-helpers'

const chatMsgStyle = `
@keyframes streamPulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.45; }
}
@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}
.msg-content pre {
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 12px 14px;
  margin: 8px 0;
  overflow-x: auto;
  font-family: var(--font-mono);
  font-size: 13px;
  line-height: 1.5;
}
[data-theme="dark"] .msg-content pre {
  background: #1e1e1e;
  border-color: #484848;
}
.msg-content code {
  font-family: var(--font-mono);
  font-size: 13px;
  background: var(--bg-input-field);
  padding: 2px 6px;
  border-radius: 4px;
}
[data-theme="dark"] .msg-content code {
  background: #2a2a2a;
}
.msg-content pre code {
  padding: 0;
  background: none;
}
.msg-content blockquote {
  border-left: 3px solid var(--accent);
  padding-left: 12px;
  margin: 8px 0;
  color: var(--text-secondary);
  font-style: italic;
}
.msg-content ul, .msg-content ol { padding-left: 20px; margin: 8px 0; }
.msg-content li { margin: 4px 0; }
.msg-content a { color: var(--accent); text-decoration: underline; }
.msg-content h1, .msg-content h2, .msg-content h3 { margin: 12px 0 8px; font-weight: 600; }
.msg-content h1 { font-size: 1.4em; }
.msg-content h2 { font-size: 1.2em; }
.msg-content h3 { font-size: 1.1em; }
.msg-content p { margin: 8px 0; }
.msg-content table { border-collapse: collapse; width: 100%; margin: 8px 0; }
.msg-content th, .msg-content td { border: 1px solid var(--border); padding: 6px 10px; text-align: left; }
.msg-content th { background: var(--bg-tertiary); }
[data-theme="dark"] .msg-content th { background: #3e3e3e; border-color: #484848; }
[data-theme="dark"] .msg-content td { border-color: #484848; }
`

interface ChatMessageItemProps {
  message: Message
  agent: AgentInfo | null
  activeAgentKey: string
  isStreaming: boolean
  streamState: StreamingState
  onToggleToolDetail: (msgId: string) => void
}

export function ChatMessageItem({
  message: msg,
  agent,
  activeAgentKey,
  isStreaming,
  streamState,
  onToggleToolDetail
}: ChatMessageItemProps) {
  const isUser = msg.role === 'user'
  const isAssistant = msg.role === 'assistant'

  // Get streaming state from message if it exists (for restored messages)
  const msgStreamPhase = msg.streamPhase || null
  const msgStreamStatus = msg.streamStatus || null

  // Determine if this message is actively streaming or was restored from a previous session
  const isActiveStreaming = isStreaming && streamState.msgId === msg.id
  const isRestoredStreaming = msg.isStreaming && msgStreamPhase && msgStreamPhase !== 'done'

  // Use active streaming state if available, otherwise use restored state from store
  const displayPhase = isActiveStreaming
    ? streamState.phase
    : (isRestoredStreaming ? msgStreamPhase : null)
  const displayStatus = isActiveStreaming
    ? streamState.statusText
    : (isRestoredStreaming ? msgStreamStatus : null)

  const streamBorderCls = displayPhase
    ? `border-l-[3px] ${displayPhase === 'thinking' ? 'border-l-[var(--accent)]' :
       displayPhase === 'error' ? 'border-l-[var(--error)]' :
       'border-l-[var(--success)]'}`
    : ''

  const handleToggleTool = useCallback(() => {
    onToggleToolDetail(msg.id)
  }, [msg.id, onToggleToolDetail])

  return (
    <>
      <style>{chatMsgStyle}</style>
      <div
        className={`flex gap-2 mb-4 items-end w-full ${isUser ? 'flex-row-reverse justify-start self-end' : 'self-start'}`}
      >
        <div className="w-8 h-8 rounded-[var(--radius-full)] bg-[var(--bg-tertiary)] flex items-center justify-center text-[13px] font-semibold flex-shrink-0 text-white" style={{
          background: isUser ? 'var(--bg-tag)' : (agent ? getAvatarColor(activeAgentKey) : 'var(--bg-tertiary)')
        }}>
          {isUser ? '👤' : (() => {
            const emoji = agent?.emoji || ''
            const avatarUrl = agent?.avatar || (emoji && (emoji.startsWith('http') || emoji.startsWith('/') || emoji.startsWith('data:')) ? emoji : null)
            return avatarUrl
              ? <div style={{ width: '100%', height: '100%', borderRadius: '50%', backgroundImage: `url('${avatarUrl}')`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
              : emoji || agent?.name?.charAt(0) || 'AI'
          })()}
        </div>
        <div className={`max-w-[70%] px-3.5 py-2.5 rounded-[var(--radius-lg)] text-sm leading-6 ${streamBorderCls} ${isUser ? 'bg-[var(--bg-tag)] text-[var(--bg-tag-text)]' : 'bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-primary)] dark:bg-[#353535] dark:border-[#484848]'}`}>
          <div
            className="msg-content overflow-wrap-break-word break-words"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content, msg.role) }}
          />
          {/* Status line: inside bubble, below content */}
          {displayStatus && (
            <div className="inline-flex items-center gap-1.5 text-[var(--text-hint)] text-sm break-all" style={{ animation: 'streamPulse 1.2s ease-in-out infinite' }}>
              {displayStatus}
              {isActiveStreaming && <span className="inline-block w-1.5 h-3.5 bg-[var(--accent)] rounded-[1px] ml-0.5 align-text-bottom" style={{ animation: 'blink 0.8s ease-in-out infinite' }} />}
            </div>
          )}
          {/* Footer: inside bubble, with divider */}
          {!displayPhase && (isAssistant || isUser) && (
            <div className="flex items-center justify-between flex-wrap gap-1 mt-2 pt-1.5 border-t border-t-[var(--border-msg)]">
              <div className="flex items-center gap-1.5">
                {msg.toolCalls && msg.toolCalls.length > 0 && (
                  <button
                    className="inline-flex items-center gap-1 px-2 py-0.5 border border-[var(--border)] rounded-[var(--radius-sm)] bg-[var(--bg-tertiary)] text-[var(--text-secondary)] text-[11px] cursor-pointer transition-all duration-150 select-none whitespace-nowrap hover:bg-[var(--accent-light)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
                    onClick={handleToggleTool}
                    title="查看工具调用详情"
                  >
                    🔧 {msg.toolCalls.length} 个工具
                  </button>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <span className={`text-[10px] ${isUser ? 'text-[rgba(43,76,111,0.7)] dark:text-white/70' : 'text-[var(--text-hint)]'}`}>{formatTime(msg.timestamp)}</span>
                {msg.usage && (
                  <span className="inline-block text-[10px] text-[var(--text-secondary)] bg-[var(--bg-secondary)] px-1 py-px rounded-[3px] break-words max-w-[120px] overflow-hidden text-ellipsis whitespace-nowrap">{formatUsage(msg.usage)}</span>
                )}
                {msg.latency && (
                  <span className="inline-block text-[10px] text-[var(--text-secondary)] bg-[var(--bg-secondary)] px-1 py-px rounded-[3px] break-words max-w-[120px] overflow-hidden text-ellipsis whitespace-nowrap">{formatLatency(msg.latency)}</span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

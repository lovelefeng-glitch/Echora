import { useState } from 'react'
import type { Conversation } from '../../stores/app-store'
import { ConversationDropdown } from './ConversationDropdown'

const shimmerStyle = `
@keyframes shimmer {
  0% { left: -100%; }
  100% { left: 200%; }
}
`

interface ChatTopbarProps {
  title: string
  theme: string
  onToggleTheme: () => void
  onShowPreview?: () => void
  conversations?: Conversation[]
  currentConversationId?: string | null
  onSelectConversation?: (id: string) => void
  onCreateConversation?: () => void
  showDropdown?: boolean
  hasActiveConversation?: boolean
  onRefresh?: () => void
  isRefreshing?: boolean
}

export function ChatTopbar({
  title,
  theme,
  onToggleTheme,
  onShowPreview,
  conversations,
  currentConversationId,
  onSelectConversation,
  onCreateConversation,
  showDropdown = true,
  hasActiveConversation = false,
  onRefresh,
  isRefreshing
}: ChatTopbarProps) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)

  const handleTitleClick = () => {
    if (showDropdown && conversations && currentConversationId !== undefined && onSelectConversation) {
      setIsDropdownOpen(!isDropdownOpen)
    }
  }

  const handleCloseDropdown = () => {
    setIsDropdownOpen(false)
  }

  const isDark = theme === 'dark'
  const topbarCls = `h-[var(--topbar-height)] px-3 flex items-center justify-between bg-[var(--bg-secondary)] rounded-[20px] flex-shrink-0 mb-2 [-webkit-app-region:drag] select-none [&_button]:[-webkit-app-region:no-drag] [&_select]:[-webkit-app-region:no-drag] [&_input]:[-webkit-app-region:no-drag] [&_a]:[-webkit-app-region:no-drag]`
  const topbarArrowCls = isDark ? 'text-sm text-white mr-1' : 'text-sm text-[var(--text-hint)] mr-1'
  const convTitleBase = 'inline-flex items-center py-[5px] px-3.5 rounded-[var(--radius-xl)] text-[13px] font-medium whitespace-nowrap cursor-pointer transition-all duration-150 select-none bg-[var(--bg-tag)] text-[var(--bg-tag-text)] [-webkit-app-region:no-drag]'
  const convTitleActiveCls = `${convTitleBase} relative overflow-hidden`
  const convTitleArrowCls = isDark ? 'text-[10px] ml-1 text-white/60' : 'text-[10px] ml-1 text-[var(--text-hint)]'
  const btnBase = 'w-7 h-7 rounded-full border-none bg-[var(--bg-tertiary)] text-[var(--text-secondary)] cursor-pointer transition-all duration-150 flex items-center justify-center flex-shrink-0'
  const btnHoverCls = 'hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
  const btnTextCls = isDark
    ? 'py-[3px] px-3 rounded-[var(--radius-xl)] border-2 border-dashed border-[#484848] bg-transparent text-white/80 text-[13px] font-medium cursor-pointer whitespace-nowrap transition-all duration-150'
    : 'py-[3px] px-3 rounded-[var(--radius-xl)] border-2 border-dashed border-[var(--border)] bg-transparent text-[var(--text-secondary)] text-[13px] font-medium cursor-pointer whitespace-nowrap transition-all duration-150'
  const btnTextHoverCls = isDark
    ? 'hover:border-white/80 hover:text-white'
    : 'hover:border-[var(--text-secondary)] hover:text-[var(--text-primary)]'

  return (
    <>
      <style>{shimmerStyle}</style>
      <div className={topbarCls}>
        <div className="flex items-center min-w-0 gap-1.5">
          <span className={topbarArrowCls}>&gt;&gt;</span>
          <div className="relative flex items-center [-webkit-app-region:no-drag] z-[100]">
            <div
              className={hasActiveConversation ? convTitleActiveCls : convTitleBase}
              onClick={handleTitleClick}
            >
              {hasActiveConversation && (
                <style>{`
                  .conv-title-active::after {
                    content: '';
                    position: absolute;
                    top: 0;
                    left: -100%;
                    width: 60%;
                    height: 100%;
                    background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.25) 50%, transparent 100%);
                    animation: shimmer 2s ease-in-out infinite;
                    pointer-events: none;
                  }
                `}</style>
              )}
              <span className={`overflow-hidden text-ellipsis ${hasActiveConversation ? 'conv-title-active' : ''}`}>{title}</span>
              {showDropdown && conversations && currentConversationId !== undefined && onSelectConversation && (
                <span className={convTitleArrowCls}>▾</span>
              )}
            </div>
            {showDropdown && conversations && currentConversationId !== undefined && onSelectConversation && (
              <ConversationDropdown
                conversations={conversations}
                currentConversationId={currentConversationId ?? null}
                onSelectConversation={onSelectConversation}
                isOpen={isDropdownOpen}
                onClose={handleCloseDropdown}
              />
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {showDropdown && onCreateConversation && (
            <button className={`${btnTextCls} ${btnTextHoverCls}`} onClick={onCreateConversation}>新建会话</button>
          )}
          {onRefresh && (
            <button className={`${btnBase} ${btnHoverCls}`} onClick={onRefresh} title="刷新状态" disabled={isRefreshing}>
              {isRefreshing ? '⏳' : '🔄'}
            </button>
          )}
          <button className={`${btnBase} ${btnHoverCls}`} onClick={onToggleTheme} title="切换白昼/夜间模式">
            {isDark ? '☀️' : '🌙'}
          </button>
          {onShowPreview && (
            <button className={`${btnBase} ${btnHoverCls}`} onClick={onShowPreview} title="打开工具面板">
              🛠️
            </button>
          )}
        </div>
      </div>
    </>
  )
}

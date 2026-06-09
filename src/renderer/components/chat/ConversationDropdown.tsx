import { useState, useRef, useEffect } from 'react'
import { formatTime } from '../../utils/chat-helpers'

interface Conversation {
  id: string
  title: string
  updatedAt: number
}

interface ConversationDropdownProps {
  conversations: Conversation[]
  currentConversationId: string | null
  onSelectConversation: (id: string) => void
  isOpen: boolean
  onClose: () => void
}

export function ConversationDropdown({
  conversations,
  currentConversationId,
  onSelectConversation,
  isOpen,
  onClose
}: ConversationDropdownProps) {
  const [searchText, setSearchText] = useState('')
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen, onClose])

  // Reset search when closing
  useEffect(() => {
    if (!isOpen) {
      setSearchText('')
    }
  }, [isOpen])

  // Filter conversations by search text
  const filteredConversations = searchText
    ? conversations.filter(conv =>
        conv.title.toLowerCase().includes(searchText.toLowerCase())
      )
    : conversations

  if (!isOpen) return null

  return (
    <div className="absolute top-full left-0 mt-1" ref={dropdownRef}>
      <div className="w-80 max-h-[380px] bg-white border border-[var(--border)] rounded-[var(--radius-lg)] shadow-[0_4px_16px_rgba(0,0,0,0.1)] z-[1000] overflow-hidden relative dark:bg-[var(--bg-secondary)]">
        <input
          type="text"
          className="w-full px-3.5 py-2.5 border-none border-b border-b-[var(--border)] text-[13px] outline-none font-[inherit] bg-[#F8F9FA] dark:bg-[var(--bg-tertiary)] placeholder:text-[var(--text-hint)]"
          placeholder="🔍 搜索会话..."
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          autoFocus
        />
        <div className="max-h-80 overflow-y-auto">
          {filteredConversations.map((conv) => (
            <div
              key={conv.id}
              className={`flex items-center gap-2.5 px-3.5 py-2.5 cursor-pointer transition-[background] duration-[0.12s] border-b border-b-[var(--border-light)] last:border-b-0 hover:bg-[var(--bg-hover)] ${conv.id === currentConversationId ? 'bg-[var(--accent-light)]' : ''}`}
              onClick={() => {
                onSelectConversation(conv.id)
                onClose()
              }}
            >
              <span className="flex-1 text-[13px] overflow-hidden text-ellipsis whitespace-nowrap">{conv.title}</span>
              <span className="text-[11px] text-[var(--text-hint)] flex-shrink-0">
                {formatTime(conv.updatedAt)}
              </span>
            </div>
          ))}
          {filteredConversations.length === 0 && (
            <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-hint)', fontSize: 12 }}>
              {searchText ? '未找到匹配的会话' : '暂无会话'}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

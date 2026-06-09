import { useRef, useEffect } from 'react'
import type { Message, AgentInfo } from '../../stores/app-store'
import type { StreamingState } from '../../hooks/use-streaming'
import { ChatMessageItem } from './ChatMessageItem'
import { EmptyState } from './EmptyState'

interface ChatMessageListProps {
  messages: Message[]
  isStreaming: boolean
  streamState: StreamingState
  agent: AgentInfo | null
  activeAgentKey: string
  onToggleToolDetail: (msgId: string) => void
}

export function ChatMessageList({
  messages,
  isStreaming,
  streamState,
  agent,
  activeAgentKey,
  onToggleToolDetail
}: ChatMessageListProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  // Scroll to bottom when messages change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages.length, streamState.content])

  const isEmpty = messages.length === 0 && !isStreaming

  return (
    <div className="flex-1 min-h-0 overflow-y-auto pl-6 pr-2 scrollbar-gutter-stable" ref={scrollRef}>
      <div className="w-full relative flex flex-col">
        {isEmpty ? (
          <EmptyState agent={agent} />
        ) : (
          messages.map((msg) => (
            <ChatMessageItem
              key={msg.id}
              message={msg}
              agent={agent}
              activeAgentKey={activeAgentKey}
              isStreaming={isStreaming}
              streamState={streamState}
              onToggleToolDetail={onToggleToolDetail}
            />
          ))
        )}
      </div>
    </div>
  )
}

import type { Message } from '../../stores/app-store'
import { Modal } from '../Modal'

// Vivid action descriptions per tool
const ACTION_VERBS: Record<string, { run: string; done: string; fail: string; emoji: string }> = {
  read:         { run: '正在阅读', done: '已阅读', fail: '阅读失败', emoji: '📄' },
  write:        { run: '正在写入', done: '已写入', fail: '写入失败', emoji: '✍️' },
  edit:         { run: '正在编辑', done: '已编辑', fail: '编辑失败', emoji: '✏️' },
  exec:         { run: '正在执行', done: '已执行', fail: '执行失败', emoji: '💻' },
  web_search:   { run: '正在搜索', done: '已搜索', fail: '搜索失败', emoji: '🔍' },
  web_fetch:    { run: '正在抓取', done: '已抓取', fail: '抓取失败', emoji: '🌐' },
  fetch:        { run: '正在获取', done: '已获取', fail: '获取失败', emoji: '📡' },
  list_files:   { run: '正在列出', done: '已列出', fail: '列出失败', emoji: '📂' },
  search_file:  { run: '正在搜索', done: '已搜索', fail: '搜索失败', emoji: '🔎' },
  browser:      { run: '正在操作', done: '已操作', fail: '操作失败', emoji: '🌍' },
  message:      { run: '正在发送', done: '已发送', fail: '发送失败', emoji: '💬' },
  cron:         { run: '正在管理', done: '已管理', fail: '管理失败', emoji: '⏰' },
  memory_search:{ run: '正在搜索记忆', done: '已搜索记忆', fail: '搜索失败', emoji: '🧠' },
  wiki_search:  { run: '正在搜索', done: '已搜索', fail: '搜索失败', emoji: '📚' },
  workboard:    { run: '正在操作', done: '已操作', fail: '操作失败', emoji: '📋' },
  mcp_mcp:      { run: '正在调用 MCP', done: 'MCP 调用完成', fail: 'MCP 调用失败', emoji: '🔌' },
}

function getActionInfo(name: string) {
  return ACTION_VERBS[name] || { run: '正在调用', done: '已完成', fail: '调用失败', emoji: '🔧' }
}

interface ToolDetailModalProps {
  open: boolean
  onClose: () => void
  messages: Message[]
  expandedMsgId: string | null
}

export function ToolDetailModal({
  open,
  onClose,
  messages,
  expandedMsgId
}: ToolDetailModalProps) {
  if (!expandedMsgId) return null

  const msg = messages.find((m) => m.id === expandedMsgId)
  if (!msg?.toolCalls) return null

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="工具调用详情"
      size="medium"
    >
      <div className="flex flex-col">
        {msg.toolCalls.map((tc, i) => {
          const name = tc?.name || 'tool'
          const action = getActionInfo(name)
          const emoji = tc?.emoji || action.emoji
          const isDone = tc?.status === 'done' || tc?.status === 'completed'
          const isFailed = tc?.status === 'failed' || tc?.status === 'error'

          const verb = isFailed ? action.fail : isDone ? action.done : action.run
          const statusIcon = isDone ? '✅' : isFailed ? '❌' : '⏳'
          // Single line: emoji + status + verb + detail
          const detail = tc?.detail || name

          return (
            <div key={i} className="flex items-center gap-1.5 py-[5px] border-t border-[var(--border)] text-[13px] text-[var(--text-primary)] leading-[1.3] first:border-t-0">
              <span className="text-[15px] flex-shrink-0 w-5 text-center">{emoji}</span>
              <span className="text-[13px] flex-shrink-0">{statusIcon}</span>
              <span className={`overflow-hidden text-ellipsis whitespace-nowrap ${isFailed ? 'text-[var(--error)]' : ''}`}>
                {verb} {detail}
              </span>
            </div>
          )
        })}
      </div>
    </Modal>
  )
}

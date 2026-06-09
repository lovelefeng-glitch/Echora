import { useEffect, useRef, useState, useMemo, useCallback, useSyncExternalStore } from 'react'
import { useLogStore } from '../../stores/log-store'
import type { LogEntry } from '../../stores/log-store'

/**
 * ConsolePreview - 控制台预览组件
 * 显示应用的 console.log/warn/error 输出
 */

type LogLevel = 'all' | 'info' | 'warn' | 'error' | 'debug'

// useSyncExternalStore 的 snapshot/getSnapshot
const subscribeLogs = (callback: () => void) => {
  return useLogStore.subscribe(callback)
}
const getLogsSnapshot = () => useLogStore.getState().logs

export function ConsolePreview() {
  const containerRef = useRef<HTMLDivElement>(null)
  const [filter, setFilter] = useState<LogLevel>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [isAutoScroll, setIsAutoScroll] = useState(true)
  const [copiedId, setCopiedId] = useState<number | null>(null)
  
  // 使用 useSyncExternalStore 安全订阅
  const logs = useSyncExternalStore(subscribeLogs, getLogsSnapshot)
  
  const clearLogs = useLogStore((s) => s.clearLogs)

  // 自动滚动到底部
  useEffect(() => {
    if (isAutoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [logs, isAutoScroll])

  // 过滤日志
  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      if (filter !== 'all' && log.level !== filter) return false
      if (searchQuery && !log.message.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false
      }
      return true
    })
  }, [logs, filter, searchQuery])

  // 复制单条日志
  const copyLog = useCallback(async (log: LogEntry) => {
    const text = `[${formatTime(log.timestamp)}] [${log.level.toUpperCase()}] ${log.source ? `[${log.source}] ` : ''}${log.message}`
    try {
      await navigator.clipboard.writeText(text)
      setCopiedId(log.id)
      setTimeout(() => setCopiedId(null), 1500)
    } catch (err) {
      console.error('复制失败:', err)
    }
  }, [])

  // 复制所有过滤后的日志
  const copyAllLogs = useCallback(async () => {
    const text = filteredLogs.map(log => 
      `[${formatTime(log.timestamp)}] [${log.level.toUpperCase()}] ${log.source ? `[${log.source}] ` : ''}${log.message}`
    ).join('\n')
    try {
      await navigator.clipboard.writeText(text)
      setCopiedId(-1)
      setTimeout(() => setCopiedId(null), 1500)
    } catch (err) {
      console.error('复制失败:', err)
    }
  }, [filteredLogs])

  // 复制所有错误日志
  const copyErrorLogs = useCallback(async () => {
    const errorLogs = logs.filter(l => l.level === 'error')
    const text = errorLogs.map(log => 
      `[${formatTime(log.timestamp)}] ${log.source ? `[${log.source}] ` : ''}${log.message}`
    ).join('\n')
    try {
      await navigator.clipboard.writeText(text)
      setCopiedId(-2)
      setTimeout(() => setCopiedId(null), 1500)
    } catch (err) {
      console.error('复制失败:', err)
    }
  }, [logs])

  // 获取级别样式
  const getLevelStyle = (level: string) => {
    switch (level) {
      case 'error': return 'border-l-2 border-[var(--error)]'
      case 'warn': return 'border-l-2 border-[var(--warning)]'
      case 'info': return 'border-l-2 border-[var(--accent)]'
      case 'debug': return 'border-l-2 border-[var(--text-hint)]'
      default: return 'border-l-2 border-transparent'
    }
  }

  // 获取级别标签样式
  const getLevelBadgeStyle = (level: string) => {
    switch (level) {
      case 'error': return 'bg-[var(--error-subtle)] text-[var(--error)]'
      case 'warn': return 'bg-[var(--warning-subtle)] text-[var(--warning)]'
      case 'info': return 'bg-[var(--accent-subtle, rgba(99,102,241,0.1))] text-[var(--accent)]'
      case 'debug': return 'bg-[var(--bg-secondary)] text-[var(--text-hint)]'
      default: return 'bg-[var(--bg-secondary)] text-[var(--text-secondary)]'
    }
  }

  // 格式化时间
  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp)
    return date.toLocaleTimeString('zh-CN', { 
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  }

  // 统计信息
  const stats = useMemo(() => {
    return {
      total: logs.length,
      info: logs.filter(l => l.level === 'info').length,
      warn: logs.filter(l => l.level === 'warn').length,
      error: logs.filter(l => l.level === 'error').length,
      debug: logs.filter(l => l.level === 'debug').length,
    }
  }, [logs])

  return (
    <div className="flex flex-col h-full bg-[var(--bg-primary)]">
      {/* 工具栏 */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--border)] bg-[var(--bg-secondary)]">
        {/* 搜索框 */}
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="搜索日志..."
          className="flex-1 min-w-0 px-2 py-1 text-xs bg-[var(--bg-primary)] border border-[var(--border)] rounded focus:outline-none focus:border-[var(--accent)]"
        />
        
        {/* 复制全部按钮 */}
        <button
          className="shrink-0 px-2 py-1 text-xs rounded transition-colors text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
          onClick={copyAllLogs}
          title="复制所有日志"
        >
          {copiedId === -1 ? '✓' : '📋'}
        </button>
        
        {/* 自动滚动按钮 */}
        <button
          className={`shrink-0 px-2 py-1 text-xs rounded transition-colors ${
            isAutoScroll 
              ? 'bg-[var(--accent)] text-white' 
              : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
          }`}
          onClick={() => setIsAutoScroll(!isAutoScroll)}
          title={isAutoScroll ? '关闭自动滚动' : '开启自动滚动'}
        >
          {isAutoScroll ? '⬇️' : '⏸️'}
        </button>
        
        {/* 清空按钮 */}
        <button
          className="shrink-0 px-2 py-1 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--error)] rounded transition-colors"
          onClick={clearLogs}
          title="清空日志"
        >
          🗑️
        </button>
      </div>
      
      {/* 日志列表 */}
      <div 
        ref={containerRef}
        className="flex-1 overflow-auto text-sm"
      >
        {filteredLogs.length === 0 ? (
          <div className="flex items-center justify-center h-full text-[var(--text-hint)]">
            {logs.length === 0 ? '暂无日志' : '没有匹配的日志'}
          </div>
        ) : (
          <div className="py-1">
            {filteredLogs.map((log) => (
              <div 
                key={log.id}
                className={`group px-3 py-2 hover:bg-[var(--bg-hover)] ${getLevelStyle(log.level)}`}
              >
                {/* 第一行：时间 + 级别 + 复制按钮 */}
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs text-[var(--text-hint)] font-mono">
                    {formatTime(log.timestamp)}
                  </span>
                  <span className={`px-1.5 py-0.5 text-xs font-medium rounded ${getLevelBadgeStyle(log.level)}`}>
                    {log.level.toUpperCase()}
                  </span>
                  
                  {/* 复制按钮 - 悬停显示 */}
                  <button
                    className="opacity-0 group-hover:opacity-100 ml-auto px-1.5 py-0.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] rounded transition-all"
                    onClick={() => copyLog(log)}
                    title="复制此条日志"
                  >
                    {copiedId === log.id ? '✓ 已复制' : '📋 复制'}
                  </button>
                </div>
                
                {/* 第二行：来源（如果有） */}
                {log.source && (
                  <div className="text-xs text-[var(--text-hint)] mb-1">
                    📍 {log.source}
                  </div>
                )}
                
                {/* 第三行：消息内容 */}
                <div className="text-[var(--text-primary)] font-mono text-xs leading-relaxed break-all whitespace-pre-wrap">
                  {log.message}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      
      {/* 状态栏 - 可点击过滤 */}
      <div className="flex items-center gap-3 px-3 py-1.5 text-xs border-t border-[var(--border)] bg-[var(--bg-secondary)]">
        <button
          className={`transition-colors ${filter === 'all' ? 'text-[var(--text-primary)] font-medium' : 'text-[var(--text-hint)] hover:text-[var(--text-secondary)]'}`}
          onClick={() => setFilter('all')}
        >
          总计: {stats.total}
        </button>
        <button
          className={`transition-colors ${filter === 'info' ? 'text-[var(--accent)] font-medium' : 'text-[var(--accent)] hover:opacity-80'}`}
          onClick={() => setFilter(filter === 'info' ? 'all' : 'info')}
        >
          INFO: {stats.info}
        </button>
        <button
          className={`transition-colors ${filter === 'warn' ? 'text-[var(--warning)] font-medium' : 'text-[var(--warning)] hover:opacity-80'}`}
          onClick={() => setFilter(filter === 'warn' ? 'all' : 'warn')}
        >
          WARN: {stats.warn}
        </button>
        <button
          className={`transition-colors ${filter === 'error' ? 'text-[var(--error)] font-medium' : 'text-[var(--error)] hover:opacity-80'}`}
          onClick={() => setFilter(filter === 'error' ? 'all' : 'error')}
        >
          ERROR: {stats.error}
        </button>
        
        {/* 复制错误按钮 */}
        {stats.error > 0 && (
          <button
            className="ml-auto px-2 py-0.5 text-xs text-[var(--error)] hover:bg-[var(--error-subtle)] rounded transition-colors"
            onClick={copyErrorLogs}
            title="复制所有错误日志"
          >
            {copiedId === -2 ? '✓ 已复制' : '📋 复制错误'}
          </button>
        )}
      </div>
    </div>
  )
}

import { marked } from 'marked'

marked.setOptions({ breaks: true, gfm: true })

const AVATAR_COLORS = ['#4A90D9', '#E85D75', '#7C5CBF', '#F5A623', '#50C878', '#FF6B6B', '#45B7D1', '#FFD93D', '#6C5B7B', '#00B4D8']

export function getAvatarColor(key: string): string {
  let hash = 0
  for (let i = 0; i < key.length; i++) {
    hash = ((hash << 5) - hash) + key.charCodeAt(i)
    hash |= 0
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

export function escapeHtml(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export function renderMarkdown(content: unknown, role?: string): string {
  if (!content || typeof content !== 'string') return ''
  // User/system messages: plain text with line breaks (no markdown)
  if (role === 'user' || role === 'system') {
    return escapeHtml(content).replace(/\n/g, '<br>')
  }
  // Assistant messages: render via marked
  try {
    let processed = content
    // Fix heading spacing: ensure double newline before headings
    processed = processed.replace(/([^\n])\n(#{1,6} )/g, '$1\n\n$2')
    // Escape lone ~ to prevent marked misinterpreting as strikethrough (preserve ~~deleted~~)
    processed = processed.replace(/(^|[^~])~([^~]|$)/g, '$1\\~$2')
    return marked.parse(processed) as string
  } catch {
    return escapeHtml(content).replace(/\n/g, '<br>')
  }
}

export function formatTime(ts: number): string {
  if (!ts) return ''
  const d = new Date(ts)
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

export function formatUsage(usage: { input?: number; output?: number; totalTokens?: number; cacheRead?: number }): string {
  if (!usage) return ''
  const parts: string[] = []
  if (usage.input != null) parts.push(`↑${usage.input >= 10000 ? (usage.input / 1000).toFixed(1) + 'k' : usage.input}`)
  if (usage.output != null) parts.push(`↓${usage.output >= 10000 ? (usage.output / 1000).toFixed(1) + 'k' : usage.output}`)
  if (usage.cacheRead != null) parts.push(`R${usage.cacheRead >= 1000 ? (usage.cacheRead / 1000).toFixed(1) + 'k' : usage.cacheRead}`)
  if (usage.totalTokens != null) parts.push(`Σ${usage.totalTokens >= 10000 ? (usage.totalTokens / 1000).toFixed(1) + 'k' : usage.totalTokens}`)
  return parts.join(' ')
}

export function formatLatency(ms?: number): string {
  if (!ms) return ''
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`
}

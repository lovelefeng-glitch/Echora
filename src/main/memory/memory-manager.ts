/**
 * 记忆管理器
 * 三层记忆：短期缓冲 → 中期摘要 → 长期持久化
 */

import { create } from '../utils/console-logger'
import type { ChatMessage } from '../llm/types'
import type {
  MemoryEntry,
  MemorySearchResult,
  MemoryConfig
} from './types'
import { DEFAULT_MEMORY_CONFIG } from './types'

const log = create('MemoryManager')

/**
 * 记忆管理器
 */
export class MemoryManager {
  private _config: MemoryConfig

  /** 短期记忆：最近的消息轮次 */
  private _shortTerm: ChatMessage[] = []

  /** 中期记忆：对话摘要 */
  private _midTerm: string[] = []

  /** 长期记忆：持久化存储 */
  private _longTerm = new Map<string, MemoryEntry>()

  constructor(config?: Partial<MemoryConfig>) {
    this._config = { ...DEFAULT_MEMORY_CONFIG, ...config }
  }

  // ========== 短期记忆 ==========

  /**
   * 添加消息到短期记忆
   */
  addToShortTerm(message: ChatMessage): void {
    this._shortTerm.push(message)

    // 超过最大轮数时触发中期记忆压缩
    if (this._shortTerm.length > this._config.shortTermMaxTurns * 2) {
      this._compressToMidTerm()
    }
  }

  /**
   * 获取短期记忆
   */
  getShortTerm(): ChatMessage[] {
    return [...this._shortTerm]
  }

  /**
   * 获取最近 N 轮对话
   */
  getRecentMessages(turns: number = 10): ChatMessage[] {
    const maxMessages = turns * 2 // 每轮包含用户和助手消息
    return this._shortTerm.slice(-maxMessages)
  }

  /**
   * 清空短期记忆
   */
  clearShortTerm(): void {
    this._shortTerm = []
  }

  // ========== 中期记忆 ==========

  /**
   * 压缩到中期记忆
   */
  private _compressToMidTerm(): void {
    if (this._shortTerm.length <= this._config.shortTermMaxTurns * 2) {
      return
    }

    // 提取需要压缩的消息
    const messagesToCompress = this._shortTerm.slice(0, -this._config.shortTermMaxTurns * 2)
    const recentMessages = this._shortTerm.slice(-this._config.shortTermMaxTurns * 2)

    // 生成摘要（简化实现：提取关键信息）
    const summary = this._generateSummary(messagesToCompress)
    if (summary) {
      this._midTerm.push(summary)
      log.info('生成中期记忆摘要')
    }

    // 保留最近的消息
    this._shortTerm = recentMessages
  }

  /**
   * 生成摘要（简化实现）
   */
  private _generateSummary(messages: ChatMessage[]): string {
    // 提取关键信息
    const keyPoints: string[] = []

    for (const msg of messages) {
      if (msg.role === 'user') {
        // 提取用户的问题
        const question = msg.content.substring(0, 100)
        keyPoints.push(`用户询问: ${question}`)
      }
    }

    if (keyPoints.length === 0) {
      return ''
    }

    return `[对话摘要] ${keyPoints.join('; ')}`
  }

  /**
   * 获取中期记忆
   */
  getMidTerm(): string[] {
    return [...this._midTerm]
  }

  /**
   * 清空中期记忆
   */
  clearMidTerm(): void {
    this._midTerm = []
  }

  // ========== 长期记忆 ==========

  /**
   * 添加长期记忆
   */
  addToLongTerm(
    content: string,
    source: 'user_explicit' | 'agent_detected' = 'user_explicit',
    metadata?: Record<string, unknown>
  ): MemoryEntry {
    const id = `mem_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    const entry: MemoryEntry = {
      id,
      type: 'long_term',
      content,
      createdAt: Date.now(),
      lastAccessedAt: Date.now(),
      accessCount: 0,
      source,
      metadata
    }

    this._longTerm.set(id, entry)
    log.info(`添加长期记忆: ${content.substring(0, 50)}...`)

    return entry
  }

  /**
   * 检测是否包含"记住"指令
   */
  detectRememberCommand(message: string): string | null {
    const patterns = [
      /记住[：:]\s*(.+)/i,
      /remember[：:]\s*(.+)/i,
      /请记住\s*(.+)/i,
      /帮我记住\s*(.+)/i
    ]

    for (const pattern of patterns) {
      const match = message.match(pattern)
      if (match) {
        return match[1].trim()
      }
    }

    return null
  }

  /**
   * 检索长期记忆
   */
  searchLongTerm(query: string, topK: number = 5): MemorySearchResult[] {
    const results: MemorySearchResult[] = []
    const queryLower = query.toLowerCase()

    for (const entry of this._longTerm.values()) {
      // 简单的关键词匹配
      const contentLower = entry.content.toLowerCase()
      let score = 0

      // 检查关键词匹配
      const words = queryLower.split(/\s+/)
      for (const word of words) {
        if (contentLower.includes(word)) {
          score += 1
        }
      }

      // 归一化
      score = score / Math.max(words.length, 1)

      // 应用遗忘衰减
      const daysSinceAccess = (Date.now() - entry.lastAccessedAt) / (1000 * 60 * 60 * 24)
      if (daysSinceAccess > this._config.longTermFadeDays) {
        score *= 0.5 // 降权
      }

      if (score > 0) {
        results.push({ entry, score })
      }
    }

    // 按分数排序
    results.sort((a, b) => b.score - a.score)

    // 更新访问时间
    for (const result of results.slice(0, topK)) {
      result.entry.lastAccessedAt = Date.now()
      result.entry.accessCount++
    }

    return results.slice(0, topK)
  }

  /**
   * 获取所有长期记忆
   */
  getLongTerm(): MemoryEntry[] {
    return Array.from(this._longTerm.values())
  }

  /**
   * 更新长期记忆
   */
  updateLongTerm(id: string, content: string): boolean {
    const entry = this._longTerm.get(id)
    if (!entry) {
      return false
    }

    entry.content = content
    entry.lastAccessedAt = Date.now()
    return true
  }

  /**
   * 删除长期记忆
   */
  deleteLongTerm(id: string): boolean {
    return this._longTerm.delete(id)
  }

  /**
   * 清理过期的长期记忆
   */
  cleanupLongTerm(): number {
    const now = Date.now()
    let deleted = 0

    for (const [id, entry] of this._longTerm) {
      const daysSinceAccess = (now - entry.lastAccessedAt) / (1000 * 60 * 60 * 24)
      if (daysSinceAccess > this._config.longTermDeleteDays) {
        this._longTerm.delete(id)
        deleted++
      }
    }

    if (deleted > 0) {
      log.info(`清理 ${deleted} 条过期长期记忆`)
    }

    return deleted
  }

  // ========== 系统提示词注入 ==========

  /**
   * 生成记忆相关的系统提示词片段
   */
  generateMemoryPrompt(): string {
    const parts: string[] = []

    // 中期记忆摘要
    if (this._midTerm.length > 0) {
      parts.push('## 历史对话摘要')
      parts.push(this._midTerm.slice(-3).join('\n'))
    }

    // 长期记忆
    const longTermEntries = this.getLongTerm()
    if (longTermEntries.length > 0) {
      parts.push('## 用户记忆')
      for (const entry of longTermEntries.slice(0, 10)) {
        parts.push(`- ${entry.content}`)
      }
    }

    return parts.join('\n\n')
  }

  // ========== 配置 ==========

  /**
   * 更新配置
   */
  updateConfig(config: Partial<MemoryConfig>): void {
    this._config = { ...this._config, ...config }
  }

  /**
   * 获取配置
   */
  getConfig(): MemoryConfig {
    return { ...this._config }
  }
}

/**
 * 创建记忆管理器实例
 */
export function createMemoryManager(config?: Partial<MemoryConfig>): MemoryManager {
  return new MemoryManager(config)
}

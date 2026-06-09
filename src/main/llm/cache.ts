/**
 * LLM 请求缓存
 * 相同 query 在 TTL 内直接返回缓存结果
 */

import type { ChatMessage, TokenUsage } from './types'

/** 缓存配置 */
export interface CacheConfig {
  /** 缓存 TTL（毫秒），默认 5 分钟 */
  ttl?: number
  /** 最大缓存条目数 */
  maxSize?: number
}

/** 缓存条目 */
interface CacheEntry {
  response: string
  usage?: TokenUsage
  timestamp: number
  hits: number
}

/**
 * LLM 请求缓存
 * 基于消息内容的简单缓存，用于减少重复请求
 */
export class LLMCache {
  private _cache = new Map<string, CacheEntry>()
  private _ttl: number
  private _maxSize: number

  constructor(config?: CacheConfig) {
    this._ttl = config?.ttl || 5 * 60 * 1000 // 默认 5 分钟
    this._maxSize = config?.maxSize || 1000
  }

  /**
   * 生成缓存键
   */
  private _generateKey(model: string, messages: ChatMessage[]): string {
    const content = messages.map(m => `${m.role}:${m.content}`).join('|')
    return `${model}:${this._hash(content)}`
  }

  /**
   * 简单字符串哈希
   */
  private _hash(str: string): string {
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash // 转换为 32 位整数
    }
    return hash.toString(36)
  }

  /**
   * 获取缓存
   */
  get(model: string, messages: ChatMessage[]): { response: string; usage?: TokenUsage } | null {
    const key = this._generateKey(model, messages)
    const entry = this._cache.get(key)

    if (!entry) {
      return null
    }

    // 检查是否过期
    if (Date.now() - entry.timestamp > this._ttl) {
      this._cache.delete(key)
      return null
    }

    // 更新命中次数
    entry.hits++

    return {
      response: entry.response,
      usage: entry.usage
    }
  }

  /**
   * 设置缓存
   */
  set(model: string, messages: ChatMessage[], response: string, usage?: TokenUsage): void {
    // 检查缓存大小限制
    if (this._cache.size >= this._maxSize) {
      this._evict()
    }

    const key = this._generateKey(model, messages)
    this._cache.set(key, {
      response,
      usage,
      timestamp: Date.now(),
      hits: 0
    })
  }

  /**
   * 清除过期缓存
   */
  cleanup(): number {
    const now = Date.now()
    let cleaned = 0

    for (const [key, entry] of this._cache) {
      if (now - entry.timestamp > this._ttl) {
        this._cache.delete(key)
        cleaned++
      }
    }

    return cleaned
  }

  /**
   * 清除所有缓存
   */
  clear(): void {
    this._cache.clear()
  }

  /**
   * 获取缓存统计
   */
  getStats(): { size: number; hits: number; misses: number } {
    let hits = 0
    for (const entry of this._cache.values()) {
      hits += entry.hits
    }

    return {
      size: this._cache.size,
      hits,
      misses: 0 // 需要外部跟踪
    }
  }

  /**
   * 淘汰策略：移除最旧和最少命中的条目
   */
  private _evict(): void {
    const entries = Array.from(this._cache.entries())

    // 按命中次数和时间排序
    entries.sort((a, b) => {
      // 优先移除命中次数少的
      if (a[1].hits !== b[1].hits) {
        return a[1].hits - b[1].hits
      }
      // 其次移除最旧的
      return a[1].timestamp - b[1].timestamp
    })

    // 移除前 20% 的条目
    const removeCount = Math.max(1, Math.floor(entries.length * 0.2))
    for (let i = 0; i < removeCount; i++) {
      this._cache.delete(entries[i][0])
    }
  }
}

/**
 * 全局缓存实例
 */
let globalCache: LLMCache | null = null

/**
 * 获取全局缓存实例
 */
export function getLLMCache(config?: CacheConfig): LLMCache {
  if (!globalCache) {
    globalCache = new LLMCache(config)
  }
  return globalCache
}

/**
 * 记忆系统类型定义
 */

/** 记忆类型 */
export type MemoryType = 'short_term' | 'mid_term' | 'long_term'

/** 记忆条目 */
export interface MemoryEntry {
  /** 记忆 ID */
  id: string
  /** 记忆类型 */
  type: MemoryType
  /** 内容 */
  content: string
  /** 创建时间 */
  createdAt: number
  /** 最后访问时间 */
  lastAccessedAt: number
  /** 访问次数 */
  accessCount: number
  /** 来源（用户显式/Agent判断） */
  source: 'user_explicit' | 'agent_detected'
  /** 相关性分数（用于检索） */
  relevanceScore?: number
  /** 元数据 */
  metadata?: Record<string, unknown>
}

/** 记忆检索结果 */
export interface MemorySearchResult {
  /** 记忆条目 */
  entry: MemoryEntry
  /** 相关性分数 */
  score: number
}

/** 记忆配置 */
export interface MemoryConfig {
  /** 短期记忆最大轮数 */
  shortTermMaxTurns: number
  /** 中期记忆摘要触发轮数 */
  midTermTriggerTurns: number
  /** 长期记忆遗忘天数（降权） */
  longTermFadeDays: number
  /** 长期记忆删除天数 */
  longTermDeleteDays: number
  /** 存储路径 */
  storagePath?: string
}

/** 默认记忆配置 */
export const DEFAULT_MEMORY_CONFIG: MemoryConfig = {
  shortTermMaxTurns: 20,
  midTermTriggerTurns: 20,
  longTermFadeDays: 30,
  longTermDeleteDays: 90
}

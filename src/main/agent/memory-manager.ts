/**
 * Agent 记忆管理器
 * 基于 JSON 文件的持久化记忆存储
 * 来源: Agent 模块
 * 输出: MemoryManager 类（增删改查 + 去重 + 分类）
 * 依赖: node:fs, node:path, node:crypto, console-logger
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { createHash } from 'node:crypto'
import { create } from '../utils/console-logger'

const log = create('AgentMemory')

// ========== 类型定义 ==========

/** 记忆分类 */
export type MemoryCategory = 'fact' | 'preference' | 'decision'

/** 记忆条目 */
export interface AgentMemoryEntry {
  /** 记忆唯一 ID */
  id: string
  /** 内容哈希（用于去重） */
  hash: string
  /** 记忆分类 */
  category: MemoryCategory
  /** 记忆内容 */
  content: string
  /** 关键词列表（用于搜索和匹配） */
  keywords: string[]
  /** 创建时间 */
  createdAt: number
  /** 最后更新时间 */
  updatedAt: number
  /** 访问次数 */
  accessCount: number
  /** 来源标识 */
  source: string
  /** 元数据 */
  metadata?: Record<string, unknown>
}

/** 记忆搜索结果 */
export interface MemorySearchResult {
  /** 匹配的记忆条目 */
  entry: AgentMemoryEntry
  /** 匹配分数（0~1） */
  score: number
}

/** 记忆存储配置 */
export interface AgentMemoryConfig {
  /** JSON 文件存储路径 */
  storagePath: string
  /** 分类过滤器（可选，空则返回全部） */
  categoryFilter?: MemoryCategory
  /** 搜索返回最大条数 */
  searchTopK: number
}

/** 默认配置 */
const DEFAULT_CONFIG: AgentMemoryConfig = {
  storagePath: join(process.cwd(), 'data', 'agent-memory.json'),
  searchTopK: 10
}

// ========== 工具函数 ==========

/**
 * 计算内容哈希（SHA-256）
 * 来源: 文本内容
 * 输出: 十六进制哈希字符串
 */
function computeHash(content: string): string {
  return createHash('sha256').update(content.trim().toLowerCase()).digest('hex')
}

/**
 * 从内容中提取关键词
 * 来源: 记忆内容文本
 * 输出: 去重后的关键词数组
 */
function extractKeywords(content: string): string[] {
  // 按空白和标点分词，过滤空串，去重
  const tokens = content
    .replace(/[，。！？、；：""''（）\[\]【】《》,.!?;:'"()\s]+/g, ' ')
    .split(' ')
    .map(t => t.trim().toLowerCase())
    .filter(t => t.length > 0)

  return [...new Set(tokens)]
}

/**
 * 生成唯一 ID
 * 来源: 时间戳 + 随机串
 * 输出: 唯一字符串
 */
function generateId(): string {
  return `amem_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`
}

// ========== 主类 ==========

/**
 * Agent 记忆管理器
 * 支持 JSON 文件持久化存储、分类管理、去重、关键词搜索和更新
 */
export class AgentMemoryManager {
  private _config: AgentMemoryConfig
  private _memories: AgentMemoryEntry[] = []
  private _hashIndex: Map<string, string> = new Map() // hash → id
  private _loaded = false

  constructor(config?: Partial<AgentMemoryConfig>) {
    this._config = { ...DEFAULT_CONFIG, ...config }
  }

  // ========== 初始化与持久化 ==========

  /**
   * 从 JSON 文件加载记忆
   * 来源: 磁盘文件
   * 输出: 内存中的记忆列表 + 哈希索引
   */
  load(): void {
    try {
      const dir = dirname(this._config.storagePath)
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true })
        log.info(`创建存储目录: ${dir}`)
      }

      if (existsSync(this._config.storagePath)) {
        const raw = readFileSync(this._config.storagePath, 'utf-8')
        const parsed = JSON.parse(raw) as AgentMemoryEntry[]
        this._memories = Array.isArray(parsed) ? parsed : []
        log.info(`从文件加载 ${this._memories.length} 条记忆`)
      } else {
        this._memories = []
        log.info('存储文件不存在，初始化为空记忆列表')
      }

      // 构建哈希索引
      this._hashIndex.clear()
      for (const entry of this._memories) {
        this._hashIndex.set(entry.hash, entry.id)
      }

      this._loaded = true
      log.success('记忆加载完成')
    } catch (error) {
      log.error('加载记忆文件失败:', error instanceof Error ? error.message : String(error))
      this._memories = []
      this._hashIndex.clear()
      this._loaded = true
    }
  }

  /**
   * 保存记忆到 JSON 文件
   * 来源: 内存中的记忆列表
   * 输出: 磁盘文件
   */
  save(): void {
    try {
      const dir = dirname(this._config.storagePath)
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true })
      }

      writeFileSync(this._config.storagePath, JSON.stringify(this._memories, null, 2), 'utf-8')
      log.info(`已保存 ${this._memories.length} 条记忆到文件`)
    } catch (error) {
      log.error('保存记忆文件失败:', error instanceof Error ? error.message : String(error))
    }
  }

  /**
   * 确保已加载
   */
  private _ensureLoaded(): void {
    if (!this._loaded) {
      this.load()
    }
  }

  // ========== 增 ==========

  /**
   * 添加记忆（自动去重）
   * 来源: 内容文本 + 分类 + 来源标识
   * 输出: 新条目 或 已存在的条目（去重命中时）
   */
  add(
    content: string,
    category: MemoryCategory,
    source: string = 'agent',
    metadata?: Record<string, unknown>
  ): AgentMemoryEntry {
    this._ensureLoaded()

    const hash = computeHash(content)

    // 去重：基于内容哈希
    if (this._hashIndex.has(hash)) {
      const existingId = this._hashIndex.get(hash)!
      const existing = this._memories.find(m => m.id === existingId)
      if (existing) {
        existing.accessCount++
        existing.updatedAt = Date.now()
        log.info(`去重命中，更新已有记忆 [${existing.id}]`)
        this.save()
        return existing
      }
    }

    const entry: AgentMemoryEntry = {
      id: generateId(),
      hash,
      category,
      content: content.trim(),
      keywords: extractKeywords(content),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      accessCount: 0,
      source,
      metadata
    }

    this._memories.push(entry)
    this._hashIndex.set(hash, entry.id)

    log.info(`添加记忆 [${entry.id}] 分类=${category} 来源=${source}`)
    log.debug(`内容预览: ${entry.content.substring(0, 80)}...`)

    this.save()
    return entry
  }

  // ========== 查 ==========

  /**
   * 根据 ID 获取记忆
   * 来源: 记忆 ID
   * 输出: 记忆条目 或 undefined
   */
  getById(id: string): AgentMemoryEntry | undefined {
    this._ensureLoaded()

    const entry = this._memories.find(m => m.id === id)
    if (entry) {
      entry.accessCount++
    }
    return entry
  }

  /**
   * 基于关键词搜索记忆
   * 来源: 搜索关键词
   * 输出: 按相关性排序的搜索结果
   */
  search(query: string, topK?: number): MemorySearchResult[] {
    this._ensureLoaded()

    const limit = topK ?? this._config.searchTopK
    const queryLower = query.toLowerCase().trim()
    const queryWords = queryLower.split(/\s+/).filter(w => w.length > 0)

    const results: MemorySearchResult[] = []

    for (const entry of this._memories) {
      let score = 0

      // 分类过滤
      if (this._config.categoryFilter && entry.category !== this._config.categoryFilter) {
        continue
      }

      // 内容匹配
      const contentLower = entry.content.toLowerCase()
      for (const word of queryWords) {
        if (contentLower.includes(word)) {
          score += 1
        }
      }

      // 关键词匹配（权重更高）
      for (const word of queryWords) {
        if (entry.keywords.some(k => k.includes(word) || word.includes(k))) {
          score += 0.5
        }
      }

      // 归一化
      score = score / Math.max(queryWords.length, 1)

      if (score > 0) {
        results.push({ entry, score })
      }
    }

    // 按分数降序排序
    results.sort((a, b) => b.score - a.score)

    // 更新匹配条目的访问计数
    for (const r of results.slice(0, limit)) {
      r.entry.accessCount++
    }

    log.info(`搜索 "${query}" 返回 ${Math.min(results.length, limit)} 条结果`)
    return results.slice(0, limit)
  }

  /**
   * 按分类获取所有记忆
   * 来源: 分类名
   * 输出: 该分类下的所有记忆
   */
  getByCategory(category: MemoryCategory): AgentMemoryEntry[] {
    this._ensureLoaded()

    return this._memories.filter(m => m.category === category)
  }

  /**
   * 获取所有记忆
   * 来源: 无
   * 输出: 全部记忆条目
   */
  getAll(): AgentMemoryEntry[] {
    this._ensureLoaded()
    return [...this._memories]
  }

  /**
   * 获取记忆总数
   */
  count(): number {
    this._ensureLoaded()
    return this._memories.length
  }

  // ========== 改 ==========

  /**
   * 更新记忆内容（基于关键词匹配找到目标）
   * 来源: 旧内容关键词 + 新内容
   * 输出: 是否更新成功
   */
  updateByKeyword(keyword: string, newContent: string, newCategory?: MemoryCategory): boolean {
    this._ensureLoaded()

    const keywordLower = keyword.toLowerCase()
    const matched = this._memories.find(m =>
      m.content.toLowerCase().includes(keywordLower) ||
      m.keywords.some(k => k.includes(keywordLower))
    )

    if (!matched) {
      log.warn(`未找到匹配关键词 "${keyword}" 的记忆`)
      return false
    }

    // 检查新内容是否与已有记忆重复（排除自身）
    const newHash = computeHash(newContent)
    const duplicateId = this._hashIndex.get(newHash)
    if (duplicateId && duplicateId !== matched.id) {
      log.warn(`新内容与已有记忆 [${duplicateId}] 重复，跳过更新`)
      return false
    }

    // 移除旧哈希索引
    this._hashIndex.delete(matched.hash)

    // 更新内容
    matched.content = newContent.trim()
    matched.hash = newHash
    matched.keywords = extractKeywords(newContent)
    matched.updatedAt = Date.now()
    if (newCategory) {
      matched.category = newCategory
    }

    // 更新哈希索引
    this._hashIndex.set(newHash, matched.id)

    log.info(`已更新记忆 [${matched.id}] 关键词="${keyword}"`)
    this.save()
    return true
  }

  /**
   * 通过 ID 更新记忆
   * 来源: 记忆 ID + 新内容
   * 输出: 是否更新成功
   */
  updateById(id: string, updates: Partial<Pick<AgentMemoryEntry, 'content' | 'category' | 'metadata'>>): boolean {
    this._ensureLoaded()

    const entry = this._memories.find(m => m.id === id)
    if (!entry) {
      log.warn(`未找到记忆 [${id}]`)
      return false
    }

    if (updates.content !== undefined) {
      const newHash = computeHash(updates.content)
      const duplicateId = this._hashIndex.get(newHash)
      if (duplicateId && duplicateId !== id) {
        log.warn(`新内容与已有记忆 [${duplicateId}] 重复，跳过更新`)
        return false
      }

      this._hashIndex.delete(entry.hash)
      entry.content = updates.content.trim()
      entry.hash = newHash
      entry.keywords = extractKeywords(updates.content)
      this._hashIndex.set(newHash, id)
    }

    if (updates.category !== undefined) {
      entry.category = updates.category
    }

    if (updates.metadata !== undefined) {
      entry.metadata = { ...entry.metadata, ...updates.metadata }
    }

    entry.updatedAt = Date.now()

    log.info(`已更新记忆 [${id}]`)
    this.save()
    return true
  }

  // ========== 删 ==========

  /**
   * 通过 ID 删除记忆
   * 来源: 记忆 ID
   * 输出: 是否删除成功
   */
  deleteById(id: string): boolean {
    this._ensureLoaded()

    const index = this._memories.findIndex(m => m.id === id)
    if (index === -1) {
      log.warn(`未找到记忆 [${id}]，无法删除`)
      return false
    }

    const removed = this._memories.splice(index, 1)[0]
    this._hashIndex.delete(removed.hash)

    log.info(`已删除记忆 [${id}]`)
    this.save()
    return true
  }

  /**
   * 基于关键词删除匹配的记忆
   * 来源: 关键词
   * 输出: 删除的条目数量
   */
  deleteByKeyword(keyword: string): number {
    this._ensureLoaded()

    const keywordLower = keyword.toLowerCase()
    const beforeCount = this._memories.length

    this._memories = this._memories.filter(m => {
      const match =
        m.content.toLowerCase().includes(keywordLower) ||
        m.keywords.some(k => k.includes(keywordLower))

      if (match) {
        this._hashIndex.delete(m.hash)
      }

      return !match
    })

    const deleted = beforeCount - this._memories.length
    if (deleted > 0) {
      log.info(`基于关键词 "${keyword}" 删除了 ${deleted} 条记忆`)
      this.save()
    } else {
      log.warn(`未找到匹配关键词 "${keyword}" 的记忆`)
    }

    return deleted
  }

  /**
   * 清空所有记忆
   */
  clearAll(): number {
    this._ensureLoaded()

    const count = this._memories.length
    this._memories = []
    this._hashIndex.clear()

    log.info(`已清空全部 ${count} 条记忆`)
    this.save()
    return count
  }

  // ========== 查询辅助 ==========

  /**
   * 检测消息中的"记住"指令
   * 来源: 用户消息文本
   * 输出: 要记住的内容 或 null
   */
  detectRememberCommand(message: string): string | null {
    const patterns = [
      /记住[：:]\s*(.+)/i,
      /remember[：:]\s*(.+)/i,
      /请记住\s*(.+)/i,
      /帮我记住\s*(.+)/i,
      /别忘了\s*(.+)/i
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
   * 推断记忆分类
   * 来源: 内容文本
   * 输出: 推荐的分类
   */
  inferCategory(content: string): MemoryCategory {
    const lower = content.toLowerCase()

    // 偏好关键词
    const preferencePatterns = [
      /喜欢|偏好|倾向于|更喜欢|最爱|钟爱|习惯|常用/,
      /prefer|like|favorite|habit|usual|prefer/
    ]

    // 决策关键词
    const decisionPatterns = [
      /决定|选择了|确认|最终|方案|计划|定了|敲定/,
      /decided|chosen|confirmed|plan|decision/
    ]

    for (const p of preferencePatterns) {
      if (p.test(lower)) return 'preference'
    }

    for (const p of decisionPatterns) {
      if (p.test(lower)) return 'decision'
    }

    return 'fact'
  }

  /**
   * 生成用于系统提示的记忆上下文
   * 来源: 当前记忆列表
   * 输出: 格式化的文本片段
   */
  generateMemoryPrompt(): string {
    this._ensureLoaded()

    if (this._memories.length === 0) return ''

    const parts: string[] = ['## Agent 记忆']

    // 按分类分组输出
    const groups: Record<MemoryCategory, AgentMemoryEntry[]> = {
      fact: [],
      preference: [],
      decision: []
    }

    for (const entry of this._memories) {
      groups[entry.category].push(entry)
    }

    const categoryLabels: Record<MemoryCategory, string> = {
      fact: '事实',
      preference: '偏好',
      decision: '决策'
    }

    for (const [cat, entries] of Object.entries(groups) as [MemoryCategory, AgentMemoryEntry[]][]) {
      if (entries.length === 0) continue
      parts.push(`### ${categoryLabels[cat]}`)
      for (const e of entries.slice(0, 20)) {
        parts.push(`- ${e.content}`)
      }
    }

    return parts.join('\n')
  }

  // ========== 配置 ==========

  /**
   * 获取当前配置
   */
  getConfig(): AgentMemoryConfig {
    return { ...this._config }
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<AgentMemoryConfig>): void {
    this._config = { ...this._config, ...config }
    log.info('记忆配置已更新')
  }
}

/**
 * 创建 Agent 记忆管理器实例
 */
export function createAgentMemoryManager(config?: Partial<AgentMemoryConfig>): AgentMemoryManager {
  return new AgentMemoryManager(config)
}

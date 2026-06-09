/**
 * SQLite 存储适配器
 * 
 * 将新的 SQLite 实现适配到旧的 SessionManager 和 AgentMemoryManager 接口
 * 这样 AgentManager 可以无缝切换到 SQLite 存储
 * 
 * 来源：Sprint 11 Phase 1 - Echora Agent 核心能力提升
 * 输出：SQLiteSessionManagerAdapter, SQLiteMemoryManagerAdapter
 * 依赖：./store/, ./session-manager.ts, ./memory-manager.ts
 */

import { create } from '../utils/console-logger'
import { SQLiteDatabase, createSchema } from '../store'
import { SqliteSessionStore } from '../store/sqlite-session-store'
import { SqliteMemoryStore } from '../store/sqlite-memory-store'
import type { SessionStore, MemoryStore, Session, Message, MemoryEntry, MemoryCategory } from '../store/interfaces'

const log = create('SQLiteAdapter')

/**
 * SQLite 会话管理器适配器
 * 
 * 适配旧的 SessionManager 接口到新的 SqliteSessionStore
 */
export class SQLiteSessionManagerAdapter {
  private _store: SqliteSessionStore
  private _db: SQLiteDatabase

  constructor(dbPath: string) {
    this._db = new SQLiteDatabase({ path: dbPath })
    createSchema(this._db)
    this._store = new SqliteSessionStore(this._db)
    log.info(`SQLiteSessionManagerAdapter 已初始化: ${dbPath}`)
  }

  /**
   * 创建会话
   */
  async createSession(sessionId: string, agentKey: string, title?: string): Promise<Session> {
    return this._store.createSession(agentKey, title)
  }

  /**
   * 获取会话
   */
  async getSession(sessionId: string): Promise<Session | null> {
    return this._store.getSession(sessionId)
  }

  /**
   * 列出会话
   */
  async listSessions(agentKey: string, limit?: number): Promise<Session[]> {
    return this._store.listSessions(agentKey, limit)
  }

  /**
   * 删除会话
   */
  async deleteSession(sessionId: string): Promise<boolean> {
    return this._store.deleteSession(sessionId)
  }

  /**
   * 添加消息
   */
  async addMessage(sessionId: string, role: string, content: string, metadata?: Record<string, unknown>): Promise<Message> {
    return this._store.addMessage(sessionId, {
      role: role as 'user' | 'assistant' | 'system',
      content,
      metadata
    })
  }

  /**
   * 获取消息历史
   */
  async getMessages(sessionId: string, limit?: number): Promise<Message[]> {
    return this._store.getMessages(sessionId, limit)
  }

  /**
   * 搜索消息
   */
  async searchMessages(query: string, sessionId?: string) {
    return this._store.searchMessages(query, sessionId)
  }

  /**
   * 关闭存储
   */
  async close(): Promise<void> {
    this._store.close()
  }
}

/**
 * SQLite 记忆管理器适配器
 * 
 * 适配旧的 AgentMemoryManager 接口到新的 SqliteMemoryStore
 */
export class SQLiteMemoryManagerAdapter {
  private _store: SqliteMemoryStore
  private _db: SQLiteDatabase

  constructor(dbPath: string) {
    this._db = new SQLiteDatabase({ path: dbPath })
    createSchema(this._db)
    this._store = new SqliteMemoryStore(this._db)
    log.info(`SQLiteMemoryManagerAdapter 已初始化: ${dbPath}`)
  }

  /**
   * 添加记忆
   */
  async add(content: string, category: MemoryCategory, source?: string): Promise<MemoryEntry> {
    return this._store.save({
      category,
      content,
      keywords: this._extractKeywords(content),
      source: source || 'agent'
    })
  }

  /**
   * 搜索记忆
   */
  async search(query: string, topK?: number): Promise<MemoryEntry[]> {
    const results = await this._store.search(query, topK)
    return results.map(r => r.entry)
  }

  /**
   * 获取所有记忆
   */
  async getAll(): Promise<MemoryEntry[]> {
    // 获取所有分类的记忆
    const categories: MemoryCategory[] = ['fact', 'preference', 'decision', 'skill', 'context']
    const allMemories: MemoryEntry[] = []
    
    for (const category of categories) {
      const memories = await this._store.getByCategory(category)
      allMemories.push(...memories)
    }
    
    return allMemories
  }

  /**
   * 删除记忆
   */
  async deleteById(id: string): Promise<boolean> {
    return this._store.delete(id)
  }

  /**
   * 生成记忆上下文（用于注入系统提示）
   */
  async generateMemoryPrompt(): Promise<string> {
    const memories = await this.getAll()
    if (memories.length === 0) return ''

    // 按分类组织记忆
    const grouped = new Map<MemoryCategory, MemoryEntry[]>()
    for (const memory of memories) {
      const existing = grouped.get(memory.category) || []
      existing.push(memory)
      grouped.set(memory.category, existing)
    }

    // 生成提示
    const parts: string[] = []
    parts.push('## 用户记忆')
    
    for (const [category, entries] of Array.from(grouped.entries())) {
      if (entries.length > 0) {
        parts.push(`\n### ${this._getCategoryName(category)}`)
        for (const entry of entries.slice(0, 5)) {
          parts.push(`- ${entry.content}`)
        }
      }
    }

    return parts.join('\n')
  }

  /**
   * 提取关键词
   */
  private _extractKeywords(content: string): string[] {
    // 简单实现：提取长度 > 2 的词
    const words = content.split(/[\s,，。、；：！？]+/).filter(w => w.length > 2)
    return Array.from(new Set(words)).slice(0, 10)
  }

  /**
   * 获取分类名称
   */
  private _getCategoryName(category: MemoryCategory): string {
    const names: Record<MemoryCategory, string> = {
      fact: '事实',
      preference: '偏好',
      decision: '决策',
      skill: '技能',
      context: '上下文'
    }
    return names[category] || category
  }

  /**
   * 关闭存储
   */
  async close(): Promise<void> {
    this._store.close()
  }
}

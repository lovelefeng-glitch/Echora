/**
 * SQLite 记忆存储实现
 * 
 * 实现 MemoryStore 接口，使用 SQLite + FTS5 存储记忆
 * 
 * 来源：Sprint 11 Phase 1 - Echora Agent 核心能力提升
 * 输出：SqliteMemoryStore 类
 * 依赖：./sqlite.ts, ./interfaces.ts, ./schema.ts
 */

import { randomUUID } from 'node:crypto'
import { create } from '../utils/console-logger'
import type { SQLiteDatabase } from './sqlite'
import type {
  MemoryStore,
  MemoryEntry,
  MemorySearchResult,
  MemoryCategory
} from './interfaces'

const log = create('SqliteMemoryStore')

/**
 * SQLite 记忆存储实现
 */
export class SqliteMemoryStore implements MemoryStore {
  private _db: SQLiteDatabase

  constructor(db: SQLiteDatabase) {
    this._db = db
    log.info('SqliteMemoryStore 已初始化')
  }

  /**
   * 保存记忆
   */
  async save(
    entry: Omit<MemoryEntry, 'id' | 'createdAt' | 'updatedAt' | 'accessCount'>
  ): Promise<MemoryEntry> {
    const id = randomUUID()
    const now = Date.now()

    this._db.run(
      `INSERT INTO memories (id, category, content, keywords, source, created_at, updated_at, access_count, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)`,
      id,
      entry.category,
      entry.content,
      JSON.stringify(entry.keywords),
      entry.source,
      now,
      now,
      entry.metadata ? JSON.stringify(entry.metadata) : null
    )

    log.info(`保存记忆: ${id} (分类: ${entry.category})`)

    return {
      id,
      category: entry.category,
      content: entry.content,
      keywords: entry.keywords,
      source: entry.source,
      createdAt: now,
      updatedAt: now,
      accessCount: 0,
      metadata: entry.metadata
    }
  }

  /**
   * 搜索记忆（FTS5 全文搜索）
   */
  async search(query: string, limit = 20): Promise<MemorySearchResult[]> {
    const rows = this._db.all<{
      id: string
      category: string
      content: string
      keywords: string
      source: string
      created_at: number
      updated_at: number
      access_count: number
      metadata: string | null
    }>(
      `SELECT m.*
       FROM memories_fts
       JOIN memories m ON memories_fts.rowid = m.rowid
       WHERE memories_fts MATCH ?
       ORDER BY rank
       LIMIT ?`,
      query, limit
    )

    return rows.map(row => ({
      entry: {
        id: row.id,
        category: row.category as MemoryCategory,
        content: row.content,
        keywords: JSON.parse(row.keywords),
        source: row.source,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        accessCount: row.access_count,
        metadata: row.metadata ? JSON.parse(row.metadata) : undefined
      },
      score: 1.0 // FTS5 不直接返回分数，使用默认值
    }))
  }

  /**
   * 获取分类记忆
   */
  async getByCategory(category: MemoryCategory, limit = 50): Promise<MemoryEntry[]> {
    const rows = this._db.all<{
      id: string
      category: string
      content: string
      keywords: string
      source: string
      created_at: number
      updated_at: number
      access_count: number
      metadata: string | null
    }>(
      'SELECT * FROM memories WHERE category = ? ORDER BY updated_at DESC LIMIT ?',
      category, limit
    )

    return rows.map(row => ({
      id: row.id,
      category: row.category as MemoryCategory,
      content: row.content,
      keywords: JSON.parse(row.keywords),
      source: row.source,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      accessCount: row.access_count,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined
    }))
  }

  /**
   * 获取单个记忆
   */
  async get(id: string): Promise<MemoryEntry | null> {
    const row = this._db.get<{
      id: string
      category: string
      content: string
      keywords: string
      source: string
      created_at: number
      updated_at: number
      access_count: number
      metadata: string | null
    }>(
      'SELECT * FROM memories WHERE id = ?',
      id
    )

    if (!row) return null

    return {
      id: row.id,
      category: row.category as MemoryCategory,
      content: row.content,
      keywords: JSON.parse(row.keywords),
      source: row.source,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      accessCount: row.access_count,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined
    }
  }

  /**
   * 删除记忆
   */
  async delete(id: string): Promise<boolean> {
    const result = this._db.run(
      'DELETE FROM memories WHERE id = ?',
      id
    )
    return result.changes > 0
  }

  /**
   * 更新访问计数
   */
  async touch(id: string): Promise<void> {
    this._db.run(
      'UPDATE memories SET access_count = access_count + 1 WHERE id = ?',
      id
    )
  }

  /**
   * 关闭存储
   */
  async close(): Promise<void> {
    this._db.close()
    log.info('SqliteMemoryStore 已关闭')
  }
}

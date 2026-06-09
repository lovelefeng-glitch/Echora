/**
 * SQLite 会话存储实现
 * 
 * 实现 SessionStore 接口，使用 SQLite + FTS5 存储会话和消息
 * 
 * 来源：Sprint 11 Phase 1 - Echora Agent 核心能力提升
 * 输出：SqliteSessionStore 类
 * 依赖：./sqlite.ts, ./interfaces.ts, ./schema.ts
 */

import { randomUUID } from 'node:crypto'
import { create } from '../utils/console-logger'
import type { SQLiteDatabase } from './sqlite'
import type {
  SessionStore,
  Session,
  Message,
  MessageSearchResult,
  MessageRole
} from './interfaces'

const log = create('SqliteSessionStore')

/**
 * SQLite 会话存储实现
 */
export class SqliteSessionStore implements SessionStore {
  private _db: SQLiteDatabase

  constructor(db: SQLiteDatabase) {
    this._db = db
    log.info('SqliteSessionStore 已初始化')
  }

  /**
   * 创建会话
   */
  async createSession(agentKey: string, title?: string): Promise<Session> {
    const id = randomUUID()
    const now = Date.now()

    this._db.run(
      `INSERT INTO sessions (id, agent_key, title, created_at, updated_at, message_count)
       VALUES (?, ?, ?, ?, ?, 0)`,
      id, agentKey, title || `会话 ${new Date(now).toLocaleString('zh-CN')}`, now, now
    )

    log.info(`创建会话: ${id} (agent: ${agentKey})`)

    return {
      id,
      agentKey,
      title: title || `会话 ${new Date(now).toLocaleString('zh-CN')}`,
      createdAt: now,
      updatedAt: now,
      messageCount: 0
    }
  }

  /**
   * 获取会话
   */
  async getSession(sessionId: string): Promise<Session | null> {
    const row = this._db.get<{
      id: string
      agent_key: string
      title: string
      created_at: number
      updated_at: number
      message_count: number
      metadata: string | null
    }>(
      'SELECT * FROM sessions WHERE id = ?',
      sessionId
    )

    if (!row) return null

    return {
      id: row.id,
      agentKey: row.agent_key,
      title: row.title,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      messageCount: row.message_count,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined
    }
  }

  /**
   * 列出会话
   */
  async listSessions(agentKey: string, limit = 50): Promise<Session[]> {
    const rows = this._db.all<{
      id: string
      agent_key: string
      title: string
      created_at: number
      updated_at: number
      message_count: number
      metadata: string | null
    }>(
      'SELECT * FROM sessions WHERE agent_key = ? ORDER BY updated_at DESC LIMIT ?',
      agentKey, limit
    )

    return rows.map(row => ({
      id: row.id,
      agentKey: row.agent_key,
      title: row.title,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      messageCount: row.message_count,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined
    }))
  }

  /**
   * 删除会话
   */
  async deleteSession(sessionId: string): Promise<boolean> {
    const result = this._db.run(
      'DELETE FROM sessions WHERE id = ?',
      sessionId
    )
    return result.changes > 0
  }

  /**
   * 更新会话标题
   */
  async updateSessionTitle(sessionId: string, title: string): Promise<void> {
    this._db.run(
      'UPDATE sessions SET title = ?, updated_at = ? WHERE id = ?',
      title, Date.now(), sessionId
    )
  }

  /**
   * 添加消息
   */
  async addMessage(
    sessionId: string,
    message: Omit<Message, 'id' | 'sessionId' | 'createdAt'>
  ): Promise<Message> {
    const id = randomUUID()
    const now = Date.now()

    this._db.transaction(() => {
      // 插入消息
      this._db.run(
        `INSERT INTO messages (id, session_id, role, content, created_at, metadata)
         VALUES (?, ?, ?, ?, ?, ?)`,
        id, sessionId, message.role, message.content, now,
        message.metadata ? JSON.stringify(message.metadata) : null
      )

      // 更新会话的更新时间和消息数量
      this._db.run(
        `UPDATE sessions 
         SET updated_at = ?, message_count = message_count + 1 
         WHERE id = ?`,
        now, sessionId
      )
    })

    return {
      id,
      sessionId,
      role: message.role,
      content: message.content,
      createdAt: now,
      metadata: message.metadata
    }
  }

  /**
   * 获取消息历史
   */
  async getMessages(sessionId: string, limit = 100): Promise<Message[]> {
    const rows = this._db.all<{
      id: string
      session_id: string
      role: string
      content: string
      created_at: number
      metadata: string | null
    }>(
      'SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC LIMIT ?',
      sessionId, limit
    )

    return rows.map(row => ({
      id: row.id,
      sessionId: row.session_id,
      role: row.role as MessageRole,
      content: row.content,
      createdAt: row.created_at,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined
    }))
  }

  /**
   * 搜索消息（FTS5 全文搜索）
   */
  async searchMessages(query: string, sessionId?: string): Promise<MessageSearchResult[]> {
    let sql: string
    let params: (string | number)[]

    if (sessionId) {
      // 在指定会话中搜索
      sql = `
        SELECT m.*, highlight(messages_fts, 0, '<mark>', '</mark>') as snippet
        FROM messages_fts
        JOIN messages m ON messages_fts.rowid = m.rowid
        WHERE messages_fts MATCH ? AND m.session_id = ?
        ORDER BY rank
        LIMIT 50
      `
      params = [query, sessionId]
    } else {
      // 在所有会话中搜索
      sql = `
        SELECT m.*, highlight(messages_fts, 0, '<mark>', '</mark>') as snippet
        FROM messages_fts
        JOIN messages m ON messages_fts.rowid = m.rowid
        WHERE messages_fts MATCH ?
        ORDER BY rank
        LIMIT 50
      `
      params = [query]
    }

    const rows = this._db.all<{
      id: string
      session_id: string
      role: string
      content: string
      created_at: number
      metadata: string | null
      snippet: string
    }>(sql, ...params)

    return rows.map(row => ({
      message: {
        id: row.id,
        sessionId: row.session_id,
        role: row.role as MessageRole,
        content: row.content,
        createdAt: row.created_at,
        metadata: row.metadata ? JSON.parse(row.metadata) : undefined
      },
      score: 1.0, // FTS5 不直接返回分数，使用默认值
      snippet: row.snippet
    }))
  }

  /**
   * 关闭存储
   */
  async close(): Promise<void> {
    this._db.close()
    log.info('SqliteSessionStore 已关闭')
  }
}

/**
 * Session Manager
 * 管理 Agent 会话的持久化存储
 * 使用 JSONL 格式存储对话历史，元数据存储为 JSON 索引文件
 * 来源：Agent 模块  |  输出：Session CRUD API  |  依赖：fs, path, console-logger
 */

import * as fs from 'fs'
import * as path from 'path'
import { create } from '../utils/console-logger'
import type { TokenUsage } from '../llm/types'

const log = create('SessionManager')

/** 会话元数据 */
export interface SessionMeta {
  /** 会话唯一标识 */
  id: string
  /** 会话标题 */
  title: string
  /** 关联的 Agent ID */
  agentId?: string
  /** 创建时间（Unix 时间戳） */
  createdAt: number
  /** 最后活跃时间（Unix 时间戳） */
  updatedAt: number
  /** 累计 Token 使用量 */
  tokenUsage: TokenUsage
  /** 消息总数 */
  messageCount: number
}

/** 会话消息记录（JSONL 格式） */
export interface SessionMessage {
  /** 消息角色 */
  role: 'system' | 'user' | 'assistant' | 'tool'
  /** 消息内容 */
  content: string
  /** 时间戳 */
  timestamp: number
  /** 模型名称（可选） */
  model?: string
  /** Token 使用量（可选） */
  tokenUsage?: TokenUsage
}

/** 完整会话（元数据 + 消息） */
export interface Session extends SessionMeta {
  /** 会话消息列表 */
  messages: SessionMessage[]
}

/** SessionManager 配置 */
export interface SessionManagerConfig {
  /** 数据存储根目录 */
  dataDir: string
  /** 是否启用详细日志 */
  verbose?: boolean
}

/**
 * SessionManager
 * 管理 Agent 会话的持久化存储
 * - 元数据存储为 JSON 索引文件 (sessions-index.json)
 * - 消息存储为 JSONL 文件 (sessions/{sessionId}.jsonl)
 * - 单例模式，确保全局唯一实例
 */
export class SessionManager {
  private static _instance: SessionManager | null = null

  private _config: SessionManagerConfig
  private _sessionsDir: string
  private _indexPath: string
  /** 内存中的会话元数据索引 */
  private _index = new Map<string, SessionMeta>()
  /** 缓存已加载的会话消息（避免重复读取文件） */
  private _messageCache = new Map<string, SessionMessage[]>()
  private _dirty = false

  private constructor(config: SessionManagerConfig) {
    this._config = config
    this._sessionsDir = path.join(config.dataDir, 'sessions')
    this._indexPath = path.join(config.dataDir, 'sessions-index.json')
    this._ensureDirectories()
    this._loadIndex()
  }

  /**
   * 获取单例实例
   */
  static getInstance(config?: SessionManagerConfig): SessionManager {
    if (!SessionManager._instance) {
      if (!config) {
        throw new Error('SessionManager 未初始化，请先调用 getInstance(config)')
      }
      SessionManager._instance = new SessionManager(config)
    }
    return SessionManager._instance
  }

  /**
   * 重置单例实例（仅用于测试）
   */
  static resetInstance(): void {
    SessionManager._instance = null
  }

  // ─── CRUD API ───────────────────────────────────────────────

  /**
   * 获取所有会话列表（按最后活跃时间倒序）
   * @param agentId 可选，按 Agent ID 过滤
   * @returns 会话元数据数组
   */
  listSessions(agentId?: string): SessionMeta[] {
    let sessions = Array.from(this._index.values())

    if (agentId) {
      sessions = sessions.filter(s => s.agentId === agentId)
    }

    // 按 updatedAt 倒序排列
    sessions.sort((a, b) => b.updatedAt - a.updatedAt)

    if (this._config.verbose) {
      log.info(`列出 ${sessions.length} 个会话${agentId ? ` (Agent: ${agentId})` : ''}`)
    }

    return sessions
  }

  /**
   * 加载指定会话（含消息）
   * @param sessionId 会话 ID
   * @returns 完整会话数据，不存在则返回 null
   */
  loadSession(sessionId: string): Session | null {
    const meta = this._index.get(sessionId)
    if (!meta) {
      log.warn(`会话不存在: ${sessionId}`)
      return null
    }

    const messages = this._loadMessages(sessionId)

    log.info(`加载会话: ${sessionId} (${messages.length} 条消息)`)

    return {
      ...meta,
      messages
    }
  }

  /**
   * 创建新会话
   * @param title 会话标题（可选，默认自动生成）
   * @param agentId 关联的 Agent ID（可选）
   * @returns 新会话的元数据
   */
  createSession(title?: string, agentId?: string): SessionMeta {
    const id = this._generateSessionId()
    const now = Date.now()

    const meta: SessionMeta = {
      id,
      title: title || this._generateDefaultTitle(now),
      agentId,
      createdAt: now,
      updatedAt: now,
      tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      messageCount: 0
    }

    this._index.set(id, meta)
    this._dirty = true
    this._saveIndex()

    // 创建空的 JSONL 文件
    this._touchJsonlFile(id)

    log.info(`创建会话: ${id} (标题: "${meta.title}")`)

    return meta
  }

  /**
   * 向会话追加一条消息
   * @param sessionId 会话 ID
   * @param message 消息记录
   * @returns 是否成功
   */
  appendMessage(sessionId: string, message: SessionMessage): boolean {
    const meta = this._index.get(sessionId)
    if (!meta) {
      log.warn(`追加消息失败，会话不存在: ${sessionId}`)
      return false
    }

    // 写入 JSONL 文件
    this._appendJsonl(sessionId, message)

    // 更新内存缓存
    let cached = this._messageCache.get(sessionId)
    if (!cached) {
      cached = this._loadMessages(sessionId)
      this._messageCache.set(sessionId, cached)
    }
    cached.push(message)

    // 更新元数据
    meta.updatedAt = Date.now()
    meta.messageCount = cached.length

    // 累加 Token 使用量
    if (message.tokenUsage) {
      meta.tokenUsage.promptTokens += message.tokenUsage.promptTokens
      meta.tokenUsage.completionTokens += message.tokenUsage.completionTokens
      meta.tokenUsage.totalTokens += message.tokenUsage.totalTokens
    }

    this._dirty = true
    this._saveIndex()

    if (this._config.verbose) {
      log.info(
        `[Session:${sessionId}] 追加消息 (role: ${message.role}), ` +
        `当前消息数: ${meta.messageCount}`
      )
    }

    return true
  }

  /**
   * 批量追加消息
   * @param sessionId 会话 ID
   * @param messages 消息数组
   * @returns 成功追加的消息数
   */
  appendMessages(sessionId: string, messages: SessionMessage[]): number {
    let count = 0
    for (const msg of messages) {
      if (this.appendMessage(sessionId, msg)) {
        count++
      }
    }
    return count
  }

  /**
   * 更新会话元数据
   * @param sessionId 会话 ID
   * @param updates 需要更新的字段
   * @returns 是否成功
   */
  updateSessionMeta(
    sessionId: string,
    updates: Partial<Pick<SessionMeta, 'title' | 'agentId'>>
  ): boolean {
    const meta = this._index.get(sessionId)
    if (!meta) {
      log.warn(`更新元数据失败，会话不存在: ${sessionId}`)
      return false
    }

    if (updates.title !== undefined) meta.title = updates.title
    if (updates.agentId !== undefined) meta.agentId = updates.agentId
    meta.updatedAt = Date.now()

    this._dirty = true
    this._saveIndex()

    log.info(`更新会话元数据: ${sessionId}`)
    return true
  }

  /**
   * 删除会话（含消息文件）
   * @param sessionId 会话 ID
   * @returns 是否成功
   */
  deleteSession(sessionId: string): boolean {
    const meta = this._index.get(sessionId)
    if (!meta) {
      log.warn(`删除会话失败，会话不存在: ${sessionId}`)
      return false
    }

    // 删除 JSONL 文件
    const jsonlPath = this._getJsonlPath(sessionId)
    try {
      if (fs.existsSync(jsonlPath)) {
        fs.unlinkSync(jsonlPath)
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      log.error(`删除 JSONL 文件失败: ${msg}`)
    }

    // 清除内存缓存
    this._messageCache.delete(sessionId)

    // 从索引中移除
    this._index.delete(sessionId)
    this._dirty = true
    this._saveIndex()

    log.info(`删除会话: ${sessionId} (标题: "${meta.title}")`)
    return true
  }

  /**
   * 清空指定 Agent 的所有会话
   * @param agentId Agent ID
   * @returns 删除的会话数量
   */
  clearAgentSessions(agentId: string): number {
    const sessions = this.listSessions(agentId)
    let count = 0
    for (const session of sessions) {
      if (this.deleteSession(session.id)) {
        count++
      }
    }
    log.info(`清空 Agent "${agentId}" 的 ${count} 个会话`)
    return count
  }

  /**
   * 获取指定会话的消息列表
   * @param sessionId 会话 ID
   * @param limit 限制返回数量（可选，默认全部）
   * @returns 消息数组，不存在则返回空数组
   */
  getMessages(sessionId: string, limit?: number): SessionMessage[] {
    const messages = this._loadMessages(sessionId)
    if (limit && limit > 0) {
      return messages.slice(-limit)
    }
    return messages
  }

  /**
   * 获取会话统计信息
   * @param sessionId 会话 ID
   * @returns 统计信息，不存在则返回 null
   */
  getSessionStats(sessionId: string): {
    messageCount: number
    totalTokens: TokenUsage
    duration: number
  } | null {
    const meta = this._index.get(sessionId)
    if (!meta) return null

    return {
      messageCount: meta.messageCount,
      totalTokens: { ...meta.tokenUsage },
      duration: meta.updatedAt - meta.createdAt
    }
  }

  /**
   * 搜索会话（按标题关键字）
   * @param keyword 搜索关键字
   * @param agentId 可选，按 Agent ID 过滤
   * @returns 匹配的会话元数据数组
   */
  searchSessions(keyword: string, agentId?: string): SessionMeta[] {
    const lowerKeyword = keyword.toLowerCase()
    let sessions = Array.from(this._index.values())

    if (agentId) {
      sessions = sessions.filter(s => s.agentId === agentId)
    }

    return sessions
      .filter(s => s.title.toLowerCase().includes(lowerKeyword))
      .sort((a, b) => b.updatedAt - a.updatedAt)
  }

  /**
   * 刷新索引到磁盘
   */
  flush(): void {
    if (this._dirty) {
      this._saveIndex()
      log.info('索引已刷新到磁盘')
    }
  }

  /**
   * 获取所有会话总数
   */
  getSessionCount(): number {
    return this._index.size
  }

  // ─── 内部方法 ───────────────────────────────────────────────

  /**
   * 确保目录存在
   */
  private _ensureDirectories(): void {
    const dataDir = this._config.dataDir
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true })
      log.info(`创建数据目录: ${dataDir}`)
    }
    if (!fs.existsSync(this._sessionsDir)) {
      fs.mkdirSync(this._sessionsDir, { recursive: true })
      log.info(`创建会话目录: ${this._sessionsDir}`)
    }
  }

  /**
   * 从磁盘加载会话索引
   */
  private _loadIndex(): void {
    this._index.clear()

    if (!fs.existsSync(this._indexPath)) {
      log.info('会话索引文件不存在，使用空索引')
      return
    }

    try {
      const raw = fs.readFileSync(this._indexPath, 'utf-8')
      const data = JSON.parse(raw) as Record<string, SessionMeta>

      for (const [id, meta] of Object.entries(data)) {
        this._index.set(id, meta)
      }

      log.info(`加载会话索引: ${this._index.size} 个会话`)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      log.error(`加载会话索引失败: ${msg}`)
    }
  }

  /**
   * 保存会话索引到磁盘
   */
  private _saveIndex(): void {
    try {
      const data: Record<string, SessionMeta> = {}
      for (const [id, meta] of this._index) {
        data[id] = meta
      }

      fs.writeFileSync(this._indexPath, JSON.stringify(data, null, 2), 'utf-8')
      this._dirty = false
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      log.error(`保存会话索引失败: ${msg}`)
    }
  }

  /**
   * 获取 JSONL 文件路径
   */
  private _getJsonlPath(sessionId: string): string {
    return path.join(this._sessionsDir, `${sessionId}.jsonl`)
  }

  /**
   * 从 JSONL 文件加载消息
   * 优先从缓存读取
   */
  private _loadMessages(sessionId: string): SessionMessage[] {
    // 检查内存缓存
    const cached = this._messageCache.get(sessionId)
    if (cached) {
      return cached
    }

    const jsonlPath = this._getJsonlPath(sessionId)
    if (!fs.existsSync(jsonlPath)) {
      return []
    }

    try {
      const raw = fs.readFileSync(jsonlPath, 'utf-8')
      const lines = raw.split('\n').filter(line => line.trim().length > 0)
      const messages: SessionMessage[] = []

      for (const line of lines) {
        try {
          const msg = JSON.parse(line) as SessionMessage
          messages.push(msg)
        } catch {
          // 跳过格式错误的行
          log.warn(`跳过格式错误的 JSONL 行: ${line.substring(0, 100)}`)
        }
      }

      // 存入缓存
      this._messageCache.set(sessionId, messages)

      return messages
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      log.error(`加载 JSONL 文件失败 (${sessionId}): ${msg}`)
      return []
    }
  }

  /**
   * 追加一条消息到 JSONL 文件
   */
  private _appendJsonl(sessionId: string, message: SessionMessage): void {
    const jsonlPath = this._getJsonlPath(sessionId)

    try {
      const line = JSON.stringify(message) + '\n'
      fs.appendFileSync(jsonlPath, line, 'utf-8')
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      log.error(`追加 JSONL 消息失败 (${sessionId}): ${msg}`)
    }
  }

  /**
   * 创建空的 JSONL 文件
   */
  private _touchJsonlFile(sessionId: string): void {
    const jsonlPath = this._getJsonlPath(sessionId)
    try {
      if (!fs.existsSync(jsonlPath)) {
        fs.writeFileSync(jsonlPath, '', 'utf-8')
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      log.error(`创建 JSONL 文件失败 (${sessionId}): ${msg}`)
    }
  }

  /**
   * 生成会话 ID
   * 格式：sess_{timestamp}_{random}
   */
  private _generateSessionId(): string {
    const timestamp = Date.now()
    const random = Math.random().toString(36).substring(2, 8)
    return `sess_${timestamp}_${random}`
  }

  /**
   * 生成默认会话标题
   */
  private _generateDefaultTitle(timestamp: number): string {
    const date = new Date(timestamp)
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    return `新会话 ${month}-${day} ${hours}:${minutes}`
  }
}

/**
 * 获取全局 SessionManager 实例
 * @param config 首次调用时需提供配置
 */
export function getSessionManager(config?: SessionManagerConfig): SessionManager {
  return SessionManager.getInstance(config)
}

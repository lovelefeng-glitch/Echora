/**
 * 存储层接口定义
 * 
 * 设计原则：接口驱动，策略可替换
 * - SessionStore: 会话存储接口（SQLite 实现，后期可换）
 * - MemoryStore: 记忆存储接口（SQLite 实现，后期可换向量/图）
 * - ContextCompressor: 上下文压缩接口（摘要实现，后期可换分层/语义）
 * 
 * 来源：Sprint 11 Phase 1 - Echora Agent 核心能力提升
 * 输出：所有存储层的统一接口
 * 依赖：无
 */

// ============================================================
// 通用类型
// ============================================================

/** 消息角色 */
export type MessageRole = 'user' | 'assistant' | 'system'

/** 记忆分类 */
export type MemoryCategory = 'fact' | 'preference' | 'decision' | 'skill' | 'context'

// ============================================================
// 会话相关类型
// ============================================================

/** 会话 */
export interface Session {
  /** 会话唯一 ID */
  id: string
  /** Agent 标识（如 'echora', 'hermes', 'openclaw'） */
  agentKey: string
  /** 会话标题 */
  title: string
  /** 创建时间（毫秒时间戳） */
  createdAt: number
  /** 更新时间（毫秒时间戳） */
  updatedAt: number
  /** 消息数量 */
  messageCount: number
  /** 扩展元数据（JSON） */
  metadata?: Record<string, unknown>
}

/** 消息 */
export interface Message {
  /** 消息唯一 ID */
  id: string
  /** 所属会话 ID */
  sessionId: string
  /** 消息角色 */
  role: MessageRole
  /** 消息内容 */
  content: string
  /** 创建时间（毫秒时间戳） */
  createdAt: number
  /** 扩展元数据（JSON，包含 tool_calls, usage 等） */
  metadata?: Record<string, unknown>
}

/** 消息搜索结果 */
export interface MessageSearchResult {
  /** 匹配的消息 */
  message: Message
  /** 匹配的相关性分数（0~1） */
  score: number
  /** 匹配的片段（高亮） */
  snippet: string
}

// ============================================================
// 记忆相关类型
// ============================================================

/** 记忆条目 */
export interface MemoryEntry {
  /** 记忆唯一 ID */
  id: string
  /** 记忆分类 */
  category: MemoryCategory
  /** 记忆内容 */
  content: string
  /** 关键词列表 */
  keywords: string[]
  /** 来源标识 */
  source: string
  /** 创建时间（毫秒时间戳） */
  createdAt: number
  /** 更新时间（毫秒时间戳） */
  updatedAt: number
  /** 访问次数 */
  accessCount: number
  /** 扩展元数据（JSON） */
  metadata?: Record<string, unknown>
}

/** 记忆搜索结果 */
export interface MemorySearchResult {
  /** 匹配的记忆条目 */
  entry: MemoryEntry
  /** 匹配的相关性分数（0~1） */
  score: number
}

// ============================================================
// 压缩相关类型
// ============================================================

/** 压缩后的上下文 */
export interface CompressedContext {
  /** 保留的消息 */
  kept: Message[]
  /** 摘要（如果有） */
  summary?: string
  /** 压缩比（0~1，1 表示无压缩） */
  ratio: number
  /** 压缩策略名称 */
  strategy: string
}

// ============================================================
// 存储接口
// ============================================================

/** 会话存储接口 */
export interface SessionStore {
  /** 创建会话 */
  createSession(agentKey: string, title?: string): Promise<Session>
  /** 获取会话 */
  getSession(sessionId: string): Promise<Session | null>
  /** 列出会话 */
  listSessions(agentKey: string, limit?: number): Promise<Session[]>
  /** 删除会话 */
  deleteSession(sessionId: string): Promise<boolean>
  /** 更新会话标题 */
  updateSessionTitle(sessionId: string, title: string): Promise<void>

  /** 添加消息 */
  addMessage(sessionId: string, message: Omit<Message, 'id' | 'sessionId' | 'createdAt'>): Promise<Message>
  /** 获取消息历史 */
  getMessages(sessionId: string, limit?: number): Promise<Message[]>
  /** 搜索消息（全文搜索） */
  searchMessages(query: string, sessionId?: string): Promise<MessageSearchResult[]>

  /** 关闭存储 */
  close(): Promise<void>
}

/** 记忆存储接口 */
export interface MemoryStore {
  /** 保存记忆 */
  save(entry: Omit<MemoryEntry, 'id' | 'createdAt' | 'updatedAt' | 'accessCount'>): Promise<MemoryEntry>
  /** 搜索记忆（关键词搜索） */
  search(query: string, limit?: number): Promise<MemorySearchResult[]>
  /** 获取分类记忆 */
  getByCategory(category: MemoryCategory, limit?: number): Promise<MemoryEntry[]>
  /** 获取单个记忆 */
  get(id: string): Promise<MemoryEntry | null>
  /** 删除记忆 */
  delete(id: string): Promise<boolean>
  /** 更新访问计数 */
  touch(id: string): Promise<void>

  /** 关闭存储 */
  close(): Promise<void>
}

/** 上下文压缩器接口 */
export interface ContextCompressor {
  /** 压缩器名称 */
  readonly name: string

  /** 检查是否需要压缩 */
  shouldCompress(messages: Message[], tokenCount: number): boolean

  /** 执行压缩 */
  compress(messages: Message[]): Promise<CompressedContext>

  /** 估算压缩后的 token 数 */
  estimateTokens(compressed: CompressedContext): number
}

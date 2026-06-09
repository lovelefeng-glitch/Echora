/**
 * 存储层模块入口
 * 
 * 导出所有存储相关的类型、接口和实现
 * 
 * 来源：Sprint 11 Phase 1 - Echora Agent 核心能力提升
 * 输出：统一的存储层 API
 * 依赖：./interfaces.ts, ./sqlite.ts, ./schema.ts
 */

// 接口和类型
export type {
  MessageRole,
  MemoryCategory,
  Session,
  Message,
  MessageSearchResult,
  MemoryEntry,
  MemorySearchResult,
  CompressedContext,
  SessionStore,
  MemoryStore,
  ContextCompressor
} from './interfaces'

// SQLite 数据库封装
export { SQLiteDatabase, createSQLiteDB } from './sqlite'
export type { SQLiteConfig } from './sqlite'

// Schema 定义
export { createSchema, needsUpgrade, SCHEMA_VERSION } from './schema'

// SQLite 存储实现
export { SqliteSessionStore } from './sqlite-session-store'
export { SqliteMemoryStore } from './sqlite-memory-store'

// 数据库管理器
export { DatabaseManager, createDatabaseManager } from './db-manager'
export type { DatabaseManagerConfig } from './db-manager'

// 压缩器
export { SummaryCompressor, createSummaryCompressor } from './compressors/summary'
export type { SummaryCompressorConfig } from './compressors/summary'

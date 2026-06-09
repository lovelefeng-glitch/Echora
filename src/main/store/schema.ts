/**
 * 数据库 Schema 定义
 * 
 * 定义 Echora Agent 数据库的表结构、索引和 FTS5 虚拟表
 * 
 * 来源：Sprint 11 Phase 1 - Echora Agent 核心能力提升
 * 输出：createSchema() 函数
 * 依赖：./sqlite.ts
 */

import type { SQLiteDatabase } from './sqlite'

/** Schema 版本号（用于升级管理） */
export const SCHEMA_VERSION = 1

/**
 * 创建数据库 Schema
 * 
 * 包含：
 * - schema_version: 版本管理表
 * - sessions: 会话表
 * - messages: 消息表（含 FTS5 全文搜索）
 * - memories: 记忆表（含 FTS5 全文搜索）
 */
export function createSchema(db: SQLiteDatabase): void {
  db.transaction(() => {
    // 版本管理表
    db.exec(`
      CREATE TABLE IF NOT EXISTS schema_version (
        version INTEGER NOT NULL
      )
    `)

    // 检查当前版本
    const currentVersion = db.get<{ version: number }>('SELECT version FROM schema_version')
    if (currentVersion && currentVersion.version >= SCHEMA_VERSION) {
      return // 已经是最新版本
    }

    // 会话表
    db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        agent_key TEXT NOT NULL,
        title TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        message_count INTEGER DEFAULT 0,
        metadata TEXT
      )
    `)

    // 会话索引
    db.exec('CREATE INDEX IF NOT EXISTS idx_sessions_agent ON sessions(agent_key)')
    db.exec('CREATE INDEX IF NOT EXISTS idx_sessions_updated ON sessions(updated_at DESC)')

    // 消息表
    db.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        metadata TEXT,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
      )
    `)

    // 消息索引
    db.exec('CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, created_at)')

    // 消息 FTS5 全文搜索虚拟表
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
        content,
        content='messages',
        content_rowid='rowid'
      )
    `)

    // FTS5 触发器：插入消息时同步到 FTS
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS messages_fts_insert AFTER INSERT ON messages
      BEGIN
        INSERT INTO messages_fts(rowid, content) VALUES (NEW.rowid, NEW.content);
      END
    `)

    // FTS5 触发器：删除消息时同步删除 FTS
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS messages_fts_delete AFTER DELETE ON messages
      BEGIN
        INSERT INTO messages_fts(messages_fts, rowid, content) VALUES ('delete', OLD.rowid, OLD.content);
      END
    `)

    // FTS5 触发器：更新消息时同步更新 FTS
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS messages_fts_update AFTER UPDATE ON messages
      BEGIN
        INSERT INTO messages_fts(messages_fts, rowid, content) VALUES ('delete', OLD.rowid, OLD.content);
        INSERT INTO messages_fts(rowid, content) VALUES (NEW.rowid, NEW.content);
      END
    `)

    // 记忆表
    db.exec(`
      CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY,
        category TEXT NOT NULL,
        content TEXT NOT NULL,
        keywords TEXT,
        source TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        access_count INTEGER DEFAULT 0,
        metadata TEXT
      )
    `)

    // 记忆索引
    db.exec('CREATE INDEX IF NOT EXISTS idx_memories_category ON memories(category)')
    db.exec('CREATE INDEX IF NOT EXISTS idx_memories_access ON memories(access_count DESC)')

    // 记忆 FTS5 全文搜索虚拟表
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
        content,
        keywords,
        content='memories',
        content_rowid='rowid'
      )
    `)

    // FTS5 触发器：插入记忆时同步到 FTS
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS memories_fts_insert AFTER INSERT ON memories
      BEGIN
        INSERT INTO memories_fts(rowid, content, keywords) VALUES (NEW.rowid, NEW.content, NEW.keywords);
      END
    `)

    // FTS5 触发器：删除记忆时同步删除 FTS
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS memories_fts_delete AFTER DELETE ON memories
      BEGIN
        INSERT INTO memories_fts(memories_fts, rowid, content, keywords) VALUES ('delete', OLD.rowid, OLD.content, OLD.keywords);
      END
    `)

    // FTS5 触发器：更新记忆时同步更新 FTS
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS memories_fts_update AFTER UPDATE ON memories
      BEGIN
        INSERT INTO memories_fts(memories_fts, rowid, content, keywords) VALUES ('delete', OLD.rowid, OLD.content, OLD.keywords);
        INSERT INTO memories_fts(rowid, content, keywords) VALUES (NEW.rowid, NEW.content, NEW.keywords);
      END
    `)

    // 更新版本号
    db.exec('DELETE FROM schema_version')
    db.exec(`INSERT INTO schema_version VALUES (${SCHEMA_VERSION})`)
  })
}

/**
 * 检查数据库是否需要升级
 */
export function needsUpgrade(db: SQLiteDatabase): boolean {
  const currentVersion = db.get<{ version: number }>('SELECT version FROM schema_version')
  return !currentVersion || currentVersion.version < SCHEMA_VERSION
}

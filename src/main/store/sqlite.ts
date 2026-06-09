/**
 * SQLite 数据库封装
 * 
 * 封装 node:sqlite（Node 24 内置），提供：
 * - 同步/异步操作
 * - 事务支持
 * - WAL 模式（并发读写）
 * - 错误处理
 * 
 * 来源：Sprint 11 Phase 1 - Echora Agent 核心能力提升
 * 输出：SQLiteDatabase 类
 * 依赖：node:sqlite（Node 22+ 内置）
 */

import { DatabaseSync } from 'node:sqlite'
import { create } from '../utils/console-logger'

const log = create('SQLite')

/** SQLite 数据库配置 */
export interface SQLiteConfig {
  /** 数据库文件路径（':memory:' 表示内存数据库） */
  path: string
  /** 是否启用 WAL 模式（默认 true） */
  enableWAL?: boolean
  /** 是否启用外键约束（默认 true） */
  enableForeignKeys?: boolean
}

/**
 * SQLite 数据库封装类
 * 
 * 使用 node:sqlite 的 DatabaseSync 实现同步操作
 * 支持 WAL 模式和事务
 */
export class SQLiteDatabase {
  private _db: DatabaseSync
  private _path: string
  private _closed = false

  constructor(config: SQLiteConfig) {
    this._path = config.path
    this._db = new DatabaseSync(config.path)

    // 启用 WAL 模式
    if (config.enableWAL !== false) {
      try {
        this._db.exec('PRAGMA journal_mode=WAL')
        log.info(`WAL 模式已启用: ${config.path}`)
      } catch (e) {
        log.warn(`WAL 模式启用失败，回退到 DELETE 模式: ${(e as Error).message}`)
        this._db.exec('PRAGMA journal_mode=DELETE')
      }
    }

    // 启用外键约束
    if (config.enableForeignKeys !== false) {
      this._db.exec('PRAGMA foreign_keys=ON')
    }

    log.info(`数据库已打开: ${config.path}`)
  }

  /** 获取数据库路径 */
  get path(): string {
    return this._path
  }

  /** 数据库是否已关闭 */
  get closed(): boolean {
    return this._closed
  }

  /**
   * 执行 SQL 语句（无返回值）
   */
  exec(sql: string): void {
    this._ensureOpen()
    this._db.exec(sql)
  }

  /**
   * 执行查询（返回所有结果）
   */
  all<T = Record<string, unknown>>(sql: string, ...params: (string | number | bigint | null | Buffer)[]): T[] {
    this._ensureOpen()
    const stmt = this._db.prepare(sql)
    return stmt.all(...params) as T[]
  }

  /**
   * 执行查询（返回第一行）
   */
  get<T = Record<string, unknown>>(sql: string, ...params: (string | number | bigint | null | Buffer)[]): T | undefined {
    this._ensureOpen()
    const stmt = this._db.prepare(sql)
    return stmt.get(...params) as T | undefined
  }

  /**
   * 执行插入/更新/删除（返回变更行数）
   */
  run(sql: string, ...params: (string | number | bigint | null | Buffer)[]): { changes: number; lastInsertRowid: number | bigint } {
    this._ensureOpen()
    const stmt = this._db.prepare(sql)
    return stmt.run(...params) as { changes: number; lastInsertRowid: number | bigint }
  }

  /**
   * 执行事务
   */
  transaction<T>(fn: () => T): T {
    this._ensureOpen()
    this._db.exec('BEGIN')
    try {
      const result = fn()
      this._db.exec('COMMIT')
      return result
    } catch (e) {
      this._db.exec('ROLLBACK')
      throw e
    }
  }

  /**
   * 关闭数据库
   */
  close(): void {
    if (this._closed) return
    this._db.close()
    this._closed = true
    log.info(`数据库已关闭: ${this._path}`)
  }

  /**
   * 确保数据库未关闭
   */
  private _ensureOpen(): void {
    if (this._closed) {
      throw new Error(`数据库已关闭: ${this._path}`)
    }
  }
}

/**
 * 创建 SQLite 数据库实例
 */
export function createSQLiteDB(config: SQLiteConfig): SQLiteDatabase {
  return new SQLiteDatabase(config)
}

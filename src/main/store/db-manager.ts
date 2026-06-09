/**
 * 数据库管理器
 * 
 * 封装 SQLite 数据库的初始化和生命周期管理
 * 
 * 来源：E2E 测试修复 - SQLite 存储层未集成
 * 输出：DatabaseManager 类
 * 依赖：./sqlite.ts, ./schema.ts
 */

import { join } from 'path'
import { app } from 'electron'
import { create } from '../utils/console-logger'
import { SQLiteDatabase, createSQLiteDB } from './sqlite'
import { createSchema, needsUpgrade } from './schema'

const log = create('DatabaseManager')

/** 数据库管理器配置 */
export interface DatabaseManagerConfig {
  /** 数据库目录（为空则自动使用 app userData） */
  dataDir?: string
  /** 数据库文件名（默认 echora.db） */
  filename?: string
}

/**
 * 数据库管理器
 * 
 * 管理 SQLite 数据库的初始化、升级和生命周期
 */
export class DatabaseManager {
  private static _instance: DatabaseManager | null = null
  private _db: SQLiteDatabase | null = null
  private _config: DatabaseManagerConfig
  private _initialized = false

  private constructor(config?: DatabaseManagerConfig) {
    this._config = {
      filename: 'echora.db',
      ...config
    }
  }

  /**
   * 获取单例实例
   */
  static getInstance(config?: DatabaseManagerConfig): DatabaseManager {
    if (!DatabaseManager._instance) {
      DatabaseManager._instance = new DatabaseManager(config)
    }
    return DatabaseManager._instance
  }

  /**
   * 初始化数据库
   * 
   * 应该在应用启动时调用
   */
  async initialize(): Promise<void> {
    if (this._initialized) {
      log.warn('数据库已初始化，跳过')
      return
    }

    try {
      // 确定数据库路径
      const dataDir = this._config.dataDir || this._resolveDataDir()
      const dbPath = join(dataDir, this._config.filename || 'echora.db')

      log.info(`初始化数据库: ${dbPath}`)

      // 创建数据库实例
      this._db = createSQLiteDB({ path: dbPath })

      // 创建 Schema
      createSchema(this._db)

      // 检查是否需要升级
      if (needsUpgrade(this._db)) {
        log.info('数据库 Schema 需要升级')
        createSchema(this._db)
      }

      this._initialized = true
      log.success('数据库初始化完成')
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error)
      log.error(`数据库初始化失败: ${errMsg}`)
      throw error
    }
  }

  /**
   * 获取数据库实例
   */
  getDatabase(): SQLiteDatabase | null {
    return this._db
  }

  /**
   * 数据库是否已初始化
   */
  get isInitialized(): boolean {
    return this._initialized
  }

  /**
   * 关闭数据库
   */
  async close(): Promise<void> {
    if (this._db) {
      this._db.close()
      this._db = null
      this._initialized = false
      log.info('数据库已关闭')
    }
  }

  /**
   * 解析数据目录
   */
  private _resolveDataDir(): string {
    try {
      if (app && app.isReady && app.isReady()) {
        return app.getPath('userData')
      }
    } catch {
      // 非 Electron 环境
    }
    // fallback: 使用用户主目录下的 .echora
    const home = process.env.USERPROFILE || process.env.HOME || ''
    return join(home, '.echora')
  }
}

/**
 * 创建数据库管理器
 */
export function createDatabaseManager(config?: DatabaseManagerConfig): DatabaseManager {
  return DatabaseManager.getInstance(config)
}

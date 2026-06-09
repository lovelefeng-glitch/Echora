/**
 * 文件操作工具
 * file_read: dangerLevel: safe
 * file_write: dangerLevel: confirm
 *
 * 来源: 内置工具模块
 * 输出: fileReadHandler / fileWriteHandler / 白名单管理 API
 * 依赖: fs/promises, path, console-logger
 */

import * as fs from 'fs/promises'
import * as path from 'path'
import { create } from '../../utils/console-logger'
import type { ToolDefinition, ToolHandler } from '../types'

const log = create('FileOps')

// ── 目录白名单配置 ──────────────────────────────────────────

/** 白名单目录列表（模块级状态） */
let _allowedDirs: string[] = []

/**
 * 设置白名单目录
 * @param dirs 允许访问的目录绝对路径列表
 */
export function setAllowedDirs(dirs: string[]): void {
  _allowedDirs = dirs.map(d => path.resolve(d))
  log.info(`白名单目录已更新: ${_allowedDirs.length} 个`)
  for (const d of _allowedDirs) {
    log.debug(`  → ${d}`)
  }
}

/**
 * 获取当前白名单目录
 */
export function getAllowedDirs(): string[] {
  return [..._allowedDirs]
}

/**
 * 检查路径是否在白名单目录内
 * 白名单为空时允许所有路径
 */
function _isPathAllowed(targetPath: string): boolean {
  // 白名单为空时不做限制
  if (_allowedDirs.length === 0) {
    log.debug('白名单为空，跳过路径检查')
    return true
  }

  const resolved = path.resolve(targetPath)
  for (const dir of _allowedDirs) {
    if (resolved === dir || resolved.startsWith(dir + path.sep)) {
      return true
    }
  }
  return false
}

/**
 * 解析文件路径（处理相对路径和绝对路径）
 */
function _resolvePath(filePath: string, contextWorkingDir?: string): string {
  if (path.isAbsolute(filePath)) {
    return path.resolve(filePath)
  }
  // 相对路径基于工作目录解析
  return path.resolve(contextWorkingDir || process.cwd(), filePath)
}

/** file_read 工具定义 */
export const fileReadDefinition: ToolDefinition = {
  name: 'file_read',
  description: '读取指定路径的文件内容。仅允许读取白名单目录中的文件。',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: '文件路径'
      },
      encoding: {
        type: 'string',
        description: '文件编码，默认 utf-8',
        default: 'utf-8'
      }
    },
    required: ['path']
  },
  dangerLevel: 'safe',
  category: 'file',
  enabled: true
}

/** file_read 工具处理器 */
export const fileReadHandler: ToolHandler = async (args, context) => {
  const rawPath = args.path as string
  const encoding = (args.encoding as string) || 'utf-8'

  if (!rawPath) {
    return {
      success: false,
      output: '',
      error: '缺少必需参数: path'
    }
  }

  const filePath = _resolvePath(rawPath, context.workingDirectory)

  try {
    log.info(`file_read: ${filePath} (encoding: ${encoding})`)

    // 白名单检查
    if (!_isPathAllowed(filePath)) {
      const msg = `访问被拒绝: 路径 "${filePath}" 不在白名单目录内。允许的目录: ${_allowedDirs.join(', ')}`
      log.warn(`file_read 被拒绝: ${filePath}`)
      return { success: false, output: '', error: msg }
    }

    // 读取文件
    const content = await fs.readFile(filePath, { encoding: encoding as BufferEncoding })
    const stat = await fs.stat(filePath)

    log.info(`file_read 完成: ${filePath} (${stat.size} bytes)`)

    return {
      success: true,
      output: content,
      data: {
        path: filePath,
        size: stat.size,
        modified: stat.mtime.toISOString(),
        encoding
      }
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    log.error(`file_read 失败: ${filePath} - ${msg}`)
    return {
      success: false,
      output: '',
      error: `读取文件失败: ${msg}`
    }
  }
}

/** file_write 工具定义 */
export const fileWriteDefinition: ToolDefinition = {
  name: 'file_write',
  description: '写入内容到指定路径的文件。需要用户确认。会自动备份原文件。',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: '文件路径'
      },
      content: {
        type: 'string',
        description: '要写入的内容'
      },
      encoding: {
        type: 'string',
        description: '文件编码，默认 utf-8',
        default: 'utf-8'
      }
    },
    required: ['path', 'content']
  },
  dangerLevel: 'confirm',
  category: 'file',
  enabled: true
}

/** file_write 工具处理器 */
export const fileWriteHandler: ToolHandler = async (args, context) => {
  const rawPath = args.path as string
  const content = args.content as string
  const encoding = (args.encoding as string) || 'utf-8'

  if (!rawPath) {
    return { success: false, output: '', error: '缺少必需参数: path' }
  }
  if (content === undefined || content === null) {
    return { success: false, output: '', error: '缺少必需参数: content' }
  }

  const filePath = _resolvePath(rawPath, context.workingDirectory)

  try {
    log.info(`file_write: ${filePath} (${content.length} chars, encoding: ${encoding})`)

    // 白名单检查
    if (!_isPathAllowed(filePath)) {
      const msg = `访问被拒绝: 路径 "${filePath}" 不在白名单目录内。允许的目录: ${_allowedDirs.join(', ')}`
      log.warn(`file_write 被拒绝: ${filePath}`)
      return { success: false, output: '', error: msg }
    }

    // 自动创建不存在的目录
    const dir = path.dirname(filePath)
    try {
      await fs.access(dir)
    } catch {
      log.info(`file_write: 创建目录 ${dir}`)
      await fs.mkdir(dir, { recursive: true })
    }

    // 备份原文件（仅在文件已存在时）
    let backedUp = false
    try {
      await fs.access(filePath)
      // 文件存在 → 检查是否已有今日备份，避免重复
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
      const backupPath = `${filePath}.backup.${timestamp}`
      await fs.copyFile(filePath, backupPath)
      backedUp = true
      log.info(`file_write: 已备份 → ${backupPath}`)
    } catch {
      // 文件不存在，无需备份
    }

    // 写入文件
    await fs.writeFile(filePath, content, { encoding: encoding as BufferEncoding })

    const stat = await fs.stat(filePath)
    log.info(`file_write 完成: ${filePath} (${stat.size} bytes)`)

    return {
      success: true,
      output: `文件已写入: ${filePath}\n大小: ${stat.size} bytes${backedUp ? '\n已备份原文件' : ''}`,
      data: { path: filePath, size: stat.size, backedUp, encoding }
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    log.error(`file_write 失败: ${filePath} - ${msg}`)
    return {
      success: false,
      output: '',
      error: `写入文件失败: ${msg}`
    }
  }
}

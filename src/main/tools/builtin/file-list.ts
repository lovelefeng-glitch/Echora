/**
 * 文件列表工具
 * file_list: 列出目录内容，支持 glob/正则文件搜索
 * dangerLevel: safe
 *
 * 来源: Sprint 11 Phase 2 - Echora Agent 核心能力提升
 * 输出: fileListDefinition / fileListHandler
 * 依赖: fs/promises, path, console-logger
 */

import * as fs from 'fs/promises'
import * as path from 'path'
import { create } from '../../utils/console-logger'
import type { ToolDefinition, ToolHandler } from '../types'

const log = create('FileList')

/** file_list 工具定义 */
export const fileListDefinition: ToolDefinition = {
  name: 'file_list',
  description: '列出目录内容，支持 glob/正则文件搜索。可以浏览文件系统结构。',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: '目录路径（默认当前工作目录）',
        default: '.'
      },
      pattern: {
        type: 'string',
        description: '文件名匹配模式（支持通配符 * 和 ?）'
      },
      regex: {
        type: 'string',
        description: '正则表达式（优先级高于 pattern）'
      },
      recursive: {
        type: 'boolean',
        description: '是否递归搜索子目录（默认 false）',
        default: false
      },
      max_depth: {
        type: 'number',
        description: '递归最大深度（默认 3）',
        default: 3
      },
      include_hidden: {
        type: 'boolean',
        description: '是否包含隐藏文件（默认 false）',
        default: false
      },
      max_results: {
        type: 'number',
        description: '最大返回数量（默认 100）',
        default: 100
      }
    },
    required: []
  },
  dangerLevel: 'safe',
  category: 'file',
  enabled: true
}

/** 文件信息 */
interface FileInfo {
  name: string
  path: string
  type: 'file' | 'directory' | 'symlink'
  size: number
  modified: number
}

/**
 * 列出目录内容
 */
async function listDirectory(
  dirPath: string,
  options: {
    pattern?: string
    regex?: string
    recursive?: boolean
    maxDepth?: number
    includeHidden?: boolean
    maxResults?: number
    currentDepth?: number
  } = {}
): Promise<FileInfo[]> {
  const {
    pattern,
    regex,
    recursive = false,
    maxDepth = 3,
    includeHidden = false,
    maxResults = 100,
    currentDepth = 0
  } = options

  const results: FileInfo[] = []

  // 检查是否超过最大深度
  if (currentDepth > maxDepth) {
    return results
  }

  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true })

    for (const entry of entries) {
      // 跳过隐藏文件
      if (!includeHidden && entry.name.startsWith('.')) {
        continue
      }

      const fullPath = path.join(dirPath, entry.name)

      // 获取文件信息
      let stats
      try {
        stats = await fs.stat(fullPath)
      } catch {
        // 跳过无法访问的文件
        continue
      }

      const fileInfo: FileInfo = {
        name: entry.name,
        path: fullPath,
        type: entry.isDirectory() ? 'directory' : entry.isSymbolicLink() ? 'symlink' : 'file',
        size: stats.size,
        modified: stats.mtimeMs
      }

      // 应用过滤器
      let matches = true
      if (regex) {
        try {
          const re = new RegExp(regex, 'i')
          matches = re.test(entry.name)
        } catch {
          // 无效正则，跳过
          matches = false
        }
      } else if (pattern) {
        // 简单的通配符匹配
        const regexStr = pattern
          .replace(/\./g, '\\.')
          .replace(/\*/g, '.*')
          .replace(/\?/g, '.')
        const re = new RegExp(`^${regexStr}$`, 'i')
        matches = re.test(entry.name)
      }

      if (matches) {
        results.push(fileInfo)

        // 检查是否超过最大结果数
        if (results.length >= maxResults) {
          return results
        }
      }

      // 递归搜索子目录
      if (recursive && entry.isDirectory()) {
        const subResults = await listDirectory(fullPath, {
          pattern,
          regex,
          recursive,
          maxDepth,
          includeHidden,
          maxResults: maxResults - results.length,
          currentDepth: currentDepth + 1
        })
        results.push(...subResults)
      }
    }
  } catch (error) {
    log.error(`列出目录失败: ${dirPath}`, error)
    throw error
  }

  return results
}

/** file_list 工具处理器 */
export const fileListHandler: ToolHandler = async (args, context) => {
  const dirPath = (args.path as string) || '.'
  const pattern = args.pattern as string | undefined
  const regex = args.regex as string | undefined
  const recursive = (args.recursive as boolean) || false
  const maxDepth = (args.max_depth as number) || 3
  const includeHidden = (args.include_hidden as boolean) || false
  const maxResults = (args.max_results as number) || 100

  // 解析路径
  const resolvedPath = path.isAbsolute(dirPath)
    ? dirPath
    : path.resolve(context.workingDirectory || process.cwd(), dirPath)

  log.info(`列出目录: ${resolvedPath}`)

  try {
    // 检查路径是否存在
    const stats = await fs.stat(resolvedPath)
    if (!stats.isDirectory()) {
      return {
        success: false,
        output: '',
        error: `路径不是目录: ${resolvedPath}`
      }
    }

    // 列出目录内容
    const files = await listDirectory(resolvedPath, {
      pattern,
      regex,
      recursive,
      maxDepth,
      includeHidden,
      maxResults
    })

    // 格式化输出
    const formatted = files.map(f => ({
      name: f.name,
      path: f.path,
      type: f.type,
      size: f.size,
      modified: new Date(f.modified).toISOString()
    }))

    return {
      success: true,
      output: JSON.stringify(formatted, null, 2),
      data: {
        path: resolvedPath,
        count: formatted.length,
        files: formatted
      }
    }
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error)
    log.error(`列出目录失败: ${errMsg}`)
    return {
      success: false,
      output: '',
      error: `列出目录失败: ${errMsg}`
    }
  }
}

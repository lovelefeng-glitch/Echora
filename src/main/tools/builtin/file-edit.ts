/**
 * 文件编辑工具
 * file_edit: 文件局部编辑（find & replace）
 * dangerLevel: confirm
 *
 * 来源: Sprint 11 Phase 2 - Echora Agent 核心能力提升
 * 输出: fileEditDefinition / fileEditHandler
 * 依赖: fs/promises, path, console-logger
 */

import * as fs from 'fs/promises'
import * as path from 'path'
import { create } from '../../utils/console-logger'
import type { ToolDefinition, ToolHandler } from '../types'

const log = create('FileEdit')

/** file_edit 工具定义 */
export const fileEditDefinition: ToolDefinition = {
  name: 'file_edit',
  description: '文件局部编辑（find & replace）。只修改匹配的内容，不重写整个文件。',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: '文件路径'
      },
      old_string: {
        type: 'string',
        description: '要查找的字符串（必须唯一）'
      },
      new_string: {
        type: 'string',
        description: '替换后的字符串'
      },
      replace_all: {
        type: 'boolean',
        description: '是否替换所有匹配（默认 false，只替换第一个）',
        default: false
      },
      encoding: {
        type: 'string',
        description: '文件编码（默认 utf-8）',
        default: 'utf-8'
      }
    },
    required: ['path', 'old_string', 'new_string']
  },
  dangerLevel: 'confirm',
  category: 'file',
  enabled: true
}

/** file_edit 工具处理器 */
export const fileEditHandler: ToolHandler = async (args, context) => {
  const filePath = args.path as string
  const oldString = args.old_string as string
  const newString = args.new_string as string
  const replaceAll = (args.replace_all as boolean) || false
  const encoding = (args.encoding as string) || 'utf-8'

  // 解析路径
  const resolvedPath = path.isAbsolute(filePath)
    ? filePath
    : path.resolve(context.workingDirectory || process.cwd(), filePath)

  log.info(`编辑文件: ${resolvedPath}`)

  try {
    // 检查文件是否存在
    try {
      await fs.access(resolvedPath)
    } catch {
      return {
        success: false,
        output: '',
        error: `文件不存在: ${resolvedPath}`
      }
    }

    // 读取文件内容
    const content = await fs.readFile(resolvedPath, { encoding: encoding as BufferEncoding })

    // 检查是否包含要查找的字符串
    if (!content.includes(oldString)) {
      return {
        success: false,
        output: '',
        error: `文件中未找到要替换的内容`
      }
    }

    // 检查是否唯一（如果不是替换所有）
    if (!replaceAll) {
      const count = content.split(oldString).length - 1
      if (count > 1) {
        return {
          success: false,
          output: '',
          error: `找到 ${count} 处匹配，但未指定 replace_all=true。请提供更多上下文以确保唯一匹配。`
        }
      }
    }

    // 执行替换
    let newContent: string
    let replaceCount: number

    if (replaceAll) {
      // 替换所有匹配
      const parts = content.split(oldString)
      replaceCount = parts.length - 1
      newContent = parts.join(newString)
    } else {
      // 只替换第一个匹配
      const index = content.indexOf(oldString)
      newContent = content.substring(0, index) + newString + content.substring(index + oldString.length)
      replaceCount = 1
    }

    // 写入文件
    await fs.writeFile(resolvedPath, newContent, { encoding: encoding as BufferEncoding })

    log.info(`文件编辑完成: ${resolvedPath} (${replaceCount} 处替换)`)

    return {
      success: true,
      output: `文件编辑成功，替换了 ${replaceCount} 处内容`,
      data: {
        path: resolvedPath,
        replaceCount,
        oldLength: content.length,
        newLength: newContent.length
      }
    }
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error)
    log.error(`文件编辑失败: ${errMsg}`)
    return {
      success: false,
      output: '',
      error: `文件编辑失败: ${errMsg}`
    }
  }
}

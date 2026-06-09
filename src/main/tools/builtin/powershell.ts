/**
 * PowerShell 命令执行工具
 * dangerLevel: dangerous（需要二次确认）
 *
 * 来源: 内置工具模块
 * 输出: powershellExecuteHandler
 * 依赖: child_process, console-logger
 */

import { exec } from 'child_process'
import { create } from '../../utils/console-logger'
import type { ToolDefinition, ToolHandler } from '../types'

const log = create('PowerShell')

/** 默认超时时间（毫秒） */
const DEFAULT_TIMEOUT = 30_000

/** 最大超时时间（毫秒） */
const MAX_TIMEOUT = 300_000

/** powershell_execute 工具定义 */
export const powershellExecuteDefinition: ToolDefinition = {
  name: 'powershell_execute',
  description: '执行 PowerShell 命令并返回输出。支持超时控制和工作目录配置。需要用户确认。',
  parameters: {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: '要执行的 PowerShell 命令'
      },
      timeout: {
        type: 'number',
        description: '超时时间（毫秒），默认 30000，最大 300000',
        default: DEFAULT_TIMEOUT
      },
      cwd: {
        type: 'string',
        description: '工作目录（可选），不传则使用默认工作目录'
      }
    },
    required: ['command']
  },
  dangerLevel: 'dangerous',
  category: 'system',
  enabled: true
}

/** powershell_execute 工具处理器 */
export const powershellExecuteHandler: ToolHandler = async (args, context) => {
  const command = args.command as string
  const rawTimeout = (args.timeout as number) || DEFAULT_TIMEOUT
  const cwd = (args.cwd as string) || context.workingDirectory

  if (!command) {
    return {
      success: false,
      output: '',
      error: '缺少必需参数: command'
    }
  }

  // 限制超时范围
  const timeout = Math.min(Math.max(rawTimeout, 1000), MAX_TIMEOUT)

  log.info(`执行命令: ${command}`)
  log.debug(`超时: ${timeout}ms, 工作目录: ${cwd || '默认'}`)

  const startTime = Date.now()

  return new Promise((resolve) => {
    const child = exec(
      command,
      {
        shell: 'powershell.exe',
        timeout,
        cwd: cwd || undefined,
        maxBuffer: 1024 * 1024 * 10, // 10MB
        encoding: 'utf-8'
      },
      (error, stdout, stderr) => {
        const duration = Date.now() - startTime

        if (error) {
          // 超时错误
          if (error.killed || (error as NodeJS.ErrnoException).code === 'ETIME') {
            log.warn(`命令超时 (${timeout}ms): ${command}`)
            resolve({
              success: false,
              output: stdout || '',
              error: `命令执行超时（${timeout}ms）`,
              duration
            })
            return
          }

          // 命令执行失败（非零退出码）
          const exitCode = (error as { code?: number }).code ?? 'unknown'
          log.error(`命令执行失败 (exit ${exitCode}): ${command}`)
          log.debug(`stderr: ${stderr || '(空)'}`)

          resolve({
            success: false,
            output: stdout || '',
            error: `命令执行失败 (exit ${exitCode}): ${error.message}\n${stderr || ''}`,
            duration
          })
          return
        }

        // 成功
        log.info(`命令执行成功 (${duration}ms)`)
        if (stderr) {
          log.debug(`stderr: ${stderr}`)
        }

        resolve({
          success: true,
          output: stdout || '(无输出)',
          data: {
            command,
            duration,
            cwd: cwd || process.cwd(),
            exitCode: 0
          },
          duration
        })
      }
    )

    // 监控子进程异常
    child.on('error', (err) => {
      log.error(`子进程异常: ${err.message}`)
      resolve({
        success: false,
        output: '',
        error: `子进程启动失败: ${err.message}`,
        duration: Date.now() - startTime
      })
    })
  })
}

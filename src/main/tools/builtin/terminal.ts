/**
 * 终端执行工具
 * terminal: 通用终端执行（bash/cmd）
 * dangerLevel: confirm
 *
 * 来源: Sprint 11 Phase 2 - Echora Agent 核心能力提升
 * 输出: terminalDefinition / terminalHandler
 * 依赖: child_process, os, console-logger
 */

import { exec, spawn } from 'child_process'
import * as os from 'os'
import { create } from '../../utils/console-logger'
import type { ToolDefinition, ToolHandler } from '../types'

const log = create('Terminal')

/** terminal 工具定义 */
export const terminalDefinition: ToolDefinition = {
  name: 'terminal',
  description: '执行终端命令。支持 bash/cmd/PowerShell。可以运行脚本、安装依赖、编译代码等。',
  parameters: {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: '要执行的命令'
      },
      shell: {
        type: 'string',
        description: '使用的 shell（默认自动检测：Windows 用 cmd，其他用 bash）',
        enum: ['bash', 'cmd', 'powershell', 'auto']
      },
      working_directory: {
        type: 'string',
        description: '工作目录（默认当前目录）'
      },
      timeout: {
        type: 'number',
        description: '超时时间（毫秒，默认 30000）',
        default: 30000
      },
      env: {
        type: 'object',
        description: '环境变量（键值对）'
      }
    },
    required: ['command']
  },
  dangerLevel: 'confirm',
  category: 'system',
  enabled: true
}

/**
 * 检测默认 shell
 */
function getDefaultShell(): string {
  const platform = os.platform()
  if (platform === 'win32') {
    return 'cmd'
  }
  return 'bash'
}

/**
 * 执行命令
 */
function executeCommand(
  command: string,
  options: {
    shell?: string
    workingDirectory?: string
    timeout?: number
    env?: Record<string, string>
  } = {}
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    const {
      shell = getDefaultShell(),
      workingDirectory = process.cwd(),
      timeout = 30000,
      env = {}
    } = options

    // 构建完整的环境变量
    const fullEnv = { ...process.env, ...env }

    // 根据 shell 类型构建命令
    let shellCommand: string
    let shellArgs: string[]

    switch (shell) {
      case 'powershell':
        shellCommand = 'powershell.exe'
        shellArgs = ['-Command', command]
        break
      case 'cmd':
        shellCommand = 'cmd.exe'
        shellArgs = ['/c', command]
        break
      case 'bash':
      default:
        shellCommand = 'bash'
        shellArgs = ['-c', command]
        break
    }

    log.info(`执行命令: ${command} (shell: ${shell})`)

    const child = spawn(shellCommand, shellArgs, {
      cwd: workingDirectory,
      env: fullEnv,
      timeout,
      windowsHide: true
    })

    let stdout = ''
    let stderr = ''

    child.stdout?.on('data', (data) => {
      stdout += data.toString()
    })

    child.stderr?.on('data', (data) => {
      stderr += data.toString()
    })

    child.on('close', (code) => {
      resolve({
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        exitCode: code ?? 0
      })
    })

    child.on('error', (error) => {
      reject(error)
    })

    // 超时处理
    setTimeout(() => {
      child.kill('SIGTERM')
      reject(new Error(`命令执行超时 (${timeout}ms)`))
    }, timeout)
  })
}

/** terminal 工具处理器 */
export const terminalHandler: ToolHandler = async (args, context) => {
  const command = args.command as string
  const shell = (args.shell as string) || 'auto'
  const workingDirectory = (args.working_directory as string) || context.workingDirectory || process.cwd()
  const timeout = (args.timeout as number) || 30000
  const env = (args.env as Record<string, string>) || {}

  // 解析 shell
  const resolvedShell = shell === 'auto' ? getDefaultShell() : shell

  log.info(`执行终端命令: ${command}`)

  try {
    const result = await executeCommand(command, {
      shell: resolvedShell,
      workingDirectory,
      timeout,
      env
    })

    const output = result.stdout
    const hasError = result.exitCode !== 0 || result.stderr.length > 0

    return {
      success: result.exitCode === 0,
      output: output || (hasError ? result.stderr : '命令执行完成，无输出'),
      error: hasError ? result.stderr : undefined,
      data: {
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
        shell: resolvedShell,
        workingDirectory
      }
    }
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error)
    log.error(`命令执行失败: ${errMsg}`)
    return {
      success: false,
      output: '',
      error: `命令执行失败: ${errMsg}`
    }
  }
}

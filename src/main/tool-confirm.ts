import { BrowserWindow } from 'electron'
import { create as createLog } from './utils/console-logger'
import { getToolRegistry } from './tools'

const log = createLog('ToolConfirm')

/** 确认请求超时时间（毫秒） */
const CONFIRM_TIMEOUT_MS = 60_000

/** 待处理的确认请求 */
let pendingConfirmResolve: ((confirmed: boolean) => void) | null = null
let pendingConfirmTimer: ReturnType<typeof setTimeout> | null = null

/** 模块级窗口引用获取器 */
let getWindow: () => BrowserWindow | null = () => null

/**
 * 初始化工具确认模块的窗口引用
 */
export function initToolConfirm(getWindowFn: () => BrowserWindow | null): void {
  getWindow = getWindowFn
}

/**
 * 请求用户确认工具操作
 * 通过 IPC 发送确认请求到渲染进程，等待用户响应
 */
export function requestToolConfirm(
  toolName: string,
  args: Record<string, unknown>,
  dangerLevel: string
): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    // 取消之前的待处理请求
    if (pendingConfirmResolve) {
      pendingConfirmResolve(false)
      pendingConfirmResolve = null
    }
    if (pendingConfirmTimer) {
      clearTimeout(pendingConfirmTimer)
      pendingConfirmTimer = null
    }

    pendingConfirmResolve = resolve

    // 构建确认详情
    const details = _buildConfirmDetails(toolName, args)

    // 发送到渲染进程
    const win = getWindow()
    if (win && !win.isDestroyed()) {
      win.webContents.send('tool:confirm-request', {
        toolName,
        dangerLevel,
        args,
        details
      })
    } else {
      // 窗口不可用，自动拒绝
      resolve(false)
      pendingConfirmResolve = null
      return
    }

    // 超时处理
    pendingConfirmTimer = setTimeout(() => {
      log.warn(`工具确认超时 (${CONFIRM_TIMEOUT_MS}ms): ${toolName}`)
      if (pendingConfirmResolve) {
        pendingConfirmResolve(false)
        pendingConfirmResolve = null
      }
    }, CONFIRM_TIMEOUT_MS)
  })
}

/** 根据工具名称和参数构建确认详情 */
function _buildConfirmDetails(toolName: string, args: Record<string, unknown>): string {
  if (toolName === 'file_write') {
    const filePath = args.path as string || '(未知路径)'
    const content = args.content as string || ''
    const preview = content.length > 200 ? content.substring(0, 200) + '...' : content
    return `文件路径: ${filePath}\n内容预览:\n${preview}\n\n写入操作将覆盖目标文件（如有），原文件将自动备份。`
  }
  if (toolName === 'powershell_execute') {
    const command = args.command as string || '(未知命令)'
    const cwd = args.cwd as string || '(默认目录)'
    const timeout = (args.timeout as number) || 30000
    return `命令: ${command}\n工作目录: ${cwd}\n超时: ${timeout}ms\n\n请确认要执行此 PowerShell 命令。`
  }
  return JSON.stringify(args, null, 2)
}

/**
 * 设置 ToolRegistry 的确认回调
 * 在应用启动后调用，确保渲染进程就绪
 */
export function setupToolConfirmCallback(): void {
  const registry = getToolRegistry()
  registry.setConfirmCallback(async (tool, args, _context) => {
    log.info(`工具确认请求: ${tool.name} (危险等级: ${tool.dangerLevel})`)
    return requestToolConfirm(tool.name, args, tool.dangerLevel)
  })
  log.info('工具确认回调已设置')
}

export { pendingConfirmResolve, pendingConfirmTimer, CONFIRM_TIMEOUT_MS }

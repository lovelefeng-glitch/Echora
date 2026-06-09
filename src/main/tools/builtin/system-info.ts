/**
 * 系统信息检测工具
 * 来源：Node.js os 模块 + process.env
 * 输出：操作系统信息、用户名、桌面路径
 * 依赖：os, path, node-versions
 * dangerLevel: safe
 */

import os from 'os'
import path from 'path'
import type { ToolDefinition, ToolHandler } from '../types'
import { create } from '../../utils/console-logger'

const log = create('SystemInfo')

/** system_info 工具定义 */
export const systemInfoDefinition: ToolDefinition = {
  name: 'system_info',
  description: '获取当前操作系统信息，包括 OS 类型、版本、用户名和桌面路径。用于了解运行环境。',
  parameters: {
    type: 'object',
    properties: {},
    required: []
  },
  dangerLevel: 'safe',
  category: 'system',
  enabled: true
}

/** 系统信息结果 */
export interface SystemInfoResult {
  platform: string
  arch: string
  osType: string
  osRelease: string
  osVersion: string
  hostname: string
  username: string
  homeDir: string
  desktopPath: string
  cpuModel: string
  cpuCores: number
  totalMemoryMB: number
  freeMemoryMB: number
  nodeVersion: string
  uptime: number
}

/** 收集系统信息 */
export function collectSystemInfo(): SystemInfoResult {
  log.info('开始收集系统信息')

  const username = process.env.USERNAME || process.env.USER || 'unknown'
  log.info(`检测到用户名: ${username}`)

  const homeDir = os.homedir()
  log.info(`主目录: ${homeDir}`)

  // 计算桌面路径：C:\Users\{username}\Desktop
  const desktopPath = path.join('C:', 'Users', username, 'Desktop')
  log.info(`桌面路径: ${desktopPath}`)

  const platform = os.platform()
  const arch = os.arch()
  const osType = os.type()
  const osRelease = os.release()
  const osVersion = os.version()
  const hostname = os.hostname()
  const cpus = os.cpus()
  const totalMemory = os.totalmem()
  const freeMemory = os.freemem()
  const uptime = os.uptime()

  log.info(`平台: ${platform} (${arch}), 系统: ${osType} ${osRelease}`)

  const result: SystemInfoResult = {
    platform,
    arch,
    osType,
    osRelease,
    osVersion,
    hostname,
    username,
    homeDir,
    desktopPath,
    cpuModel: cpus.length > 0 ? cpus[0].model : 'unknown',
    cpuCores: cpus.length,
    totalMemoryMB: Math.round(totalMemory / (1024 * 1024)),
    freeMemoryMB: Math.round(freeMemory / (1024 * 1024)),
    nodeVersion: process.version,
    uptime: Math.round(uptime)
  }

  log.info('系统信息收集完成', {
    platform: result.platform,
    osType: result.osType,
    username: result.username,
    desktopPath: result.desktopPath
  })

  return result
}

/** system_info 工具处理器 */
export const systemInfoHandler: ToolHandler = async (_args, _context) => {
  try {
    const info = collectSystemInfo()

    const output = [
      `操作系统: ${info.osType} ${info.osRelease} (${info.arch})`,
      `主机名: ${info.hostname}`,
      `用户名: ${info.username}`,
      `主目录: ${info.homeDir}`,
      `桌面路径: ${info.desktopPath}`,
      `CPU: ${info.cpuModel} (${info.cpuCores} 核)`,
      `内存: ${info.totalMemoryMB} MB 总计 / ${info.freeMemoryMB} MB 可用`,
      `Node.js: ${info.nodeVersion}`,
      `运行时间: ${Math.round(info.uptime / 3600)} 小时`
    ].join('\n')

    return {
      success: true,
      output,
      data: info
    }
  } catch (error) {
    log.error('收集系统信息失败', error)
    return {
      success: false,
      output: '',
      error: `系统信息获取失败: ${error instanceof Error ? error.message : String(error)}`
    }
  }
}

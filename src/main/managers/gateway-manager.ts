import { spawn, exec, type ChildProcess } from 'child_process'
import * as path from 'path'
import * as fs from 'fs'
import http from 'http'
import type { BrowserWindow } from 'electron'
import type { GatewayStatusChangeData } from '../../shared/ipc-types'

const TAG = 'Gateway'

interface GatewayConfig {
  port?: number
  env?: Record<string, string>
  [key: string]: unknown
}

interface ProcessInfo {
  process: ChildProcess | null
  pid: number | undefined
  status: string
  aiType: string
  exePath?: string
  port: number
  config?: GatewayConfig
  url?: string
  owned: boolean
  startTime: number
}

interface StartCommand {
  cmd: string
  args: string[]
  cwd: string | undefined
}

interface StatusResult {
  [aiType: string]: {
    status: string
    pid: number | undefined
    port: number
    url: string | null
    owned: boolean
    uptime: number
  }
}

export class GatewayManager {
  private processes = new Map<string, ProcessInfo>()
  private mainWindow: BrowserWindow | null = null

  setMainWindow(win: BrowserWindow): void {
    this.mainWindow = win
  }

  async isPortInUse(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      if (!port) return resolve(false)
      const cmd =
        process.platform === 'win32'
          ? `netstat -ano | findstr :${port} | findstr LISTENING`
          : `lsof -i :${port} -sTCP:LISTEN`
      exec(cmd, { timeout: 3000 }, (_err, stdout) => {
        resolve(!!(stdout && stdout.trim()))
      })
    })
  }

  async killProcessOnPort(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      if (process.platform !== 'win32') return resolve(false)
      exec(
        `netstat -ano | findstr :${port} | findstr LISTENING`,
        { timeout: 3000 },
        (_err, stdout) => {
          const lines = (stdout || '').trim().split('\n')
          let killed = false
          for (const line of lines) {
            const m = line.trim().match(/(\d+)$/)
            if (m) {
              exec(`taskkill /pid ${m[1]} /T /F`, () => {})
              killed = true
            }
          }
          resolve(killed)
        }
      )
    })
  }

  async start(
    aiType: string,
    exePath: string,
    config: GatewayConfig = {}
  ): Promise<{ success: boolean; pid?: number; port?: number; message?: string }> {
    const existing = this.processes.get(aiType)
    if (existing && existing.status === 'running') {
      return { success: true, message: '已在运行中', pid: existing.pid, port: existing.port }
    }

    if (!exePath || !fs.existsSync(exePath)) {
      return { success: false, message: '可执行文件不存在: ' + exePath }
    }

    const port = config.port || (aiType === 'openclaw' ? 18789 : 28789)
    if (await this.isPortInUse(port)) {
      this.log(aiType, 'warn', `端口 ${port} 已被占用，尝试清理...`)
      await this.killProcessOnPort(port)
      await new Promise((r) => setTimeout(r, 2000))
    }

    try {
      const startCmd = this.buildStartCommand(aiType, exePath, config)

      const proc = spawn(startCmd.cmd, startCmd.args, {
        cwd: startCmd.cwd || path.dirname(exePath),
        env: { ...process.env, ...(config.env || {}) },
        windowsHide: true,
        detached: false
      })

      const procInfo: ProcessInfo = {
        process: proc,
        pid: proc.pid,
        status: 'starting',
        aiType,
        exePath,
        port,
        config,
        owned: true,
        startTime: Date.now()
      }
      this.processes.set(aiType, procInfo)
      this.notifyStatusChange(aiType, 'starting')

      proc.on('close', (code) => {
        procInfo.status = 'stopped'
        this.processes.delete(aiType)
        this.notifyStatusChange(aiType, 'stopped', code ?? undefined)
      })
      proc.on('error', (err) => {
        procInfo.status = 'error'
        this.log(aiType, 'error', err.message)
        this.notifyStatusChange(aiType, 'error')
      })

      await this.waitForReady(procInfo, 35000)
      procInfo.status = 'running'
      this.notifyStatusChange(aiType, 'running')
      return { success: true, pid: proc.pid, port }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      return { success: false, message: msg }
    }
  }

  async stop(aiType: string): Promise<{ success: boolean; message?: string }> {
    const procInfo = this.processes.get(aiType)
    if (!procInfo) {
      this.log(aiType, 'info', 'stop: 未在 processes 中找到，返回成功')
      return { success: true, message: '未在运行' }
    }

    this.log(aiType, 'info', `stop: 找到进程 pid=${procInfo.pid}, owned=${procInfo.owned}, hasProcess=${!!procInfo.process}`)

    try {
      if (procInfo.owned && procInfo.process) {
        // Echora 自己启动的进程：直接 kill
        this.log(aiType, 'info', `stop: 使用 process.kill`)
        if (process.platform === 'win32') {
          exec(`taskkill /pid ${procInfo.pid} /T /F`, () => {})
        } else {
          procInfo.process.kill('SIGTERM')
        }
      } else if (procInfo.pid) {
        // 检测到的外部进程：优先用 taskkill 按 PID 杀
        if (process.platform === 'win32' && procInfo.pid) {
          this.log(aiType, 'info', `stop: 使用 taskkill /pid ${procInfo.pid}`)
          await new Promise<void>((resolve) => {
            exec(`taskkill /pid ${procInfo.pid} /T /F`, (err, stdout, stderr) => {
              if (err) this.log(aiType, 'warn', `taskkill 失败: ${err.message}`)
              if (stderr) this.log(aiType, 'warn', `taskkill stderr: ${stderr}`)
              if (stdout) this.log(aiType, 'info', `taskkill stdout: ${stdout}`)
              resolve()
            })
          })
        } else if (procInfo.exePath) {
          this.log(aiType, 'info', `stop: 使用 cliStop`)
          await this.cliStop(aiType, procInfo.exePath)
        }
      }

      this.processes.delete(aiType)
      this.notifyStatusChange(aiType, 'stopped')
      this.log(aiType, 'info', 'stop: 已通知状态变更')
      return { success: true }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      this.log(aiType, 'error', `stop 异常: ${msg}`)
      return { success: false, message: msg }
    }
  }

  async restart(aiType: string): Promise<{ success: boolean; message?: string }> {
    const procInfo = this.processes.get(aiType)
    if (!procInfo) {
      return { success: false, message: '该 AI 未配置，无法重启' }
    }

    this.log(aiType, 'info', '正在重启...')

    try {
      const restarted = await this.cliRestart(aiType, procInfo.exePath!, procInfo.port)
      if (restarted) {
        await new Promise((r) => setTimeout(r, 3000))
        this.notifyStatusChange(aiType, 'running')
        return { success: true, message: '已通过 CLI 重启' }
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      this.log(aiType, 'warn', 'CLI 重启失败，改用 stop+start: ' + msg)
    }

    await this.stop(aiType)
    await new Promise((r) => setTimeout(r, 2000))
    return this.start(aiType, procInfo.exePath!, procInfo.config || {})
  }

  private buildStartCommand(aiType: string, exePath: string, config: GatewayConfig): StartCommand {
    const isScript = exePath && (exePath.endsWith('.cmd') || exePath.endsWith('.bat'))
    const portArgs = config.port ? ['--port', String(config.port)] : []

    if (aiType === 'openclaw') {
      if (isScript) {
        return { cmd: 'cmd', args: ['/c', exePath, 'gateway', 'start', ...portArgs], cwd: path.dirname(exePath) }
      }
      return { cmd: 'openclaw', args: ['gateway', 'start', ...portArgs], cwd: undefined }
    }

    if (isScript) {
      return { cmd: 'cmd', args: ['/c', exePath, 'gateway', 'start', ...portArgs], cwd: path.dirname(exePath) }
    }
    return { cmd: exePath, args: ['gateway', 'start', ...portArgs], cwd: path.dirname(exePath) }
  }

  private cliStop(aiType: string, exePath: string): Promise<boolean> {
    return new Promise((resolve) => {
      const isScript = exePath && (exePath.endsWith('.cmd') || exePath.endsWith('.bat'))
      let cmd: string
      let args: string[]
      let cwd: string | undefined
      if (aiType === 'openclaw') {
        cmd = isScript ? 'cmd' : 'openclaw'
        args = isScript ? ['/c', exePath, 'gateway', 'stop'] : ['gateway', 'stop']
        cwd = isScript ? path.dirname(exePath) : undefined
      } else {
        cmd = isScript ? 'cmd' : exePath || 'qclaw'
        args = isScript ? ['/c', exePath, 'gateway', 'stop'] : ['gateway', 'stop']
        cwd = isScript ? path.dirname(exePath) : exePath ? path.dirname(exePath) : undefined
      }
      const proc = spawn(cmd, args, { cwd, windowsHide: true })
      proc.on('close', () => resolve(true))
      proc.on('error', () => resolve(false))
      setTimeout(() => {
        try {
          proc.kill()
        } catch {}
        resolve(false)
      }, 8000)
    })
  }

  private cliRestart(aiType: string, exePath: string, _port: number): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const isScript = exePath && (exePath.endsWith('.cmd') || exePath.endsWith('.bat'))
      let cmd: string
      let args: string[]
      let cwd: string | undefined
      if (aiType === 'openclaw') {
        cmd = isScript ? 'cmd' : 'openclaw'
        args = isScript ? ['/c', exePath, 'gateway', 'restart'] : ['gateway', 'restart']
        cwd = isScript ? path.dirname(exePath) : undefined
      } else {
        cmd = isScript ? 'cmd' : exePath || 'qclaw'
        args = isScript ? ['/c', exePath, 'gateway', 'restart'] : ['gateway', 'restart']
        cwd = isScript ? path.dirname(exePath) : exePath ? path.dirname(exePath) : undefined
      }
      const proc = spawn(cmd, args, { cwd, windowsHide: true })
      proc.on('close', (code) => {
        if (code === 0) resolve(true)
        else reject(new Error('CLI restart 退出码 ' + code))
      })
      proc.on('error', (err) => reject(err))
      setTimeout(() => {
        try {
          proc.kill()
        } catch {}
        reject(new Error('timeout'))
      }, 10000)
    })
  }

  private waitForReady(procInfo: ProcessInfo, timeoutMs: number): Promise<void> {
    const port = procInfo.port
    const start = Date.now()
    return new Promise((resolve, reject) => {
      const check = (): void => {
        if (Date.now() - start > timeoutMs) return reject(new Error('网关启动超时'))
        const req = http.get(`http://127.0.0.1:${port}/health`, { timeout: 3000 }, (res) => {
          if (res.statusCode === 200) {
            res.resume()
            return resolve()
          }
          res.resume()
          setTimeout(check, 1000)
        })
        req.on('error', () => setTimeout(check, 1000))
        req.setTimeout(3000, () => {
          req.destroy()
          setTimeout(check, 1000)
        })
      }
      check()
    })
  }

  attach(aiType: string, info: { pid: number; port: number; url?: string }): void {
    const existing = this.processes.get(aiType)
    if (existing) {
      // 更新 PID 和端口（进程可能被外部重启，PID 变化）
      existing.pid = info.pid
      existing.port = info.port
      existing.url = info.url
      return
    }
    this.processes.set(aiType, {
      process: null,
      pid: info.pid,
      status: 'running',
      aiType,
      port: info.port,
      url: info.url,
      owned: false,
      startTime: Date.now()
    })
    this.log(aiType, 'debug', `已接管运行中的网关 (PID ${info.pid}, 端口 ${info.port})`)
    this.notifyStatusChange(aiType, 'running')
  }

  getAllStatus(): StatusResult {
    const status: StatusResult = {}
    for (const [aiType, info] of this.processes) {
      status[aiType] = {
        status: info.status,
        pid: info.pid,
        port: info.port,
        url: info.url || (info.port ? `http://127.0.0.1:${info.port}` : null),
        owned: info.owned !== false,
        uptime: Date.now() - info.startTime
      }
    }
    return status
  }

  async checkAlive(aiType: string): Promise<boolean> {
    const info = this.processes.get(aiType)
    if (!info) return false
    if (info.port) {
      return new Promise((resolve) => {
        const req = http.get(
          `http://127.0.0.1:${info.port}/health`,
          { timeout: 2000 },
          (res) => {
            res.resume()
            resolve(res.statusCode === 200)
          }
        )
        req.on('error', () => resolve(false))
        req.setTimeout(2000, () => {
          req.destroy()
          resolve(false)
        })
      })
    }
    return true
  }

  shutdownAll(): void {
    for (const [aiType, info] of this.processes) {
      if (info.owned) this.stop(aiType)
      else this.log(aiType, 'info', '跳过外部进程')
    }
  }

  private log(aiType: string, channel: string, message: string): void {
    console.log(`[${TAG}] [${aiType}:${channel}] ${message}`)
  }

  private notifyStatusChange(aiType: string, status: string, extra?: number | string): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      const data: GatewayStatusChangeData & { extra?: number | string; timestamp: number } = {
        aiType,
        status,
        extra,
        timestamp: Date.now()
      }
      this.mainWindow.webContents.send('gateway:statusChange', data)
    }
  }
}

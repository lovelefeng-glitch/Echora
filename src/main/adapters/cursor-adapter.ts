import { spawn, execSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  BaseAdapter,
  type AdapterAgentItem,
  type StartResult,
  type StopResult,
  type StatusResult,
  type SendMessageResult
} from './base-adapter'

interface CursorRunningInfo {
  pid: number
}

export class CursorAdapter extends BaseAdapter {
  constructor(config: ConstructorParameters<typeof BaseAdapter>[0] = {}) {
    super(config)
    this.name = 'cursor'
    this._log = this._log
  }

  async start(): Promise<StartResult> {
    const alreadyRunning = await this._isCursorRunning()
    if (alreadyRunning) {
      this.status = 'running'
      return { success: true, message: 'Cursor 已在运行', pid: alreadyRunning.pid }
    }

    const exePath = this.config.exePath || this._findCursorPath()
    if (!exePath) {
      return { success: false, message: '未找到 Cursor 可执行文件，请手动指定路径' }
    }

    try {
      const proc = spawn(exePath, [], {
        detached: true,
        stdio: 'ignore',
        cwd: path.dirname(exePath),
        windowsHide: false
      })
      proc.unref()

      this.status = 'running'
      return { success: true, message: 'Cursor 已启动', pid: proc.pid }
    } catch (e) {
      this.status = 'error'
      return { success: false, message: `启动 Cursor 失败: ${(e as Error).message}` }
    }
  }

  async stop(): Promise<StopResult> {
    try {
      const pid = await this._getCursorPid()
      if (pid) {
        process.kill(pid, 'SIGTERM')
      }
    } catch (_e) { /* suppress */ }
    this.status = 'offline'
    return { success: true }
  }

  async getStatus(): Promise<StatusResult> {
    const running = await this._isCursorRunning()
    if (running) {
      this.status = 'running'
      return { status: 'running', pid: running.pid, uptime: 0 }
    }
    this.status = 'offline'
    return { status: 'offline' }
  }

  async listAgents(): Promise<AdapterAgentItem[]> {
    return [
      {
        id: 'cursor-default',
        name: 'Cursor AI',
        description: 'Cursor 内置 AI 助手（需在 Cursor 内直接对话）'
      }
    ]
  }

  async sendMessage(_agentId: string, _message: string): Promise<SendMessageResult> {
    return {
      success: false,
      message:
        'Cursor 不支持外部 API 调用，请在 Cursor 窗口内直接对话。可通过 Cursor Composer (Ctrl+I) 进行 AI 交互。'
    }
  }

  private _findCursorPath(): string | null {
    const candidates = [
      path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'Cursor', 'Cursor.exe'),
      path.join(os.homedir(), 'AppData', 'Local', 'cursor', 'Cursor.exe'),
      'C:\\Program Files\\Cursor\\Cursor.exe'
    ]
    for (const p of candidates) {
      if (fs.existsSync(p)) return p
    }
    return null
  }

  private async _isCursorRunning(): Promise<CursorRunningInfo | null> {
    try {
      const raw = execSync(
        'powershell -NoProfile -Command "Get-Process -Name Cursor -ErrorAction SilentlyContinue | Select-Object Id | ConvertTo-Json -Compress"',
        { encoding: 'utf8', timeout: 5000, maxBuffer: 1024 * 1024 }
      ).trim()

      if (!raw) return null
      const parsed = JSON.parse(raw)
      if (!parsed) return null
      const info = Array.isArray(parsed) ? parsed[0] : parsed
      return info ? { pid: info.Id } : null
    } catch (_e) {
      return null
    }
  }

  private async _getCursorPid(): Promise<number | null> {
    const running = await this._isCursorRunning()
    return running ? running.pid : null
  }
}

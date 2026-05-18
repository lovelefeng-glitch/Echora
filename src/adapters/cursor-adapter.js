// Cursor 适配器 v0.1
// Cursor 是基于 VS Code 的 AI IDE，没有标准 HTTP Gateway API
// 此适配器提供进程检测和启动能力，对话功能待 Cursor Extension API 成熟后接入

const BaseAdapter = require('./base-adapter');
const { spawn, execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

class CursorAdapter extends BaseAdapter {
  constructor(config = {}) {
    super(config);
    this.name = 'cursor';
  }

  /**
   * 启动 Cursor
   */
  async start() {
    const alreadyRunning = await this._isCursorRunning();
    if (alreadyRunning) {
      this.status = 'running';
      return { success: true, message: 'Cursor 已在运行', pid: alreadyRunning.pid };
    }

    const exePath = this.config.exePath || this._findCursorPath();
    if (!exePath) {
      return { success: false, message: '未找到 Cursor 可执行文件，请手动指定路径' };
    }

    try {
      const proc = spawn(exePath, [], {
        detached: true,
        stdio: 'ignore',
        cwd: path.dirname(exePath),
        windowsHide: false,
      });
      proc.unref();

      this.status = 'running';
      return { success: true, message: 'Cursor 已启动', pid: proc.pid };
    } catch (e) {
      this.status = 'error';
      return { success: false, message: `启动 Cursor 失败: ${e.message}` };
    }
  }

  /**
   * 停止 Cursor
   */
  async stop() {
    try {
      const pid = await this._getCursorPid();
      if (pid) {
        process.kill(pid, 'SIGTERM');
      }
    } catch (e) {}
    this.status = 'offline';
    return { success: true };
  }

  /**
   * 获取状态
   */
  async getStatus() {
    const running = await this._isCursorRunning();
    if (running) {
      this.status = 'running';
      return { status: 'running', pid: running.pid, uptime: 0 };
    }
    this.status = 'offline';
    return { status: 'offline' };
  }

  /**
   * 枚举 Agent —— Cursor 无外部 Agent API
   */
  async listAgents() {
    return [
      { id: 'cursor-default', name: 'Cursor AI', description: 'Cursor 内置 AI 助手（需在 Cursor 内直接对话）' },
    ];
  }

  /**
   * 发送消息 —— Cursor 无外部对话 API
   */
  async sendMessage(agentId, message) {
    return {
      success: false,
      message: 'Cursor 不支持外部 API 调用，请在 Cursor 窗口内直接对话。可通过 Cursor Composer (Ctrl+I) 进行 AI 交互。',
    };
  }

  // ========== 私有方法 ==========

  _findCursorPath() {
    const candidates = [
      path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'Cursor', 'Cursor.exe'),
      path.join(os.homedir(), 'AppData', 'Local', 'cursor', 'Cursor.exe'),
      'C:\\Program Files\\Cursor\\Cursor.exe',
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) return p;
    }
    return null;
  }

  async _isCursorRunning() {
    try {
      const raw = execSync(
        'powershell -NoProfile -Command "Get-Process -Name Cursor -ErrorAction SilentlyContinue | Select-Object Id | ConvertTo-Json -Compress"',
        { encoding: 'utf8', timeout: 5000, maxBuffer: 1024 * 1024 }
      ).trim();

      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed) return null;
      // 可能是单个进程或数组
      const info = Array.isArray(parsed) ? parsed[0] : parsed;
      return info ? { pid: info.Id } : null;
    } catch (e) {
      return null;
    }
  }

  async _getCursorPid() {
    const running = await this._isCursorRunning();
    return running ? running.pid : null;
  }
}

module.exports = CursorAdapter;
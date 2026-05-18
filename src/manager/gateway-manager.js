// 网关管理器 - 管理各个 AI 软件的网关进程生命周期
// v0.3: 修复 OpenClaw CLI 命令、端口冲突检测、.cmd 文件支持

const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');

class GatewayManager {
  constructor() {
    this.processes = new Map();  // aiType -> { process, pid, status, port, owned, exePath }
    this.mainWindow = null;
  }

  setMainWindow(win) {
    this.mainWindow = win;
  }

  // ==================== 端口/进程检测 ====================

  /**
   * 检测端口是否已被占用（LISTEN 状态）
   */
  async isPortInUse(port) {
    return new Promise((resolve) => {
      if (!port) return resolve(false);
      const cmd = process.platform === 'win32'
        ? `netstat -ano | findstr :${port} | findstr LISTENING`
        : `lsof -i :${port} -sTCP:LISTEN`;
      exec(cmd, { timeout: 3000 }, (err, stdout) => {
        resolve(!!(stdout && stdout.trim()));
      });
    });
  }

  /**
   * 终止占用指定端口的进程（Windows: taskkill）
   */
  async killProcessOnPort(port) {
    return new Promise((resolve) => {
      if (process.platform !== 'win32') return resolve(false);
      exec(`netstat -ano | findstr :${port} | findstr LISTENING`, { timeout: 3000 }, (err, stdout) => {
        const lines = (stdout || '').trim().split('\n');
        let killed = false;
        for (const line of lines) {
          const m = line.trim().match(/(\d+)$/);
          if (m) {
            exec(`taskkill /pid ${m[1]} /T /F`, () => {});
            killed = true;
          }
        }
        resolve(killed);
      });
    });
  }

  // ==================== 启动 / 停止 / 重启 ====================

  /**
   * 启动网关
   * - 已运行则跳过
   * - 端口被占用则先清理
   */
  async start(aiType, exePath, config = {}) {
    const existing = this.processes.get(aiType);
    if (existing && existing.status === 'running') {
      return { success: true, message: '已在运行中', pid: existing.pid, port: existing.port };
    }

    if (!exePath || !fs.existsSync(exePath)) {
      return { success: false, message: '可执行文件不存在: ' + exePath };
    }

    // 端口冲突检测
    const port = config.port || (aiType === 'openclaw' ? 18789 : 28789);
    if (await this.isPortInUse(port)) {
      this.log(aiType, 'warn', `端口 ${port} 已被占用，尝试清理...`);
      await this.killProcessOnPort(port);
      await new Promise(r => setTimeout(r, 2000));
    }

    try {
      const startCmd = this._buildStartCommand(aiType, exePath, config);

      const proc = spawn(startCmd.cmd, startCmd.args, {
        cwd: startCmd.cwd || path.dirname(exePath),
        env: { ...process.env, ...(config.env || {}) },
        windowsHide: true,
        detached: false,
      });

      const procInfo = {
        process: proc,
        pid: proc.pid,
        status: 'starting',
        aiType,
        exePath,
        port,
        config,
        owned: true,
        startTime: Date.now(),
      };
      this.processes.set(aiType, procInfo);

      proc.on('close', (code) => {
        procInfo.status = 'stopped';
        this.processes.delete(aiType);
        this.notifyStatusChange(aiType, 'stopped', code);
      });
      proc.on('error', (err) => {
        procInfo.status = 'error';
        this.log(aiType, 'error', err.message);
        this.notifyStatusChange(aiType, 'error', err.message);
      });

      // 等待网关就绪
      await this._waitForReady(procInfo, 20000);
      procInfo.status = 'running';
      this.notifyStatusChange(aiType, 'running');
      return { success: true, pid: proc.pid, port };

    } catch (err) {
      return { success: false, message: err.message };
    }
  }

  /**
   * 停止网关
   */
  async stop(aiType) {
    const procInfo = this.processes.get(aiType);
    if (!procInfo) {
      return { success: true, message: '未在运行' };
    }

    try {
      if (procInfo.owned && procInfo.process) {
        // Echora 启动的进程
        if (process.platform === 'win32') {
          exec(`taskkill /pid ${procInfo.pid} /T /F`, () => {});
        } else {
          procInfo.process.kill('SIGTERM');
        }
      } else if (procInfo.pid) {
        // 外部进程：尝试用 CLI 停止（OpenClaw/QClaw 支持 gateway stop）
        await this._cliStop(aiType, procInfo.exePath);
      }

      this.processes.delete(aiType);
      this.notifyStatusChange(aiType, 'stopped');
      return { success: true };
    } catch (err) {
      return { success: false, message: err.message };
    }
  }

  /**
   * 重启网关
   * 优先用 CLI 的 restart 命令，失败则 stop + start
   */
  async restart(aiType) {
    const procInfo = this.processes.get(aiType);
    if (!procInfo) {
      return { success: false, message: '该 AI 未配置，无法重启' };
    }

    this.log(aiType, 'info', '正在重启...');

    // 方式1：CLI restart 命令
    try {
      const restarted = await this._cliRestart(aiType, procInfo.exePath, procInfo.port);
      if (restarted) {
        await new Promise(r => setTimeout(r, 3000));
        this.notifyStatusChange(aiType, 'running');
        return { success: true, message: '已通过 CLI 重启' };
      }
    } catch (e) {
      this.log(aiType, 'warn', 'CLI 重启失败，改用 stop+start: ' + e.message);
    }

    // 方式2：stop + start
    await this.stop(aiType);
    await new Promise(r => setTimeout(r, 2000));
    return this.start(aiType, procInfo.exePath, procInfo.config || {});
  }

  // ==================== CLI 命令构建 ====================

  /**
   * 构建启动命令
   * OpenClaw: 用 openclaw CLI（cmd /c 包装 .cmd 文件）
   * QClaw: 直接执行 exe，或 cmd /c 包装 .cmd
   */
  _buildStartCommand(aiType, exePath, config) {
    const isScript = exePath && (exePath.endsWith('.cmd') || exePath.endsWith('.bat'));
    const portArgs = config.port ? ['--port', String(config.port)] : [];

    if (aiType === 'openclaw') {
      // OpenClaw：优先用 PATH 中的 openclaw 命令
      if (isScript) {
        return { cmd: 'cmd', args: ['/c', exePath, 'gateway', 'start', ...portArgs], cwd: path.dirname(exePath) };
      }
      // 假设 openclaw 在 PATH 中
      return { cmd: 'openclaw', args: ['gateway', 'start', ...portArgs], cwd: undefined };
    }

    // QClaw 或其他
    if (isScript) {
      return { cmd: 'cmd', args: ['/c', exePath, 'gateway', 'start', ...portArgs], cwd: path.dirname(exePath) };
    }
    return { cmd: exePath, args: ['gateway', 'start', ...portArgs], cwd: path.dirname(exePath) };
  }

  /**
   * CLI 停止（openclaw gateway stop / qclaw gateway stop）
   */
  _cliStop(aiType, exePath) {
    return new Promise((resolve) => {
      const isScript = exePath && (exePath.endsWith('.cmd') || exePath.endsWith('.bat'));
      let cmd, args, cwd;
      if (aiType === 'openclaw') {
        cmd = isScript ? 'cmd' : 'openclaw';
        args = isScript ? ['/c', exePath, 'gateway', 'stop'] : ['gateway', 'stop'];
        cwd = isScript ? path.dirname(exePath) : undefined;
      } else {
        cmd = isScript ? 'cmd' : (exePath || 'qclaw');
        args = isScript ? ['/c', exePath, 'gateway', 'stop'] : ['gateway', 'stop'];
        cwd = isScript ? path.dirname(exePath) : (exePath ? path.dirname(exePath) : undefined);
      }
      const proc = spawn(cmd, args, { cwd, windowsHide: true });
      proc.on('close', () => resolve(true));
      proc.on('error', () => resolve(false));
      setTimeout(() => { try { proc.kill(); } catch (e) {} resolve(false); }, 8000);
    });
  }

  /**
   * CLI 重启（openclaw gateway restart）
   */
  _cliRestart(aiType, exePath, port) {
    return new Promise((resolve, reject) => {
      const isScript = exePath && (exePath.endsWith('.cmd') || exePath.endsWith('.bat'));
      let cmd, args, cwd;
      if (aiType === 'openclaw') {
        cmd = isScript ? 'cmd' : 'openclaw';
        args = isScript ? ['/c', exePath, 'gateway', 'restart'] : ['gateway', 'restart'];
        cwd = isScript ? path.dirname(exePath) : undefined;
      } else {
        // QClaw 不一定支持 restart 子命令，尝试一下
        cmd = isScript ? 'cmd' : (exePath || 'qclaw');
        args = isScript ? ['/c', exePath, 'gateway', 'restart'] : ['gateway', 'restart'];
        cwd = isScript ? path.dirname(exePath) : (exePath ? path.dirname(exePath) : undefined);
      }
      const proc = spawn(cmd, args, { cwd, windowsHide: true });
      proc.on('close', (code) => {
        if (code === 0) resolve(true);
        else reject(new Error('CLI restart 退出码 ' + code));
      });
      proc.on('error', (err) => reject(err));
      setTimeout(() => { try { proc.kill(); } catch (e) {} reject(new Error('timeout')); }, 10000);
    });
  }

  /**
   * 等待网关就绪（轮询 /health）
   */
  _waitForReady(procInfo, timeoutMs) {
    const port = procInfo.port;
    const start = Date.now();
    return new Promise((resolve, reject) => {
      const check = () => {
        if (Date.now() - start > timeoutMs) return reject(new Error('网关启动超时'));
        const req = http.get(`http://127.0.0.1:${port}/health`, { timeout: 3000 }, (res) => {
          if (res.statusCode === 200) { res.resume(); return resolve(); }
          res.resume();
          setTimeout(check, 1000);
        });
        req.on('error', () => setTimeout(check, 1000));
        req.setTimeout(3000, () => { req.destroy(); setTimeout(check, 1000); });
      };
      check();
    });
  }

  // ==================== 状态查询 ====================

  /**
   * 接管已运行的网关（不启动新进程）
   */
  attach(aiType, info) {
    if (this.processes.has(aiType)) return;
    this.processes.set(aiType, {
      process: null,
      pid: info.pid,
      status: 'running',
      aiType,
      port: info.port,
      url: info.url,
      owned: false,
      startTime: Date.now(),
    });
    this.log(aiType, 'info', `已接管运行中的网关 (PID ${info.pid}, 端口 ${info.port})`);
    this.notifyStatusChange(aiType, 'running');
  }

  getAllStatus() {
    const status = {};
    for (const [aiType, info] of this.processes) {
      status[aiType] = {
        status: info.status,
        pid: info.pid,
        port: info.port,
        url: info.url || (info.port ? `http://127.0.0.1:${info.port}` : null),
        owned: info.owned !== false,
        uptime: Date.now() - info.startTime,
      };
    }
    return status;
  }

  async checkAlive(aiType) {
    const info = this.processes.get(aiType);
    if (!info) return false;
    if (info.port) {
      return new Promise((resolve) => {
        const req = http.get(`http://127.0.0.1:${info.port}/health`, { timeout: 2000 }, (res) => {
          res.resume();
          resolve(res.statusCode === 200);
        });
        req.on('error', () => resolve(false));
        req.setTimeout(2000, () => { req.destroy(); resolve(false); });
      });
    }
    return true;
  }

  shutdownAll() {
    for (const [aiType, info] of this.processes) {
      if (info.owned) this.stop(aiType);
      else this.log(aiType, 'info', '跳过外部进程');
    }
  }

  // ==================== 工具 ====================

  log(aiType, channel, message) {
    console.log(`[GatewayManager][${aiType}:${channel}] ${message}`);
  }

  notifyStatusChange(aiType, status, extra) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('gateway:statusChange', {
        aiType, status, extra, timestamp: Date.now(),
      });
    }
  }
}

module.exports = GatewayManager;

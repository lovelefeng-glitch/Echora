// Hermes 适配器 v1.0
// 对接 Hermes API Server（OpenAI 兼容端点）
// 依赖：Node 内置 http 模块 + js-yaml（配置解析）

const BaseAdapter = require('./base-adapter');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');
const yaml = require('js-yaml');

class HermesAdapter extends BaseAdapter {
  /**
   * @param {object} config - { exePath, port, token, baseUrl? }
   */
  constructor(config = {}) {
    super(config);
    this.name = 'hermes';
    this.token = config.token || process.env.API_SERVER_KEY || '';
    this.baseUrl = config.baseUrl || `http://127.0.0.1:${config.port || 8642}`;
    this._proc = null;
    this._chatEndpoint = '/v1/chat/completions'; // Hermes 使用标准 OpenAI 端点
    this._requestTimeout = 120000; // Hermes 可能处理复杂任务
    this._sessionId = null;
  }

  /**
   * 设置 Hermes session ID（用于上下文维持）
   * @param {string} sessionId
   */
  setSessionId(sessionId) {
    this._sessionId = sessionId;
  }

  /**
   * 启动 Hermes API Server
   * 命令: hermes gateway run --platform api_server
   */
  async start() {
    const alive = await this.getStatus();
    if (alive.status === 'running') {
      return { success: true, message: 'Hermes API Server 已在运行' };
    }

    const exePath = this.config.exePath || this.config.execPath || '';
    if (!exePath) {
      return { success: false, message: '未配置 Hermes 可执行文件路径' };
    }

    // 启动参数：gateway run --platform api_server
    const args = ['gateway', 'run', '--platform', 'api_server'];
    if (this.config.port) {
      args.push('--port', String(this.config.port));
    }
    // 如果有 profile，也加上
    if (this.config.profile) {
      args.push('-p', this.config.profile);
    }

    // 环境变量：API Server 相关配置
    const env = { ...process.env };
    if (this.token) {
      env.API_SERVER_KEY = this.token;
    }
    env.API_SERVER_ENABLED = 'true';
    if (this.config.port) {
      env.API_SERVER_PORT = String(this.config.port);
    }

    const cwd = path.dirname(exePath);
    if (fs.existsSync(cwd)) {
      // 尝试定位 hermes 可执行文件
      const hermesBin = process.platform === 'win32' ? 'hermes.exe' : 'hermes';
      const fullExe = fs.existsSync(path.join(cwd, hermesBin))
        ? path.join(cwd, hermesBin)
        : exePath;

      this._proc = spawn(fullExe, args, {
        cwd,
        env,
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } else {
      this._proc = spawn(exePath, args, {
        env,
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    }

    this.status = 'starting';

    try {
      await this._waitForReady(20000);
      return { success: true, message: 'Hermes API Server 启动成功' };
    } catch (e) {
      this.status = 'error';
      return { success: false, message: e.message };
    }
  }

  async stop() {
    if (this._proc) {
      try { this._proc.kill('SIGTERM'); } catch (e) {}
      this._proc = null;
    }
    this.status = 'offline';
    return { success: true };
  }

  /**
   * 获取 Hermes API Server 状态
   */
  async getStatus() {
    try {
      const data = await this._httpGet('/health');
      if (data && (data.ok || data.status === 'ok' || data.status === 'running')) {
        this.status = 'running';
        return { status: 'running', uptime: data.uptime || 0, hasChatAPI: true };
      }
    } catch (e) {
      // /health 可能不存在，尝试 /v1/models 作为备选
      try {
        const data = await this._httpGet('/v1/models');
        if (data && (data.data || data.object === 'list')) {
          this.status = 'running';
          return { status: 'running', hasChatAPI: true };
        }
      } catch (e2) {}
    }
    this.status = 'offline';
    return { status: 'offline' };
  }

  /**
   * 枚举 Agent
   * 从 Hermes 配置中读取 agents 列表
   */
  async listAgents() {
    const home = process.env.USERPROFILE || process.env.HOME || '~';
    const configPath = path.join(home, 'AppData', 'Local', 'hermes', 'config.yaml');

    try {
      if (fs.existsSync(configPath)) {
        const raw = fs.readFileSync(configPath, 'utf8');
        const config = yaml.load(raw);
        const agents = [];
        if (config.agents && Array.isArray(config.agents)) {
          for (const a of config.agents) {
            agents.push({
              id: a.id || a.name || `hermes-agent-${agents.length}`,
              name: a.name || a.id || `Agent ${agents.length + 1}`,
              description: a.description || '',
            });
          }
        }
        return agents;
      }
    } catch (e) {
      console.warn('[HermesAdapter] listAgents config error:', e.message);
    }

    // 保底：返回默认 agent
    return [{ id: 'hermes-default', name: 'Hermes', description: 'Default Hermes Agent' }];
  }

  /**
   * 发送消息（非流式）
   * @param {string} agentId
   * @param {string} message
   * @param {string} userId - 用于 X-Hermes-Session-Id
   */
  async sendMessage(agentId, message, userId) {
    const body = JSON.stringify({
      model: agentId || 'hermes-default',
      messages: [{ role: 'user', content: message }],
      stream: false,
      max_tokens: 4096,
    });

    try {
      const data = await this._httpPost('/v1/chat/completions', body, userId);
      if (data && data.choices && data.choices[0]) {
        const content = data.choices[0].message.content;
        return { success: true, content, messageId: data.id };
      }
      return { success: false, message: '无效的响应格式' };
    } catch (e) {
      return { success: false, message: e.message };
    }
  }

  /**
   * 发送消息（流式 / SSE）
   */
  sendMessageStream(agentId, message, callbacks, userId) {
    const { onChunk, onDone, onError } = callbacks || {};

    const body = JSON.stringify({
      model: agentId || 'hermes-default',
      messages: [{ role: 'user', content: message }],
      stream: true,
      max_tokens: 4096,
    });

    const url = new URL(this.baseUrl);
    const endpoint = '/v1/chat/completions';
    const headers = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
      'Accept': 'text/event-stream',
    };
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }
    // Hermes session management
    if (userId || this._sessionId) {
      headers['X-Hermes-Session-Id'] = userId || this._sessionId;
    }

    const options = {
      hostname: url.hostname,
      port: url.port,
      path: endpoint,
      method: 'POST',
      timeout: this._requestTimeout,
      headers,
    };

    let fullContent = '';
    const req = http.request(options, (res) => {
      if (res.statusCode >= 400) {
        let errBody = '';
        res.on('data', c => errBody += c);
        res.on('end', () => {
          if (onError) onError(new Error(`${res.statusCode} ${res.statusMessage}`));
          this._emitMessage({ agentId, role: 'assistant', content: `❌ ${res.statusCode} ${res.statusMessage}`, done: true });
        });
        return;
      }

      let buffer = '';
      res.on('data', (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data: ')) continue;
          const payload = trimmed.slice(6).trim();
          if (payload === '[DONE]') {
            if (onDone) onDone(fullContent);
            this._emitMessage({ agentId, role: 'assistant', content: fullContent, done: true });
            return;
          }
          try {
            const parsed = JSON.parse(payload);
            const delta = parsed.choices?.[0]?.delta?.content || '';
            if (delta) {
              fullContent += delta;
              if (onChunk) onChunk(delta, fullContent);
            }
          } catch (e) {}
        }
      });

      res.on('end', () => {
        if (onDone) onDone(fullContent);
        this._emitMessage({ agentId, role: 'assistant', content: fullContent, done: true });
      });
    });

    req.setTimeout(this._requestTimeout, () => { req.destroy(); if (onError) onError(new Error('请求超时')); });
    req.on('error', (err) => {
      if (onError) onError(err);
      this._emitMessage({ agentId, role: 'assistant', content: `❌ ${err.message}`, done: true });
    });

    req.end(body);
    return req;
  }

  // ========== 私有方法 ==========

  async _waitForReady(timeoutMs) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        const data = await this._httpGet('/health');
        if (data && (data.ok || data.status === 'ok' || data.status === 'running')) {
          this.status = 'running';
          return;
        }
      } catch (e) {
        // 也尝试 /v1/models
        try {
          await this._httpGet('/v1/models');
          this.status = 'running';
          return;
        } catch (e2) {}
      }
      await new Promise(r => setTimeout(r, 1000));
    }
    throw new Error('Hermes API Server 启动超时');
  }

  _httpGet(p) {
    return new Promise((resolve, reject) => {
      const url = new URL(p, this.baseUrl);
      const headers = { 'Accept': 'application/json' };
      if (this.token) {
        headers['Authorization'] = `Bearer ${this.token}`;
      }

      const options = {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method: 'GET',
        timeout: 5000,
        headers,
      };

      http.get(options, (res) => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => {
          try { resolve(JSON.parse(data)); }
          catch (e) { resolve({ raw: data }); }
        });
      }).on('error', reject).setTimeout(5000, function () { this.destroy(); reject(new Error('请求超时')); });
    });
  }

  _httpPost(p, bodyString, userId) {
    return new Promise((resolve, reject) => {
      const url = new URL(p, this.baseUrl);
      const headers = {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyString),
      };
      if (this.token) {
        headers['Authorization'] = `Bearer ${this.token}`;
      }
      if (userId || this._sessionId) {
        headers['X-Hermes-Session-Id'] = userId || this._sessionId;
      }

      const options = {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method: 'POST',
        timeout: this._requestTimeout,
        headers,
      };

      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => {
          if (res.statusCode >= 400) {
            let msg = `${res.statusCode}`;
            if (data && data.length < 200) msg += ` ${data}`;
            reject(new Error(msg));
            return;
          }
          try { resolve(JSON.parse(data)); }
          catch (e) { reject(new Error(`解析失败: ${data.substring(0, 100)}`)); }
        });
      });
      req.setTimeout(this._requestTimeout, () => { req.destroy(); reject(new Error('请求超时')); });
      req.on('error', reject);
      req.end(bodyString);
    });
  }
}

module.exports = HermesAdapter;
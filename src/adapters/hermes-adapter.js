// Hermes 适配器 v3.0
// 通过 Hermes Gateway API Server 对接（端口 8083）
// Hermes 自己管理会话上下文、工具调用、记忆、技能
// Echora 只发最新一条消息，Hermes 从 state.db 加载历史

const BaseAdapter = require('./base-adapter');
const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');
const yaml = require('js-yaml');
const os = require('os');

const DEFAULT_API_PORT = 8083;
const API_KEY = 'echora-shared-secret';

class HermesAdapter extends BaseAdapter {
  constructor(config = {}) {
    super(config);
    this.name = 'hermes';
    this.apiPort = config.port || config.apiPort || DEFAULT_API_PORT;
    this.baseUrl = config.baseUrl || `http://127.0.0.1:${this.apiPort}`;
    this.apiKey = config.apiKey || API_KEY;
    this._proc = null;
    this._requestTimeout = 300000; // Hermes agent 可能执行工具，给 5 分钟
    this._hermesConfig = null;
  }

  // ========== 配置读取 ==========

  _loadHermesConfig() {
    if (this._hermesConfig) return true;
    const hermesRoot = this.config.hermesRoot || path.join(os.homedir(), 'AppData', 'Local', 'hermes');
    const configPath = path.join(hermesRoot, 'config.yaml');
    if (!fs.existsSync(configPath)) return false;
    try {
      this._hermesConfig = yaml.load(fs.readFileSync(configPath, 'utf8'));
      return true;
    } catch (e) {
      console.warn('[HermesAdapter] config.yaml 读取失败:', e.message);
      return false;
    }
  }

  _getHermesExe() {
    const exePath = this.config.exePath || this.config.execPath;
    if (exePath && fs.existsSync(exePath)) return exePath;
    const candidates = [
      path.join(os.homedir(), 'AppData', 'Local', 'hermes', 'hermes-agent', 'venv', 'Scripts', 'hermes.exe'),
      path.join(os.homedir(), 'AppData', 'Local', 'hermes', 'hermes.exe'),
    ];
    for (const c of candidates) { if (fs.existsSync(c)) return c; }
    return null;
  }

  // ========== 生命周期 ==========

  async start() {
    const alive = await this.getStatus();
    if (alive.status === 'running') return { success: true, message: 'Hermes API Server 已在运行' };

    this._loadHermesConfig();

    const hermesExe = this._getHermesExe();
    if (!hermesExe) return { success: false, message: '未找到 Hermes 可执行文件' };

    // 启动 hermes gateway run（会自动开启 API Server）
    const args = ['gateway', 'run', '--replace'];
    this._proc = spawn(hermesExe, args, {
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    this._proc.stdout?.on('data', d => console.log('[Hermes]', d.toString().trim()));
    this._proc.stderr?.on('data', d => console.warn('[Hermes]', d.toString().trim()));

    this.status = 'starting';
    try {
      await this._waitForReady(30000);
      return { success: true, message: 'Hermes API Server 启动成功' };
    } catch (e) {
      this.status = 'error';
      return { success: false, message: e.message };
    }
  }

  async stop() {
    if (this._proc) { try { this._proc.kill('SIGTERM'); } catch (e) {} this._proc = null; }
    try {
      const netstat = execSync('netstat -ano', { encoding: 'utf-8', timeout: 3000 });
      for (const line of netstat.split('\n')) {
        const m = line.match(new RegExp(`TCP\\s+127\\.0\\.0\\.1:${this.apiPort}\\s+\\S+\\s+LISTENING\\s+(\\d+)`));
        if (m) { execSync(`taskkill /PID ${m[1]} /F`, { stdio: 'ignore' }); break; }
      }
    } catch (e) {}
    this.status = 'offline';
    return { success: true };
  }

  async getStatus() {
    try {
      const data = await this._httpGet('/health');
      if (data && (data.status === 'ok' || data.status === 'running' || data.ok)) {
        this.status = 'running';
        return { status: 'running', hasChatAPI: true, capabilities: data.capabilities || [] };
      }
    } catch (e) {}
    this.status = 'offline';
    return { status: 'offline' };
  }

  // ========== Agent 列表 ==========

  async listAgents() {
    // Hermes agent 是统一的，通过 model 字段选择
    // 但可以列出 Hermes 已配置的 profile
    this._loadHermesConfig();
    const agents = [{ id: 'hermes-agent', name: 'Hermes Agent', description: '完整 Hermes agent（工具/记忆/技能）' }];

    // 如果有 profiles，也列出来
    try {
      const hermesRoot = this.config.hermesRoot || path.join(os.homedir(), 'AppData', 'Local', 'hermes');
      const profilesDir = path.join(hermesRoot, 'profiles');
      if (fs.existsSync(profilesDir)) {
        const profiles = fs.readdirSync(profilesDir).filter(f => fs.statSync(path.join(profilesDir, f)).isDirectory());
        for (const p of profiles) {
          agents.push({ id: `hermes-${p}`, name: `Hermes (${p})`, description: `Profile: ${p}` });
        }
      }
    } catch (e) {}

    return agents;
  }

  // ========== 消息发送（核心：只发最新消息，Hermes 管理历史） ==========

  async sendMessage(agentId, messages, userId) {
    // messages 可能是数组（从 main.js 传来）或字符串（兼容旧调用）
    let latestMessage;
    if (Array.isArray(messages)) {
      latestMessage = messages[messages.length - 1]?.content || '';
    } else {
      latestMessage = messages || '';
    }

    // 确定 model（agentId 可能是 profile 名）
    const model = agentId && agentId !== 'main' && agentId !== 'hermes-agent'
      ? agentId.replace('hermes-', '')
      : 'hermes-agent';

    const body = JSON.stringify({
      model,
      messages: [{ role: 'user', content: latestMessage }],
      stream: false,
      max_tokens: 16384,
    });

    const headers = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
      'Authorization': `Bearer ${this.apiKey}`,
    };
    // 会话 ID：通过 X-Hermes-Session-Id 头关联会话
    if (userId) {
      headers['X-Hermes-Session-Id'] = userId;
    }

    try {
      const data = await this._httpPost('/v1/chat/completions', body, headers);
      if (data?.choices?.[0]) {
        // 从响应头获取 session ID（首次请求会返回）
        return {
          success: true,
          content: data.choices[0].message.content,
          messageId: data.id,
          sessionId: data._sessionId || userId,
        };
      }
      return { success: false, message: '无效响应格式' };
    } catch (e) {
      return { success: false, message: e.message };
    }
  }

  sendMessageStream(agentId, messages, callbacks, userId) {
    const { onChunk, onDone, onError } = callbacks || {};

    let latestMessage;
    if (Array.isArray(messages)) {
      latestMessage = messages[messages.length - 1]?.content || '';
    } else {
      latestMessage = messages || '';
    }

    const model = agentId && agentId !== 'main' && agentId !== 'hermes-agent'
      ? agentId.replace('hermes-', '')
      : 'hermes-agent';

    const body = JSON.stringify({
      model,
      messages: [{ role: 'user', content: latestMessage }],
      stream: true,
      max_tokens: 16384,
    });

    const url = new URL(this.baseUrl);
    const headers = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
      'Accept': 'text/event-stream',
      'Authorization': `Bearer ${this.apiKey}`,
    };
    if (userId) {
      headers['X-Hermes-Session-Id'] = userId;
    }

    const options = {
      hostname: url.hostname, port: url.port, path: '/v1/chat/completions',
      method: 'POST', timeout: this._requestTimeout, headers,
    };

    let fullContent = '';
    let returnedSessionId = null;

    const req = http.request(options, (res) => {
      // 捕获返回的 session ID
      returnedSessionId = res.headers['x-hermes-session-id'] || null;

      if (res.statusCode >= 400) {
        let errBody = '';
        res.on('data', c => errBody += c);
        res.on('end', () => {
          if (onError) onError(new Error(`${res.statusCode}: ${errBody.substring(0, 200)}`));
          this._emitMessage({ agentId, role: 'assistant', content: `❌ ${res.statusCode}`, done: true, sessionId: returnedSessionId });
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
            this._emitMessage({ agentId, role: 'assistant', content: fullContent, done: true, sessionId: returnedSessionId });
            return;
          }
          try {
            const parsed = JSON.parse(payload);
            const delta = parsed.choices?.[0]?.delta?.content || '';
            if (delta) { fullContent += delta; if (onChunk) onChunk(delta, fullContent); }
          } catch (e) {}
        }
      });
      res.on('end', () => {
        if (onDone) onDone(fullContent);
        this._emitMessage({ agentId, role: 'assistant', content: fullContent, done: true, sessionId: returnedSessionId });
      });
    });
    req.setTimeout(this._requestTimeout, () => { req.destroy(); if (onError) onError(new Error('请求超时（5分钟）')); });
    req.on('error', (err) => { if (onError) onError(err); });
    req.end(body);
    return req;
  }

  // ========== 内部方法 ==========

  async _waitForReady(timeoutMs) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        const data = await this._httpGet('/health');
        if (data && (data.status === 'ok' || data.status === 'running' || data.ok)) {
          this.status = 'running';
          return;
        }
      } catch (e) {}
      await new Promise(r => setTimeout(r, 2000));
    }
    throw new Error('Hermes API Server 启动超时（30秒）');
  }

  _httpGet(p) {
    return new Promise((resolve, reject) => {
      const url = new URL(p, this.baseUrl);
      http.get({ hostname: url.hostname, port: url.port, path: url.pathname, method: 'GET', timeout: 5000, headers: { Accept: 'application/json', Authorization: `Bearer ${this.apiKey}` } }, (res) => {
        let data = ''; res.on('data', c => data += c);
        res.on('end', () => { try { resolve(JSON.parse(data)); } catch (e) { resolve({ raw: data }); } });
      }).on('error', reject).setTimeout(5000, function () { this.destroy(); reject(new Error('超时')); });
    });
  }

  _httpPost(p, bodyString, extraHeaders = {}) {
    return new Promise((resolve, reject) => {
      const url = new URL(p, this.baseUrl);
      const headers = {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyString),
        'Authorization': `Bearer ${this.apiKey}`,
        ...extraHeaders,
      };
      const req = http.request({ hostname: url.hostname, port: url.port, path: url.pathname, method: 'POST', timeout: this._requestTimeout, headers }, (res) => {
        let data = ''; res.on('data', c => data += c);
        res.on('end', () => {
          if (res.statusCode >= 400) { reject(new Error(`${res.statusCode}: ${data.substring(0, 300)}`)); return; }
          try {
            const parsed = JSON.parse(data);
            parsed._sessionId = res.headers['x-hermes-session-id'] || null;
            resolve(parsed);
          } catch (e) { reject(new Error(`解析失败`)); }
        });
      });
      req.setTimeout(this._requestTimeout, () => { req.destroy(); reject(new Error('超时')); });
      req.on('error', reject);
      req.end(bodyString);
    });
  }
}

module.exports = HermesAdapter;




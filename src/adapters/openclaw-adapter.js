// QClaw / OpenClaw 适配器 v1.1
// 对接 QClaw Gateway OpenAI 兼容 API
// 依赖：无（仅使用 Node 内置 http 模块）
//
// v1.1: HTTP 超时 + 状态码检查 + model 格式修正（openclaw/<agentId>）
//       + 聊天端点探测（discoverChatAPI）用于区分 QClaw / OpenClaw 网关

const BaseAdapter = require('./base-adapter');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');
const os = require('os');

class OpenClawAdapter extends BaseAdapter {
  /**
   * @param {object} config - { exePath, port, token, baseUrl?, aiType? }
   */
  constructor(config = {}) {
    super(config);
    this.aiType = config.aiType || 'qclaw';
    this.name = this.aiType;
    this.token = config.token || '';
    this.baseUrl = config.baseUrl || `http://127.0.0.1:${config.port || 28789}`;
    this._proc = null;
    this._chatEndpoint = null; // 延迟探测
    this._requestTimeout = 15000;
    this._currentModel = null;
    this._defaultModel = null;
    // 尝试从配置读取默认模型
    this._loadDefaultModel();
  }

  /**
   * 从配置读取默认模型
   */
  _loadDefaultModel() {
    try {
      const configPath = this.config.configPath
        || path.join(os.homedir(), this.aiType === 'openclaw' ? '.openclaw' : '.qclaw', 'openclaw.json');
      if (fs.existsSync(configPath)) {
        const raw = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        const providers = raw.providers || raw.modelProviders || {};
        const entries = Array.isArray(providers) ? providers : Object.values(providers);
        if (entries?.[0]?.model) this._defaultModel = entries[0].model;
      }
    } catch (e) {}
  }

  /**
   * 启动网关进程
   */
  async start() {
    const alive = await this.getStatus();
    if (alive.status === 'running') {
      return { success: true, message: '网关已在运行' };
    }

    const exePath = this.config.exePath || this.config.execPath || '';
    if (!exePath || !fs.existsSync(exePath)) {
      return { success: false, message: '可执行文件路径未配置或不存在' };
    }

    this._proc = spawn(
      exePath,
      ['gateway', 'start', '--port', String(this.config.port || 28789)],
      { cwd: path.dirname(exePath), detached: true, stdio: ['ignore'] }
    );
    this.status = 'starting';

    try {
      await this._waitForReady(20000);
      return { success: true, message: '网关启动成功' };
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
   * 获取网关状态 + 聊天端点探测
   */
  async getStatus() {
    try {
      const data = await this._httpGet('/health');
      if (data && data.ok) {
        this.status = 'running';
        // 探测聊天 API 可用性
        if (this._chatEndpoint === null) {
          this._chatEndpoint = await this._discoverChatEndpoint();
        }
        return { status: 'running', uptime: data.uptime || 0, hasChatAPI: !!this._chatEndpoint };
      }
    } catch (e) {}
    this.status = 'offline';
    return { status: 'offline' };
  }

  /**
   * 枚举 Agent
   */
  async listAgents() {
    return OpenClawAdapter.readAgentsConfig(this.aiType);
  }

  /**
   * 发送消息（非流式）
   */
  /**
   * 发送消息（REST / 非流式）
   * @param {string} agentId
   * @param {string} message  - 本条用户输入
   * @param {string} userId   - 会话标识（QClaw 用 user 字段路由到同一个 session）
   */
  async sendMessage(agentId, message, userId) {
    // 确保聊天端点已探测
    if (this._chatEndpoint === null) {
      this._chatEndpoint = await this._discoverChatEndpoint();
    }
    if (!this._chatEndpoint) {
      return {
        success: false,
        message: `${this.aiType === 'openclaw' ? 'OpenClaw' : 'QClaw'} 网关不支持 REST 聊天 API。` +
          `${this.aiType === 'openclaw' ? ' 请使用 Control UI (http://127.0.0.1:' + (this.config.port || 18789) + ') 进行对话。' : ''}`,
      };
    }

    // model 格式：openclaw/<agentId> 用于选择特定 agent
    const model = agentId && agentId !== 'main'
      ? `openclaw/${agentId}`
      : 'openclaw';

    const body = JSON.stringify({
      model,
      messages: [{ role: 'user', content: message }],
      user: userId || undefined,
      stream: false,
      max_tokens: 4096,
    });

    try {
      const data = await this._httpPost(this._chatEndpoint, body);
      if (data && data.choices && data.choices[0]) {
        const content = data.choices[0].message.content;
        // 非流式路径：结果由 renderer 从返回值渲染，不通过 _emitMessage 双发
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
  sendMessageStream(agentId, message, callbacks) {
    const { onChunk, onDone, onError } = callbacks || {};

    const model = agentId && agentId !== 'main'
      ? `openclaw/${agentId}`
      : 'openclaw';

    const body = JSON.stringify({
      model,
      messages: [{ role: 'user', content: message }],
      stream: true,
      max_tokens: 4096,
    });

    const url = new URL(this.baseUrl);
    const endpoint = this._chatEndpoint || '/v1/chat/completions';
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: endpoint,
      method: 'POST',
      timeout: this._requestTimeout,
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'Accept': 'text/event-stream',
      },
    };

    let fullContent = '';
    const req = http.request(options, (res) => {
      // 非 200 状态码立即报错
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

  /**
   * 静态：从配置文件读取 Agent 列表
   */
  static readAgentsConfig(aiType = 'qclaw') {
    const agents = [];
    const home = process.env.USERPROFILE || process.env.HOME || '~';
    const configDirs = {
      qclaw: path.join(home, '.qclaw'),
      openclaw: path.join(home, '.openclaw'),
    };
    const configDir = configDirs[aiType] || path.join(home, `.${aiType}`);

    try {
      const cfgPath = path.join(configDir, 'openclaw.json');
      if (fs.existsSync(cfgPath)) {
        const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
        const list = cfg.agents?.list || [];
        for (const a of list) {
          agents.push({
            id: a.id,
            name: a.identity?.name || a.name || a.id,
            emoji: a.identity?.emoji || null,
            avatar: a.identity?.avatar || null,
            description: a.description || '',
          });
        }
      }
    } catch (e) {}

    try {
      const agentsDir = path.join(configDir, 'agents');
      if (fs.existsSync(agentsDir)) {
        const dirs = fs.readdirSync(agentsDir, { withFileTypes: true });
        for (const entry of dirs) {
          if (!entry.isDirectory()) continue;
          if (agents.some(a => a.id === entry.name)) continue;
          let agentName = entry.name;
          let emoji = null;
          try {
            for (const fname of ['agent/IDENTITY.md', 'agent/SOUL.md', 'IDENTITY.md', 'SOUL.md']) {
              const p = path.join(agentsDir, entry.name, fname);
              if (fs.existsSync(p)) {
                const content = fs.readFileSync(p, 'utf8');
                const nameMatch = content.match(/Name:\s*(.+)/i);
                const emojiMatch = content.match(/Emoji:\s*(.+)/i);
                if (nameMatch) agentName = nameMatch[1].trim();
                if (emojiMatch) emoji = emojiMatch[1].trim();
                break;
              }
            }
          } catch (e) {}
          agents.push({ id: entry.name, name: agentName, emoji, description: '' });
        }
      }
    } catch (e) {}

    if (agents.length === 0) {
      const fallbackName = aiType === 'openclaw' ? 'OpenClaw' : 'QClaw';
      agents.push({ id: 'main', name: fallbackName, description: '默认 Agent' });
    }

    return agents;
  }

  // ========== 私有方法 ==========

  /**
   * 探测聊天 API 端点是否存在
   * QClaw 网关有 /v1/chat/completions，OpenClaw 网关没有
   */
  async _discoverChatEndpoint() {
    const candidates = ['/v1/chat/completions', '/api/chat', '/chat/completions'];
    for (const ep of candidates) {
      try {
        const result = await this._httpHead(ep);
        // 405 (Method Not Allowed) 说明端点存在只支持 POST，视为可用
        if (result >= 200 && result < 500 && result !== 404) {
          console.log(`[OpenClawAdapter] Chat endpoint found: ${ep} (status ${result})`);
          return ep;
        }
      } catch (e) {}
    }
    console.warn(`[OpenClawAdapter] No chat endpoint found on ${this.baseUrl}`);
    return null;
  }

  async _waitForReady(timeoutMs) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        const data = await this._httpGet('/health');
        if (data && data.ok) { this.status = 'running'; return; }
      } catch (e) {}
      await new Promise(r => setTimeout(r, 1000));
    }
    throw new Error('网关启动超时');
  }

  /**
   * HTTP HEAD（轻量探测）
   */
  _httpHead(path) {
    return new Promise((resolve, reject) => {
      const url = new URL(path, this.baseUrl);
      const options = { hostname: url.hostname, port: url.port, path: url.pathname + url.search, method: 'HEAD', timeout: 3000 };
      const req = http.request(options, (res) => { res.resume(); resolve(res.statusCode); });
      req.setTimeout(3000, () => { req.destroy(); reject(new Error('timeout')); });
      req.on('error', reject);
      req.end();
    });
  }

  /**
   * HTTP GET（带超时）
   */
  _httpGet(path) {
    return new Promise((resolve, reject) => {
      const url = new URL(path, this.baseUrl);
      const options = {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method: 'GET',
        timeout: this._requestTimeout,
        headers: { 'Authorization': `Bearer ${this.token}`, 'Accept': 'application/json' },
      };
      http.get(options, (res) => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => {
          try { resolve(JSON.parse(data)); }
          catch (e) { reject(new Error(`解析失败: ${data.substring(0, 100)}`)); }
        });
      }).on('error', reject).setTimeout(this._requestTimeout, function () { this.destroy(); reject(new Error('请求超时')); });
    });
  }

  /**
   * HTTP POST（带超时 + 状态码检查）
   */
  _httpPost(path, bodyString) {
    return new Promise((resolve, reject) => {
      const url = new URL(path, this.baseUrl);
      const options = {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method: 'POST',
        timeout: this._requestTimeout,
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(bodyString),
        },
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

  // ========== 模型信息 ==========

  async getModelInfo() {
    // 尝试从 openclaw.json 读取模型配置
    const configPath = this.config.configPath
      || path.join(os.homedir(), this.aiType === 'openclaw' ? '.openclaw' : '.qclaw', 'openclaw.json');
    let modelName = null;
    let contextWindow = null;

    try {
      if (fs.existsSync(configPath)) {
        const raw = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        // 模型名从 providers 中提取
        const providers = raw.providers || raw.modelProviders || {};
        const firstProvider = Object.values(providers)[0];
        if (firstProvider) {
          modelName = firstProvider.model || firstProvider.id || null;
        }
        // 上下文窗口（如果有的话）
        contextWindow = raw.contextWindow || null;
      }
    } catch (e) { /* 忽略 */ }

    return {
      model: modelName,
      contextWindow,
      contextUsed: null,
      usagePct: null,
    };
  }

  // ========== 模型切换 ==========

  /**
   * 列出可用模型（从配置文件的 providers 提取）
   */
  async listModels() {
    const models = [];
    const configPath = this.config.configPath
      || path.join(os.homedir(), this.aiType === 'openclaw' ? '.openclaw' : '.qclaw', 'openclaw.json');
    try {
      if (fs.existsSync(configPath)) {
        const raw = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        const providers = raw.providers || raw.modelProviders || {};
        // providers 可能是 object { name: { model, ... } } 或 array [ { model, ... } ]
        const entries = Array.isArray(providers) ? providers : Object.entries(providers).map(([id, v]) => ({ id, ...v }));
        for (const p of entries) {
          const modelId = p.model || p.id;
          if (!modelId) continue;
          models.push({
            id: modelId,
            name: p.name || modelId,
            isDefault: models.length === 0,
            source: 'config',
          });
        }
      }
    } catch (e) {}
    return models;
  }

  setModel(modelId) {
    this._currentModel = modelId || null;
    return { success: true, model: this._currentModel };
  }

  getCurrentModel() {
    if (this._currentModel) return this._currentModel;
    return this._defaultModel || null;
  }
}

module.exports = OpenClawAdapter;
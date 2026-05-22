// QClaw 专属适配器 v1.0
// 从 openclaw-adapter.js 拆分，QClaw 专属逻辑
// - 读 ~/.qclaw/openclaw.json（token + 端口）
// - switchModel: 修改配置文件 + 重启 gateway
// - listModels: 从 providers 提取模型列表

const BaseAdapter = require('./base-adapter');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');
const os = require('os');

class QClawAdapter extends BaseAdapter {
  constructor(config = {}) {
    super(config);
    this.aiType = 'qclaw';
    this.name = 'qclaw';
    this.token = config.token || '';
    this.baseUrl = config.baseUrl || `http://127.0.0.1:${config.port || 28789}`;
    this._proc = null;
    this._chatEndpoint = null;
    this._requestTimeout = 300000;  // 5分钟，与 OpenClaw 对齐
    this._currentModel = null;
    this._defaultModel = null;
    this._lastModelInfo = null;
    this._modelInfoCache = new Map();
    this._loadConfig();
  }

  /**
   * 从 ~/.qclaw/openclaw.json 读取配置
   */
  _loadConfig() {
    try {
      const configPath = this.config.configPath
        || path.join(os.homedir(), '.qclaw', 'openclaw.json');
      if (fs.existsSync(configPath)) {
        const raw = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        this.token = raw.gateway?.auth?.token || this.token;
        this.baseUrl = `http://127.0.0.1:${raw.gateway?.port || 28789}`;
        // 读默认模型
        const agents = raw.agents?.list || [];
        if (agents[0]?.model?.primary) {
          this._defaultModel = agents[0].model.primary;
        }
      }
    } catch (e) {}
  }

  async start() {
    const alive = await this.getStatus();
    if (alive.status === 'running') return { success: true, message: '网关已在运行' };
    const exePath = this.config.exePath || '';
    if (!exePath || !fs.existsSync(exePath)) {
      return { success: false, message: '可执行文件路径未配置或不存在' };
    }
    this._proc = spawn(exePath, ['gateway', 'start', '--port', String(this.config.port || 28789)],
      { cwd: path.dirname(exePath), detached: true, stdio: ['ignore'] });
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
    if (this._proc) { try { this._proc.kill('SIGTERM'); } catch (e) {} this._proc = null; }
    this.status = 'offline';
    return { success: true };
  }

  async getStatus() {
    try {
      const data = await this._httpGet('/health');
      if (data && data.ok) {
        this.status = 'running';
        if (this._chatEndpoint === null) this._chatEndpoint = await this._discoverChatEndpoint();
        return { status: 'running', uptime: data.uptime || 0, hasChatAPI: !!this._chatEndpoint };
      }
    } catch (e) {}
    this.status = 'offline';
    return { status: 'offline' };
  }

  async listAgents() {
    const agents = [];
    try {
      const configPath = path.join(os.homedir(), '.qclaw', 'openclaw.json');
      if (fs.existsSync(configPath)) {
        const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
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
    if (agents.length === 0) agents.push({ id: 'main', name: 'QClaw', description: '默认 Agent' });
    return agents;
  }

  async sendMessage(agentId, message, userId) {
    if (this._chatEndpoint === null) this._chatEndpoint = await this._discoverChatEndpoint();
    if (!this._chatEndpoint) return { success: false, message: 'QClaw 网关不支持 REST 聊天 API' };
    const model = agentId && agentId !== 'main' ? `openclaw/${agentId}` : 'openclaw';
    const body = JSON.stringify({
      model, messages: [{ role: 'user', content: message }],
      user: userId || undefined, stream: false, max_tokens: 4096,
    });
    try {
      const data = await this._httpPost(this._chatEndpoint, body);
      if (data && data.choices && data.choices[0]) {
        return { success: true, content: data.choices[0].message.content, messageId: data.id };
      }
      return { success: false, message: '无效的响应格式' };
    } catch (e) { return { success: false, message: e.message }; }
  }

  sendMessageStream(agentId, message, callbacks, userId) {
    const { onChunk, onDone, onError, onToolCall } = callbacks || {};
    const model = agentId && agentId !== 'main' ? `openclaw/${agentId}` : 'openclaw';
    const body = JSON.stringify({
      model, messages: [{ role: 'user', content: message }],
      user: userId || undefined, stream: true, max_tokens: 4096,
    });
    const url = new URL(this.baseUrl);
    const endpoint = this._chatEndpoint || '/v1/chat/completions';
    const options = {
      hostname: url.hostname, port: url.port, path: endpoint, method: 'POST',
      timeout: this._requestTimeout,
      headers: {
        'Authorization': `Bearer ${this.token}`, 'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body), 'Accept': 'text/event-stream',
      },
    };
    let fullContent = '';
    let usage = null;
    const req = http.request(options, (res) => {
      if (res.statusCode >= 400) {
        let errBody = '';
        res.on('data', c => errBody += c);
        res.on('end', () => { if (onError) onError(new Error(`${res.statusCode} ${res.statusMessage}`)); });
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
            if (onDone) onDone(fullContent, null, usage);
            return;
          }
          try {
            const parsed = JSON.parse(payload);
            const delta = parsed.choices?.[0]?.delta;
            if (delta?.content) {
              fullContent += delta.content;
              if (onChunk) onChunk(delta.content, fullContent);
            }
            // 捕获 tool_calls
            if (delta?.tool_calls && onToolCall) {
              for (const tc of delta.tool_calls) {
                onToolCall({
                  id: tc.id, type: 'function',
                  name: tc.function?.name || 'unknown',
                  arguments: tc.function?.arguments || '',
                  status: 'running',
                });
              }
            }
            // 捕获 usage
            if (parsed.usage) usage = parsed.usage;
          } catch (e) {}
        }
      });
      res.on('end', () => {
        if (onDone) onDone(fullContent, null, usage);
      });
    });
    req.setTimeout(this._requestTimeout, () => { req.destroy(); if (onError) onError(new Error('请求超时')); });
    req.on('error', (err) => { if (onError) onError(err); });
    req.end(body);
    return req;
  }

  // ========== 模型信息 ==========

  async getModelInfo() {
    const cacheKey = this._currentModel || 'default';
    if (this._modelInfoCache.has(cacheKey)) return this._modelInfoCache.get(cacheKey);
    const info = await this._fetchModelInfo();
    this._modelInfoCache.set(cacheKey, info);
    return info;
  }

  async _fetchModelInfo() {
    const configPath = path.join(os.homedir(), '.qclaw', 'openclaw.json');
    let modelName = this._currentModel || this._defaultModel || null;
    let contextWindow = null;
    try {
      if (fs.existsSync(configPath)) {
        const raw = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        const agents = raw.agents?.list || [];
        if (agents[0]?.model?.primary) modelName = agents[0].model.primary;
        // 尝试从 models.providers 读 contextWindow
        const providers = raw.models?.providers || {};
        for (const p of Object.values(providers)) {
          if (p.models) {
            for (const m of p.models) {
              if (m.id === modelName && m.contextWindow) contextWindow = m.contextWindow;
            }
          }
        }
      }
    } catch (e) {}
    return { model: modelName, contextWindow, contextUsed: null, usagePct: null };
  }

  // ========== 模型切换 ==========

  async listModels() {
    const models = [];
    const configPath = path.join(os.homedir(), '.qclaw', 'openclaw.json');
    try {
      if (fs.existsSync(configPath)) {
        const raw = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        const providers = raw.models?.providers || {};
        for (const [providerId, provider] of Object.entries(providers)) {
          if (provider.models) {
            for (const m of provider.models) {
              models.push({
                id: m.id, name: m.name || m.id,
                provider: providerId,
                contextWindow: m.contextWindow || null,
                isDefault: m.id === this._defaultModel,
              });
            }
          }
        }
      }
    } catch (e) {}
    return models;
  }

  /**
   * 切换模型：修改 ~/.qclaw/openclaw.json → agents.list[0].model.primary → 重启 gateway
   */
  async switchModel(modelId) {
    const configPath = path.join(os.homedir(), '.qclaw', 'openclaw.json');
    try {
      const raw = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (!raw.agents?.list?.[0]) return { success: false, message: '配置中无 agents.list' };
      raw.agents.list[0].model = raw.agents.list[0].model || {};
      raw.agents.list[0].model.primary = modelId;
      fs.writeFileSync(configPath, JSON.stringify(raw, null, 2), 'utf8');
      this._currentModel = modelId;
      this._modelInfoCache.clear();
      this._lastModelInfo = null;
      return { success: true, needsRestart: true, model: modelId };
    } catch (e) {
      return { success: false, message: e.message };
    }
  }

  getCurrentModel() {
    return this._currentModel || this._defaultModel || null;
  }

  // ========== 私有方法 ==========

  async _discoverChatEndpoint() {
    const candidates = ['/v1/chat/completions', '/api/chat', '/chat/completions'];
    for (const ep of candidates) {
      try {
        const result = await this._httpHead(ep);
        if (result >= 200 && result < 500 && result !== 404) return ep;
      } catch (e) {}
    }
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

  _httpHead(path) {
    return new Promise((resolve, reject) => {
      const url = new URL(path, this.baseUrl);
      const req = http.request({ hostname: url.hostname, port: url.port, path: url.pathname, method: 'HEAD', timeout: 3000 }, (res) => { res.resume(); resolve(res.statusCode); });
      req.setTimeout(3000, () => { req.destroy(); reject(new Error('timeout')); });
      req.on('error', reject);
      req.end();
    });
  }

  _httpGet(path) {
    return new Promise((resolve, reject) => {
      const url = new URL(path, this.baseUrl);
      http.get({ hostname: url.hostname, port: url.port, path: url.pathname, method: 'GET', timeout: this._requestTimeout, headers: { 'Authorization': `Bearer ${this.token}`, 'Accept': 'application/json' } }, (res) => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => { try { resolve(JSON.parse(data)); } catch (e) { reject(new Error(`解析失败: ${data.substring(0, 100)}`)); } });
      }).on('error', reject).setTimeout(this._requestTimeout, function () { this.destroy(); reject(new Error('请求超时')); });
    });
  }

  _httpPost(path, bodyString) {
    return new Promise((resolve, reject) => {
      const url = new URL(path, this.baseUrl);
      const req = http.request({ hostname: url.hostname, port: url.port, path: url.pathname, method: 'POST', timeout: this._requestTimeout, headers: { 'Authorization': `Bearer ${this.token}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(bodyString) } }, (res) => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => {
          if (res.statusCode >= 400) { reject(new Error(`${res.statusCode} ${data.substring(0, 100)}`)); return; }
          try { resolve(JSON.parse(data)); } catch (e) { reject(new Error(`解析失败`)); }
        });
      });
      req.setTimeout(this._requestTimeout, () => { req.destroy(); reject(new Error('请求超时')); });
      req.on('error', reject);
      req.end(bodyString);
    });
  }
}

module.exports = QClawAdapter;

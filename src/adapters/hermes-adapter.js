// Hermes 适配器 v2.1
// 通过 Hermes Proxy (hermes proxy start --provider custom) 对接
// 支持多 provider 动态切换（按模型名匹配）

const BaseAdapter = require('./base-adapter');
const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');
const yaml = require('js-yaml');
const os = require('os');

const DEFAULT_PROXY_PORT = 8645;

class HermesAdapter extends BaseAdapter {
  constructor(config = {}) {
    super(config);
    this.name = 'hermes';
    this.proxyPort = config.port || config.proxyPort || DEFAULT_PROXY_PORT;
    this.baseUrl = config.baseUrl || `http://127.0.0.1:${this.proxyPort}`;
    this.token = config.token || 'no-key-needed';
    this._proc = null;
    this._chatEndpoint = '/v1/chat/completions';
    this._requestTimeout = 120000;
    this._hermesConfig = null;
    this._allProviders = [];
    this._currentProvider = null; // 当前激活的 provider name
  }

  // ========== 配置读取 ==========

  _loadHermesConfig() {
    if (this._hermesConfig) return true;
    const hermesRoot = this.config.hermesRoot || path.join(os.homedir(), 'AppData', 'Local', 'hermes');
    const configPath = path.join(hermesRoot, 'config.yaml');
    if (!fs.existsSync(configPath)) return false;
    try {
      const raw = fs.readFileSync(configPath, 'utf8');
      this._hermesConfig = yaml.load(raw);
      this._allProviders = (this._hermesConfig?.custom_providers || []).map(cp => ({
        name: cp.name,
        baseUrl: cp.base_url,
        apiKey: cp.api_key,
        model: cp.model,
        models: cp.models ? Object.keys(cp.models) : [],
      }));
      // 默认用第一个 provider
      if (!this._providerConfig && this._allProviders.length > 0) {
        this._providerConfig = this._allProviders[0];
      }
      return true;
    } catch (e) {
      console.warn('[HermesAdapter] config.yaml 读取失败:', e.message);
      return false;
    }
  }

  _findProviderForModel(model) {
    this._loadHermesConfig();
    if (!model) return this._providerConfig;
    // 精确匹配 model 字段
    for (const cp of this._allProviders) {
      if (cp.model === model) return cp;
    }
    // 匹配 models 列表
    for (const cp of this._allProviders) {
      if (cp.models.includes(model)) return cp;
    }
    return this._providerConfig;
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
    if (alive.status === 'running') return { success: true, message: 'Hermes Proxy 已在运行' };

    this._loadHermesConfig();
    if (!this._providerConfig) return { success: false, message: '未找到自定义 Provider 配置' };

    const hermesExe = this._getHermesExe();
    if (!hermesExe) return { success: false, message: '未找到 Hermes 可执行文件' };

    const args = [
      'proxy', 'start',
      '--provider', 'custom',
      '--base-url', this._providerConfig.baseUrl,
      '--api-key', this._providerConfig.apiKey,
      '--port', String(this.proxyPort),
    ];

    this._proc = spawn(hermesExe, args, {
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    this._proc.stdout?.on('data', d => console.log('[Hermes Proxy]', d.toString().trim()));
    this._proc.stderr?.on('data', d => console.warn('[Hermes Proxy]', d.toString().trim()));

    this.status = 'starting';
    try {
      await this._waitForReady(15000);
      this._currentProvider = this._providerConfig.name;
      return { success: true, message: `Proxy 启动 (${this._providerConfig.name})` };
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
        const m = line.match(new RegExp(`TCP\\s+127\\.0\\.0\\.1:${this.proxyPort}\\s+\\S+\\s+LISTENING\\s+(\\d+)`));
        if (m) { execSync(`taskkill /PID ${m[1]} /F`, { stdio: 'ignore' }); break; }
      }
    } catch (e) {}
    this.status = 'offline';
    this._currentProvider = null;
    return { success: true };
  }

  async getStatus() {
    try {
      const data = await this._httpGet('/health');
      if (data && data.status === 'ok') {
        this.status = 'running';
        return { status: 'running', hasChatAPI: true, provider: data.upstream };
      }
    } catch (e) {}
    this.status = 'offline';
    return { status: 'offline' };
  }

  // ========== Agent 列表（显示所有可用模型） ==========

  async listAgents() {
    this._loadHermesConfig();
    const agents = [];
    for (const cp of this._allProviders) {
      // 主模型
      agents.push({
        id: cp.model,
        name: cp.model,
        description: `via ${cp.name}`,
      });
      // 额外模型
      for (const m of cp.models) {
        if (m !== cp.model) {
          agents.push({ id: m, name: m, description: `via ${cp.name}` });
        }
      }
    }
    if (agents.length === 0) {
      agents.push({ id: 'hermes-default', name: 'Hermes', description: 'Default' });
    }
    return agents;
  }

  // ========== 消息发送 ==========

  async sendMessage(agentId, message) {
    // 按模型名选择 provider
    const targetModel = agentId || this._providerConfig?.model;
    const provider = this._findProviderForModel(targetModel);

    // provider 切换时重启 proxy
    if (provider && this._currentProvider !== provider.name) {
      console.log(`[HermesAdapter] 切换 provider: ${this._currentProvider} → ${provider.name}`);
      await this.stop();
      this._providerConfig = provider;
      const result = await this.start();
      if (!result.success) return result;
    }

    const body = JSON.stringify({
      model: targetModel,
      messages: [{ role: 'user', content: message }],
      stream: false,
      max_tokens: 4096,
    });

    try {
      const data = await this._httpPost('/v1/chat/completions', body);
      if (data?.choices?.[0]) {
        return { success: true, content: data.choices[0].message.content, messageId: data.id };
      }
      return { success: false, message: '无效响应格式' };
    } catch (e) {
      return { success: false, message: e.message };
    }
  }

  sendMessageStream(agentId, message, callbacks) {
    const { onChunk, onDone, onError } = callbacks || {};
    const targetModel = agentId || this._providerConfig?.model;

    const body = JSON.stringify({
      model: targetModel,
      messages: [{ role: 'user', content: message }],
      stream: true,
      max_tokens: 4096,
    });

    const url = new URL(this.baseUrl);
    const options = {
      hostname: url.hostname, port: url.port, path: this._chatEndpoint,
      method: 'POST', timeout: this._requestTimeout,
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), 'Accept': 'text/event-stream' },
    };

    let fullContent = '';
    const req = http.request(options, (res) => {
      if (res.statusCode >= 400) {
        let errBody = '';
        res.on('data', c => errBody += c);
        res.on('end', () => { if (onError) onError(new Error(`${res.statusCode}`)); });
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
          if (payload === '[DONE]') { if (onDone) onDone(fullContent); this._emitMessage({ agentId, role: 'assistant', content: fullContent, done: true }); return; }
          try {
            const parsed = JSON.parse(payload);
            const delta = parsed.choices?.[0]?.delta?.content || '';
            if (delta) { fullContent += delta; if (onChunk) onChunk(delta, fullContent); }
          } catch (e) {}
        }
      });
      res.on('end', () => { if (onDone) onDone(fullContent); this._emitMessage({ agentId, role: 'assistant', content: fullContent, done: true }); });
    });
    req.setTimeout(this._requestTimeout, () => { req.destroy(); if (onError) onError(new Error('超时')); });
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
        if (data?.status === 'ok') { this.status = 'running'; return; }
      } catch (e) {}
      await new Promise(r => setTimeout(r, 1000));
    }
    throw new Error('Proxy 启动超时');
  }

  _httpGet(p) {
    return new Promise((resolve, reject) => {
      const url = new URL(p, this.baseUrl);
      http.get({ hostname: url.hostname, port: url.port, path: url.pathname, method: 'GET', timeout: 5000, headers: { Accept: 'application/json' } }, (res) => {
        let data = ''; res.on('data', c => data += c);
        res.on('end', () => { try { resolve(JSON.parse(data)); } catch (e) { resolve({ raw: data }); } });
      }).on('error', reject).setTimeout(5000, function () { this.destroy(); reject(new Error('超时')); });
    });
  }

  _httpPost(p, bodyString) {
    return new Promise((resolve, reject) => {
      const url = new URL(p, this.baseUrl);
      const req = http.request({ hostname: url.hostname, port: url.port, path: url.pathname, method: 'POST', timeout: this._requestTimeout, headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(bodyString) } }, (res) => {
        let data = ''; res.on('data', c => data += c);
        res.on('end', () => {
          if (res.statusCode >= 400) { reject(new Error(`${res.statusCode}: ${data.substring(0, 200)}`)); return; }
          try { resolve(JSON.parse(data)); } catch (e) { reject(new Error(`解析失败`)); }
        });
      });
      req.setTimeout(this._requestTimeout, () => { req.destroy(); reject(new Error('超时')); });
      req.on('error', reject);
      req.end(bodyString);
    });
  }
}

module.exports = HermesAdapter;

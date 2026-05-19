// Hermes 适配器 v2.0
// 通过 Hermes Proxy (hermes proxy start --provider custom) 对接
// 依赖：Node 内置 http 模块 + js-yaml（配置解析）

const BaseAdapter = require('./base-adapter');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');
const yaml = require('js-yaml');
const os = require('os');

// 默认代理端口（hermes proxy start 默认监听）
const DEFAULT_PROXY_PORT = 8645;

class HermesAdapter extends BaseAdapter {
  /**
   * @param {object} config - { exePath, port, token, baseUrl?, hermesRoot? }
   */
  constructor(config = {}) {
    super(config);
    this.name = 'hermes';
    // 代理端口（不是 Hermes 内部端口）
    this.proxyPort = config.port || config.proxyPort || DEFAULT_PROXY_PORT;
    this.baseUrl = config.baseUrl || `http://127.0.0.1:${this.proxyPort}`;
    this.token = config.token || 'no-key-needed'; // proxy 不校验 token
    this._proc = null;
    this._chatEndpoint = '/v1/chat/completions';
    this._requestTimeout = 120000;

    // 从 Hermes 配置读取 provider 信息
    this._hermesConfig = null;
    this._providerConfig = null;
  }

  /**
   * 读取 Hermes config.yaml，提取自定义 provider 的 base_url 和 api_key
   */
  _loadHermesConfig() {
    if (this._hermesConfig) return this._hermesConfig;

    const hermesRoot = this.config.hermesRoot
      || path.join(os.homedir(), 'AppData', 'Local', 'hermes');
    const configPath = path.join(hermesRoot, 'config.yaml');

    if (!fs.existsSync(configPath)) {
      console.warn('[HermesAdapter] config.yaml not found:', configPath);
      return null;
    }

    try {
      const raw = fs.readFileSync(configPath, 'utf8');
      this._hermesConfig = yaml.load(raw);

      // 提取当前使用的 provider 信息
      const modelName = this._hermesConfig?.model?.default;
      const customProviders = this._hermesConfig?.custom_providers || [];

      // 查找匹配的 custom provider（优先按 model 名匹配）
      for (const cp of customProviders) {
        if (cp.model === modelName) {
          this._providerConfig = {
            name: cp.name,
            baseUrl: cp.base_url,
            apiKey: cp.api_key,
            model: cp.model || modelName,
          };
          break;
        }
      }

      // 没找到精确匹配，用第一个 custom provider
      if (!this._providerConfig && customProviders.length > 0) {
        const cp = customProviders[0];
        this._providerConfig = {
          name: cp.name,
          baseUrl: cp.base_url,
          apiKey: cp.api_key,
          model: cp.model || modelName,
        };
      }

      return this._hermesConfig;
    } catch (e) {
      console.warn('[HermesAdapter] 读取 config.yaml 失败:', e.message);
      return null;
    }
  }

  /**
   * 获取 hermes 可执行文件路径
   */
  _getHermesExe() {
    const exePath = this.config.exePath || this.config.execPath;
    if (exePath && fs.existsSync(exePath)) return exePath;

    // 常见路径
    const candidates = [
      path.join(os.homedir(), 'AppData', 'Local', 'hermes', 'hermes-agent', 'venv', 'Scripts', 'hermes.exe'),
      path.join(os.homedir(), 'AppData', 'Local', 'hermes', 'hermes.exe'),
    ];
    for (const c of candidates) {
      if (fs.existsSync(c)) return c;
    }
    return null;
  }

  /**
   * 启动 Hermes Proxy
   * 命令: hermes proxy start --provider custom --base-url <URL> --api-key <KEY>
   */
  async start() {
    // 先检查是否已在运行
    const alive = await this.getStatus();
    if (alive.status === 'running') {
      return { success: true, message: 'Hermes Proxy 已在运行' };
    }

    // 读取 Hermes 配置
    this._loadHermesConfig();
    if (!this._providerConfig) {
      return { success: false, message: '未找到 Hermes 自定义 Provider 配置（config.yaml 中的 custom_providers）' };
    }

    const hermesExe = this._getHermesExe();
    if (!hermesExe) {
      return { success: false, message: '未找到 Hermes 可执行文件' };
    }

    // 构建启动参数
    const args = [
      'proxy', 'start',
      '--provider', 'custom',
      '--base-url', this._providerConfig.baseUrl,
      '--api-key', this._providerConfig.apiKey,
      '--port', String(this.proxyPort),
    ];

    const cwd = path.dirname(hermesExe);

    this._proc = spawn(hermesExe, args, {
      cwd,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    this._proc.stdout?.on('data', (d) => {
      console.log('[Hermes Proxy]', d.toString().trim());
    });
    this._proc.stderr?.on('data', (d) => {
      console.warn('[Hermes Proxy]', d.toString().trim());
    });

    this.status = 'starting';

    try {
      await this._waitForReady(15000);
      return { success: true, message: `Hermes Proxy 启动成功 (${this._providerConfig.name})` };
    } catch (e) {
      this.status = 'error';
      return { success: false, message: e.message };
    }
  }

  /**
   * 停止 Hermes Proxy
   */
  async stop() {
    if (this._proc) {
      try { this._proc.kill('SIGTERM'); } catch (e) {}
      this._proc = null;
    }
    // 也尝试通过端口找到并 kill 进程
    try {
      const { execSync } = require('child_process');
      const netstat = execSync('netstat -ano', { encoding: 'utf-8', timeout: 3000 });
      const lines = netstat.split('\n');
      for (const line of lines) {
        const m = line.match(new RegExp(`TCP\\s+127\\.0\\.0\\.1:${this.proxyPort}\\s+\\S+\\s+LISTENING\\s+(\\d+)`));
        if (m) {
          execSync(`taskkill /PID ${m[1]} /F`, { stdio: 'ignore' });
          break;
        }
      }
    } catch (e) {}
    this.status = 'offline';
    return { success: true };
  }

  /**
   * 获取状态
   */
  async getStatus() {
    try {
      const data = await this._httpGet('/health');
      if (data && (data.status === 'ok' || data.ok)) {
        this.status = 'running';
        return {
          status: 'running',
          hasChatAPI: true,
          provider: data.upstream || 'unknown',
          authenticated: data.authenticated || false,
        };
      }
    } catch (e) {}

    // 尝试 /v1/models
    try {
      const data = await this._httpGet('/v1/models');
      if (data && (data.data || data.object === 'list')) {
        this.status = 'running';
        return { status: 'running', hasChatAPI: true };
      }
    } catch (e) {}

    this.status = 'offline';
    return { status: 'offline' };
  }

  /**
   * 枚举 Agent（从 Hermes 配置读取）
   */
  async listAgents() {
    this._loadHermesConfig();

    const agents = [];

    // 从 custom_providers 读取可用模型
    const providers = this._hermesConfig?.custom_providers || [];
    for (const cp of providers) {
      agents.push({
        id: cp.model || cp.name,
        name: cp.model || cp.name,
        description: `Provider: ${cp.name}`,
      });
    }

    // 添加默认模型
    const defaultModel = this._hermesConfig?.model?.default;
    if (defaultModel && !agents.find(a => a.id === defaultModel)) {
      agents.unshift({
        id: defaultModel,
        name: defaultModel,
        description: 'Default model',
      });
    }

    // 至少返回一个
    if (agents.length === 0) {
      agents.push({ id: 'hermes-default', name: 'Hermes', description: 'Default Hermes Agent' });
    }

    return agents;
  }

  /**
   * 发送消息（非流式）
   */
  async sendMessage(agentId, message) {
    const body = JSON.stringify({
      model: agentId || this._providerConfig?.model || 'hermes-default',
      messages: [{ role: 'user', content: message }],
      stream: false,
      max_tokens: 4096,
    });

    try {
      const data = await this._httpPost('/v1/chat/completions', body);
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
  sendMessageStream(agentId, message, callbacks) {
    const { onChunk, onDone, onError } = callbacks || {};

    const body = JSON.stringify({
      model: agentId || this._providerConfig?.model || 'hermes-default',
      messages: [{ role: 'user', content: message }],
      stream: true,
      max_tokens: 4096,
    });

    const url = new URL(this.baseUrl);
    const headers = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
      'Accept': 'text/event-stream',
    };

    const options = {
      hostname: url.hostname,
      port: url.port,
      path: this._chatEndpoint,
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
        if (data && (data.status === 'ok' || data.ok)) {
          this.status = 'running';
          return;
        }
      } catch (e) {}
      await new Promise(r => setTimeout(r, 1000));
    }
    throw new Error('Hermes Proxy 启动超时（15秒）');
  }

  _httpGet(p) {
    return new Promise((resolve, reject) => {
      const url = new URL(p, this.baseUrl);
      const options = {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method: 'GET',
        timeout: 5000,
        headers: { 'Accept': 'application/json' },
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

  _httpPost(p, bodyString) {
    return new Promise((resolve, reject) => {
      const url = new URL(p, this.baseUrl);
      const options = {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method: 'POST',
        timeout: this._requestTimeout,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(bodyString),
        },
      };
      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => {
          if (res.statusCode >= 400) {
            reject(new Error(`${res.statusCode}: ${data.substring(0, 200)}`));
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

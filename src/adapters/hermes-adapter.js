const LOG_DIR = require('path').join(require('os').homedir(), 'AppData', 'Local', 'Echora', 'logs');
function logAdapter(level, msg, data) {
  try {
    const fs = require('fs');
    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
    const ts = new Date().toISOString();
    const line = '[' + ts + '] [' + level + '] ' + msg + (data ? ' ' + JSON.stringify(data) : '') + '\n';
    fs.appendFileSync(require('path').join(LOG_DIR, 'hermes-adapter.log'), line);
  } catch (e) {}
}
// Hermes 适配器 v3.2
// 通过 Hermes Gateway API Server 对接（端口 8083）
// Hermes 自己管理会话上下文、工具调用、记忆、技能
// Echora 只发最新一条消息，Hermes 从 state.db 加载历史
// v3.2: getStatus() 改用 gateway_state.json + PID 检测（解决状态识别问题）
// v3.1: 502 截断错误自动降级为流式模式

const BaseAdapter = require('./base-adapter');
const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');
const net = require('net');
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
    this._requestTimeout = 300000;
    this._hermesConfig = null;
    this._configParams = null;
    this._lastModelInfo = null;
    this._currentModel = null;  // null = use config default
  }

  _loadHermesConfig() {
    if (this._hermesConfig) return true;
    const hermesRoot = this.config.hermesRoot || path.join(os.homedir(), 'AppData', 'Local', 'hermes');
    const configPath = path.join(hermesRoot, 'config.yaml');
    if (!fs.existsSync(configPath)) return false;
    try {
      this._hermesConfig = yaml.load(fs.readFileSync(configPath, 'utf8'));
      this._configParams = {
        gatewayTimeout: ((this._hermesConfig?.agent?.gateway_timeout) || 1800) * 1000,
        maxTurns: (this._hermesConfig?.agent?.max_turns) || 90,
      };
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

  async start() {
    const alive = await this.getStatus();
    if (alive.status === 'running') return { success: true, message: 'Hermes API Server 已在运行' };

    this._loadHermesConfig();
    const hermesExe = this._getHermesExe();
    if (!hermesExe) return { success: false, message: '未找到 Hermes 可执行文件' };

    const args = ['gateway', 'run', '--replace'];
    this._proc = spawn(hermesExe, args, {
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,  // 隐藏 Windows 终端窗口
    });
    this._proc.stdout?.on('data', d => console.log('[Hermes]', d.toString().trim()));
    this._proc.stderr?.on('data', d => console.warn('[Hermes]', d.toString().trim()));

    this.status = 'starting';
    if (this._configParams) this._requestTimeout = this._configParams.gatewayTimeout;

    try {
      await this._waitForReady(30000);
      logAdapter('INFO', 'Hermes API Server started');
      return { success: true, message: 'Hermes API Server 启动成功' };
    } catch (e) {
      this.status = 'error';
      logAdapter('ERROR', 'sendMessage failed', { error: e.message });
      return { success: false, message: e.message };
    }
  }

  async stop() {
    // 1. 尝试杀子进程树（Echora 自己启动的）
    if (this._proc) {
      try {
        // Windows: 用 taskkill /T 杀进程树，避免残留子进程
        if (process.platform === 'win32' && this._proc.pid) {
          execSync(`taskkill /T /F /PID ${this._proc.pid}`, { stdio: 'ignore' });
        } else {
          this._proc.kill('SIGTERM');
        }
      } catch (e) {}
      this._proc = null;
    }
    // 2. 兜底：按端口查找并杀残留进程（防止多开）
    try {
      const netstat = execSync('netstat -ano', { encoding: 'utf-8', timeout: 3000 });
      for (const line of netstat.split('\n')) {
        const m = line.match(new RegExp(`TCP\\s+127\\.0\\.0\\.1:${this.apiPort}\\s+\\S+\\s+LISTENING\\s+(\\d+)`));
        if (m) {
          const pid = parseInt(m[1], 10);
          // 避免误杀：只杀 PID 不是当前 Echora 主进程的
          if (pid && pid !== process.pid) {
            execSync(`taskkill /T /F /PID ${pid}`, { stdio: 'ignore' });
          }
          break;
        }
      }
    } catch (e) {}
    this.status = 'offline';
    return { success: true };
  }

  async getStatus() {
    // 方式0: 快速 TCP 端口检查（< 100ms，不依赖 HTTP）
    try {
      await this._testPort(this.apiPort);
      this.status = 'running';
      logAdapter('INFO', 'getStatus: running (via TCP connect)', { port: this.apiPort });
      return { status: 'running', hasChatAPI: true, capabilities: [], fastCheck: true };
    } catch (e) {
      logAdapter('DEBUG', 'getStatus: TCP connect failed, trying next methods', { port: this.apiPort, error: e.message });
    }

    // 方式1: 读 gateway_state.json + 检查 PID 存活（最可靠）
    try {
      const hermesRoot = this.config.hermesRoot || path.join(os.homedir(), 'AppData', 'Local', 'hermes');
      const statePath = path.join(hermesRoot, 'gateway_state.json');
      if (fs.existsSync(statePath)) {
        const stateData = JSON.parse(fs.readFileSync(statePath, 'utf8'));
        if (stateData.gateway_state === 'running' && stateData.pid) {
          // 检查 PID 是否存活
          try {
            process.kill(stateData.pid, 0);  // signal 0 = 检查进程是否存在
            this.status = 'running';
            logAdapter('INFO', 'getStatus: running (via gateway_state.json)', { pid: stateData.pid });
            return {
              status: 'running',
              hasChatAPI: true,
              pid: stateData.pid,
              apiServerState: stateData.platforms?.api_server?.state || 'unknown',
              capabilities: [],
            };
          } catch (e) {
            // PID 不存在，进程已死
            logAdapter('WARN', 'getStatus: PID dead but state says running', { pid: stateData.pid });
          }
        }
      }
    } catch (e) {
      logAdapter('DEBUG', 'getStatus: gateway_state.json read failed', { error: e.message });
    }

    // 方式2: fallback 到 HTTP /health
    try {
      const data = await this._httpGet('/health');
      if (data && (data.status === 'ok' || data.status === 'running' || data.ok)) {
        this.status = 'running';
        logAdapter('INFO', 'getStatus: running (via /health)');
        return { status: 'running', hasChatAPI: true, capabilities: data.capabilities || [] };
      }
    } catch (e) {}

    this.status = 'offline';
    return { status: 'offline' };
  }

  async listAgents() {
    this._loadHermesConfig();
    const agents = [{ id: 'hermes-agent', name: 'Hermes Agent', description: '完整 Hermes agent（工具/记忆/技能）' }];
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

  // ========== 消息发送（502 自动降级流式） ==========

  async sendMessage(agentId, messages, userId) {
      logAdapter('INFO', 'sendMessage called', { agentId, userId, messageCount: Array.isArray(messages) ? messages.length : 1 });
    let latestMessage;
    if (Array.isArray(messages)) {
      latestMessage = messages[messages.length - 1]?.content || '';
    } else {
      latestMessage = messages || '';
    }

    let model = this._currentModel;
    if (!model) {
      if (agentId && agentId !== 'main' && agentId !== 'hermes-agent') {
        model = agentId.replace('hermes-', '');
      } else {
        this._loadHermesConfig();
        const m = this._hermesConfig?.model;
        model = (m?.default || m?.main) || 'deepseek-ai/deepseek-v4-pro';
      }
    }

    logAdapter('DEBUG', 'sendMessage model dispatch', { _currentModel: this._currentModel, resolvedModel: model, agentId });

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
    if (userId) headers['X-Hermes-Session-Id'] = userId;
    logAdapter('DEBUG', 'sendMessage headers', {
      hasSessionId: !!headers['X-Hermes-Session-Id'],
      sessionId: headers['X-Hermes-Session-Id'] || 'NONE',
      model,
      bodyPreview: latestMessage.substring(0, 200),
    });

    try {
      const data = await this._httpPost('/v1/chat/completions', body, headers);
      if (data?.choices?.[0]) {
        logAdapter('INFO', 'sendMessage success', {
          messageId: data.id,
          requestId: data._requestId || 'N/A',
          returnedSessionId: data._sessionId || 'N/A',
          sentSessionId: userId || 'N/A',
        });
      // 缓存模型和 usage 信息
      if (data.usage) {
        this._lastModelInfo = {
          model: data.model || 'hermes-agent',
          promptTokens: data.usage.prompt_tokens || 0,
          completionTokens: data.usage.completion_tokens || 0,
          totalTokens: data.usage.total_tokens || 0,
        };
      } else if (data.model) {
        this._lastModelInfo = { model: data.model, promptTokens: null, completionTokens: null, totalTokens: null };
      }
      return { success: true, content: data.choices[0].message.content, messageId: data.id, sessionId: data._sessionId || userId };
      }
      return { success: false, message: '无效响应格式' };
    } catch (e) {
      // 502 截断错误：降级为流式模式重试
      if (e.message && e.message.includes('502')) {
        logAdapter('WARN', '502 fallback to stream');
        return this._sendViaStream(model, latestMessage, userId);
      }
      logAdapter('ERROR', 'sendMessage failed', { error: e.message });
      return { success: false, message: e.message };
    }
  }

  // 流式降级：用 sendMessageStream 收集完整内容
  _sendViaStream(model, message, userId) {
    return new Promise((resolve) => {
      const body = JSON.stringify({
        model,
        messages: [{ role: 'user', content: message }],
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
      if (userId) headers['X-Hermes-Session-Id'] = userId;

      const options = {
        hostname: url.hostname, port: url.port, path: '/v1/chat/completions',
        method: 'POST', timeout: this._requestTimeout, headers,
      };

      let fullContent = '';
      let returnedSessionId = null;

      const req = http.request(options, (res) => {
        returnedSessionId = res.headers['x-hermes-session-id'] || null;
        logAdapter('DEBUG', '_sendViaStream response headers', {
          statusCode: res.statusCode,
          returnedSessionId: returnedSessionId || 'N/A',
          sentSessionId: userId || 'N/A',
        });

        if (res.statusCode >= 400) {
          let errBody = '';
          res.on('data', c => errBody += c);
          res.on('end', () => resolve({ success: false, message: `${res.statusCode}: ${errBody.substring(0, 200)}` }));
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
              resolve({ success: true, content: fullContent, sessionId: returnedSessionId });
              return;
            }
            try {
              const parsed = JSON.parse(payload);
              const delta = parsed.choices?.[0]?.delta?.content || '';
              if (delta) fullContent += delta;
            } catch (e) {}
          }
        });
        res.on('end', () => resolve({ success: true, content: fullContent, sessionId: returnedSessionId }));
      });
      req.setTimeout(this._requestTimeout, () => { req.destroy(); resolve({ success: false, message: '流式请求超时' }); });
      req.on('error', (err) => resolve({ success: false, message: err.message }));
      req.end(body);
    });
  }

  sendMessageStream(agentId, messages, callbacks, userId) {
    const { onChunk, onDone, onError, onToolCall } = callbacks || {};

    let latestMessage;
    if (Array.isArray(messages)) {
      latestMessage = messages[messages.length - 1]?.content || '';
    } else {
      latestMessage = messages || '';
    }

    let model = this._currentModel;
    if (!model) {
      if (agentId && agentId !== 'main' && agentId !== 'hermes-agent') {
        model = agentId.replace('hermes-', '');
      } else {
        this._loadHermesConfig();
        const m = this._hermesConfig?.model;
        model = (m?.default || m?.main) || 'deepseek-ai/deepseek-v4-pro';
      }
    }

    const body = JSON.stringify({
      model,
      messages: [{ role: 'user', content: latestMessage }],
      stream: true,
      max_tokens: 16384,
    });

    logAdapter('DEBUG', 'sendMessageStream called', {
      agentId,
      userId: userId || 'NONE',
      model,
      bodyPreview: latestMessage.substring(0, 200),
    });

    const url = new URL(this.baseUrl);
    const headers = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
      'Accept': 'text/event-stream',
      'Authorization': `Bearer ${this.apiKey}`,
    };
    if (userId) headers['X-Hermes-Session-Id'] = userId;

    const options = {
      hostname: url.hostname, port: url.port, path: '/v1/chat/completions',
      method: 'POST', timeout: this._requestTimeout, headers,
    };

    let fullContent = '';
    let returnedSessionId = null;

    const req = http.request(options, (res) => {
      returnedSessionId = res.headers['x-hermes-session-id'] || null;
      logAdapter('DEBUG', 'sendMessageStream response headers', {
        statusCode: res.statusCode,
        returnedSessionId: returnedSessionId || 'N/A',
        sentSessionId: userId || 'N/A',
        headers: Object.fromEntries(Object.entries(res.headers).filter(([k]) => k.includes('session') || k.includes('hermes'))),
      });

      if (res.statusCode >= 400) {
        let errBody = '';
        res.on('data', c => errBody += c);
        res.on('end', () => {
          if (onError) onError(new Error(`${res.statusCode}: ${errBody.substring(0, 200)}`));
        });
        return;
      }

      let buffer = '';
      let lastMessage = null;  // 保存最后一个完整 message（工具调用后可能在这里）
      res.on('data', (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data: ')) continue;
          const payload = trimmed.slice(6).trim();
          if (payload === '[DONE]') {
            // 优先用 fullContent，其次用 lastMessage（工具调用后的最终回复）
            const finalContent = fullContent || lastMessage || '';
            if (onDone) onDone(finalContent);
            return;
          }
          try {
            const parsed = JSON.parse(payload);
            // 捕获 delta.content（普通流式）
            const delta = parsed.choices?.[0]?.delta?.content || '';
            if (delta) { fullContent += delta; if (onChunk) onChunk(delta, fullContent); }
            // 捕获完整 message（工具调用后的最终回复可能在这里）
            const msg = parsed.choices?.[0]?.message?.content;
            if (msg) lastMessage = msg;
            // 捕获 tool_calls（工具调用信息）
            const toolCalls = parsed.choices?.[0]?.delta?.tool_calls;
            if (Array.isArray(toolCalls) && onToolCall) {
              for (const tc of toolCalls) {
                if (tc.function?.name) {
                  onToolCall({
                    name: tc.function.name,
                    arguments: tc.function.arguments || '',
                    id: tc.id || '',
                    index: tc.index ?? 0,
                  });
                }
              }
            }
          } catch (e) {}
        }
      });
      res.on('end', () => {
        const finalContent = fullContent || lastMessage || '';
        if (finalContent && onDone) onDone(finalContent);
      });
    });
    req.setTimeout(this._requestTimeout, () => { req.destroy(); if (onError) onError(new Error('请求超时')); });
    req.on('error', (err) => { if (onError) onError(err); });
    req.end(body);
    return req;
  }

  /**
   * 从 custom_providers 查找指定模型的上下文长度
   */
  _findContextLength(modelId) {
    if (!modelId) return null;
    try {
      const providers = this._hermesConfig?.custom_providers;
      if (!Array.isArray(providers)) return null;
      for (const p of providers) {
        if (p.models && p.models[modelId]) {
          return p.models[modelId].context_length || null;
        }
      }
    } catch (e) {}
    return null;
  }

  // ========== 模型信息 ==========

  /**
   * 获取当前模型信息：名称、上下文窗口大小、当前占用
   * 优先从缓存的配置解析，其次从最近一次响应的 usage 获取
   */
  async getModelInfo() {
    // 尝试读取 Hermes 配置获取模型名
    this._loadHermesConfig();

    let modelName = this._currentModel || null;
    let contextWindow = null;
    let contextUsed = null;
    let usagePct = null;

    // 1) 从 config.yaml 解析模型信息
    if (this._hermesConfig) {
      // 模型名：优先 _currentModel，其次 config.model.default/main
      if (!modelName) {
        const m = this._hermesConfig.model;
        modelName = (m && typeof m === 'object') ? (m.default || m.main) : (typeof m === 'string' ? m : null);
      }

      // 上下文窗口：从 custom_providers 匹配当前模型
      if (!contextWindow) {
        const targetModel = modelName || this._hermesConfig.model?.default || this._hermesConfig.model?.main;
        contextWindow = this._findContextLength(targetModel)
          || this._hermesConfig.model?.context_window
          || this._hermesConfig.model?.max_tokens;
      }
    }

    // 2) 尝试从缓存获取 usage
    if (this._lastModelInfo) {
      contextUsed = this._lastModelInfo.promptTokens || null;
      if (!modelName && this._lastModelInfo.model) modelName = this._lastModelInfo.model;
    }

    // 3) 尝试实时查询 /v1/models
    if (!modelName) {
      try {
        const modelsData = await this._httpGet('/v1/models');
        if (modelsData?.data?.[0]?.id) {
          modelName = modelsData.data[0].id;
        }
      } catch (e) { /* 忽略 */ }
    }

    // 4) 计算占用比例
    if (contextUsed && contextWindow) {
      usagePct = Math.round((contextUsed / contextWindow) * 100 * 10) / 10;
    }

    return {
      model: modelName,
      contextWindow,
      contextUsed,
      usagePct,
    };
  }

  // ========== 模型切换 ==========

  /**
   * 列出可用模型
   * 来源：1) config.yaml 的 model 2) /v1/models API 3) profiles 下的配置
   */
  async listModels() {
    const models = [];
    const seen = new Set();

    // 1) 从 config.yaml 解析默认模型
    this._loadHermesConfig();
    if (this._hermesConfig) {
      const m = this._hermesConfig.model;
      const defaultModel = (m && typeof m === 'object') ? (m.default || m.main) : m;
      if (typeof defaultModel === 'string' && !seen.has(defaultModel)) {
        seen.add(defaultModel);
        models.push({
          id: defaultModel,
          name: defaultModel.split('/').pop(),
          isDefault: true,
          source: 'config',
          base_url: m?.base_url || '',
          api_key: m?.api_key || '',
        });
      }
    }

    // 1.5) 从 custom_providers 解析所有可用模型（带连接信息）
    try {
      const providers = this._hermesConfig?.custom_providers;
      if (Array.isArray(providers)) {
        for (const p of providers) {
          const pModels = p.models;
          if (pModels && typeof pModels === 'object') {
            for (const modelId of Object.keys(pModels)) {
              if (!seen.has(modelId)) {
                seen.add(modelId);
                models.push({
                  id: modelId,
                  name: modelId.split('/').pop(),
                  isDefault: false,
                  source: 'custom_provider',
                  provider: p.name || '',
                  base_url: p.base_url || '',
                  api_key: p.api_key || '',
                });
              }
            }
          }
          const pSingle = p.model;
          if (typeof pSingle === 'string' && !seen.has(pSingle)) {
            seen.add(pSingle);
            models.push({
              id: pSingle,
              name: pSingle,
              isDefault: false,
              source: 'custom_provider',
              provider: p.name || '',
              base_url: p.base_url || '',
              api_key: p.api_key || '',
            });
          }
        }
      }
    } catch (e) {}

    // 2) 从 profiles 解析
    try {
      const hermesRoot = this.config.hermesRoot || path.join(os.homedir(), 'AppData', 'Local', 'hermes');
      const profilesDir = path.join(hermesRoot, 'profiles');
      if (fs.existsSync(profilesDir)) {
        const profiles = fs.readdirSync(profilesDir).filter(f =>
          fs.statSync(path.join(profilesDir, f)).isDirectory()
        );
        for (const p of profiles) {
          const pConfigPath = path.join(profilesDir, p, 'config.yaml');
          if (!fs.existsSync(pConfigPath)) continue;
          try {
            const pConfig = yaml.load(fs.readFileSync(pConfigPath, 'utf8'));
            const pModel = pConfig.model?.id || pConfig.model;
            if (typeof pModel === 'string' && !seen.has(pModel)) {
              seen.add(pModel);
              models.push({
                id: pModel,
                name: `${pModel.split('/').pop()} (${p})`,
                isDefault: false,
                source: 'profile',
                profile: p,
              });
            }
          } catch (e) {}
        }
      }
    } catch (e) {}

    // 3) 尝试从 /v1/models API 获取
    try {
      const modelsData = await this._httpGet('/v1/models');
      if (modelsData?.data && Array.isArray(modelsData.data)) {
        for (const m of modelsData.data) {
          if (!seen.has(m.id)) {
            seen.add(m.id);
            models.push({
              id: m.id,
              name: m.id.split('/').pop(),
              isDefault: false,
              source: 'api',
            });
          }
        }
      }
    } catch (e) {}

    return models;
  }

  /**
   * 设置当前使用的模型
   * @param {string|null} modelId 模型 ID，null 恢复默认
   */
  setModel(modelId) {
    this._currentModel = modelId || null;
    logAdapter('INFO', 'setModel', { model: this._currentModel || '(default)' });
    return { success: true, model: this._currentModel };
  }

  /**
   * 切换模型（Hermes 特有逻辑：修改 config.yaml + 重启 Gateway）
   * Hermes Gateway API Server 忽略请求 body 的 model 字段，
   * 必须修改 config.yaml 的 model.default 并重启才能生效。
   * @param {string|null} modelId 模型 ID，null 恢复默认
   * @returns {Promise<{success: boolean, needsRestart: boolean, message: string, model: string|null}>}
   */
  async switchModel(modelId) {
    const hermesRoot = this.config.hermesRoot || path.join(os.homedir(), 'AppData', 'Local', 'hermes');
    const configPath = path.join(hermesRoot, 'config.yaml');

    // 1. 读取配置
    if (!fs.existsSync(configPath)) {
      logAdapter('ERROR', 'switchModel: config.yaml not found', { configPath });
      return { success: false, needsRestart: false, message: '找不到 config.yaml' };
    }

    let config;
    try {
      config = yaml.load(fs.readFileSync(configPath, 'utf8'));
    } catch (e) {
      logAdapter('ERROR', 'switchModel: config.yaml parse failed', { error: e.message });
      return { success: false, needsRestart: false, message: '配置文件解析失败: ' + e.message };
    }

    // 2. 查找目标模型所属的 provider，获取 base_url + api_key
    if (!config.model) config.model = {};
    const oldModel = config.model.default;
    const newModel = modelId || config.model.main || 'deepseek-ai/deepseek-v4-pro';
    let newBaseUrl = null;
    let newApiKey = null;

    // 从 custom_providers 查找匹配的 provider
    const providers = config.custom_providers;
    if (Array.isArray(providers)) {
      for (const p of providers) {
        // 检查 models 字典
        if (p.models && typeof p.models === 'object' && p.models[newModel]) {
          newBaseUrl = p.base_url || null;
          newApiKey = p.api_key || null;
          break;
        }
        // 检查单模型字段
        if (p.model === newModel) {
          newBaseUrl = p.base_url || null;
          newApiKey = p.api_key || null;
          break;
        }
      }
    }

    // 更新 config.model 的所有字段
    config.model.default = newModel;
    if (newBaseUrl) config.model.base_url = newBaseUrl;
    if (newApiKey) config.model.api_key = newApiKey;
    this._currentModel = modelId || null;

    logAdapter('INFO', 'switchModel: updating config.yaml', {
      oldModel, newModel,
      base_url: newBaseUrl || '(unchanged)',
      hasApiKey: !!newApiKey,
    });

    // 3. 写回配置（保留 YAML 格式）
    try {
      const yamlStr = yaml.dump(config, {
        indent: 2,
        lineWidth: -1,
        noRefs: true,
        sortKeys: false,
        quotingType: '"',
      });
      fs.writeFileSync(configPath, yamlStr, 'utf8');
    } catch (e) {
      logAdapter('ERROR', 'switchModel: config.yaml write failed', { error: e.message });
      return { success: false, needsRestart: false, message: '配置文件写入失败: ' + e.message };
    }

    // 4. 重启 Hermes Gateway
    logAdapter('INFO', 'switchModel: restarting Gateway', { newModel });
    try {
      await this.stop();
      await new Promise(r => setTimeout(r, 1000));
      await this.start();
      logAdapter('INFO', 'switchModel: Gateway restarted successfully', { model: newModel });
      return { success: true, needsRestart: true, message: `已切换至 ${newModel}，Gateway 已重启`, model: newModel };
    } catch (e) {
      logAdapter('ERROR', 'switchModel: Gateway restart failed', { error: e.message });
      return { success: false, needsRestart: false, message: 'Gateway 重启失败: ' + e.message };
    }
  }

  // ========== 快速端口检查 ==========
  _testPort(port, timeoutMs = 100) {
    return new Promise((resolve, reject) => {
      const socket = new net.Socket();
      socket.setTimeout(timeoutMs);
      socket.connect(port, '127.0.0.1', () => { socket.destroy(); resolve(true); });
      socket.on('error', () => { socket.destroy(); reject(new Error('port not reachable')); });
      socket.on('timeout', () => { socket.destroy(); reject(new Error('timeout')); });
    });
  }

  /**
   * 获取当前选中的模型 ID
   */
  getCurrentModel() {
    if (this._currentModel) return this._currentModel;
    // 回退到 config.yaml 默认模型
    this._loadHermesConfig();
    return this._hermesConfig?.model?.id || this._hermesConfig?.model || 'hermes-agent';
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
    throw new Error('Hermes API Server 启动超时');
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
      // 详细日志：记录实际发送的 headers 和 body
      logAdapter('DEBUG', '_httpPost request', {
        url: `${url.hostname}:${url.port}${url.pathname}`,
        headers: { ...headers, 'Authorization': 'Bearer ***' },
        bodyPreview: bodyString.substring(0, 500),
        hasSessionId: !!extraHeaders['X-Hermes-Session-Id'],
        sessionId: extraHeaders['X-Hermes-Session-Id'] || 'NONE',
      });
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
      req.on('error', (err) => {
        logAdapter('ERROR', '_httpPost error', { error: err.message });
        reject(err);
      });
      req.end(bodyString);
    });
  }
}

module.exports = HermesAdapter;




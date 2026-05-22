// ConfigReader - AI 配置文件读取模块 v2.0
// 读取、发现、规范化 AI 网关配置（QClaw / OpenClaw / Hermes）
// v2.0: 新增 YAML 解析支持 + Hermes 配置发现与规范化

const fs = require('fs');
const path = require('path');
const os = require('os');
const yaml = require('js-yaml');

/** 敏感字段黑名单（大小写不敏感匹配） */
const SENSITIVE_KEYS = ['api_key', 'apikey', 'api-key', 'token', 'secret', 'password', 'passwd', 'auth_token', 'auth-token', 'access_key', 'access-token', 'api_server_key'];

/**
 * 递归过滤对象中的敏感字段
 * @param {*} value 任意值
 * @returns {*} 过滤后的值
 */
function filterSensitive(value) {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) {
    return value.map(item => filterSensitive(item));
  }
  if (typeof value === 'object') {
    const filtered = {};
    for (const [key, val] of Object.entries(value)) {
      const lowerKey = key.toLowerCase().replace(/[-_]/g, '');
      if (SENSITIVE_KEYS.some(sk => sk.replace(/[-_]/g, '') === lowerKey)) {
        filtered[key] = '***FILTERED***';
      } else {
        filtered[key] = filterSensitive(val);
      }
    }
    return filtered;
  }
  return value;
}

/**
 * 根据文件扩展名选择解析器
 * @param {string} raw 文件原始内容
 * @param {string} filePath 文件路径（用于扩展名判断）
 * @returns {object} 解析后的对象
 */
function parseByExtension(raw, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.yaml' || ext === '.yml') {
    return yaml.load(raw);
  }
  // 默认 JSON
  return JSON.parse(raw);
}

const ConfigReader = {
  /**
   * 读取并解析 AI 配置文件（自动识别 JSON / YAML）
   * @param {string} filePath 配置文件绝对路径
   * @returns {{ success: boolean, data?: object, error?: string }}
   */
  read(filePath) {
    try {
      // 1. 参数校验
      if (!filePath || typeof filePath !== 'string') {
        return { success: false, error: '未提供有效的配置文件路径' };
      }

      // 2. 检查文件是否存在
      if (!fs.existsSync(filePath)) {
        return { success: false, error: `配置文件不存在: ${filePath}` };
      }

      // 3. 检查是否为文件（而非目录）
      const stat = fs.statSync(filePath);
      if (!stat.isFile()) {
        return { success: false, error: `路径不是文件: ${filePath}` };
      }

      // 4. 读取文件内容
      const raw = fs.readFileSync(filePath, 'utf8');
      if (!raw || raw.trim().length === 0) {
        return { success: false, error: '配置文件为空' };
      }

      // 5. 根据扩展名解析（JSON 或 YAML）
      let data;
      try {
        data = parseByExtension(raw, filePath);
      } catch (parseErr) {
        const ext = path.extname(filePath).toLowerCase();
        const format = (ext === '.yaml' || ext === '.yml') ? 'YAML' : 'JSON';
        return { success: false, error: `${format} 解析失败: ${parseErr.message}` };
      }

      // 6. 验证解析结果
      if (typeof data !== 'object' || data === null) {
        return { success: false, error: '配置文件内容不是有效的对象' };
      }

      return { success: true, data };
    } catch (err) {
      // 权限错误等系统级异常
      if (err.code === 'EACCES' || err.code === 'EPERM') {
        return { success: false, error: `没有权限读取配置文件: ${filePath}` };
      }
      return { success: false, error: `读取配置失败: ${err.message}` };
    }
  },

  /**
   * 自动发现已知 AI 配置文件路径
   * @returns {{ qclaw: string|null, openclaw: string|null, hermes: string|null }}
   */
  discover() {
    const home = os.homedir();
    const knownPaths = {
      qclaw: path.join(home, '.qclaw', 'openclaw.json'),
      openclaw: path.join(home, '.openclaw', 'openclaw.json'),
      hermes: path.join(home, 'AppData', 'Local', 'hermes', 'config.yaml'),
    };

    const result = {};
    for (const [aiType, confPath] of Object.entries(knownPaths)) {
      try {
        if (fs.existsSync(confPath) && fs.statSync(confPath).isFile()) {
          result[aiType] = confPath;
        } else {
          result[aiType] = null;
        }
      } catch (e) {
        result[aiType] = null;
      }
    }

    return result;
  },

  /**
   * 发现 Hermes profiles 目录列表
   * @returns {Array<{name: string, configPath: string|null}>}
   */
  discoverHermesProfiles() {
    const home = os.homedir();
    const profilesDir = path.join(home, 'AppData', 'Local', 'hermes', 'profiles');
    const profiles = [];

    try {
      if (!fs.existsSync(profilesDir)) return profiles;
      const entries = fs.readdirSync(profilesDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const configPath = path.join(profilesDir, entry.name, 'config.yaml');
        const hasConfig = fs.existsSync(configPath);
        profiles.push({
          name: entry.name,
          configPath: hasConfig ? configPath : null,
        });
      }
    } catch (e) {
      console.warn('[ConfigReader] discoverHermesProfiles error:', e.message);
    }

    return profiles;
  },

  /**
   * 规范化提取配置（屏蔽敏感字段如 api_key、token）
   * @param {string} aiType AI 类型标识
   * @param {object} rawData 原始配置数据
   * @returns {{ agents: Array, models: Array, port: number|null, profiles?: Array }}
   */
  normalize(aiType, rawData) {
    if (aiType === 'hermes') {
      return this.normalizeHermes(rawData);
    }

    const result = {
      gateway: {},
      agents: [],
      models: [],
      session: {},
      tools: {},
      browser: {},
      port: null,
    };

    if (!rawData || typeof rawData !== 'object') return result;

    try {
      // === Gateway ===
      if (rawData.gateway) {
        const gw = rawData.gateway;
        result.gateway = {
          port: gw.port || null,
          mode: gw.mode || null,
          bind: gw.bind || null,
          authMode: gw.auth?.mode || null,
          httpEnabled: gw.http?.endpoints?.chatCompletions?.enabled ?? null,
          controlUiAllowInsecure: gw.controlUi?.allowInsecureAuth ?? null,
          tailscaleMode: gw.tailscale?.mode || null,
        };
        result.port = gw.port || null;
      }

      // === Agents ===
      if (rawData.agents?.list) {
        result.agents = rawData.agents.list.map(a => ({
          id: a.id || '',
          name: a.identity?.name || a.name || a.id || '',
          emoji: a.identity?.emoji || null,
          workspace: a.workspace || null,
          modelPrimary: a.model?.primary || null,
          modelFallbacks: a.model?.fallbacks || [],
          reasoningDefault: a.reasoningDefault || null,
          skills: a.skills || [],
          timeoutSeconds: a.timeoutSeconds || null,
          maxConcurrent: a.maxConcurrent || null,
        }));
      }

      // === Models ===
      if (rawData.models?.providers) {
        const providers = rawData.models.providers;
        const entries = Array.isArray(providers)
          ? providers.map((p, i) => [p.provider || p.name || `provider-${i}`, p])
          : Object.entries(providers);
        result.models = entries.map(([key, provider]) => ({
          provider: key,
          baseUrl: provider.base_url || provider.baseUrl || '',
          api: provider.api || null,
          models: (provider.models || []).map(m => ({
            id: m.id || '',
            name: m.name || m.id || '',
            contextWindow: m.contextWindow || null,
            maxTokens: m.maxTokens || null,
            input: m.input || [],
            reasoning: m.reasoning ?? null,
            cost: m.cost || null,
            // 完整路径 = providerId/modelId
            fullPath: `${key}/${m.id}`,
          })),
        }));
      }

      // === Session ===
      if (rawData.session) {
        result.session = {
          resetMode: rawData.session.resetMode || null,
          dmScope: rawData.session.dmScope || null,
          maxHistory: rawData.session.maxHistory || null,
        };
      }

      // === Tools ===
      if (rawData.tools) {
        result.tools = {
          allowBash: rawData.tools.allowBash ?? null,
          allowNetwork: rawData.tools.allowNetwork ?? null,
          toolTimeout: rawData.tools.timeout || null,
        };
      }

      // === Browser ===
      if (rawData.browser) {
        result.browser = {
          enabled: rawData.browser.enabled ?? null,
          engine: rawData.browser.engine || null,
        };
      }
    } catch (e) {
      console.warn('[ConfigReader] normalize 异常:', e.message);
    }

    return result;
  },

  /**
   * Hermes 专用规范化
   * Hermes 配置为 YAML 格式，结构不同于 QClaw/OpenClaw
   * @param {object} rawData Hermes config.yaml 解析后的数据
   * @returns {{ agents: Array, models: Array, port: number|null, profiles: Array, apiServerEnabled: boolean }}
   */
  normalizeHermes(rawData) {
    const result = {
      model: {},
      agent: {},
      memory: {},
      compression: {},
      delegation: {},
      browser: {},
      security: {},
      display: {},
      approvals: {},
      sessions: {},
      cron: {},
      toolsets: {},
      apiServer: {},
      agents: [],
      models: [],
      profiles: [],
      port: null,
    };

    if (!rawData || typeof rawData !== 'object') return result;

    try {
      const safeData = filterSensitive(rawData);

      // === Model ===
      if (safeData.model) {
        result.model = {
          default: safeData.model.default || null,
          main: safeData.model.main || null,
          maxTokens: safeData.model.max_tokens || null,
          temperature: safeData.model.temperature || null,
          topP: safeData.model.top_p || null,
        };
      }

      // === Agent ===
      if (safeData.agent) {
        result.agent = {
          maxTurns: safeData.agent.max_turns || null,
          gatewayTimeout: safeData.agent.gateway_timeout || null,
          reasoningEffort: safeData.agent.reasoning_effort || null,
        };
      }

      // === Memory ===
      if (safeData.memory) {
        result.memory = {
          enabled: safeData.memory.enabled ?? null,
          backend: safeData.memory.backend || null,
          maxEntries: safeData.memory.max_entries || null,
        };
      }

      // === Compression ===
      if (safeData.compression) {
        result.compression = {
          enabled: safeData.compression.enabled ?? null,
          windowSize: safeData.compression.window_size || null,
          truncateMode: safeData.compression.truncate_mode || null,
        };
      }

      // === Delegation ===
      if (safeData.delegation) {
        result.delegation = {
          enabled: safeData.delegation.enabled ?? null,
          agents: safeData.delegation.agents || [],
        };
      }

      // === Browser ===
      if (safeData.browser) {
        result.browser = {
          engine: safeData.browser.engine || null,
          path: safeData.browser.path || null,
        };
      }

      // === Security ===
      if (safeData.security) {
        result.security = {
          sandbox: safeData.security.sandbox ?? null,
          approvalMode: safeData.security.approval_mode || null,
        };
      }

      // === Display ===
      if (safeData.display) {
        result.display = {
          language: safeData.display.language || null,
          theme: safeData.display.theme || null,
        };
      }

      // === Approvals ===
      if (safeData.approvals) {
        result.approvals = {
          mode: safeData.approvals.mode || null,
          autoApprove: safeData.approvals.auto_approve ?? null,
        };
      }

      // === Sessions ===
      if (safeData.sessions) {
        result.sessions = {
          maxActive: safeData.sessions.max_active || null,
          idleTimeout: safeData.sessions.idle_timeout || null,
        };
      }

      // === Cron ===
      if (safeData.cron) {
        result.cron = {
          enabled: safeData.cron.enabled ?? null,
          jobs: safeData.cron.jobs || [],
        };
      }

      // === Toolsets ===
      if (safeData.toolsets) {
        result.toolsets = {
          enabled: safeData.toolsets.enabled ?? null,
          tools: safeData.toolsets.tools || [],
        };
      }

      // === API Server ===
      if (safeData.api_server) {
        const api = safeData.api_server;
        result.apiServer = {
          enabled: api.enabled ?? null,
          port: api.port || null,
          host: api.host || null,
        };
        result.port = api.port || 8642;
      }

      // === Profiles ===
      result.profiles = this.discoverHermesProfiles();
    } catch (e) {
      console.warn('[ConfigReader] normalizeHermes 异常:', e.message);
    }

    return result;
  },
};

module.exports = ConfigReader;

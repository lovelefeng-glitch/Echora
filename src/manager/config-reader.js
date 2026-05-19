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
      agents: [],
      models: [],
      port: null,
    };

    if (!rawData || typeof rawData !== 'object') {
      return result;
    }

    try {
      // 提取 agents
      if (rawData.agents && Array.isArray(rawData.agents.list)) {
        result.agents = rawData.agents.list.map(agent => ({
          id: agent.id || '',
          name: agent.name || agent.id || '',
          model: agent.model || undefined,
        }));
      }

      // 提取 models（过滤敏感字段）
      // providers 可能是对象 { name: {...} } 或数组 [{...}]
      if (rawData.models && rawData.models.providers) {
        const providers = rawData.models.providers;
        const providerEntries = Array.isArray(providers)
          ? providers.map((p, i) => [p.provider || p.name || `provider-${i}`, p])
          : Object.entries(providers);
        result.models = providerEntries.map(([key, provider]) => {
          const safeProvider = filterSensitive(provider);
          return {
            provider: key,
            base_url: safeProvider.base_url || safeProvider.baseUrl || '',
            models: safeProvider.models || [],
          };
        });
      }

      // 提取 port
      if (rawData.gateway && typeof rawData.gateway.port === 'number') {
        result.port = rawData.gateway.port;
      }
    } catch (e) {
      console.warn(`[ConfigReader] normalize 异常:`, e.message);
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
      agents: [],
      models: [],
      port: null,
      profiles: [],
      apiServerEnabled: false,
    };

    if (!rawData || typeof rawData !== 'object') {
      return result;
    }

    try {
      // 提取 agents（Hermes 的 agents 可能在不同位置）
      const safeData = filterSensitive(rawData);

      // Hermes agent 定义：agents 列表或单个 agent 配置
      if (safeData.agents && Array.isArray(safeData.agents)) {
        result.agents = safeData.agents.map((a, i) => ({
          id: a.id || a.name || `hermes-agent-${i}`,
          name: a.name || a.id || `Agent ${i + 1}`,
          model: a.model || undefined,
        }));
      } else if (safeData.agent) {
        result.agents.push({
          id: safeData.agent.id || 'hermes-default',
          name: safeData.agent.name || 'Hermes Agent',
          model: safeData.agent.model || undefined,
        });
      }

      // 提取 models / provider 信息
      if (safeData.models && Array.isArray(safeData.models)) {
        result.models = safeData.models.map(m => ({
          provider: m.provider || m.name || 'unknown',
          model: m.model || m.id || '',
        }));
      } else if (safeData.model || safeData.provider) {
        result.models.push({
          provider: safeData.provider || 'default',
          model: safeData.model || '',
        });
      }

      // 提取 API server 配置
      if (safeData.api_server || safeData.apiServer) {
        const apiServer = safeData.api_server || safeData.apiServer;
        result.port = apiServer.port || 8642;
        result.apiServerEnabled = apiServer.enabled === true || apiServer.enabled === 'true';
      } else {
        result.port = 8642; // 默认端口
      }

      // 也检查环境变量
      if (process.env.API_SERVER_ENABLED === 'true') {
        result.apiServerEnabled = true;
      }
      if (process.env.API_SERVER_PORT) {
        result.port = parseInt(process.env.API_SERVER_PORT) || 8642;
      }

      // Profiles 列表
      result.profiles = this.discoverHermesProfiles();
    } catch (e) {
      console.warn(`[ConfigReader] normalizeHermes 异常:`, e.message);
    }

    // 保底：至少有一个默认 agent
    if (result.agents.length === 0) {
      result.agents.push({ id: 'hermes-default', name: 'Hermes', description: 'Default Hermes Agent' });
    }

    return result;
  },
};

module.exports = ConfigReader;

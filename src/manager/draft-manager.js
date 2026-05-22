// DraftManager - 配置草稿文件管理
// 每个 AI 类型维护一个草稿文件，格式与原配置一致
// 启动时：原配置 → 草稿文件
// 编辑时：只读写草稿文件
// 保存时：草稿文件 → 备份原配置 → 写入原配置
// 重置时：原配置 → 覆盖草稿文件

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const os = require('os');
const ConfigReader = require('./config-reader');

const DRAFTS_DIR = path.join(__dirname, '..', '..', 'drafts');
const BACKUPS_DIR = path.join(__dirname, '..', '..', 'backups');

// 原配置文件路径
const ORIGINAL_PATHS = {
  qclaw: path.join(os.homedir(), '.qclaw', 'openclaw.json'),
  openclaw: path.join(os.homedir(), '.openclaw', 'openclaw.json'),
  hermes: path.join(os.homedir(), 'AppData', 'Local', 'hermes', 'config.yaml'),
};

// 草稿文件路径
function getDraftPath(aiType) {
  return path.join(DRAFTS_DIR, `${aiType}.json`);
}

// 备份文件路径
function getBackupPath(aiType, timestamp) {
  const ts = timestamp || new Date().toISOString().replace(/[:.]/g, '-');
  return path.join(BACKUPS_DIR, `${aiType}_${ts}.json`);
}

const DraftManager = {
  /**
   * 初始化草稿文件（启动时调用）
   * 读取原配置 → 写入草稿文件
   */
  init(aiType) {
    const originalPath = ORIGINAL_PATHS[aiType];
    const draftPath = getDraftPath(aiType);

    try {
      if (!originalPath || !fs.existsSync(originalPath)) {
        console.warn(`[DraftManager] 原配置不存在: ${aiType} → ${originalPath}`);
        // 创建空草稿
        fs.writeFileSync(draftPath, JSON.stringify({}, null, 2), 'utf8');
        return { success: false, error: '原配置不存在' };
      }

      const raw = fs.readFileSync(originalPath, 'utf8');
      let rawData;

      if (aiType === 'hermes') {
        rawData = yaml.load(raw) || {};
      } else {
        rawData = JSON.parse(raw);
      }

      // 关键：经过 normalize 转换为渲染器期望的格式
      const data = ConfigReader.normalize(aiType, rawData);

      // 写入草稿文件
      fs.writeFileSync(draftPath, JSON.stringify(data, null, 2), 'utf8');
      console.log(`[DraftManager] ${aiType} 草稿初始化完成（已 normalize）`);
      return { success: true };
    } catch (e) {
      console.error(`[DraftManager] ${aiType} 初始化失败:`, e.message);
      return { success: false, error: e.message };
    }
  },

  /**
   * 初始化所有 AI 类型
   */
  initAll() {
    const results = {};
    for (const aiType of Object.keys(ORIGINAL_PATHS)) {
      results[aiType] = this.init(aiType);
    }
    return results;
  },

  /**
   * 读取草稿文件
   */
  readDraft(aiType) {
    const draftPath = getDraftPath(aiType);
    try {
      if (!fs.existsSync(draftPath)) {
        // 草稿不存在 → 先初始化
        this.init(aiType);
      }
      const raw = fs.readFileSync(draftPath, 'utf8');
      return { success: true, data: JSON.parse(raw) };
    } catch (e) {
      return { success: false, error: e.message };
    }
  },

  /**
   * 写入草稿文件（编辑时调用）
   */
  writeDraft(aiType, data) {
    const draftPath = getDraftPath(aiType);
    try {
      fs.writeFileSync(draftPath, JSON.stringify(data, null, 2), 'utf8');
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  },

  /**
   * 保存草稿到原配置（用户点「保存」时调用）
   * 流程：备份原配置 → 转换格式 → 写入原配置
   */
  saveToOriginal(aiType) {
    const originalPath = ORIGINAL_PATHS[aiType];
    const draftPath = getDraftPath(aiType);

    try {
      // 1. 读取草稿（已 normalize 的数据）
      const draftRaw = fs.readFileSync(draftPath, 'utf8');
      const draftData = JSON.parse(draftRaw);

      // 2. 备份原配置
      if (originalPath && fs.existsSync(originalPath)) {
        const backupPath = getBackupPath(aiType);
        fs.copyFileSync(originalPath, backupPath);
        console.log(`[DraftManager] ${aiType} 原配置已备份: ${backupPath}`);
      }

      // 3. 反向转换：normalize 后的草稿 → 原始格式
      const originalData = this.denormalize(aiType, draftData);

      // 4. 转换格式并写入
      if (aiType === 'hermes') {
        const yamlStr = yaml.dump(originalData, { indent: 2, lineWidth: -1 });
        fs.writeFileSync(originalPath, yamlStr, 'utf8');
      } else {
        fs.writeFileSync(originalPath, JSON.stringify(originalData, null, 2), 'utf8');
      }

      console.log(`[DraftManager] ${aiType} 配置已保存（已 denormalize）`);
      return { success: true };
    } catch (e) {
      console.error(`[DraftManager] ${aiType} 保存失败:`, e.message);
      return { success: false, error: e.message };
    }
  },

  /**
   * 重置草稿（用户点「重置」时调用）
   * 原配置 → 覆盖草稿文件
   */
  resetDraft(aiType) {
    return this.init(aiType);
  },

  /**
   * 获取原始配置的 raw 数据（未 normalize）
   */
  readRaw(aiType) {
    const originalPath = ORIGINAL_PATHS[aiType];
    try {
      if (!originalPath || !fs.existsSync(originalPath)) return null;
      const raw = fs.readFileSync(originalPath, 'utf8');
      if (aiType === 'hermes') return yaml.load(raw) || {};
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  },

  /**
   * 将 normalize 后的草稿数据反向转换为原始配置格式
   * 保存时调用：草稿 → 原始格式 → 写入原配置文件
   */
  denormalize(aiType, draftData) {
    if (aiType === 'hermes') {
      // Hermes：草稿已经是扁平结构，需要转回 snake_case 嵌套
      return this._denormalizeHermes(draftData);
    }
    return this._denormalizeQClawOpenClaw(aiType, draftData);
  },

  _denormalizeQClawOpenClaw(aiType, d) {
    // 读取原始配置作为基础（保留草稿未涉及的字段）
    const raw = this.readRaw(aiType) || {};
    const result = JSON.parse(JSON.stringify(raw)); // 深拷贝

    // 反向写入 gateway
    if (d.gateway && result.gateway) {
      const gw = result.gateway;
      if (d.gateway.port != null) gw.port = d.gateway.port;
      if (d.gateway.mode) gw.mode = d.gateway.mode;
      if (d.gateway.bind) gw.bind = d.gateway.bind;
      if (d.gateway.authMode) { if (!gw.auth) gw.auth = {}; gw.auth.mode = d.gateway.authMode; }
      if (d.gateway.httpEnabled != null) { if (!gw.http) gw.http = {}; if (!gw.http.endpoints) gw.http.endpoints = {}; if (!gw.http.endpoints.chatCompletions) gw.http.endpoints.chatCompletions = {}; gw.http.endpoints.chatCompletions.enabled = d.gateway.httpEnabled; }
      if (d.gateway.controlUiAllowInsecure != null) { if (!gw.controlUi) gw.controlUi = {}; gw.controlUi.allowInsecureAuth = d.gateway.controlUiAllowInsecure; }
      if (d.gateway.tailscaleMode) { if (!gw.tailscale) gw.tailscale = {}; gw.tailscale.mode = d.gateway.tailscaleMode; }
    }

    // 反向写入 agents
    if (Array.isArray(d.agents) && result.agents?.list) {
      for (const agent of d.agents) {
        const rawAgent = result.agents.list.find(a => a.id === agent.id);
        if (rawAgent) {
          if (agent.name) { if (!rawAgent.identity) rawAgent.identity = {}; rawAgent.identity.name = agent.name; }
          if (agent.workspace) rawAgent.workspace = agent.workspace;
          if (agent.modelPrimary) { if (!rawAgent.model) rawAgent.model = {}; rawAgent.model.primary = agent.modelPrimary; }
          if (agent.modelFallbacks) { if (!rawAgent.model) rawAgent.model = {}; rawAgent.model.fallbacks = agent.modelFallbacks; }
          if (agent.reasoningDefault != null) rawAgent.reasoningDefault = agent.reasoningDefault;
        }
      }
    }

    // 反向写入 session / tools / browser
    if (d.session && result.session) {
      if (d.session.resetMode) result.session.resetMode = d.session.resetMode;
      if (d.session.dmScope) result.session.dmScope = d.session.dmScope;
      if (d.session.maxHistory != null) result.session.maxHistory = d.session.maxHistory;
    }
    if (d.tools && result.tools) {
      if (d.tools.allowBash != null) result.tools.allowBash = d.tools.allowBash;
      if (d.tools.allowNetwork != null) result.tools.allowNetwork = d.tools.allowNetwork;
      if (d.tools.toolTimeout != null) result.tools.timeout = d.tools.toolTimeout;
    }
    if (d.browser && result.browser) {
      if (d.browser.enabled != null) result.browser.enabled = d.browser.enabled;
      if (d.browser.engine) result.browser.engine = d.browser.engine;
    }

    return result;
  },

  _denormalizeHermes(d) {
    // 读取原始 YAML 配置作为基础
    const raw = this.readRaw('hermes') || {};
    const result = JSON.parse(JSON.stringify(raw));

    // 反向写入 model
    if (d.model && result.model) {
      if (d.model.default) result.model.default = d.model.default;
      if (d.model.main) result.model.main = d.model.main;
      if (d.model.maxTokens != null) result.model.max_tokens = d.model.maxTokens;
      if (d.model.temperature != null) result.model.temperature = d.model.temperature;
      if (d.model.topP != null) result.model.top_p = d.model.topP;
    }
    // agent
    if (d.agent && result.agent) {
      if (d.agent.maxTurns != null) result.agent.max_turns = d.agent.maxTurns;
      if (d.agent.gatewayTimeout != null) result.agent.gateway_timeout = d.agent.gatewayTimeout;
      if (d.agent.reasoningEffort) result.agent.reasoning_effort = d.agent.reasoningEffort;
    }
    // memory
    if (d.memory && result.memory) {
      if (d.memory.enabled != null) result.memory.memory_enabled = d.memory.enabled;
      if (d.memory.backend) result.memory.backend = d.memory.backend;
      if (d.memory.maxEntries != null) result.memory.max_entries = d.memory.maxEntries;
    }
    // compression
    if (d.compression && result.compression) {
      if (d.compression.enabled != null) result.compression.enabled = d.compression.enabled;
      if (d.compression.windowSize != null) result.compression.window_size = d.compression.windowSize;
      if (d.compression.truncateMode) result.compression.truncate_mode = d.compression.truncateMode;
    }
    // browser
    if (d.browser && result.browser) {
      if (d.browser.engine) result.browser.engine = d.browser.engine;
      if (d.browser.path) result.browser.path = d.browser.path;
    }
    // security
    if (d.security && result.security) {
      if (d.security.sandbox != null) result.security.sandbox = d.security.sandbox;
      if (d.security.approvalMode) result.security.approval_mode = d.security.approvalMode;
    }
    // display
    if (d.display && result.display) {
      if (d.display.language) result.display.language = d.display.language;
      if (d.display.theme) result.display.theme = d.display.theme;
    }
    // approvals
    if (d.approvals && result.approvals) {
      if (d.approvals.mode) result.approvals.mode = d.approvals.mode;
      if (d.approvals.autoApprove != null) result.approvals.auto_approve = d.approvals.autoApprove;
    }
    // api_server
    if (d.apiServer && result.api_server) {
      if (d.apiServer.enabled != null) result.api_server.enabled = d.apiServer.enabled;
      if (d.apiServer.port != null) result.api_server.port = d.apiServer.port;
      if (d.apiServer.host) result.api_server.host = d.apiServer.host;
    }

    return result;
  },

  /**
   * 获取备份文件列表
   */
  listBackups(aiType) {
    try {
      const files = fs.readdirSync(BACKUPS_DIR);
      return files
        .filter(f => f.startsWith(aiType + '_'))
        .sort()
        .reverse();
    } catch (e) {
      return [];
    }
  },

  /**
   * 获取原配置路径（只读展示）
   */
  getOriginalPath(aiType) {
    return ORIGINAL_PATHS[aiType] || null;
  },

  /**
   * 获取草稿文件路径
   */
  getDraftPath(aiType) {
    return getDraftPath(aiType);
  },
};

module.exports = DraftManager;

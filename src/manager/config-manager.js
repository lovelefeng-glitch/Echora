// 配置管理器 - 持久化用户配置（AI 路径、网关配置等）

const fs = require('fs');
const path = require('path');

let configPath = null;
let configData = {
  firstRun: true,
  aiPaths: {},           // { openclaw: 'C:/...', qclaw: 'D:/...' }
  gatewayConfigs: {},    // 各 AI 的网关启动配置
  lastActive: null,      // 上次活动的 AI
  settings: {
    autoStartOnBoot: false,
    minimizeToTray: true,
    checkUpdates: true,
    timeout: 120000,
    timeoutPerAI: {},
    pollInterval: 10000,
  },
  aiConfigPaths: {},     // AI 配置文件路径映射 { qclaw: '...', openclaw: '...' }
};

const ConfigManager = {
  init(filePath) {
    configPath = filePath;
    // 确保目录存在
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    // 尝试加载已有配置
    if (fs.existsSync(filePath)) {
      try {
        const raw = fs.readFileSync(filePath, 'utf-8');
        configData = { ...configData, ...JSON.parse(raw) };
      } catch (e) {
        console.warn('配置文件加载失败，使用默认配置:', e.message);
      }
    }
  },

  get(key) {
    return configData[key];
  },

  set(key, value) {
    configData[key] = value;
    this.save();
    return true;
  },

  getAll() {
    return { ...configData };
  },

  save() {
    if (!configPath) return false;
    try {
      fs.writeFileSync(configPath, JSON.stringify(configData, null, 2), 'utf-8');
      return true;
    } catch (e) {
      console.error('配置保存失败:', e);
      return false;
    }
  },

  reset() {
    configData = {
      firstRun: true,
      aiPaths: {},
      gatewayConfigs: {},
      lastActive: null,
      settings: {
        autoStartOnBoot: false,
        minimizeToTray: true,
        checkUpdates: true,
        timeout: 120000,
        timeoutPerAI: {},
        pollInterval: 10000,
      },
      aiConfigPaths: {},
    };
    this.save();
  },
};

module.exports = ConfigManager;
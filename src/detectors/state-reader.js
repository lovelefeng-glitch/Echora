// 网关状态文件读取器 - 从 AI 软件的状态文件反推网关运行状态
// 三层发现机制中的层级 3: 读取 gateway_state.json / gateway.lock / gateway.pid

const fs = require('fs');
const path = require('path');
const os = require('os');

// ========== 已知 AI 状态文件定义 ==========
const AI_STATE_FILES = {
  hermes: {
    name: 'Hermes',
    stateFile: path.join(os.homedir(), 'AppData', 'Local', 'hermes', 'gateway_state.json'),
    lockFile: path.join(os.homedir(), 'AppData', 'Local', 'hermes', 'gateway.lock'),
    pidFile: path.join(os.homedir(), 'AppData', 'Local', 'hermes', 'gateway.pid'),
    configFile: path.join(os.homedir(), 'AppData', 'Local', 'hermes', 'config.yaml'),
    profilesDir: path.join(os.homedir(), 'AppData', 'Local', 'hermes', 'profiles'),
    rootDir: path.join(os.homedir(), 'AppData', 'Local', 'hermes'),
  },
  qclaw: {
    name: 'QClaw',
    stateFile: path.join(os.homedir(), 'AppData', 'Local', 'QClaw', 'gateway_state.json'),
    lockFile: path.join(os.homedir(), 'AppData', 'Local', 'QClaw', 'gateway.lock'),
    pidFile: path.join(os.homedir(), 'AppData', 'Local', 'QClaw', 'gateway.pid'),
  },
  openclaw: {
    name: 'OpenClaw',
    stateFile: path.join(os.homedir(), '.openclaw', 'gateway_state.json'),
    lockFile: path.join(os.homedir(), '.openclaw', 'gateway.lock'),
    pidFile: path.join(os.homedir(), '.openclaw', 'gateway.pid'),
  },
};

/**
 * 检查进程是否存活
 * @param {number} pid
 * @returns {boolean}
 */
function isProcessAlive(pid) {
  if (!pid || pid <= 0) return false;
  try {
    // Windows: tasklist 检查 PID
    const result = require('child_process').execSync(
      `tasklist /FI "PID eq ${pid}" /NH`,
      { encoding: 'utf-8', timeout: 3000, stdio: ['pipe', 'pipe', 'pipe'] }
    );
    return result.includes(String(pid));
  } catch (e) {
    return false;
  }
}

/**
 * 安全读取 JSON 文件
 */
function readJsonFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

/**
 * 读取网关状态文件
 * @param {string} aiType - AI 类型键名
 * @returns {object | null}
 */
function readGatewayState(aiType) {
  const definition = AI_STATE_FILES[aiType];
  if (!definition) return null;

  const result = {
    aiType,
    name: definition.name,
    found: false,
    running: false,
    pid: null,
    state: null,        // 状态文件原始数据
    hasLock: false,     // lock 文件是否存在
    configExists: false, // 配置文件是否存在
    rootDir: definition.rootDir || null,
  };

  // 1. 读取 gateway_state.json
  if (definition.stateFile) {
    const stateData = readJsonFile(definition.stateFile);
    if (stateData) {
      result.found = true;
      result.state = stateData;
      result.pid = stateData.pid || null;
      result.stateFile = stateData.gateway_state || stateData.status || null;
      result.running = result.stateFile === 'running';
      result.argv = stateData.argv || null;
      result.activeAgents = stateData.active_agents || 0;
      result.updatedAt = stateData.updated_at || null;
    }
  }

  // 2. 检查 lock 文件
  if (definition.lockFile) {
    result.hasLock = fs.existsSync(definition.lockFile);
  }

  // 3. 检查 PID 文件
  if (definition.pidFile && !result.pid) {
    const pidData = readJsonFile(definition.pidFile);
    if (pidData && pidData.pid) {
      result.pid = pidData.pid;
      result.found = true;
    }
  }

  // 4. 验证进程是否存活
  if (result.pid) {
    result.processAlive = isProcessAlive(result.pid);
    // 状态文件说 running 且进程确实存活 = 确认运行中
    if (result.running && result.processAlive) {
      // 进程存活，确认运行
    } else if (result.running && !result.processAlive) {
      // 状态文件说运行但进程不在 = 僵尸状态
      result.running = false;
      result.stale = true;
    }
  }

  // 5. 检查配置文件
  if (definition.configFile) {
    result.configExists = fs.existsSync(definition.configFile);
  }

  return result;
}

// ========== 主读取器 ==========
const StateReader = {
  /**
   * 读取所有已知 AI 的状态文件
   * @returns {object} - { hermes: {...}, qclaw: {...}, openclaw: {...} }
   */
  readAll() {
    const results = {};
    for (const aiType of Object.keys(AI_STATE_FILES)) {
      results[aiType] = readGatewayState(aiType);
    }
    return results;
  },

  /**
   * 读取单个 AI 的状态
   * @param {string} aiType
   */
  readOne(aiType) {
    return readGatewayState(aiType);
  },

  /**
   * 扫描所有可能的 AI 根目录，发现未知 AI
   * @returns {Array<{rootDir: string, aiType: string, name: string, files: string[]}>}
   */
  discoverRoots() {
    const candidates = [
      // 已知路径
      { root: path.join(os.homedir(), 'AppData', 'Local', 'hermes'), type: 'hermes', name: 'Hermes' },
      { root: path.join(os.homedir(), 'AppData', 'Local', 'QClaw'), type: 'qclaw', name: 'QClaw' },
      { root: path.join(os.homedir(), '.openclaw'), type: 'openclaw', name: 'OpenClaw' },
      { root: path.join(os.homedir(), '.hermes'), type: 'hermes-alt', name: 'Hermes (alt)' },
      // 扫描常见安装路径
      { root: 'C:\\Program Files', type: 'scanned', name: 'Program Files' },
      { root: path.join(os.homedir(), 'AppData', 'Local', 'Programs'), type: 'scanned', name: 'Local Programs' },
    ];

    const discovered = [];

    for (const cand of candidates) {
      if (!fs.existsSync(cand.root)) continue;

      // 检查是否包含网关状态文件
      const stateFiles = ['gateway_state.json', 'gateway.lock', 'gateway.pid'];
      const foundFiles = [];
      for (const sf of stateFiles) {
        if (fs.existsSync(path.join(cand.root, sf))) {
          foundFiles.push(sf);
        }
      }

      // 检查是否包含配置文件
      const configFiles = ['config.yaml', 'config.json', 'openclaw.json'];
      for (const cf of configFiles) {
        if (fs.existsSync(path.join(cand.root, cf))) {
          foundFiles.push(cf);
        }
      }

      if (foundFiles.length > 0 && cand.type === 'scanned') {
        // 发现了未知 AI
        discovered.push({
          rootDir: cand.root,
          aiType: 'unknown',
          name: path.basename(cand.root),
          files: foundFiles,
        });
      }
    }

    return discovered;
  },

  /**
   * 获取已知 AI 状态文件定义（用于 UI 展示）
   */
  getDefinitions() {
    return Object.entries(AI_STATE_FILES).map(([type, def]) => ({
      type,
      name: def.name,
      stateFile: def.stateFile,
      rootDir: def.rootDir || path.dirname(def.stateFile),
    }));
  },
};

module.exports = StateReader;

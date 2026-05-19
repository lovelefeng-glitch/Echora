// AI 软件自动检测器 v0.3
// 三层发现机制: 进程名扫描 + 端口反推 + 状态文件读取

const PortScanner = require('./port-scanner');
const StateReader = require('./state-reader');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync, exec } = require('child_process');

// ========== 已知 AI 软件定义 ==========
const KNOWN_AI_SOFTWARE = {
  hermes: {
    name: 'Hermes',
    category: 'agent',
    exeNames: ['hermes.exe', 'hermes-agent.exe'],
    searchPaths: [
      path.join(os.homedir(), 'AppData', 'Local', 'hermes'),
      path.join(os.homedir(), '.hermes'),
    ],
    gatewayPatterns: [
      { processName: 'python.exe', cmdlineIncludes: 'hermes' },
      { processName: 'hermes.exe', cmdlineIncludes: null },
      { processName: 'hermes-agent.exe', cmdlineIncludes: null },
    ],
    configPattern: 'config.yaml',
    apiServerPort: 8642,
  },
  qclaw: {
    name: 'QClaw',
    category: 'agent',
    exeNames: ['QClaw.exe'],
    searchPaths: [
      'C:\\Program Files\\QClaw',
      path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'QClaw'),
    ],
    gatewayPatterns: [
      { processName: 'QClaw.exe', cmdlineIncludes: 'openclaw-gateway' },
    ],
  },
  openclaw: {
    name: 'OpenClaw',
    category: 'agent',
    exeNames: ['openclaw.cmd', 'openclaw'],
    searchPaths: [
      path.join(os.homedir(), '.openclaw'),
      path.join(os.homedir(), 'AppData', 'Roaming', 'npm'),
      'C:\\Program Files\\OpenClaw',
    ],
    npmPackage: 'openclaw',
    gatewayPatterns: [
      { processName: 'node.exe', cmdlineIncludes: 'openclaw' },
    ],
  },
  cursor: {
    name: 'Cursor',
    category: 'ide',
    exeNames: ['Cursor.exe'],
    searchPaths: [
      path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'Cursor'),
    ],
    gatewayPatterns: [
      { processName: 'Cursor.exe', cmdlineIncludes: null },
    ],
  },
  windsurf: {
    name: 'Windsurf',
    category: 'ide',
    exeNames: ['Windsurf.exe'],
    searchPaths: [
      path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'Windsurf'),
    ],
    gatewayPatterns: [
      { processName: 'Windsurf.exe', cmdlineIncludes: null },
    ],
  },
  trae: {
    name: 'Trae',
    category: 'ide',
    exeNames: ['Trae.exe'],
    searchPaths: [
      path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'Trae'),
    ],
    gatewayPatterns: [
      { processName: 'Trae.exe', cmdlineIncludes: null },
    ],
  },
  vscode: {
    name: 'VS Code (Copilot)',
    category: 'ide',
    exeNames: ['Code.exe'],
    searchPaths: [
      path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'Microsoft VS Code'),
    ],
    gatewayPatterns: [],
  },
};

/**
 * 从 netstat 输出解析 PID -> 端口列表
 */
function parseNetstat() {
  const portMap = new Map();
  let raw;
  try {
    raw = execSync('netstat -ano', { encoding: 'utf-8', timeout: 5000 });
  } catch (e) {
    return portMap;
  }

  for (const line of raw.split('\n')) {
    const m = line.match(/TCP\s+\S+:(\d+)\s+\S+\s+LISTENING\s+(\d+)/i);
    if (m) {
      const port = parseInt(m[1]);
      const pid = parseInt(m[2]);
      if (!portMap.has(pid)) portMap.set(pid, []);
      portMap.get(pid).push(port);
    }
  }
  return portMap;
}

/**
 * 获取所有进程信息（PID + 名称 + 命令行）
 */
function getProcesses() {
  let raw;
  try {
    raw = execSync(
      'powershell -NoProfile -Command "Get-CimInstance Win32_Process | Select-Object ProcessId,Name,CommandLine | ConvertTo-Json -Compress"',
      { encoding: 'utf-8', timeout: 10000, maxBuffer: 10 * 1024 * 1024 }
    );
  } catch (e) {
    console.error('[AIDetector] 进程扫描失败:', e.message);
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch (e) {
    console.error('[AIDetector] 进程 JSON 解析失败:', e.message);
    return [];
  }
}

// ========== 主检测器 ==========
const AIDetector = {
  /**
   * 完整扫描：文件 + 运行中网关（层级 1）
   */
  async scanAll(existingPaths = {}) {
    const fileResults = this.scanFiles(existingPaths);
    const gatewayResults = await this.scanGateways();
    const results = {};

    for (const [aiType, def] of Object.entries(KNOWN_AI_SOFTWARE)) {
      const f = fileResults[aiType] || { found: false, path: null };
      const gw = gatewayResults[aiType] || null;
      const alreadyRunning = !!(gw && gw.running);

      results[aiType] = {
        name: def.name,
        category: def.category,
        found: f.found || alreadyRunning,
        path: f.found ? f.path : null,
        source: f.source || (alreadyRunning ? 'running' : null),
        verified: f.verified || false,
        gateway: gw,
      };
    }
    return results;
  },

  /**
   * 扫描文件系统（自动发现可执行文件）
   */
  scanFiles(existingPaths = {}) {
    const results = {};
    for (const [aiType, def] of Object.entries(KNOWN_AI_SOFTWARE)) {
      // 1. 优先用已保存的路径
      if (existingPaths[aiType] && fs.existsSync(existingPaths[aiType])) {
        results[aiType] = { found: true, path: existingPaths[aiType], source: 'manual', verified: true };
        continue;
      }

      let found = null;

      // 2. 扫描已知路径
      for (const searchPath of def.searchPaths) {
        for (const exeName of def.exeNames) {
          const candidate = path.join(searchPath, exeName);
          if (fs.existsSync(candidate)) {
            found = { found: true, path: candidate, source: 'auto', verified: true };
            break;
          }
          const binCandidate = path.join(searchPath, 'bin', exeName);
          if (fs.existsSync(binCandidate)) {
            found = { found: true, path: binCandidate, source: 'auto', verified: true };
            break;
          }
        }
        if (found) break;
      }

      // 3. 通过 PATH 查找（CLI 工具）
      if (!found) {
        for (const exeName of def.exeNames) {
          try {
            const which = execSync(`where ${exeName} 2>nul`, { encoding: 'utf-8', timeout: 3000, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
            if (which) {
              const exePath = which.split('\n')[0].trim();
              if (fs.existsSync(exePath)) {
                found = { found: true, path: exePath, source: 'path', verified: true };
                break;
              }
            }
          } catch (e) {}
        }
      }

      // 4. npm 全局包检测
      if (!found && def.npmPackage) {
        try {
          const npmList = execSync('npm list -g --depth=0 --json', { encoding: 'utf-8', timeout: 8000, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
          if (npmList) {
            const parsed = JSON.parse(npmList);
            const deps = parsed.dependencies || {};
            if (deps[def.npmPackage]) {
              const ver = deps[def.npmPackage].version;
              const npmRoot = execSync('npm root -g', { encoding: 'utf-8', timeout: 3000 }).trim();
              const pkgPath = path.join(npmRoot, def.npmPackage);
              const cliPath = fs.existsSync(path.join(pkgPath, 'bin', 'openclaw.js'))
                ? path.join(pkgPath, 'bin', 'openclaw.js')
                : pkgPath;
              found = { found: true, path: cliPath, source: 'npm', version: ver, verified: true };
            }
          }
        } catch (e) { /* npm 不可用或包未安装 */ }
      }

      // QClaw 额外检查：通过 openclaw.json 配置确认
      if (!found && aiType === 'qclaw') {
        const qclawConfig = path.join(os.homedir(), '.qclaw', 'openclaw.json');
        if (fs.existsSync(qclawConfig)) {
          found = { found: true, path: qclawConfig, source: 'config', verified: true };
        }
      }

      results[aiType] = found || { found: false, path: null, source: null };
    }
    return results;
  },

  /**
   * 扫描运行中的网关进程
   */
  async scanGateways() {
    const results = {};
    const portMap = parseNetstat();
    const procList = getProcesses();

    for (const [aiType, def] of Object.entries(KNOWN_AI_SOFTWARE)) {
      if (!def.gatewayPatterns || def.gatewayPatterns.length === 0) continue;

      const candidates = [];

      for (const proc of procList) {
        const cmd = (proc.CommandLine || '').toLowerCase();
        const pname = (proc.Name || '').toLowerCase();

        for (const pattern of def.gatewayPatterns) {
          const nameOk = pname === pattern.processName.toLowerCase();
          const cmdOk = !pattern.cmdlineIncludes || cmd.includes(pattern.cmdlineIncludes.toLowerCase());

          if (nameOk && cmdOk) {
            const pid = proc.ProcessId;
            const ports = portMap.get(pid) || [];
            ports.sort((a, b) => a - b);
            candidates.push({
              running: true, pid,
              port: ports.length > 0 ? ports[0] : null,
              allPorts: ports,
              url: ports.length > 0 ? `http://127.0.0.1:${ports[0]}` : null,
            });
            break;
          }
        }
      }

      // 去重：按端口+进程名去重，选择第一个健康的
      let selected = null;
      for (const cand of candidates) {
        if (!cand.port) continue;
        const dup = Object.values(results).find(r => r.port === cand.port);
        if (dup) continue;

        cand.alive = await this._verifyGateway(cand.port);
        if (cand.alive && !selected) {
          selected = cand;
          break;
        }
      }

      if (!selected && candidates.length > 0) {
        for (const cand of candidates) {
          if (!cand.port) continue;
          if (!Object.values(results).find(r => r.port === cand.port)) {
            cand.alive = await this._verifyGateway(cand.port);
            selected = cand;
            break;
          }
        }
      }

      if (selected) results[aiType] = selected;
    }
    return results;
  },

  /**
   * 获取已知 AI 列表（用于下拉选择）
   */
  getKnownList() {
    return Object.entries(KNOWN_AI_SOFTWARE).map(([key, val]) => ({
      id: key,
      name: val.name,
      category: val.category,
    }));
  },

  // ========== 私有方法 ==========
  _verifyGateway(port) {
    if (!port) return Promise.resolve(false);
    return new Promise((resolve) => {
      const http = require('http');
      const healthPaths = ['/health', '/v1/health', '/'];
      let resolved = false;

      const tryPath = (idx) => {
        if (idx >= healthPaths.length) { resolved = true; return resolve(false); }
        const req = http.get(`http://127.0.0.1:${port}${healthPaths[idx]}`, { timeout: 2000 }, (res) => {
          if (!resolved) { resolved = true; resolve(res.statusCode >= 200 && res.statusCode < 500); }
        });
        req.on('error', () => {
          setTimeout(() => tryPath(idx + 1), 50);
        });
        req.on('timeout', () => { req.destroy(); tryPath(idx + 1); });
      };
      tryPath(0);
    });
  },

  // ========== 层级 2: 端口扫描发现 ==========
  /**
   * 端口扫描: 通过监听端口反推未知 AI 网关
   */
  async scanByPorts(ignorePorts = []) {
    return PortScanner.scan(ignorePorts);
  },

  // ========== 层级 3: 状态文件发现 ==========
  /**
   * 状态文件扫描: 读取已知 AI 的 gateway_state.json 等
   */
  scanByStateFiles() {
    return StateReader.readAll();
  },

  /**
   * 完整三层扫描: 进程名 + 端口反推 + 状态文件
   */
  async scanFull(existingPaths = {}, options = {}) {
    // 层级 1: 已有扫描
    const results = await this.scanAll(existingPaths);

    // 层级 2: 端口扫描
    const knownPorts = PortScanner.getKnownPorts();
    const portDiscovered = await this.scanByPorts([...knownPorts, ...(options.ignorePorts || [])]);

    // 层级 3: 状态文件
    const stateResults = this.scanByStateFiles();

    // 合并: 状态文件可以补充/确认层级 1 的结果
    for (const [aiType, stateInfo] of Object.entries(stateResults)) {
      if (stateInfo && stateInfo.found) {
        if (!results[aiType]) {
          results[aiType] = {
            name: stateInfo.name,
            category: 'agent',
            found: true,
            path: null,
            source: 'state-file',
            verified: false,
            gateway: null,
          };
        }
        if (stateInfo.running && (!results[aiType].gateway || !results[aiType].gateway.running)) {
          results[aiType].gateway = {
            running: true,
            pid: stateInfo.pid,
            port: null,
            url: null,
            alive: true,
            source: 'state-file',
          };
          results[aiType].found = true;
        }
      }
    }

    // 端口扫描: 找到的未知网关
    const unknownGateways = portDiscovered.filter(
      d => !results[d.aiType] || !results[d.aiType].found
    );

    return { results, unknownGateways, portDiscovered };
  },

  /**
   * 探测单个端口详情（用于用户查看未知网关）
   */
  async probePort(port) {
    return PortScanner.probePort(port);
  },

  /**
   * 动态注册新的 AI 类型（用于用户添加发现的新 AI）
   * @param {string} aiType - 类型键名
   * @param {object} definition - { name, category, knownPorts, httpChecks, ... }
   */
  registerType(aiType, definition) {
    // 添加到内存中的指纹库
    if (!KNOWN_AI_SOFTWARE[aiType]) {
      KNOWN_AI_SOFTWARE[aiType] = {
        name: definition.name || aiType,
        category: definition.category || 'agent',
        exeNames: definition.exeNames || [],
        searchPaths: definition.searchPaths || [],
        gatewayPatterns: definition.gatewayPatterns || [],
        configPattern: definition.configPattern || null,
        apiServerPort: definition.apiServerPort || null,
      };
    }
    // 同时注册到 PortScanner 指纹库
    if (definition.knownPorts) {
      PortScanner.registerFingerprint(aiType, {
        name: definition.name,
        category: definition.category,
        knownPorts: definition.knownPorts,
        httpChecks: definition.httpChecks || [{ path: '/', expectStatus: [200, 404] }],
        responsePatterns: definition.responsePatterns || [],
        processHints: definition.processHints || [],
      });
    }
  },
};

module.exports = AIDetector;

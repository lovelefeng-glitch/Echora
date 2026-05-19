// 端口扫描器 - 通过监听端口反推 AI 网关
// 三层发现机制中的层级 2: 端口扫描 + HTTP 指纹匹配

const { execSync } = require('child_process');
const http = require('http');

// ========== 网关指纹库 ==========
// 每个已知 AI 网关的识别特征
const GATEWAY_FINGERPRINTS = {
  qclaw: {
    name: 'QClaw',
    category: 'agent',
    knownPorts: [28789, 28791],
    httpChecks: [
      { path: '/', expectStatus: [200, 404] },
      { path: '/health', expectStatus: [200] },
    ],
    responsePatterns: [/openai|qclaw|gateway/i],
    processHints: ['QClaw.exe'],
  },
  openclaw: {
    name: 'OpenClaw',
    category: 'agent',
    knownPorts: [18789, 18791],
    httpChecks: [
      { path: '/health', expectStatus: [200] },
      { path: '/', expectStatus: [200, 404] },
    ],
    responsePatterns: [/openclaw|gateway/i],
    processHints: ['node.exe'],
    cmdlineHints: ['openclaw'],
  },
  hermes: {
    name: 'Hermes',
    category: 'agent',
    knownPorts: [8083, 8642],
    httpChecks: [
      { path: '/health', expectStatus: [200] },
      { path: '/v1/models', expectStatus: [200, 401] },
    ],
    responsePatterns: [/hermes|openai/i],
    processHints: ['hermes.exe', 'python.exe'],
    cmdlineHints: ['hermes'],
    // Hermes 特殊: 也通过状态文件检测
    stateFiles: [
      { root: '%LOCALAPPDATA%/hermes', file: 'gateway_state.json' },
    ],
  },
};

// 已知网关端口（用于过滤，不在扫描范围内）
const KNOWN_PORTS = new Set();
for (const fp of Object.values(GATEWAY_FINGERPRINTS)) {
  for (const p of fp.knownPorts) KNOWN_PORTS.add(p);
}

/**
 * 从 netstat 输出解析所有监听端口 → PID 映射
 * @returns {Map<number, {port: number, address: string}[]>}
 */
function parseListeningPorts() {
  const portMap = new Map(); // pid -> [{port, address}]
  let raw;
  try {
    raw = execSync('netstat -ano', { encoding: 'utf-8', timeout: 5000 });
  } catch (e) {
    console.error('[PortScanner] netstat 执行失败:', e.message);
    return portMap;
  }

  for (const line of raw.split('\n')) {
    const m = line.match(/TCP\s+(\S+):(\d+)\s+\S+\s+LISTENING\s+(\d+)/i);
    if (m) {
      const address = m[1];
      const port = parseInt(m[2]);
      const pid = parseInt(m[3]);
      // 只关注本地端口（127.0.0.1 或 0.0.0.0）
      if (address === '127.0.0.1' || address === '0.0.0.0' || address === '::1') {
        if (!portMap.has(pid)) portMap.set(pid, []);
        portMap.get(pid).push({ port, address });
      }
    }
  }
  return portMap;
}

/**
 * HTTP 探测单个端口，返回响应信息
 * @param {number} port
 * @param {string} path
 * @param {number} timeoutMs
 * @returns {Promise<{status: number, body: string, headers: object} | null>}
 */
function httpProbe(port, path = '/', timeoutMs = 2000) {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}${path}`, { timeout: timeoutMs }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          body: body.substring(0, 2000), // 限制 body 大小
          headers: res.headers,
        });
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

/**
 * 匹配响应内容是否符合某个指纹
 * @param {object} probeResult - httpProbe 返回值
 * @param {object} fingerprint - GATEWAY_FINGERPRINTS 中的某个条目
 * @returns {boolean}
 */
function matchFingerprint(probeResult, fingerprint) {
  if (!probeResult) return false;

  // 检查状态码
  const statusMatch = fingerprint.httpChecks.some(check =>
    check.expectStatus.includes(probeResult.status)
  );
  if (!statusMatch) return false;

  // 检查响应内容模式
  if (fingerprint.responsePatterns.length > 0) {
    return fingerprint.responsePatterns.some(pattern =>
      pattern.test(probeResult.body)
    );
  }

  // 没有内容模式要求，只要状态码匹配就算
  return true;
}

/**
 * 获取进程信息（名称 + 命令行）
 * @param {number} pid
 * @returns {{name: string, cmdline: string} | null}
 */
function getProcessInfo(pid) {
  try {
    const raw = execSync(
      `powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter 'ProcessId=${pid}' | Select-Object Name,CommandLine | ConvertTo-Json -Compress"`,
      { encoding: 'utf-8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] }
    );
    const parsed = JSON.parse(raw);
    return {
      name: parsed.Name || '',
      cmdline: parsed.CommandLine || '',
    };
  } catch (e) {
    return null;
  }
}

/**
 * 检查进程是否匹配某个指纹的进程特征
 */
function matchProcessHints(pid, fingerprint) {
  const info = getProcessInfo(pid);
  if (!info) return false;

  const nameLower = info.name.toLowerCase();
  const cmdLower = info.cmdline.toLowerCase();

  // 检查进程名
  const nameMatch = fingerprint.processHints.some(hint =>
    nameLower === hint.toLowerCase()
  );
  if (!nameMatch) return false;

  // 如果有命令行提示，也检查
  if (fingerprint.cmdlineHints && fingerprint.cmdlineHints.length > 0) {
    return fingerprint.cmdlineHints.some(hint =>
      cmdLower.includes(hint.toLowerCase())
    );
  }

  return true;
}

// ========== 主扫描器 ==========
const PortScanner = {
  /**
   * 扫描所有监听端口，尝试识别 AI 网关
   * @param {string[]} ignorePorts - 忽略的端口列表
   * @returns {Promise<Array<{port: number, pid: number, aiType: string, name: string, confidence: string, processName: string}>>}
   */
  async scan(ignorePorts = []) {
    const ignoreSet = new Set(ignorePorts.map(Number));
    const portMap = parseListeningPorts();
    const discovered = [];
    const scannedPorts = new Set();

    for (const [pid, entries] of portMap) {
      for (const { port } of entries) {
        // 跳过已知端口和忽略端口
        if (scannedPorts.has(port) || ignoreSet.has(port)) continue;
        scannedPorts.add(port);

        // 尝试 HTTP 探测
        const probeResult = await httpProbe(port, '/health');
        if (!probeResult) continue;

        // 尝试匹配每个指纹
        for (const [aiType, fingerprint] of Object.entries(GATEWAY_FINGERPRINTS)) {
          if (matchFingerprint(probeResult, fingerprint)) {
            // 额外验证: 检查进程信息
            const processMatch = matchProcessHints(pid, fingerprint);
            discovered.push({
              port,
              pid,
              aiType,
              name: fingerprint.name,
              category: fingerprint.category,
              confidence: processMatch ? 'high' : 'medium',
              processName: getProcessInfo(pid)?.name || 'unknown',
              probeStatus: probeResult.status,
              probeBodySnippet: probeResult.body.substring(0, 200),
            });
            break; // 一个端口只匹配一个指纹
          }
        }
      }
    }

    return discovered;
  },

  /**
   * 探测单个端口并返回详细信息（用于用户查看未知网关详情）
   * @param {number} port
   * @returns {Promise<object>}
   */
  async probePort(port) {
    const result = {
      port,
      alive: false,
      processes: [],
      httpResponses: [],
    };

    // 检查端口是否在监听
    const portMap = parseListeningPorts();
    let foundPid = null;
    for (const [pid, entries] of portMap) {
      if (entries.some(e => e.port === port)) {
        foundPid = pid;
        break;
      }
    }
    if (!foundPid) return result;

    // 获取进程信息
    const procInfo = getProcessInfo(foundPid);
    if (procInfo) {
      result.processes.push({
        pid: foundPid,
        name: procInfo.name,
        cmdline: procInfo.cmdline.substring(0, 500),
      });
    }

    // HTTP 探测多个路径
    const probePaths = ['/health', '/', '/v1/models', '/api/status'];
    for (const p of probePaths) {
      const resp = await httpProbe(port, p);
      if (resp) {
        result.alive = true;
        result.httpResponses.push({
          path: p,
          status: resp.status,
          bodySnippet: resp.body.substring(0, 300),
          contentType: resp.headers['content-type'] || 'unknown',
        });
      }
    }

    return result;
  },

  /**
   * 获取指纹库信息（用于 UI 展示已知 AI 类型）
   */
  getFingerprints() {
    return Object.entries(GATEWAY_FINGERPRINTS).map(([type, fp]) => ({
      type,
      name: fp.name,
      category: fp.category,
      knownPorts: fp.knownPorts,
    }));
  },

  /**
   * 获取已知网关端口列表
   */
  getKnownPorts() {
    return [...KNOWN_PORTS];
  },

  /**
   * 动态注册新的网关指纹（用于用户添加发现的新 AI）
   */
  registerFingerprint(aiType, fingerprint) {
    GATEWAY_FINGERPRINTS[aiType] = fingerprint;
    for (const p of fingerprint.knownPorts) {
      KNOWN_PORTS.add(p);
    }
  },
};

module.exports = PortScanner;


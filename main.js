// Echora - Electron Main Process
// 统一管理本地 AI 软件网关终端，实现跨 AI 对话
// v0.2: 自动检测并接管已运行的网关进程

const { app, BrowserWindow, ipcMain, dialog, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const { spawn, exec } = require('child_process');

// ---------- 模块加载 ----------
const EnvChecker = require('./src/detectors/env-checker');
const AIDetector = require('./src/detectors/ai-detector');
const GatewayManager = require('./src/manager/gateway-manager');
const ConfigManager = require('./src/manager/config-manager');
const OpenClawAdapter = require('./src/adapters/openclaw-adapter');
const HermesAdapter = require('./src/adapters/hermes-adapter');
const CursorAdapter = require('./src/adapters/cursor-adapter');
const ConfigReader = require('./src/manager/config-reader');
const { createAPIServer } = require('./src/api-server');

// ---------- 全局状态 ----------
let mainWindow = null;
let tray = null;
let isQuitting = false;
let configManager = null;
let gatewayManager = null;
const adapters = new Map(); // aiType → OpenClawAdapter
let apiServer = null;
let qclawToken = '';
let qclawPort = 28789;

// ---------- 窗口创建 ----------
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    title: 'Echora',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    backgroundColor: '#0d1117',
    show: false,
  });

  // 将窗口引用同步给网关管理器
  if (gatewayManager) gatewayManager.setMainWindow(mainWindow);

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    // 启动后自动执行环境检测和 AI 软件发现
    runStartupChecks();
  });

  mainWindow.on('close', (event) => {
    if (!isQuitting && tray) {
      event.preventDefault();
      mainWindow.hide();
      return false;
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ---------- 系统托盘 ----------
function createTray() {
  // 使用项目图标（如果太小则用 nativeImage 创建）
  const iconPath = path.join(__dirname, 'assets', 'icon.png');
  let icon;
  try {
    icon = nativeImage.createFromPath(iconPath);
    // 调整为托盘大小
    if (process.platform === 'win32') {
      icon = icon.resize({ width: 16, height: 16 });
    }
  } catch (e) {
    // 创建一个纯色小图标作为降级
    icon = nativeImage.createEmpty();
  }

  tray = new Tray(icon);
  tray.setToolTip('Echora - AI Hub');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '显示 Echora',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      },
    },
    { type: 'separator' },
    {
      label: '退出 Echora',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);

  // Windows: 单击托盘图标显示/隐藏
  tray.on('click', () => {
    if (!mainWindow) return;
    if (mainWindow.isVisible()) {
      mainWindow.focus();
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  // macOS: 双击 dock 图标也恢复窗口
  app.on('activate', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    } else {
      createWindow();
    }
  });
}

// ---------- 启动检查流程 ----------
async function runStartupChecks() {
  const config = configManager.getAll();

  // 1. 环境检测（仅首次）
  if (config.firstRun !== false) {
    const envResult = await EnvChecker.checkAll();
    safeSend('startup:env-check', envResult);
  }

  // 2. 扫描运行中的网关进程并接管（仅接管，不触发渲染层自动添加）
  const gateways = await AIDetector.scanGateways();
  for (const [aiType, info] of Object.entries(gateways)) {
    if (info.running) {
      gatewayManager.attach(aiType, info);
      console.log(`[Echora] 自动接管 ${aiType} 网关 (端口 ${info.port})`);
    }
  }

  // 2.5 确保 Hermes adapter 已创建，并立即检测状态（不等扫描或轮询）
  const hermesAdapter = getOrCreateAdapter('hermes');
  try {
    const hermesStatus = await hermesAdapter.getStatus();
    if (hermesStatus.status === 'running') {
      gatewayManager.attach('hermes', {
        pid: hermesStatus.pid || 0,
        port: hermesAdapter.apiPort || 8083,
        url: `http://127.0.0.1:${hermesAdapter.apiPort || 8083}`,
      });
      console.log('[Echora] Hermes 状态确认: running (via getStatus)');
    }
  } catch (e) { /* ignore */ }

  // 3. 给渲染进程发送已配置 AI + 运行状态
  const aiPaths = config.aiPaths || {};
  const configured = {};
  for (const [aiType, aiPath] of Object.entries(aiPaths)) {
    const def = AIDetector.getKnownList().find(k => k.id === aiType);
    configured[aiType] = {
      name: def?.name || aiType,
      category: def?.category || 'unknown',
      found: true,
      path: aiPath,
      source: 'manual',
      verified: true,
    };
  }
  safeSend('startup:ai-detected', configured);

  // 4. 发送网关状态
  const gwStatus = gatewayManager.getAllStatus();
  safeSend('gateway:statusAll', gwStatus);

  // 5. 标记首次运行完成
  if (config.firstRun !== false) {
    configManager.set('firstRun', false);
  }

  // 6. 启动定期状态轮询（每 10 秒）
  startStatusPolling();
}

function safeSend(channel, data) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    try { mainWindow.webContents.send(channel, data); } catch (e) {}
  }
}

// ---------- 定期状态轮询 ----------
let statusPollTimer = null;

function startStatusPolling() {
  if (statusPollTimer) clearInterval(statusPollTimer);
  statusPollTimer = setInterval(async () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    try {
      const gwStatus = gatewayManager.getAllStatus();

      // Hermes 特殊处理：用 adapter.getStatus() 读 gateway_state.json + PID 检测
      const hermesAdapter = adapters.get('hermes');
      if (hermesAdapter) {
        try {
          const hermesStatus = await hermesAdapter.getStatus();
          gwStatus.hermes = {
            ...gwStatus.hermes,
            status: hermesStatus.status,
            pid: hermesStatus.pid || gwStatus.hermes?.pid,
            port: gwStatus.hermes?.port || 8083,
            owned: true,
          };
          // 同步到 gatewayManager
          const hermesGw = gatewayManager.processes.get('hermes');
          if (hermesGw) hermesGw.status = hermesStatus.status;
        } catch (e) { /* ignore */ }
      }

      safeSend('gateway:statusAll', gwStatus);
    } catch (e) { /* ignore poll errors */ }
  }, 10000); // 每 10 秒
}

function stopStatusPolling() {
  if (statusPollTimer) {
    clearInterval(statusPollTimer);
    statusPollTimer = null;
  }
}

// ---------- 加载 QClaw Gateway 配置（token） ----------
function loadQclawConfig() {
  try {
    const fs = require('fs');
    const home = process.env.USERPROFILE || process.env.HOME || '~';
    const cfg = JSON.parse(fs.readFileSync(path.join(home, '.qclaw', 'openclaw.json'), 'utf8'));
    qclawToken = cfg.gateway?.auth?.token || '';
    qclawPort = cfg.gateway?.port || 28789;
    console.log('[Echora] QClaw token loaded (port %d)', qclawPort);
  } catch (e) {
    console.warn('[Echora] QClaw config not found:', e.message);
  }
}

// ---------- 端口查找 ----------
const DEFAULT_PORTS = { qclaw: 28789, openclaw: 18789, hermes: 8083 };

function getGatewayPort(aiType) {
  const gw = gatewayManager.getAllStatus();
  const info = gw[aiType];
  return info?.port || DEFAULT_PORTS[aiType] || null;
}

// ---------- 适配器工厂（懒加载） ----------
function getOrCreateAdapter(aiType, port) {
  // 优先从 gatewayManager 拿真实端口
  const realPort = port || getGatewayPort(aiType);
  const finalPort = realPort || DEFAULT_PORTS[aiType] || qclawPort;
  const baseUrl = `http://127.0.0.1:${finalPort}`;

  // 已有适配器但端口变了 → 更新
  if (adapters.has(aiType)) {
    const existing = adapters.get(aiType);
    if (existing.baseUrl !== baseUrl) {
      existing.baseUrl = baseUrl;
      existing.config.port = finalPort;
      console.log('[Echora] Adapter %s port updated: %d', aiType, finalPort);
    }
    return existing;
  }

  let adapter;
  if (aiType === 'cursor') {
    adapter = new CursorAdapter({ aiType: 'cursor' });
  } else if (aiType === 'hermes') {
    adapter = new HermesAdapter({
      port: finalPort,
      token: process.env.API_SERVER_KEY || '',
      baseUrl,
    });
  } else {
    adapter = new OpenClawAdapter({
      aiType,
      port: finalPort,
      token: qclawToken,
      baseUrl,
    });
  }

  adapter.onMessage((msg) => {
    safeSend('gateway:message', { aiType, ...msg });
  });

  adapters.set(aiType, adapter);
  console.log('[Echora] Adapter created for %s → %s', aiType, baseUrl);
  return adapter;
}

// ---------- IPC 处理 ----------
function setupIPC() {
  // === 网关管理 ===

  // 刷新网关检测（仅更新状态，不自动添加新 AI）
  ipcMain.handle('gateway:refresh', async () => {
    // 只更新已管理网关的状态，不调用 scanAll
    const gateways = gatewayManager.getAllStatus();

    // 额外检查是否有新运行的网关进程（仅更新状态，不触发 renderer 添加）
    const config = configManager.getAll();
    const detected = await AIDetector.scanGateways();
    for (const [aiType, info] of Object.entries(detected)) {
      if (info.running) {
        gatewayManager.attach(aiType, info);
      }
    }

    // Hermes 特殊处理：用 adapter.getStatus() 读 gateway_state.json
    const hermesAdapter = adapters.get('hermes');
    if (hermesAdapter) {
      try {
        const hermesStatus = await hermesAdapter.getStatus();
        if (hermesStatus.status === 'running') {
          gatewayManager.attach('hermes', {
            pid: hermesStatus.pid || 0,
            port: 8083,
            url: 'http://127.0.0.1:8083',
          });
        } else {
          // Hermes 不在运行，从 gatewayManager 移除
          gatewayManager.processes.delete('hermes');
        }
      } catch (e) { /* ignore */ }
    }

    // 返回已配置的 AI（aiPaths）供 renderer 绑定
    const aiPaths = config.aiPaths || {};
    const configured = {};
    for (const [aiType, aiPath] of Object.entries(aiPaths)) {
      const def = AIDetector.getKnownList().find(k => k.id === aiType);
      configured[aiType] = {
        name: def?.name || aiType,
        category: def?.category || 'unknown',
        found: true,
        path: aiPath,
        source: 'manual',
        verified: true,
      };
    }

    return {
      detected: configured,
      gateways: gatewayManager.getAllStatus(),
    };
  });

  // 手动接管网关
  ipcMain.handle('gateway:attach', async (event, aiType, port) => {
    gatewayManager.attach(aiType, {
      pid: 0,
      port,
      url: `http://127.0.0.1:${port}`,
    });
    return gatewayManager.getAllStatus();
  });

  ipcMain.handle('gateway:start', async (event, { aiType, exePath, config }) => {
    // Hermes 特殊处理：通过 adapter 启动
    if (aiType === 'hermes') {
      const adapter = getOrCreateAdapter('hermes');
      // 把 exePath 传给 adapter，让它知道可执行文件在哪
      if (exePath) adapter.config.exePath = exePath;
      return adapter.start();
    }
    return gatewayManager.start(aiType, exePath, config);
  });

  ipcMain.handle('gateway:stop', async (event, aiType) => {
    // Hermes 特殊处理：通过 adapter 停止 proxy
    if (aiType === 'hermes') {
      const adapter = adapters.get('hermes');
      if (adapter) return adapter.stop();
      return { success: true };
    }
    return gatewayManager.stop(aiType);
  });

  ipcMain.handle('gateway:restart', async (event, aiType) => {
    return gatewayManager.restart(aiType);
  });

  ipcMain.handle('gateway:status', async () => {
    return gatewayManager.getAllStatus();
  });

  // === 消息通道（AI 对话） ===

  // === Agent 管理 ===

  ipcMain.handle('agent:list', async (event, aiType) => {
    try {
      const adapter = getOrCreateAdapter(aiType || 'qclaw');
      return await adapter.listAgents();
    } catch (e) {
      return [{ id: 'main', name: '默认 Agent', description: '' }];
    }
  });

  ipcMain.handle('agent:modelInfo', async (event, aiType) => {
    try {
      const adapter = adapters.get(aiType);
      if (!adapter || typeof adapter.getModelInfo !== 'function') return { model: null };
      return await adapter.getModelInfo();
    } catch (e) {
      return { model: null };
    }
  });

  ipcMain.handle('agent:listModels', async (event, aiType) => {
    try {
      const adapter = adapters.get(aiType);
      if (!adapter || typeof adapter.listModels !== 'function') return [];
      return await adapter.listModels();
    } catch (e) {
      return [];
    }
  });

  ipcMain.handle('agent:setModel', async (event, aiType, modelId) => {
    try {
      const adapter = adapters.get(aiType);
      if (!adapter) return { success: false, needsRestart: false, message: '适配器未找到' };
      // 优先使用 switchModel（差异化逻辑），fallback 到 setModel
      if (typeof adapter.switchModel === 'function') {
        return await adapter.switchModel(modelId);
      } else if (typeof adapter.setModel === 'function') {
        const result = adapter.setModel(modelId);
        return { ...result, needsRestart: false };
      }
      return { success: false, needsRestart: false };
    } catch (e) {
      return { success: false, needsRestart: false, error: e.message };
    }
  });

  // === 消息通道 ===

  ipcMain.handle('message:send', async (event, { aiType, agentId, text, history, userId }) => {
    const adapter = getOrCreateAdapter(aiType || 'qclaw');
    // 如果带了 history（Hermes 等无状态 API），用 history；否则用 text（QClaw 等有状态 API）
    const messages = history || [{ role: 'user', content: text }];
    return adapter.sendMessage(agentId || 'main', messages, userId);
  });

  // 流式消息通道（fire-and-forget，chunk 通过 webContents.send 推送）
  ipcMain.on('message:sendStream', async (event, { aiType, agentId, text, userId, msgId }) => {
    const adapter = getOrCreateAdapter(aiType || 'qclaw');
    const send = (channel, data) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(channel, { msgId, ...data });
      }
    };
    try {
      adapter.sendMessageStream(agentId || 'main', text, {
        onChunk: (delta, fullContent) => {
          send('gateway:messageChunk', { delta, content: fullContent });
        },
        onDone: (fullContent, error) => {
          if (error) send('gateway:messageDone', { error: error.message || String(error) });
          else send('gateway:messageDone', { content: fullContent });
        },
        onError: (error) => {
          send('gateway:messageDone', { error: error.message || String(error) });
        }
      }, userId);
    } catch (e) {
      send('gateway:messageDone', { error: e.message });
    }
  });

  ipcMain.handle('message:status', async (event, aiType) => {
    const adapter = adapters.get(aiType || 'qclaw');
    if (!adapter) return { status: 'offline' };
    return adapter.getStatus();
  });

  // === 配置管理 ===

  ipcMain.handle('config:get', async (event, key) => {
    return configManager.get(key);
  });

  ipcMain.handle('config:set', async (event, key, value) => {
    return configManager.set(key, value);
  });

  ipcMain.handle('config:getAll', async () => {
    return configManager.getAll();
  });

  // AI 软件路径管理
  ipcMain.handle('ai:setPath', async (event, aiType, exePath) => {
    const paths = configManager.get('aiPaths') || {};
    paths[aiType] = exePath;
    configManager.set('aiPaths', paths);
    return true;
  });

  ipcMain.handle('ai:removePath', async (event, aiType) => {
    const paths = configManager.get('aiPaths') || {};
    delete paths[aiType];
    configManager.set('aiPaths', paths);
    // 同时清理适配器缓存
    adapters.delete(aiType);
    return true;
  });

  ipcMain.handle('ai:rescan', async () => {
    const paths = configManager.get('aiPaths') || {};
    return AIDetector.scanAll(paths);
  });

  // 自动检测（仅扫描，不自动添加到配置）— 返回结果供用户选择
  ipcMain.handle('ai:scan', async () => {
    const paths = configManager.get('aiPaths') || {};
    return AIDetector.scanAll(paths);
  });

  // === 环境检查 ===

  ipcMain.handle('env:check', async () => {
    return EnvChecker.checkAll();
  });

  // === 三层完整扫描（进程名 + 端口反推 + 状态文件） ===
  ipcMain.handle('ai:scanFull', async () => {
    const paths = configManager.get('aiPaths') || {};
    return AIDetector.scanFull(paths);
  });

  // === 探测单个端口详情 ===
  ipcMain.handle('ai:probePort', async (event, port) => {
    return AIDetector.probePort(port);
  });

  // === 添加发现的新 AI 类型 ===
  ipcMain.handle('ai:addDiscovered', async (event, { aiType, name, port, exePath }) => {
    if (exePath) {
      configManager.set('aiPaths', { ...configManager.get('aiPaths'), [aiType]: exePath });
    }
    if (port) {
      configManager.set('gatewayConfigs', { ...configManager.get('gatewayConfigs'), [aiType]: { port } });
    }
    return { success: true };
  });

  ipcMain.handle('env:install', async (event, tool) => {
    return EnvChecker.install(tool);
  });

  // === 文件对话框 ===

  ipcMain.handle('dialog:openFile', async (event, options) => {
    const opts = {
      title: options?.title || '选择 AI 程序文件',
      filters: [
        { name: '程序/脚本 (*.exe, *.cmd, *.bat)', extensions: ['exe', 'cmd', 'bat', 'ps1'] },
        { name: '所有文件 (*.*)', extensions: ['*'] },
      ],
      properties: ['openFile', 'dontAddToRecent'],
    };
    const result = await dialog.showOpenDialog(mainWindow, opts);
    return result;
  });

  // 选择目录（自动识别内部 AI 程序）
  ipcMain.handle('dialog:openDir', async (event, options) => {
    const opts = {
      title: options?.title || '选择 AI 安装目录',
      properties: ['openDirectory', 'dontAddToRecent'],
    };
    const result = await dialog.showOpenDialog(mainWindow, opts);
    return result;
  });

  // === AI 配置文件管理（只读） ===

  ipcMain.handle('ai-config:set-path', async (event, aiType, filePath) => {
    const paths = configManager.get('aiConfigPaths') || {};
    paths[aiType] = filePath;
    configManager.set('aiConfigPaths', paths);
    return true;
  });

  ipcMain.handle('ai-config:read', async (event, aiType) => {
    const paths = configManager.get('aiConfigPaths') || {};
    const filePath = paths[aiType];
    if (!filePath) return { success: false, error: `未注册 ${aiType} 的配置路径` };
    const result = ConfigReader.read(filePath);
    if (result.success) {
      result.data = ConfigReader.normalize(aiType, result.data);
    }
    return result;
  });

  ipcMain.handle('ai-config:discover', async () => {
    return ConfigReader.discover();
  });

  // === Hermes 专用 ===

  ipcMain.handle('hermes:profiles', async () => {
    return ConfigReader.discoverHermesProfiles();
  });

  ipcMain.handle('hermes:config', async () => {
    const paths = ConfigReader.discover();
    if (!paths.hermes) return { success: false, error: 'Hermes 配置文件未找到' };
    const result = ConfigReader.read(paths.hermes);
    if (result.success) {
      result.data = ConfigReader.normalize('hermes', result.data);
    }
    return result;
  });

  // === AI 配置列表 ===

  ipcMain.handle('ai-config:list', async () => {
    const paths = configManager.get('aiConfigPaths') || {};
    const list = {};
    for (const [aiType, filePath] of Object.entries(paths)) {
      const result = ConfigReader.read(filePath);
      list[aiType] = {
        path: filePath,
        status: result.success ? 'ok' : 'error',
        preview: result.success ? ConfigReader.normalize(aiType, result.data) : null,
        error: result.error || null,
      };
    }
    return list;
  });
}

// ---------- 应用生命周期 ----------

/** 检测端口是否被旧 Echora 实例占用，弹窗询问是否关闭 */
function checkPortConflict(port) {
  return new Promise((resolve) => {
    exec(`netstat -ano | findstr :${port} | findstr LISTENING`, { timeout: 3000 }, (err, stdout) => {
      if (err || !stdout || !stdout.trim()) {
        // 端口空闲
        return resolve(false);
      }

      // 提取 PID
      const m = stdout.trim().split(/\r?\n/)[0].match(/(\d+)$/);
      const pid = m ? m[1] : '?';

      dialog.showMessageBox({
        type: 'warning',
        title: 'Echora - 端口冲突',
        message: '检测到 Echora 已在运行',
        detail: `端口 ${port} 已被占用 (PID ${pid})。\n\n点击「关闭旧进程」将终止旧实例并重新启动。\n点击「取消」则退出本次启动。`,
        buttons: ['关闭旧进程', '取消'],
        defaultId: 0,
        cancelId: 1,
        noLink: true,
      }).then(({ response }) => {
        if (response === 0) {
          exec(`taskkill /pid ${pid} /T /F`, (killErr) => {
            if (killErr) {
              console.warn(`[Echora] taskkill 失败:`, killErr.message);
            }
            // 等待端口释放
            setTimeout(() => resolve(true), 2000);
          });
        } else {
          app.quit();
          resolve(false);
        }
      });
    });
  });
}

app.whenReady().then(async () => {
  ConfigManager.init(path.join(app.getPath('userData'), 'echora-config.json'));
  configManager = ConfigManager;

  // 🔒 端口冲突检测：避免多开
  await checkPortConflict(18790);

  gatewayManager = new GatewayManager();
  loadQclawConfig();
  setupIPC();
  createWindow();
  createTray();

  // 启动自控 API（端口 18790，外部 AI 可通过 HTTP 控制）
  apiServer = createAPIServer({
    getConfig: () => ConfigManager.getAll(),
    getState: () => ({}),
    AIDetector,
    gatewayManager,
    doScan: async () => {
      return AIDetector.scanAll(ConfigManager.getAll().aiPaths || {});
    },
  }, 18790);
});

app.on('window-all-closed', () => {
  // 有托盘时不退出
  if (process.platform !== 'darwin') {
    // 不自动退出，托盘保持运行
  }
});

app.on('before-quit', () => {
  isQuitting = true;
  if (apiServer) { apiServer.close(); apiServer = null; }
  if (gatewayManager) {
    gatewayManager.shutdownAll();
  }
});



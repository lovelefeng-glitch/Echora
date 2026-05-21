// Echora - Preload Script v0.2 (安全 IPC 桥梁)

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('echora', {
  // ===== 网关管理 =====
  gateway: {
    // 启动
    start: (aiType, exePath, config) =>
      ipcRenderer.invoke('gateway:start', { aiType, exePath, config }),

    // 停止
    stop: (aiType) =>
      ipcRenderer.invoke('gateway:stop', aiType),

    // 重启
    restart: (aiType) =>
      ipcRenderer.invoke('gateway:restart', aiType),

    // 获取全部状态
    status: () =>
      ipcRenderer.invoke('gateway:status'),

    // 🆕 刷新：重新扫描运行中的网关
    refresh: () =>
      ipcRenderer.invoke('gateway:refresh'),

    // 🆕 手动接管网关
    attach: (aiType, port) =>
      ipcRenderer.invoke('gateway:attach', aiType, port),

    // 监听网关状态变化
    onStatusChange: (callback) => {
      const handler = (event, data) => callback(data);
      ipcRenderer.on('gateway:statusChange', handler);
      return () => ipcRenderer.removeListener('gateway:statusChange', handler);
    },

    // 🆕 监听启动时全量网关状态
    onStatusAll: (callback) => {
      const handler = (event, data) => callback(data);
      ipcRenderer.on('gateway:statusAll', handler);
      return () => ipcRenderer.removeListener('gateway:statusAll', handler);
    },

    // 监听网关消息（AI 回复）
    onMessage: (callback) => {
      const handler = (event, data) => callback(data);
      ipcRenderer.on('gateway:message', handler);
      return () => ipcRenderer.removeListener('gateway:message', handler);
    },
  },

  // ===== 配置管理 =====
  config: {
    get: (key) => ipcRenderer.invoke('config:get', key),
    set: (key, value) => ipcRenderer.invoke('config:set', key, value),
    getAll: () => ipcRenderer.invoke('config:getAll'),
  },

  // ===== AI 配置文件管理（只读） =====
  aiConfig: {
    setPath: (aiType, filePath) => ipcRenderer.invoke('ai-config:set-path', aiType, filePath),
    read: (aiType) => ipcRenderer.invoke('ai-config:read', aiType),
    discover: () => ipcRenderer.invoke('ai-config:discover'),
    list: () => ipcRenderer.invoke('ai-config:list'),
  },

  // ===== Hermes 专用 =====
  hermes: {
    profiles: () => ipcRenderer.invoke('hermes:profiles'),
    config: () => ipcRenderer.invoke('hermes:config'),
  },

  // ===== AI 软件管理 =====
  ai: {
    setPath: (aiType, exePath) => ipcRenderer.invoke('ai:setPath', aiType, exePath),
    removePath: (aiType) => ipcRenderer.invoke('ai:removePath', aiType),
    rescan: () => ipcRenderer.invoke('ai:rescan'),
    scan: () => ipcRenderer.invoke('ai:scan'),
    scanFull: () => ipcRenderer.invoke('ai:scanFull'),
    probePort: (port) => ipcRenderer.invoke('ai:probePort', port),
    addDiscovered: (data) => ipcRenderer.invoke('ai:addDiscovered', data),
  },

  // ===== 环境检查 =====
  env: {
    check: () => ipcRenderer.invoke('env:check'),
    install: (tool) => ipcRenderer.invoke('env:install', tool),
  },

  // ===== 文件对话框 =====
  dialog: {
    openFile: (options) => ipcRenderer.invoke('dialog:openFile', options),
    openDir: (options) => ipcRenderer.invoke('dialog:openDir', options),
  },

  // ===== Agent 管理 =====
  agent: {
    list: (aiType) => ipcRenderer.invoke('agent:list', aiType),
    modelInfo: (aiType) => ipcRenderer.invoke('agent:modelInfo', aiType),
    listModels: (aiType) => ipcRenderer.invoke('agent:listModels', aiType),
    setModel: (aiType, modelId) => ipcRenderer.invoke('agent:setModel', aiType, modelId),
  },

  // ===== 消息通道（AI 对话） =====
  message: {
    send: (aiType, agentId, text, userId) =>
      ipcRenderer.invoke('message:send', { aiType, agentId, text, userId }),

    // 流式消息发送（fire-and-forget）
    sendStream: (aiType, agentId, text, userId, msgId) =>
      ipcRenderer.send('message:sendStream', { aiType, agentId, text, userId, msgId }),

    abortStream: (msgId) =>
      ipcRenderer.send('message:abortStream', { msgId }),

    status: (aiType) =>
      ipcRenderer.invoke('message:status', aiType),
  },

  // ===== 流式消息事件 =====
  onStream: {
    // 收到 chunk（实时增量内容）
    onChunk: (callback) => {
      const handler = (event, data) => callback(data);
      ipcRenderer.on('gateway:messageChunk', handler);
      return () => ipcRenderer.removeListener('gateway:messageChunk', handler);
    },
    // 收到完成或错误
    onDone: (callback) => {
      const handler = (event, data) => callback(data);
      ipcRenderer.on('gateway:messageDone', handler);
      return () => ipcRenderer.removeListener('gateway:messageDone', handler);
    },
    // 收到工具调用信息
    onToolCall: (callback) => {
      const handler = (event, data) => callback(data);
      ipcRenderer.on('gateway:messageToolCall', handler);
      return () => ipcRenderer.removeListener('gateway:messageToolCall', handler);
    },
  },

  // ===== 启动事件 =====
  onStartup: {
    envCheck: (callback) => {
      ipcRenderer.on('startup:env-check', (event, data) => callback(data));
    },
    aiDetected: (callback) => {
      ipcRenderer.on('startup:ai-detected', (event, data) => callback(data));
    },
  },
});

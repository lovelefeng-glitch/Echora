import { contextBridge, ipcRenderer } from 'electron'
import type {
  AppConfig,
  GatewayStatusMap,
  AgentListItem,
  ModelInfo,
  ModelListItem,
  SetModelResult,
  SendMessageResult,
  UsageInfo,
  ConvData,
  ConvListResult,
  ConversationsBulkSaveParams,
  OcSession,
  OcSessionHistoryMessage,
  SkillsListResult,
  AiConfigListResult,
  AiConfigDiscoverResult,
  HermesProfile,
  DraftPathsResult,
  NormalizedConfig,
  StartupEnvCheckData,
  AiProbePortResult,
  AiScanFullResult,
  MessageChunkData,
  MessageDoneData,
  MessageUsageData,
  MessageToolCallData,
  ThinkingInfo,
  ToolStepInfo,
  Attachment,
  AgentSessionMeta,
  AgentSession
} from '../shared/ipc-types'

const electronAPI = {
  window: {
    minimize: (): Promise<void> => ipcRenderer.invoke('window:minimize'),
    maximize: (): Promise<void> => ipcRenderer.invoke('window:maximize'),
    close: (): Promise<void> => ipcRenderer.invoke('window:close'),
    isMaximized: (): Promise<boolean> => ipcRenderer.invoke('window:isMaximized'),
    setTheme: (isLight: boolean): Promise<void> => ipcRenderer.invoke('window:setTheme', isLight),
    onMaximized: (callback: (maximized: boolean) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, isMax: boolean): void => callback(isMax)
      ipcRenderer.on('window:maximized', handler)
      return () => {
        ipcRenderer.removeListener('window:maximized', handler)
      }
    },
  },

  skills: {
    list: (aiType: string): Promise<SkillsListResult> =>
      ipcRenderer.invoke('skills:list', aiType),
  },

  gateway: {
    start: (aiType: string, exePath?: string, config?: object, profileName?: string): Promise<{ success: boolean; pid?: number; message?: string }> =>
      ipcRenderer.invoke('gateway:start', { aiType, exePath, config, profileName }),
    stop: (aiType: string, profileName?: string): Promise<{ success: boolean }> =>
      ipcRenderer.invoke('gateway:stop', aiType, profileName),
    restart: (aiType: string): Promise<{ success: boolean; message?: string }> =>
      ipcRenderer.invoke('gateway:restart', aiType),
    status: (): Promise<GatewayStatusMap> =>
      ipcRenderer.invoke('gateway:status'),
    refresh: (): Promise<{ detected: Record<string, import('../shared/ipc-types').AIDetected>; gateways: GatewayStatusMap }> =>
      ipcRenderer.invoke('gateway:refresh'),
    attach: (aiType: string, port: number): Promise<GatewayStatusMap> =>
      ipcRenderer.invoke('gateway:attach', aiType, port),
    onStatusChange: (callback: (data: import('../shared/ipc-types').GatewayStatusChangeData) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: import('../shared/ipc-types').GatewayStatusChangeData): void => callback(data)
      ipcRenderer.on('gateway:statusChange', handler)
      return () => {
        ipcRenderer.removeListener('gateway:statusChange', handler)
      }
    },
    onStatusAll: (callback: (data: GatewayStatusMap) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: GatewayStatusMap): void => callback(data)
      ipcRenderer.on('gateway:statusAll', handler)
      return () => {
        ipcRenderer.removeListener('gateway:statusAll', handler)
      }
    },
    onMessage: (callback: (data: import('../shared/ipc-types').GatewayMessageData) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: import('../shared/ipc-types').GatewayMessageData): void => callback(data)
      ipcRenderer.on('gateway:message', handler)
      return () => {
        ipcRenderer.removeListener('gateway:message', handler)
      }
    },
  },

  config: {
    get: (key: string): Promise<unknown> => ipcRenderer.invoke('config:get', key),
    set: (key: string, value: unknown): Promise<boolean> => ipcRenderer.invoke('config:set', key, value),
    getAll: (): Promise<AppConfig> => ipcRenderer.invoke('config:getAll'),
  },

  fileWhitelist: {
    save: (dirs: string[]): Promise<boolean> => ipcRenderer.invoke('fileWhitelist:save', dirs),
    openDir: (options?: Electron.OpenDialogOptions): Promise<Electron.OpenDialogReturnValue> => ipcRenderer.invoke('dialog:openDir', options),
  },

  conv: {
    list: (agentKey?: string): Promise<ConvListResult> => ipcRenderer.invoke('conv:list', agentKey),
    get: (agentKey: string, convId: string): Promise<ConvData | null> => ipcRenderer.invoke('conv:get', agentKey, convId),
    save: (agentKey: string, convId: string, conv: ConvData): Promise<boolean> => ipcRenderer.invoke('conv:save', agentKey, convId, conv),
    delete: (agentKey: string, convId: string): Promise<boolean> => ipcRenderer.invoke('conv:delete', agentKey, convId),
    deleteAll: (agentKey: string): Promise<boolean> => ipcRenderer.invoke('conv:deleteAll', agentKey),
  },

  conversations: {
    save: (data: ConversationsBulkSaveParams): Promise<boolean> => ipcRenderer.invoke('conversations:save', data),
    load: (): Promise<ConvListResult> => ipcRenderer.invoke('conversations:load'),
  },

  ocSessions: {
    list: (aiType: string, opts?: Record<string, unknown>): Promise<OcSession[]> => ipcRenderer.invoke('oc-sessions:list', aiType, opts),
    history: (sessionKey: string, limit?: number): Promise<OcSessionHistoryMessage[]> => ipcRenderer.invoke('oc-sessions:history', sessionKey, limit),
    create: (params: Record<string, unknown>): Promise<unknown> => ipcRenderer.invoke('oc-sessions:create', params),
    delete: (sessionKey: string): Promise<boolean> => ipcRenderer.invoke('oc-sessions:delete', sessionKey),
    reset: (sessionKey: string): Promise<boolean> => ipcRenderer.invoke('oc-sessions:reset', sessionKey),
  },

  aiConfig: {
    setPath: (aiType: string, filePath: string): Promise<boolean> => ipcRenderer.invoke('ai-config:set-path', aiType, filePath),
    read: (aiType: string): Promise<{ success: boolean; data?: NormalizedConfig; error?: string }> => ipcRenderer.invoke('ai-config:read', aiType),
    discover: (): Promise<AiConfigDiscoverResult> => ipcRenderer.invoke('ai-config:discover'),
    list: (): Promise<AiConfigListResult> => ipcRenderer.invoke('ai-config:list'),
  },

  draft: {
    read: (aiType: string): Promise<{ success: boolean; data?: NormalizedConfig; error?: string }> => ipcRenderer.invoke('draft:read', aiType),
    write: (aiType: string, data: NormalizedConfig): Promise<{ success: boolean }> => ipcRenderer.invoke('draft:write', aiType, data),
    save: (aiType: string): Promise<{ success: boolean; error?: string }> => ipcRenderer.invoke('draft:save', aiType),
    reset: (aiType: string): Promise<{ success: boolean; error?: string }> => ipcRenderer.invoke('draft:reset', aiType),
    backups: (aiType: string): Promise<string[]> => ipcRenderer.invoke('draft:backups', aiType),
    paths: (): Promise<DraftPathsResult> => ipcRenderer.invoke('draft:paths'),
  },

  hermes: {
    profiles: (): Promise<HermesProfile[]> => ipcRenderer.invoke('hermes:profiles'),
    config: (): Promise<{ success: boolean; data?: import('../shared/ipc-types').NormalizedHermesConfig; error?: string }> => ipcRenderer.invoke('hermes:config'),
  },

  ai: {
    setPath: (aiType: string, exePath: string): Promise<boolean> => ipcRenderer.invoke('ai:setPath', aiType, exePath),
    removePath: (aiType: string): Promise<boolean> => ipcRenderer.invoke('ai:removePath', aiType),
    rescan: (): Promise<import('../shared/ipc-types').AIDetected> => ipcRenderer.invoke('ai:rescan'),
    scan: (): Promise<import('../shared/ipc-types').AIDetected> => ipcRenderer.invoke('ai:scan'),
    scanFull: (): Promise<AiScanFullResult> => ipcRenderer.invoke('ai:scanFull'),
    probePort: (port: number): Promise<AiProbePortResult> => ipcRenderer.invoke('ai:probePort', port),
    addDiscovered: (data: import('../shared/ipc-types').AiAddDiscoveredParams): Promise<{ success: boolean }> => ipcRenderer.invoke('ai:addDiscovered', data),
  },

  env: {
    check: (): Promise<StartupEnvCheckData> => ipcRenderer.invoke('env:check'),
    install: (tool: string): Promise<{ success: boolean; message: string }> => ipcRenderer.invoke('env:install', tool),
  },

  dialog: {
    openFile: (options?: Electron.OpenDialogOptions): Promise<Electron.OpenDialogReturnValue> => ipcRenderer.invoke('dialog:openFile', options),
    openDir: (options?: Electron.OpenDialogOptions): Promise<Electron.OpenDialogReturnValue> => ipcRenderer.invoke('dialog:openDir', options),
  },

  agent: {
    list: (aiType: string): Promise<AgentListItem[]> => ipcRenderer.invoke('agent:list', aiType),
    modelInfo: (aiType: string, agentId?: string): Promise<ModelInfo> => ipcRenderer.invoke('agent:modelInfo', aiType, agentId),
    listModels: (aiType: string, agentId?: string): Promise<ModelListItem[]> => ipcRenderer.invoke('agent:listModels', aiType, agentId),
    setModel: (aiType: string, modelId: string, agentId?: string): Promise<SetModelResult> => ipcRenderer.invoke('agent:setModel', aiType, modelId, agentId),
    
    // Agent运行方法
    run: (params: { providerId: string; model: string; message: string; systemPrompt?: string }): Promise<{ success: boolean; content?: string; error?: string }> =>
      ipcRenderer.invoke('agent:run', params),
    runStream: (params: { providerId: string; model: string; message: string; systemPrompt?: string; msgId: string; sessionId?: string }): void =>
      ipcRenderer.send('agent:runStream', params),
    cancel: (): Promise<{ success: boolean }> =>
      ipcRenderer.invoke('agent:cancel'),
    clearHistory: (sessionId: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('agent:clearHistory', sessionId),
    getStatus: (): Promise<{ state: string; currentStep: number; totalSteps: number }> =>
      ipcRenderer.invoke('agent:getStatus'),
    
    // Agent流式事件监听
    onMessageChunk: (callback: (data: { msgId: string; delta: string; fullContent: string }) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: { msgId: string; delta: string; fullContent: string }): void => callback(data)
      ipcRenderer.on('agent:messageChunk', handler)
      return () => { ipcRenderer.removeListener('agent:messageChunk', handler) }
    },
    onMessageDone: (callback: (data: { msgId: string; fullContent: string; usage?: UsageInfo }) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: { msgId: string; fullContent: string; usage?: UsageInfo }): void => callback(data)
      ipcRenderer.on('agent:messageDone', handler)
      return () => { ipcRenderer.removeListener('agent:messageDone', handler) }
    },
    onMessageError: (callback: (data: { msgId: string; error: string }) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: { msgId: string; error: string }): void => callback(data)
      ipcRenderer.on('agent:messageError', handler)
      return () => { ipcRenderer.removeListener('agent:messageError', handler) }
    },
    onToolCall: (callback: (data: { msgId: string } & import('../shared/ipc-types').ToolCallInfo) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: { msgId: string } & import('../shared/ipc-types').ToolCallInfo): void => callback(data)
      ipcRenderer.on('agent:toolCall', handler)
      return () => { ipcRenderer.removeListener('agent:toolCall', handler) }
    },
    onStepUpdate: (callback: (data: { msgId: string; stepNumber: number; type: string; content: string }) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: { msgId: string; stepNumber: number; type: string; content: string }): void => callback(data)
      ipcRenderer.on('agent:stepUpdate', handler)
      return () => { ipcRenderer.removeListener('agent:stepUpdate', handler) }
    },
  },

  sessions: {
    list: (agentId?: string): Promise<AgentSessionMeta[]> =>
      ipcRenderer.invoke('agent:sessions:list', agentId),
    load: (sessionId: string): Promise<AgentSession | null> =>
      ipcRenderer.invoke('agent:sessions:load', sessionId),
    delete: (sessionId: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('agent:sessions:delete', sessionId),
  },

  message: {
    send: (aiType: string, agentId: string, text: string, userId?: string): Promise<SendMessageResult> =>
      ipcRenderer.invoke('message:send', { aiType, agentId, text, userId }),
    sendStream: (params: { aiType: string; agentId: string; text: string; userId?: string; msgId: string; conversationId?: string; attachments?: Attachment[] }): void =>
      ipcRenderer.send('message:sendStream', params),
    abortStream: (msgId: string): void =>
      ipcRenderer.send('message:abortStream', { msgId }),
    status: (aiType: string): Promise<{ status: string }> =>
      ipcRenderer.invoke('message:status', aiType),
    usage: (aiType: string): Promise<UsageInfo | null> =>
      ipcRenderer.invoke('message:usage', { aiType }),
  },

  tool: {
    respondConfirm: (confirmed: boolean): Promise<void> =>
      ipcRenderer.invoke('tool:confirm-response', confirmed),
    cancelConfirm: (): Promise<void> =>
      ipcRenderer.invoke('tool:confirm-cancel'),
    onConfirmRequest: (callback: (data: { toolName: string; dangerLevel: string; args: Record<string, unknown>; details: string }) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: { toolName: string; dangerLevel: string; args: Record<string, unknown>; details: string }): void => callback(data)
      ipcRenderer.on('tool:confirm-request', handler)
      return () => {
        ipcRenderer.removeListener('tool:confirm-request', handler)
      }
    },
  },

  onStream: {
    onChunk: (callback: (data: MessageChunkData) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: MessageChunkData): void => callback(data)
      ipcRenderer.on('gateway:messageChunk', handler)
      return () => {
        ipcRenderer.removeListener('gateway:messageChunk', handler)
      }
    },
    onDone: (callback: (data: MessageDoneData) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: MessageDoneData): void => callback(data)
      ipcRenderer.on('gateway:messageDone', handler)
      return () => {
        ipcRenderer.removeListener('gateway:messageDone', handler)
      }
    },
    onToolCall: (callback: (data: MessageToolCallData) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: MessageToolCallData): void => callback(data)
      ipcRenderer.on('gateway:messageToolCall', handler)
      return () => {
        ipcRenderer.removeListener('gateway:messageToolCall', handler)
      }
    },
    onThinking: (callback: (data: { msgId: string } & ThinkingInfo) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: { msgId: string } & ThinkingInfo): void => callback(data)
      ipcRenderer.on('gateway:messageThinking', handler)
      return () => {
        ipcRenderer.removeListener('gateway:messageThinking', handler)
      }
    },
    onToolStep: (callback: (data: { msgId: string } & ToolStepInfo) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: { msgId: string } & ToolStepInfo): void => callback(data)
      ipcRenderer.on('gateway:messageToolStep', handler)
      return () => {
        ipcRenderer.removeListener('gateway:messageToolStep', handler)
      }
    },
    onUsage: (callback: (data: MessageUsageData) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: MessageUsageData): void => {
        console.log('[Preload] messageUsage:', JSON.stringify(data).substring(0, 200))
        callback(data)
      }
      ipcRenderer.on('gateway:messageUsage', handler)
      return () => {
        ipcRenderer.removeListener('gateway:messageUsage', handler)
      }
    },
  },

  onStartup: {
    envCheck: (callback: (data: StartupEnvCheckData) => void): void => {
      ipcRenderer.on('startup:env-check', (_event: Electron.IpcRendererEvent, data: StartupEnvCheckData) => callback(data))
    },
    aiDetected: (callback: (data: import('../shared/ipc-types').AIDetected) => void): void => {
      ipcRenderer.on('startup:ai-detected', (_event: Electron.IpcRendererEvent, data: import('../shared/ipc-types').AIDetected) => callback(data))
    },
  },

  // Preview panel API
  preview: {
    show: (target: { type: string; url?: string; html?: string; content?: string; language?: string; path?: string; title?: string; logs?: Array<{ level: string; message: string; timestamp: number }> }): void => {
      // 通过 IPC 通知主进程，然后主进程推送回渲染进程
      // 这里直接使用自定义事件来触发 Store 更新
      window.dispatchEvent(new CustomEvent('preview:show', { detail: target }))
    },
    hide: (): void => {
      window.dispatchEvent(new CustomEvent('preview:hide'))
    },
    update: (target: Partial<{ type: string; url?: string; html?: string; content?: string; language?: string; path?: string; title?: string; logs?: Array<{ level: string; message: string; timestamp: number }> }>): void => {
      window.dispatchEvent(new CustomEvent('preview:update', { detail: target }))
    },
  },

  // File system API
  file: {
    list: (dirPath: string): Promise<{ success: boolean; data?: Array<{ name: string; path: string; type: 'file' | 'directory'; children?: unknown[] }>; error?: string }> => 
      ipcRenderer.invoke('file:list', dirPath),
    read: (filePath: string): Promise<{ success: boolean; data?: string; error?: string }> => 
      ipcRenderer.invoke('file:read', filePath),
    readBase64: (filePath: string): Promise<{ success: boolean; data?: string; error?: string }> => 
      ipcRenderer.invoke('file:readBase64', filePath),
    search: (dirPath: string, query: string): Promise<{ success: boolean; data?: Array<{ name: string; path: string; type: 'file' | 'directory' }>; error?: string }> => 
      ipcRenderer.invoke('file:search', dirPath, query),
    stat: (filePath: string): Promise<{ success: boolean; data?: { size: number; modified: number; created: number; isDirectory: boolean; isFile: boolean }; error?: string }> => 
      ipcRenderer.invoke('file:stat', filePath),
    cwd: (): Promise<{ success: boolean; data?: string; error?: string }> => 
      ipcRenderer.invoke('file:cwd'),
  },
}

contextBridge.exposeInMainWorld('echora', electronAPI)

export type ElectronAPI = typeof electronAPI

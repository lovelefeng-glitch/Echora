export const IPC_CHANNELS = {
  GATEWAY_REFRESH: 'gateway:refresh',
  GATEWAY_ATTACH: 'gateway:attach',
  GATEWAY_START: 'gateway:start',
  GATEWAY_STOP: 'gateway:stop',
  GATEWAY_RESTART: 'gateway:restart',
  GATEWAY_STATUS: 'gateway:status',
  GATEWAY_STATUS_ALL: 'gateway:statusAll',
  GATEWAY_STATUS_CHANGE: 'gateway:statusChange',
  GATEWAY_MESSAGE: 'gateway:message',
  GATEWAY_MESSAGE_CHUNK: 'gateway:messageChunk',
  GATEWAY_MESSAGE_DONE: 'gateway:messageDone',
  GATEWAY_MESSAGE_TOOL_CALL: 'gateway:messageToolCall',
  GATEWAY_MESSAGE_USAGE: 'gateway:messageUsage',
  GATEWAY_MESSAGE_THINKING: 'gateway:messageThinking',
  GATEWAY_MESSAGE_TOOL_STEP: 'gateway:messageToolStep',

  AGENT_LIST: 'agent:list',
  AGENT_MODEL_INFO: 'agent:modelInfo',
  AGENT_LIST_MODELS: 'agent:listModels',
  AGENT_SET_MODEL: 'agent:setModel',

  MESSAGE_SEND: 'message:send',
  MESSAGE_SEND_STREAM: 'message:sendStream',
  MESSAGE_ABORT_STREAM: 'message:abortStream',
  MESSAGE_STATUS: 'message:status',
  MESSAGE_USAGE: 'message:usage',

  CONFIG_GET: 'config:get',
  CONFIG_SET: 'config:set',
  CONFIG_GET_ALL: 'config:getAll',

  DRAFT_READ: 'draft:read',
  DRAFT_WRITE: 'draft:write',
  DRAFT_SAVE: 'draft:save',
  DRAFT_RESET: 'draft:reset',
  DRAFT_BACKUPS: 'draft:backups',
  DRAFT_PATHS: 'draft:paths',

  AI_CONFIG_SET_PATH: 'ai-config:set-path',
  AI_CONFIG_READ: 'ai-config:read',
  AI_CONFIG_DISCOVER: 'ai-config:discover',
  AI_CONFIG_LIST: 'ai-config:list',

  HERMES_PROFILES: 'hermes:profiles',
  HERMES_CONFIG: 'hermes:config',

  ENV_CHECK: 'env:check',
  ENV_INSTALL: 'env:install',

  AI_SET_PATH: 'ai:setPath',
  AI_REMOVE_PATH: 'ai:removePath',
  AI_RESCAN: 'ai:rescan',
  AI_SCAN: 'ai:scan',
  AI_SCAN_FULL: 'ai:scanFull',
  AI_PROBE_PORT: 'ai:probePort',
  AI_ADD_DISCOVERED: 'ai:addDiscovered',

  DIALOG_OPEN_FILE: 'dialog:openFile',
  DIALOG_OPEN_DIR: 'dialog:openDir',

  CONV_LIST: 'conv:list',
  CONV_GET: 'conv:get',
  CONV_SAVE: 'conv:save',
  CONV_DELETE: 'conv:delete',
  CONV_DELETE_ALL: 'conv:deleteAll',

  OC_SESSIONS_LIST: 'oc-sessions:list',
  OC_SESSIONS_HISTORY: 'oc-sessions:history',
  OC_SESSIONS_CREATE: 'oc-sessions:create',
  OC_SESSIONS_DELETE: 'oc-sessions:delete',
  OC_SESSIONS_RESET: 'oc-sessions:reset',

  SKILLS_LIST: 'skills:list',

  WINDOW_MINIMIZE: 'window:minimize',
  WINDOW_MAXIMIZE: 'window:maximize',
  WINDOW_CLOSE: 'window:close',
  WINDOW_IS_MAXIMIZED: 'window:isMaximized',
  WINDOW_SET_THEME: 'window:setTheme',
  WINDOW_MAXIMIZED: 'window:maximized',

  STARTUP_ENV_CHECK: 'startup:env-check',
  STARTUP_AI_DETECTED: 'startup:ai-detected',

  DIRECT_API_SEND: 'direct-api:send',
  DIRECT_API_SEND_STREAM: 'direct-api:sendStream',
  DIRECT_API_LIST_MODELS: 'direct-api:listModels',

  // 文件系统
  FILE_LIST: 'file:list',
  FILE_READ: 'file:read',
  FILE_READ_BASE64: 'file:readBase64',
  FILE_SEARCH: 'file:search',
  FILE_STAT: 'file:stat',
  FILE_CWD: 'file:cwd',
} as const

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS]

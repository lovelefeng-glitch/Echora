/**
 * Browser Mock API - 用于在纯浏览器中预览 Echora UI
 * 在 index.html 中以 <script type="module"> 加载
 * Electron 环境下 window.echroma 已存在，不会执行 mock
 */

// Guard: 只在浏览器环境（无 Electron preload）时激活
// eslint-disable-next-line @typescript-eslint/no-explicit-any
if ((window as any).echora) {
  // Electron 环境，跳过 mock
} else {

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const listeners: Record<string, Set<(data: any) => void>> = {}

function on(channel: string, cb: (data: unknown) => void): () => void {
  if (!listeners[channel]) listeners[channel] = new Set()
  listeners[channel].add(cb)
  return () => { listeners[channel]?.delete(cb) }
}

// ========== Mock Data ==========

const MOCK_GATEWAY_STATUS = {
  qclaw: { status: 'running' as const, pid: 12345, port: 28789, owned: true },
  openclaw: { status: 'running' as const, pid: 12346, port: 18789, owned: true },
  hermes: { status: 'offline' as const },
  cursor: { status: 'offline' as const },
  windsurf: { status: 'stopped' as const },
  trae: { status: 'running' as const, pid: 12347, port: 28790, owned: false }
}

const MOCK_AGENTS = new Map([
  ['qclaw:default', { id: 'default', name: '默认助手', aiType: 'qclaw', emoji: '🐉', model: 'qwen-plus' }],
  ['qclaw:coder', { id: 'coder', name: '代码助手', aiType: 'qclaw', emoji: '🐉', model: 'qwen-coder' }],
  ['openclaw:default', { id: 'default', name: '管家', aiType: 'openclaw', emoji: '🦞', model: 'gpt-4o' }],
  ['openclaw:xue', { id: 'xue', name: '小雪', aiType: 'openclaw', emoji: '❄️', model: 'claude-3.5' }],
  ['hermes:main', { id: 'main', name: 'Hermes 主', aiType: 'hermes', emoji: '🔮', model: 'hermes-1' }],
  ['trae:default', { id: 'default', name: 'Trae 助手', aiType: 'trae', emoji: '🚀', model: 'deepseek-v3' }]
])

const MOCK_DETECTED_AI = {
  qclaw: { name: 'QClaw', category: 'qclaw', found: true, path: 'C:\\Program Files\\QClaw\\qclaw.exe', source: 'registry', verified: true },
  openclaw: { name: 'OpenClaw', category: 'openclaw', found: true, path: 'C:\\Users\\ohfen\\.openclaw\\openclaw.exe', source: 'config', verified: true },
  hermes: { name: 'Hermes', category: 'hermes', found: true, path: 'C:\\Hermes\\hermes.exe', source: 'path', verified: false },
  cursor: { name: 'Cursor', category: 'cursor', found: true, path: 'C:\\Users\\ohfen\\AppData\\Local\\Programs\\cursor\\cursor.exe', source: 'registry', verified: true },
  windsurf: { name: 'Windsurf', category: 'windsurf', found: false, path: '', source: '', verified: false },
  trae: { name: 'Trae', category: 'trae', found: true, path: 'C:\\Trae\\trae.exe', source: 'registry', verified: true }
}

const MOCK_CONFIG: Record<string, unknown> = {
  gateway: { port: 18789, mode: 'local', bind: 'loopback' },
  agents: [
    { id: 'default', name: '管家', emoji: '🦞', workspace: 'C:\\Users\\ohfen\\.openclaw\\workspace-default', reasoningDefault: null, skills: [] },
    { id: 'coder', name: '阿呆', emoji: '🤖', workspace: 'C:\\Users\\ohfen\\.openclaw\\workspace-coder', reasoningDefault: 'high', skills: ['code-review'] },
    { id: 'xue', name: '小雪', emoji: '❄️', workspace: 'C:\\Users\\ohfen\\.openclaw\\workspace-xue', reasoningDefault: null, skills: [] }
  ],
  models: [
    {
      provider: 'openai-compatible',
      baseUrl: 'https://api.openai.com/v1',
      api: 'openai',
      models: [
        { id: 'gpt-4o', name: 'GPT-4o', contextWindow: 128000, maxTokens: 4096, reasoning: false, input: ['text', 'image'], fullPath: 'openai/gpt-4o' },
        { id: 'gpt-4o-mini', name: 'GPT-4o Mini', contextWindow: 128000, maxTokens: 4096, reasoning: false, input: ['text'], fullPath: 'openai/gpt-4o-mini' }
      ]
    },
    {
      provider: 'anthropic',
      baseUrl: 'https://api.anthropic.com',
      api: 'anthropic',
      models: [
        { id: 'claude-3.5-sonnet', name: 'Claude 3.5 Sonnet', contextWindow: 200000, maxTokens: 8192, reasoning: false, input: ['text', 'image'], fullPath: 'anthropic/claude-3.5-sonnet' }
      ]
    }
  ],
  session: { resetMode: 'manual', dmScope: 'agent', maxHistory: 50 }
}

const MOCK_SKILLS = {
  success: true,
  skills: [
    { name: 'web-search', displayName: 'Web Search', category: 'research', description: 'Search the web', enabled: true },
    { name: 'code-review', displayName: 'Code Review', category: 'software-development', description: 'Review code', enabled: true },
    { name: 'file-manager', displayName: 'File Manager', category: 'productivity', description: 'Manage files', enabled: false },
    { name: 'email-sender', displayName: 'Email Sender', category: 'email', description: 'Send emails', enabled: true },
    { name: 'image-gen', displayName: 'Image Gen', category: 'creative', description: 'Generate images', enabled: false }
  ],
  categories: ['creative', 'email', 'productivity', 'research', 'software-development']
}

const MOCK_DIRECT_API_PROVIDERS = [
  { id: 'openai', name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', hasApiKey: true, models: [], status: 'online' as const },
  { id: 'anthropic', name: 'Anthropic', baseUrl: 'https://api.anthropic.com', hasApiKey: true, models: [], status: 'online' as const },
  { id: 'deepseek', name: 'DeepSeek', baseUrl: 'https://api.deepseek.com', hasApiKey: false, models: [], status: 'offline' as const }
]

// ========== Build Mock API ==========

function createMockAPI() {
  const noop = () => {}
  const ok = (data: unknown = null) => Promise.resolve({ success: true, data })
  const eventOn = (channel: string) => (cb: (data: unknown) => void) => on(channel, cb)

  return {
    window: {
      minimize: noop,
      maximize: noop,
      close: noop,
      setTheme: noop,
      isMaximized: () => Promise.resolve(false),
      onMaximized: (cb: (maximized: boolean) => void) => on('window:maximized', (data) => cb(data as boolean))
    },

    skills: {
      list: (_aiType: string) => Promise.resolve(MOCK_SKILLS)
    },

    gateway: {
      start: (_aiType: string, _path?: string) => ok({ pid: 99999, port: 28799 }),
      stop: (_aiType: string) => ok(),
      restart: (_aiType: string) => ok(),
      status: () => Promise.resolve(MOCK_GATEWAY_STATUS),
      refresh: () => Promise.resolve({ detected: MOCK_DETECTED_AI, gateways: MOCK_GATEWAY_STATUS }),
      attach: (_aiType: string, _info: unknown) => ok(),
      onStatusChange: eventOn('gateway:statusChange'),
      onStatusAll: eventOn('gateway:statusAll'),
      onMessage: eventOn('gateway:message')
    },

    config: {
      get: (_key: string) => Promise.resolve(null),
      set: (_key: string, _value: unknown) => ok(),
      getAll: () => Promise.resolve({
        settings: { timeout: 30000, pollInterval: 5000, maxMessages: 100, autoStartOnBoot: false, minimizeToTray: true, checkUpdates: true },
        lastActiveAgent: 'qclaw:default'
      })
    },

    conv: {
      list: (_agentKey: string) => Promise.resolve([]),
      get: (_agentKey: string, _convId: string) => Promise.resolve(null),
      save: (_agentKey: string, _conv: unknown) => ok(),
      delete: (_agentKey: string, _convId: string) => ok(),
      deleteAll: (_agentKey: string) => ok()
    },

    conversations: {
      save: (_agentKey: string, _convId: string, _data: unknown) => ok(),
      load: (_agentKey: string) => Promise.resolve([])
    },

    ocSessions: {
      list: () => Promise.resolve([]),
      history: (_sessionKey: string) => Promise.resolve([]),
      create: (_params: unknown) => ok({ sessionKey: 'mock-session' }),
      delete: (_sessionKey: string) => ok(),
      reset: (_sessionKey: string) => ok()
    },

    aiConfig: {
      setPath: (_aiType: string, _path: string) => ok(),
      read: (_aiType: string) => Promise.resolve({ success: true, data: MOCK_CONFIG }),
      discover: (_aiType: string) => ok([]),
      list: () => Promise.resolve({
        configs: Object.entries(MOCK_DETECTED_AI).map(([k, v]) => ({
          aiType: k, name: v.name, found: v.found, path: v.path
        }))
      })
    },

    draft: {
      read: (_aiType: string) => Promise.resolve({ success: true, data: MOCK_CONFIG }),
      write: (_aiType: string, _config: unknown) => ok(),
      save: (_aiType: string) => ok({ success: true }),
      reset: (_aiType: string) => ok({ success: true }),
      backups: (_aiType: string) => Promise.resolve([]),
      paths: (_aiType: string) => Promise.resolve({})
    },

    hermes: {
      profiles: () => Promise.resolve([]),
      config: () => Promise.resolve({})
    },

    ai: {
      setPath: (_aiType: string, _path: string) => ok(),
      removePath: (_aiType: string) => ok(),
      rescan: () => ok(MOCK_DETECTED_AI),
      scan: () => Promise.resolve(MOCK_DETECTED_AI),
      scanFull: () => Promise.resolve(MOCK_DETECTED_AI),
      probePort: (_port: number) => Promise.resolve({ open: false }),
      addDiscovered: (_params: unknown) => ok()
    },

    env: {
      check: () => Promise.resolve({ node: true, npm: true }),
      install: (_pkg: string) => ok()
    },

    dialog: {
      openFile: (_options: unknown) => Promise.resolve({ canceled: true, filePaths: [] }),
      openDir: (_options: unknown) => Promise.resolve({ canceled: true, filePaths: [] })
    },

    agent: {
      list: (aiType?: string) => {
        const allAgents = Array.from(MOCK_AGENTS.values())
        if (aiType) return Promise.resolve(allAgents.filter((a) => a.aiType === aiType))
        return Promise.resolve(allAgents)
      },
      modelInfo: (_aiType: string) => Promise.resolve({ models: [] }),
      listModels: (_aiType: string) => Promise.resolve([]),
      setModel: (_aiType: string, _agentId: string, _model: string) => ok()
    },

    message: {
      send: (_params: unknown) => ok({ msgId: 'mock-msg-' + Date.now() }),
      sendStream: (_params: unknown) => ok({ msgId: 'mock-stream-' + Date.now() }),
      abortStream: (_msgId: string) => ok(),
      status: () => Promise.resolve({}),
      usage: (_msgId: string) => Promise.resolve(null)
    },

    directApi: {
      send: (_params: unknown) => ok({ msgId: 'mock-direct-' + Date.now() }),
      sendStream: (_params: unknown) => ok({ msgId: 'mock-direct-stream-' + Date.now() }),
      abortStream: (_msgId: string) => ok(),
      listModels: (_providerId: string) => Promise.resolve([]),
      listProviders: () => Promise.resolve(MOCK_DIRECT_API_PROVIDERS),
      testConnection: (_providerId: string) => Promise.resolve({ success: true })
    },

    onStream: {
      onChunk: eventOn('stream:chunk'),
      onDone: eventOn('stream:done'),
      onToolCall: eventOn('stream:toolCall'),
      onThinking: eventOn('stream:thinking'),
      onToolStep: eventOn('stream:toolStep'),
      onUsage: eventOn('stream:usage'),
      cleanup: noop
    },

    onStartup: {
      envCheck: eventOn('startup:envCheck'),
      aiDetected: eventOn('startup:aiDetected')
    }
  }
}

// ========== Inject ==========

// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(window as any).echora = createMockAPI()

// Pre-populate store with mock data
setTimeout(() => {
  // @ts-expect-error - accessing zustand store for mock initialization
  const store = document.querySelector('#root')?.__reactFiber$
  // Store will be populated by App.tsx useEffect which calls api.gateway.status() etc.
  // The mock API returns correct data, so the store will be filled automatically.
}, 0)

console.log('[Echora Browser Mock] API mock loaded - all IPC calls are mocked')

} // end else (browser mode)

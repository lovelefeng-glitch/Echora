import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import yaml from 'js-yaml'
import type {
  HermesProfile,
  AiConfigDiscoverResult
} from '../../shared/ipc-types'

const TAG = 'ConfigReader'

const SENSITIVE_KEYS = [
  'api_key', 'apikey', 'api-key', 'token', 'secret', 'password', 'passwd',
  'auth_token', 'auth-token', 'access_key', 'access-token', 'api_server_key'
]

function filterSensitive(value: unknown): unknown {
  if (value === null || value === undefined) return value
  if (Array.isArray(value)) {
    return value.map((item) => filterSensitive(item))
  }
  if (typeof value === 'object') {
    const filtered: Record<string, unknown> = {}
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      const lowerKey = key.toLowerCase().replace(/[-_]/g, '')
      if (SENSITIVE_KEYS.some((sk) => sk.replace(/[-_]/g, '') === lowerKey)) {
        filtered[key] = '***FILTERED***'
      } else {
        filtered[key] = filterSensitive(val)
      }
    }
    return filtered
  }
  return value
}

function parseByExtension(raw: string, filePath: string): unknown {
  const ext = path.extname(filePath).toLowerCase()
  if (ext === '.yaml' || ext === '.yml') {
    return yaml.load(raw)
  }
  return JSON.parse(raw)
}

export interface ReadResult {
  success: boolean
  data?: Record<string, unknown>
  error?: string
}

export interface NormalizeResult {
  gateway: Record<string, unknown>
  agents: Array<Record<string, unknown>>
  models: Array<Record<string, unknown>>
  session: Record<string, unknown>
  tools: Record<string, unknown>
  browser: Record<string, unknown>
  port: number | null
  [key: string]: unknown
}

export interface NormalizeHermesResult {
  model: Record<string, unknown>
  agent: Record<string, unknown>
  memory: Record<string, unknown>
  compression: Record<string, unknown>
  delegation: Record<string, unknown>
  browser: Record<string, unknown>
  security: Record<string, unknown>
  display: Record<string, unknown>
  approvals: Record<string, unknown>
  sessions: Record<string, unknown>
  cron: Record<string, unknown>
  toolsets: Record<string, unknown>
  apiServer: Record<string, unknown>
  agents: Array<unknown>
  models: Array<unknown>
  profiles: HermesProfile[]
  port: number | null
  [key: string]: unknown
}

export const ConfigReader = {
  read(filePath: string): ReadResult {
    try {
      if (!filePath || typeof filePath !== 'string') {
        return { success: false, error: '未提供有效的配置文件路径' }
      }
      if (!fs.existsSync(filePath)) {
        return { success: false, error: `配置文件不存在: ${filePath}` }
      }
      const stat = fs.statSync(filePath)
      if (!stat.isFile()) {
        return { success: false, error: `路径不是文件: ${filePath}` }
      }
      const raw = fs.readFileSync(filePath, 'utf8')
      if (!raw || raw.trim().length === 0) {
        return { success: false, error: '配置文件为空' }
      }
      let data: unknown
      try {
        data = parseByExtension(raw, filePath)
      } catch (parseErr: unknown) {
        const ext = path.extname(filePath).toLowerCase()
        const format = ext === '.yaml' || ext === '.yml' ? 'YAML' : 'JSON'
        const msg = parseErr instanceof Error ? parseErr.message : String(parseErr)
        return { success: false, error: `${format} 解析失败: ${msg}` }
      }
      if (typeof data !== 'object' || data === null) {
        return { success: false, error: '配置文件内容不是有效的对象' }
      }
      return { success: true, data: data as Record<string, unknown> }
    } catch (err: unknown) {
      if (err instanceof Error && ('code' in err)) {
        const code = (err as NodeJS.ErrnoException).code
        if (code === 'EACCES' || code === 'EPERM') {
          return { success: false, error: `没有权限读取配置文件: ${filePath}` }
        }
      }
      const msg = err instanceof Error ? err.message : String(err)
      return { success: false, error: `读取配置失败: ${msg}` }
    }
  },

  discover(): AiConfigDiscoverResult {
    const home = os.homedir()
    const knownPaths: Record<string, string> = {
      qclaw: path.join(home, '.qclaw', 'openclaw.json'),
      openclaw: path.join(home, '.openclaw', 'openclaw.json'),
      hermes: path.join(home, 'AppData', 'Local', 'hermes', 'config.yaml')
    }
    const result: AiConfigDiscoverResult = {
      qclaw: null,
      openclaw: null,
      hermes: null
    }
    for (const [aiType, confPath] of Object.entries(knownPaths)) {
      try {
        if (fs.existsSync(confPath) && fs.statSync(confPath).isFile()) {
          result[aiType as keyof AiConfigDiscoverResult] = confPath as never
        }
      } catch {
        result[aiType as keyof AiConfigDiscoverResult] = null as never
      }
    }
    return result
  },

  discoverHermesProfiles(): HermesProfile[] {
    const home = os.homedir()
    const profilesDir = path.join(home, 'AppData', 'Local', 'hermes', 'profiles')
    const profiles: HermesProfile[] = []
    try {
      if (!fs.existsSync(profilesDir)) return profiles
      const entries = fs.readdirSync(profilesDir, { withFileTypes: true })
      for (const entry of entries) {
        if (!entry.isDirectory()) continue
        const configPath = path.join(profilesDir, entry.name, 'config.yaml')
        if (!fs.existsSync(configPath)) continue  // 跳过残缺 profile
        profiles.push({
          name: entry.name,
          configPath
        })
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      console.warn(`[${TAG}] discoverHermesProfiles error:`, msg)
    }
    return profiles
  },

  normalize(aiType: string, rawData: Record<string, unknown>): NormalizeResult | NormalizeHermesResult {
    if (aiType === 'hermes') {
      return this.normalizeHermes(rawData)
    }
    const result: NormalizeResult = {
      gateway: {},
      agents: [],
      models: [],
      session: {},
      tools: {},
      browser: {},
      port: null
    }
    if (!rawData || typeof rawData !== 'object') return result
    try {
      if (rawData.gateway) {
        const gw = rawData.gateway as Record<string, unknown>
        const auth = gw.auth as Record<string, unknown> | undefined
        const http = gw.http as Record<string, unknown> | undefined
        const endpoints = http?.endpoints as Record<string, unknown> | undefined
        const chatCompletions = endpoints?.chatCompletions as Record<string, unknown> | undefined
        const controlUi = gw.controlUi as Record<string, unknown> | undefined
        const tailscale = gw.tailscale as Record<string, unknown> | undefined
        result.gateway = {
          port: gw.port || null,
          mode: gw.mode || null,
          bind: gw.bind || null,
          authMode: auth?.mode || null,
          httpEnabled: chatCompletions?.enabled ?? null,
          controlUiAllowInsecure: controlUi?.allowInsecureAuth ?? null,
          tailscaleMode: tailscale?.mode || null
        }
        result.port = (gw.port as number) || null
      }
      if (rawData.agents) {
        const agentsObj = rawData.agents as Record<string, unknown>
        const list = agentsObj.list as Array<Record<string, unknown>> | undefined
        if (list) {
          result.agents = list.map((a) => {
            const identity = a.identity as Record<string, unknown> | undefined
            const model = a.model as Record<string, unknown> | undefined
            return {
              id: a.id || '',
              name: identity?.name || a.name || a.id || '',
              emoji: identity?.emoji || null,
              avatar: identity?.avatar || null,
              workspace: a.workspace || null,
              modelPrimary: model?.primary || null,
              modelFallbacks: model?.fallbacks || [],
              reasoningDefault: a.reasoningDefault || null,
              skills: a.skills || [],
              timeoutSeconds: a.timeoutSeconds || null,
              maxConcurrent: a.maxConcurrent || null
            }
          })
        }
      }
      if (rawData.models) {
        const modelsObj = rawData.models as Record<string, unknown>
        const providers = modelsObj.providers as Array<Record<string, unknown>> | Record<string, Record<string, unknown>> | undefined
        if (providers) {
          const entries: Array<[string, Record<string, unknown>]> = Array.isArray(providers)
            ? providers.map((p, i) => [(p.provider || p.name || `provider-${i}`) as string, p])
            : Object.entries(providers)
          result.models = entries.map(([key, provider]) => ({
            provider: key,
            baseUrl: provider.base_url || provider.baseUrl || '',
            api: provider.api || null,
            models: ((provider.models || []) as Array<Record<string, unknown>>).map((m) => ({
              id: m.id || '',
              name: m.name || m.id || '',
              contextWindow: m.contextWindow || null,
              maxTokens: m.maxTokens || null,
              input: m.input || [],
              reasoning: m.reasoning ?? null,
              cost: m.cost || null,
              fullPath: `${key}/${m.id}`
            }))
          }))
        }
      }
      if (rawData.session) {
        const session = rawData.session as Record<string, unknown>
        result.session = {
          resetMode: session.resetMode || null,
          dmScope: session.dmScope || null,
          maxHistory: session.maxHistory || null
        }
      }
      if (rawData.tools) {
        const tools = rawData.tools as Record<string, unknown>
        result.tools = {
          allowBash: tools.allowBash ?? null,
          allowNetwork: tools.allowNetwork ?? null,
          toolTimeout: tools.timeout || null
        }
      }
      if (rawData.browser) {
        const browser = rawData.browser as Record<string, unknown>
        result.browser = {
          enabled: browser.enabled ?? null,
          engine: browser.engine || null
        }
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      console.warn(`[${TAG}] normalize 异常:`, msg)
    }
    return result
  },

  normalizeHermes(rawData: Record<string, unknown>): NormalizeHermesResult {
    const result: NormalizeHermesResult = {
      model: {},
      agent: {},
      memory: {},
      compression: {},
      delegation: {},
      browser: {},
      security: {},
      display: {},
      approvals: {},
      sessions: {},
      cron: {},
      toolsets: {},
      apiServer: {},
      agents: [],
      models: [],
      profiles: [],
      port: null
    }
    if (!rawData || typeof rawData !== 'object') return result
    try {
      const safeData = filterSensitive(rawData) as Record<string, unknown>
      if (safeData.model) {
        const m = safeData.model as Record<string, unknown>
        result.model = {
          default: m.default || null,
          main: m.main || null,
          maxTokens: m.max_tokens || null,
          temperature: m.temperature || null,
          topP: m.top_p || null
        }
      }
      if (safeData.agent) {
        const a = safeData.agent as Record<string, unknown>
        result.agent = {
          maxTurns: a.max_turns || null,
          gatewayTimeout: a.gateway_timeout || null,
          reasoningEffort: a.reasoning_effort || null
        }
      }
      if (safeData.memory) {
        const mem = safeData.memory as Record<string, unknown>
        result.memory = {
          enabled: mem.enabled ?? null,
          backend: mem.backend || null,
          maxEntries: mem.max_entries || null
        }
      }
      if (safeData.compression) {
        const c = safeData.compression as Record<string, unknown>
        result.compression = {
          enabled: c.enabled ?? null,
          windowSize: c.window_size || null,
          truncateMode: c.truncate_mode || null
        }
      }
      if (safeData.delegation) {
        const d = safeData.delegation as Record<string, unknown>
        result.delegation = {
          enabled: d.enabled ?? null,
          agents: d.agents || []
        }
      }
      if (safeData.browser) {
        const b = safeData.browser as Record<string, unknown>
        result.browser = {
          engine: b.engine || null,
          path: b.path || null
        }
      }
      if (safeData.security) {
        const s = safeData.security as Record<string, unknown>
        result.security = {
          sandbox: s.sandbox ?? null,
          approvalMode: s.approval_mode || null
        }
      }
      if (safeData.display) {
        const d = safeData.display as Record<string, unknown>
        result.display = {
          language: d.language || null,
          theme: d.theme || null
        }
      }
      if (safeData.approvals) {
        const a = safeData.approvals as Record<string, unknown>
        result.approvals = {
          mode: a.mode || null,
          autoApprove: a.auto_approve ?? null
        }
      }
      if (safeData.sessions) {
        const s = safeData.sessions as Record<string, unknown>
        result.sessions = {
          maxActive: s.max_active || null,
          idleTimeout: s.idle_timeout || null
        }
      }
      if (safeData.cron) {
        const c = safeData.cron as Record<string, unknown>
        result.cron = {
          enabled: c.enabled ?? null,
          jobs: c.jobs || []
        }
      }
      if (safeData.toolsets) {
        const t = safeData.toolsets as Record<string, unknown>
        result.toolsets = {
          enabled: t.enabled ?? null,
          tools: t.tools || []
        }
      }
      if (safeData.api_server) {
        const api = safeData.api_server as Record<string, unknown>
        result.apiServer = {
          enabled: api.enabled ?? null,
          port: api.port || null,
          host: api.host || null
        }
        result.port = (api.port as number) || 8642
      }
      result.profiles = this.discoverHermesProfiles()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      console.warn(`[${TAG}] normalizeHermes 异常:`, msg)
    }
    return result
  }
}

import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import yaml from 'js-yaml'
import { ConfigReader } from './config-reader'
import type { NormalizedConfig } from '../../shared/ipc-types'

const TAG = 'Draft'

const DRAFTS_DIR = path.join(__dirname, '..', '..', 'drafts')
const BACKUPS_DIR = path.join(__dirname, '..', '..', 'backups')

const ORIGINAL_PATHS: Record<string, string> = {
  qclaw: path.join(os.homedir(), '.qclaw', 'openclaw.json'),
  openclaw: path.join(os.homedir(), '.openclaw', 'openclaw.json'),
  hermes: path.join(os.homedir(), 'AppData', 'Local', 'hermes', 'config.yaml')
}

function getDraftPath(aiType: string): string {
  return path.join(DRAFTS_DIR, `${aiType}.json`)
}

function getBackupPath(aiType: string, timestamp?: string): string {
  const ts = timestamp || new Date().toISOString().replace(/[:.]/g, '-')
  return path.join(BACKUPS_DIR, `${aiType}_${ts}.json`)
}

export interface DraftResult {
  success: boolean
  data?: NormalizedConfig
  error?: string
}

export interface InitResult {
  success: boolean
  error?: string
}

export interface InitAllResult {
  [aiType: string]: InitResult
}

function readRaw(aiType: string): Record<string, unknown> | null {
  const originalPath = ORIGINAL_PATHS[aiType]
  try {
    if (!originalPath || !fs.existsSync(originalPath)) return null
    const raw = fs.readFileSync(originalPath, 'utf8')
    if (aiType === 'hermes') return (yaml.load(raw) as Record<string, unknown>) || {}
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function denormalizeQClawOpenClaw(aiType: string, d: Record<string, unknown>): Record<string, unknown> {
  const raw = readRaw(aiType) || {}
  const result: Record<string, unknown> = JSON.parse(JSON.stringify(raw))

  if (d.gateway && (result.gateway as Record<string, unknown>)) {
    const gw = result.gateway as Record<string, unknown>
    const dgw = d.gateway as Record<string, unknown>
    if (dgw.port != null) gw.port = dgw.port
    if (dgw.mode) gw.mode = dgw.mode
    if (dgw.bind) gw.bind = dgw.bind
    if (dgw.authMode) {
      if (!gw.auth) gw.auth = {}
      ;(gw.auth as Record<string, unknown>).mode = dgw.authMode
    }
    if (dgw.httpEnabled != null) {
      if (!gw.http) gw.http = {}
      const httpObj = gw.http as Record<string, unknown>
      if (!httpObj.endpoints) httpObj.endpoints = {}
      const endpoints = httpObj.endpoints as Record<string, unknown>
      if (!endpoints.chatCompletions) endpoints.chatCompletions = {}
      ;(endpoints.chatCompletions as Record<string, unknown>).enabled = dgw.httpEnabled
    }
    if (dgw.controlUiAllowInsecure != null) {
      if (!gw.controlUi) gw.controlUi = {}
      ;(gw.controlUi as Record<string, unknown>).allowInsecureAuth = dgw.controlUiAllowInsecure
    }
    if (dgw.tailscaleMode) {
      if (!gw.tailscale) gw.tailscale = {}
      ;(gw.tailscale as Record<string, unknown>).mode = dgw.tailscaleMode
    }
  }

  if (Array.isArray(d.agents) && (result.agents as Record<string, unknown>)?.list) {
    const list = (result.agents as Record<string, unknown>).list as Array<Record<string, unknown>>
    for (const agent of d.agents) {
      const rawAgent = list.find((a) => a.id === agent.id)
      if (rawAgent) {
        if (agent.name) {
          if (!rawAgent.identity) rawAgent.identity = {}
          ;(rawAgent.identity as Record<string, unknown>).name = agent.name
        }
        if (agent.workspace) rawAgent.workspace = agent.workspace
        if (agent.modelPrimary) {
          if (!rawAgent.model) rawAgent.model = {}
          ;(rawAgent.model as Record<string, unknown>).primary = agent.modelPrimary
        }
        if (agent.modelFallbacks) {
          if (!rawAgent.model) rawAgent.model = {}
          ;(rawAgent.model as Record<string, unknown>).fallbacks = agent.modelFallbacks
        }
        if (agent.reasoningDefault != null) rawAgent.reasoningDefault = agent.reasoningDefault
      }
    }
  }

  if (d.session && result.session) {
    const s = d.session as Record<string, unknown>
    const rs = result.session as Record<string, unknown>
    if (s.resetMode) rs.resetMode = s.resetMode
    if (s.dmScope) rs.dmScope = s.dmScope
    if (s.maxHistory != null) rs.maxHistory = s.maxHistory
  }
  if (d.tools && result.tools) {
    const t = d.tools as Record<string, unknown>
    const rt = result.tools as Record<string, unknown>
    if (t.allowBash != null) rt.allowBash = t.allowBash
    if (t.allowNetwork != null) rt.allowNetwork = t.allowNetwork
    if (t.toolTimeout != null) rt.timeout = t.toolTimeout
  }
  if (d.browser && result.browser) {
    const b = d.browser as Record<string, unknown>
    const rb = result.browser as Record<string, unknown>
    if (b.enabled != null) rb.enabled = b.enabled
    if (b.engine) rb.engine = b.engine
  }

  return result
}

function denormalizeHermes(d: Record<string, unknown>): Record<string, unknown> {
  const raw = readRaw('hermes') || {}
  const result: Record<string, unknown> = JSON.parse(JSON.stringify(raw))

  if (d.model && result.model) {
    const dm = d.model as Record<string, unknown>
    const rm = result.model as Record<string, unknown>
    if (dm.default) rm.default = dm.default
    if (dm.main) rm.main = dm.main
    if (dm.maxTokens != null) rm.max_tokens = dm.maxTokens
    if (dm.temperature != null) rm.temperature = dm.temperature
    if (dm.topP != null) rm.top_p = dm.topP
  }
  if (d.agent && result.agent) {
    const da = d.agent as Record<string, unknown>
    const ra = result.agent as Record<string, unknown>
    if (da.maxTurns != null) ra.max_turns = da.maxTurns
    if (da.gatewayTimeout != null) ra.gateway_timeout = da.gatewayTimeout
    if (da.reasoningEffort) ra.reasoning_effort = da.reasoningEffort
  }
  if (d.memory && result.memory) {
    const dm = d.memory as Record<string, unknown>
    const rm = result.memory as Record<string, unknown>
    if (dm.enabled != null) rm.memory_enabled = dm.enabled
    if (dm.backend) rm.backend = dm.backend
    if (dm.maxEntries != null) rm.max_entries = dm.maxEntries
  }
  if (d.compression && result.compression) {
    const dc = d.compression as Record<string, unknown>
    const rc = result.compression as Record<string, unknown>
    if (dc.enabled != null) rc.enabled = dc.enabled
    if (dc.windowSize != null) rc.window_size = dc.windowSize
    if (dc.truncateMode) rc.truncate_mode = dc.truncateMode
  }
  if (d.browser && result.browser) {
    const db = d.browser as Record<string, unknown>
    const rb = result.browser as Record<string, unknown>
    if (db.engine) rb.engine = db.engine
    if (db.path) rb.path = db.path
  }
  if (d.security && result.security) {
    const ds = d.security as Record<string, unknown>
    const rs = result.security as Record<string, unknown>
    if (ds.sandbox != null) rs.sandbox = ds.sandbox
    if (ds.approvalMode) rs.approval_mode = ds.approvalMode
  }
  if (d.display && result.display) {
    const dd = d.display as Record<string, unknown>
    const rd = result.display as Record<string, unknown>
    if (dd.language) rd.language = dd.language
    if (dd.theme) rd.theme = dd.theme
  }
  if (d.approvals && result.approvals) {
    const da = d.approvals as Record<string, unknown>
    const ra = result.approvals as Record<string, unknown>
    if (da.mode) ra.mode = da.mode
    if (da.autoApprove != null) ra.auto_approve = da.autoApprove
  }
  if (d.apiServer && result.api_server) {
    const das = d.apiServer as Record<string, unknown>
    const ras = result.api_server as Record<string, unknown>
    if (das.enabled != null) ras.enabled = das.enabled
    if (das.port != null) ras.port = das.port
    if (das.host) ras.host = das.host
  }

  return result
}

export const DraftManager = {
  init(aiType: string): InitResult {
    const originalPath = ORIGINAL_PATHS[aiType]
    const draftPath = getDraftPath(aiType)
    try {
      if (!originalPath || !fs.existsSync(originalPath)) {
        console.warn(`[${TAG}] 原配置不存在: ${aiType} → ${originalPath}`)
        fs.writeFileSync(draftPath, JSON.stringify({}, null, 2), 'utf8')
        return { success: false, error: '原配置不存在' }
      }
      const raw = fs.readFileSync(originalPath, 'utf8')
      let rawData: Record<string, unknown>
      if (aiType === 'hermes') {
        rawData = (yaml.load(raw) as Record<string, unknown>) || {}
      } else {
        rawData = JSON.parse(raw)
      }
      const data = ConfigReader.normalize(aiType, rawData)
      fs.writeFileSync(draftPath, JSON.stringify(data, null, 2), 'utf8')
      console.log(`[${TAG}] ${aiType} 草稿初始化完成（已 normalize）`)
      return { success: true }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error(`[${TAG}] ${aiType} 初始化失败:`, msg)
      return { success: false, error: msg }
    }
  },

  initAll(): InitAllResult {
    const results: InitAllResult = {}
    for (const aiType of Object.keys(ORIGINAL_PATHS)) {
      results[aiType] = this.init(aiType)
    }
    return results
  },

  readDraft(aiType: string): DraftResult {
    const draftPath = getDraftPath(aiType)
    try {
      if (!fs.existsSync(draftPath)) {
        this.init(aiType)
      }
      const raw = fs.readFileSync(draftPath, 'utf8')
      return { success: true, data: JSON.parse(raw) }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      return { success: false, error: msg }
    }
  },

  writeDraft(aiType: string, data: NormalizedConfig): DraftResult {
    const draftPath = getDraftPath(aiType)
    try {
      fs.writeFileSync(draftPath, JSON.stringify(data, null, 2), 'utf8')
      return { success: true }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      return { success: false, error: msg }
    }
  },

  saveToOriginal(aiType: string): DraftResult {
    const originalPath = ORIGINAL_PATHS[aiType]
    const draftPath = getDraftPath(aiType)
    try {
      const draftRaw = fs.readFileSync(draftPath, 'utf8')
      const draftData = JSON.parse(draftRaw) as Record<string, unknown>
      if (originalPath && fs.existsSync(originalPath)) {
        const backupPath = getBackupPath(aiType)
        fs.copyFileSync(originalPath, backupPath)
        console.log(`[${TAG}] ${aiType} 原配置已备份: ${backupPath}`)
      }
      let originalData: Record<string, unknown>
      if (aiType === 'hermes') {
        originalData = denormalizeHermes(draftData)
        const yamlStr = yaml.dump(originalData, { indent: 2, lineWidth: -1 })
        fs.writeFileSync(originalPath, yamlStr, 'utf8')
      } else {
        originalData = denormalizeQClawOpenClaw(aiType, draftData)
        fs.writeFileSync(originalPath, JSON.stringify(originalData, null, 2), 'utf8')
      }
      console.log(`[${TAG}] ${aiType} 配置已保存（已 denormalize）`)
      return { success: true }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error(`[${TAG}] ${aiType} 保存失败:`, msg)
      return { success: false, error: msg }
    }
  },

  resetDraft(aiType: string): InitResult {
    return this.init(aiType)
  },

  readRaw,

  denormalize(aiType: string, draftData: Record<string, unknown>): Record<string, unknown> {
    if (aiType === 'hermes') {
      return denormalizeHermes(draftData)
    }
    return denormalizeQClawOpenClaw(aiType, draftData)
  },

  listBackups(aiType: string): string[] {
    try {
      const files = fs.readdirSync(BACKUPS_DIR)
      return files
        .filter((f) => f.startsWith(aiType + '_'))
        .sort()
        .reverse()
    } catch {
      return []
    }
  },

  getOriginalPath(aiType: string): string | null {
    return ORIGINAL_PATHS[aiType] || null
  },

  getDraftPath
}

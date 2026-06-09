import fs from 'fs'
import { HermesAdapter, DIRECT_PORT as HERMES_PORT } from './adapters/hermes-adapter'
import { OpenClawAdapter } from './adapters/openclaw-adapter'
import { QClawAdapter } from './adapters/qclaw-adapter'
import { CursorAdapter } from './adapters/cursor-adapter'
import { DirectApiAdapter } from './adapters/direct-api-adapter'
import { ConfigManager } from './managers/config-manager'
import { create as createLog } from './utils/console-logger'
import type { BaseAdapter } from './adapters/base-adapter'
import type { DirectApiConfig } from '../shared/types'
import type { GatewayManager } from './managers/gateway-manager'

const log = createLog('AdapterFactory')

// ── Module-level state (injected from index.ts) ─────────────
let qclawToken = ''
let openclawToken = ''
let gatewayManagerRef: GatewayManager | null = null

/** 由 index.ts 调用，注入 qclawToken */
export function setQclawToken(token: string): void {
  qclawToken = token
}

/** 由 index.ts 调用，注入 openclawToken */
export function setOpenclawToken(token: string): void {
  openclawToken = token
}

/** 由 index.ts 调用，注入 gatewayManager 引用 */
export function setGatewayManagerRef(gm: GatewayManager | null): void {
  gatewayManagerRef = gm
}

/**
 * 加载 QClaw 配置文件，提取 token 和端口
 */
export function loadQclawConfig(): void {
  try {
    const home = process.env.USERPROFILE || process.env.HOME || '~'
    const cfg = JSON.parse(
      fs.readFileSync(require('path').join(home, '.qclaw', 'openclaw.json'), 'utf8')
    )
    qclawToken = cfg.gateway?.auth?.token || ''
    const port = cfg.gateway?.port || 28789
    log.info('QClaw token loaded (port %d)', port)
  } catch (e) {
    log.warn('QClaw config not found:', (e as Error).message)
  }
}

// ── Exported constants & collections ─────────────────────────

export const DEFAULT_PORTS: Record<string, number> = { qclaw: 28789, openclaw: 18789, hermes: HERMES_PORT }

export const adapters = new Map<string, BaseAdapter>()

// ── Exported functions ───────────────────────────────────────

export function loadTokenForAI(aiType: string): string {
  if (aiType === 'qclaw') return qclawToken
  if (aiType === 'openclaw') return openclawToken
  return ''
}

export function getGatewayPort(aiType: string): number | null {
  if (!gatewayManagerRef) return null
  const gw = gatewayManagerRef.getAllStatus()
  const info = gw[aiType]
  return info?.port || DEFAULT_PORTS[aiType] || null
}

export function getOrCreateAdapter(aiType: string, port?: number): BaseAdapter {
  const realPort = port || getGatewayPort(aiType)
  const defaultPort = aiType === 'openclaw' ? 18789 : aiType === 'qclaw' ? 28789 : HERMES_PORT
  const finalPort = realPort || DEFAULT_PORTS[aiType] || defaultPort
  const baseUrl = `http://127.0.0.1:${finalPort}`

  if (adapters.has(aiType)) {
    const existing = adapters.get(aiType)!
    // echora 类型每次刷新 provider 配置，同步 echora-agent.json
    if (aiType === 'echora' && existing instanceof DirectApiAdapter) {
      let agentProviders = (ConfigManager.get('agentProviders') as Array<Record<string, unknown>>) || []
      if (agentProviders.length === 0) {
        agentProviders = (ConfigManager.get('directApiConfigs') as Array<Record<string, unknown>>) || []
      }
      const providers = agentProviders.map((p) => ({
        id: p.id as string,
        name: p.name as string,
        baseUrl: p.baseUrl as string,
        apiKey: p.apiKey as string,
        models: (p.models as string[]) || [],
        defaultModel: (p.defaultModel as string) || '',
        contextWindow: (p.contextWindow as number) || undefined,
        contextCompression: (p.contextCompression as { enabled?: boolean; thresholdPct?: number; targetPct?: number }) || undefined,
      }))
      const synced = DirectApiAdapter.syncFromFile(providers as DirectApiConfig[])
      existing.updateProviders(synced)
    }
    const targetUrl = aiType === 'hermes' ? `http://127.0.0.1:${HERMES_PORT}` : baseUrl
    if (existing.baseUrl !== targetUrl) {
      existing.baseUrl = targetUrl
      if (aiType === 'hermes') (existing as unknown as HermesAdapter).apiPort = HERMES_PORT
      log.info('Adapter %s port updated: %s', aiType, targetUrl)
    }
    return existing
  }

  let adapter: BaseAdapter
  if (aiType === 'cursor') {
    adapter = new CursorAdapter({ aiType: 'cursor' })
  } else if (aiType === 'hermes') {
    adapter = new HermesAdapter({
      port: HERMES_PORT,
      token: process.env.API_SERVER_KEY || '',
      baseUrl: `http://127.0.0.1:${HERMES_PORT}`,
    })
  } else if (aiType === 'qclaw') {
    adapter = new QClawAdapter({
      port: finalPort,
      token: qclawToken,
      baseUrl,
      exePath: (ConfigManager.get('aiPaths') as Record<string, string>)?.qclaw,
    })
  } else if (aiType === 'echora') {
    // Echora Agent 使用直连 API，绕过网关直接调用 OpenAI 兼容 API
    // 优先从 agentProviders 读取，如果为空则从 directApiConfigs（旧配置）读取
    // 并同步到 ~/.echora/echora-agent.json
    let agentProviders = (ConfigManager.get('agentProviders') as Array<Record<string, unknown>>) || []
    if (agentProviders.length === 0) {
      agentProviders = (ConfigManager.get('directApiConfigs') as Array<Record<string, unknown>>) || []
    }
    const providers = agentProviders.map((p) => ({
      id: p.id as string,
      name: p.name as string,
      baseUrl: p.baseUrl as string,
      apiKey: p.apiKey as string,
      models: (p.models as string[]) || [],
      defaultModel: (p.defaultModel as string) || '',
      contextWindow: (p.contextWindow as number) || undefined,
      contextCompression: (p.contextCompression as { enabled?: boolean; thresholdPct?: number; targetPct?: number }) || undefined,
    }))
    const synced = DirectApiAdapter.syncFromFile(providers as DirectApiConfig[])
    adapter = new DirectApiAdapter({ providers: synced })
    log.info('[echora] DirectApiAdapter created with %d providers (synced with echora-agent.json)', synced.length)
    if (synced.length > 0) {
      log.info('[echora] Provider: %s baseUrl=%s hasKey=%s contextWindow=%s',
        synced[0].name, synced[0].baseUrl, Boolean(synced[0].apiKey), synced[0].contextWindow || 'auto')
    }
  } else {
    const ocToken = loadTokenForAI('openclaw')
    adapter = new OpenClawAdapter({
      aiType,
      port: finalPort,
      token: ocToken,
      baseUrl,
    })
  }

  try {
    if (adapter._requestTimeout && adapter._requestTimeout > 0) {
      const currentSettings = (ConfigManager.get('settings') as Record<string, unknown>) || {}
      const currentTimeout = (currentSettings.timeout as number) || 120000
      if (adapter._requestTimeout !== currentTimeout) {
        ConfigManager.set('settings', { ...currentSettings, timeout: adapter._requestTimeout })
        log.info(
          'Synced timeout from adapter: %ds → Echora config',
          Math.round(adapter._requestTimeout / 1000)
        )
      }
    }
  } catch (_e) { log.warn('Adapter timeout sync failed:', (_e as Error).message) }

  adapters.set(aiType, adapter)
  log.info('Adapter created for %s → %s', aiType, aiType === 'echora' ? 'DirectApi' : baseUrl)
  return adapter
}

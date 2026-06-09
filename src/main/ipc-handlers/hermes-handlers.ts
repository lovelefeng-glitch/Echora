import { create as createLog } from '../utils/console-logger'
import { HermesAdapter, DIRECT_PORT as HERMES_PORT } from '../adapters/hermes-adapter'
import { ConfigReader } from '../managers/config-reader'
import { adapters, getOrCreateAdapter } from '../adapter-factory'
import type { IpcRouter } from '../ipc-router'
import type { GatewayManager } from '../managers/gateway-manager'
import type { GatewayStatusMap, HermesProfile } from '../../shared/ipc-types'

const log = createLog('Hermes')

/**
 * 为 gwStatus 注入 Hermes profile 独立状态
 * 供 gateway:status、gateway:refresh、轮询三处共用
 */
export async function enrichWithHermesProfiles(gwStatus: GatewayStatusMap): Promise<void> {
  const hermesAdapter = adapters.get('hermes') as HermesAdapter | undefined
  if (!hermesAdapter) return
  try {
    const profiles = hermesAdapter.getDiscoveredProfiles()
    for (const profile of profiles) {
      try {
        const profileStatus = await hermesAdapter.getProfileStatus(profile.name)
        const profileKey = `hermes:${profile.name}`
        gwStatus[profileKey] = {
          status: profileStatus.status,
          port: hermesAdapter.getProfilePortNum(profile.name),
          owned: true,
        } as never
      } catch (e) {
        log.warn(`[enrichProfiles] ${profile.name} failed: ${(e as Error).message}`)
      }
    }
  } catch (e) {
    log.warn(`[enrichProfiles] overall failed: ${(e as Error).message}`)
  }
}

/**
 * 注册 Hermes 相关的 IPC handler
 */
export function registerHermesHandlers(
  router: IpcRouter,
  getGatewayManager: () => GatewayManager | null
): void {
  router.handle('hermes:profiles', async (): Promise<HermesProfile[]> => {
    return ConfigReader.discoverHermesProfiles()
  })

  router.handle('hermes:config', async () => {
    const paths = ConfigReader.discover()
    if (!paths.hermes) return { success: false, error: 'Hermes 配置文件未找到' }
    const result = ConfigReader.read(paths.hermes)
    if (result.success && result.data) {
      const normalized = ConfigReader.normalize('hermes', result.data)
      return { success: true, data: normalized as unknown as import('../../shared/ipc-types').NormalizedHermesConfig, error: undefined }
    }
    return result
  })
}

/**
 * 处理 Hermes 网关启动（gateway:start 的 hermes 分支）
 */
export async function handleHermesStart(
  exePath?: string,
  profileName?: string
): Promise<unknown> {
  const adapter = getOrCreateAdapter('hermes') as unknown as HermesAdapter
  if (exePath) adapter.config.exePath = exePath
  return adapter.start(profileName)
}

/**
 * 处理 Hermes 网关停止（gateway:stop 的 hermes 分支）
 */
export async function handleHermesStop(profileName?: string): Promise<unknown> {
  if (profileName) {
    const adapter = adapters.get('hermes') as HermesAdapter | undefined
    if (adapter) return adapter.stopProfile(profileName)
  }
  // 无 profileName 时走通用停止逻辑
  return null
}

/**
 * 处理 Hermes 网关重启（gateway:restart 的 hermes 分支）
 */
export async function handleHermesRestart(): Promise<unknown> {
  const adapter = adapters.get('hermes') as HermesAdapter | undefined
  if (adapter) {
    await adapter.stop()
    await new Promise((r) => setTimeout(r, 2000))
    const freshAdapter = (adapters.get('hermes') as HermesAdapter) || getOrCreateAdapter('hermes') as HermesAdapter
    return freshAdapter.start()
  }
  return null
}

/**
 * 收集已知的 Hermes profile 端口集合
 */
export function getHermesProfilePorts(): Set<number> {
  const ports = new Set<number>()
  const ha = adapters.get('hermes') as HermesAdapter | undefined
  if (ha) {
    try {
      for (const p of ha.getDiscoveredProfiles()) {
        ports.add(ha.getProfilePortNum(p.name))
      }
    } catch (_e) { log.warn('getHermesProfilePorts failed:', (_e as Error).message) }
  }
  return ports
}

import { create as createLog } from '../utils/console-logger'
import { AIDetector } from '../detectors/ai-detector'
import { ConfigManager } from '../managers/config-manager'
import { HermesAdapter, DIRECT_PORT as HERMES_PORT } from '../adapters/hermes-adapter'
import { adapters } from '../adapter-factory'
import { enrichWithHermesProfiles, getHermesProfilePorts, handleHermesStart, handleHermesStop, handleHermesRestart } from './hermes-handlers'
import type { IpcRouter } from '../ipc-router'
import type { GatewayManager } from '../managers/gateway-manager'
import type { GatewayStatusMap, GatewayStartParams, AIDetected } from '../../shared/ipc-types'

const log = createLog('Gateway')

/**
 * 注册网关相关的 IPC handler
 */
export function registerGatewayHandlers(
  router: IpcRouter,
  getGatewayManager: () => GatewayManager | null
): void {
  router.handle('gateway:refresh', async () => {
    const gatewayManager = getGatewayManager()
    if (!gatewayManager) return { detected: {}, gateways: {} }

    const config = ConfigManager.getAll()
    const detected = await AIDetector.scanGateways()
    const profilePorts = getHermesProfilePorts()

    for (const [aiType, info] of Object.entries(detected)) {
      if (info.running && info.port) {
        if (aiType === 'hermes' && profilePorts.has(info.port)) continue
        gatewayManager.attach(aiType, { pid: info.pid, port: info.port, url: info.url || undefined })
      }
    }

    // Hermes 主实例状态
    const hermesAdapter = adapters.get('hermes') as HermesAdapter | undefined
    if (hermesAdapter) {
      try {
        const hermesStatus = await hermesAdapter.getStatus()
        if (hermesStatus.status === 'running') {
          gatewayManager.attach('hermes', {
            pid: hermesStatus.pid || 0,
            port: HERMES_PORT,
            url: `http://127.0.0.1:${HERMES_PORT}`,
          })
        } else {
          ;(gatewayManager as unknown as { processes: Map<string, unknown> }).processes.delete('hermes')
        }
      } catch (_e) { log.warn('Hermes status refresh failed:', (_e as Error).message) }
    }

    const aiPaths = config.aiPaths || {}
    const configured: Record<string, Record<string, unknown>> = {}
    for (const [aiType, aiPath] of Object.entries(aiPaths)) {
      const def = AIDetector.getKnownList().find((k) => k.id === aiType)
      configured[aiType] = {
        name: def?.name || aiType,
        category: def?.category || 'unknown',
        found: true,
        path: aiPath as string,
        source: 'manual',
        verified: true,
      }
    }

    const fileResults = AIDetector.scanFiles(aiPaths)
    for (const [aiType, fileResult] of Object.entries(fileResults)) {
      if (configured[aiType] && fileResult.found && fileResult.path) {
        configured[aiType] = {
          ...configured[aiType] as Record<string, unknown>,
          path: fileResult.path,
          verified: fileResult.verified,
        }
      }
    }

    const gatewayConfigs = (config.gatewayConfigs as Record<string, Record<string, unknown>>) || {}
    for (const [aiType, gwConfig] of Object.entries(gatewayConfigs)) {
      if (!configured[aiType]) {
        const def = AIDetector.getKnownList().find((k) => k.id === aiType)
        configured[aiType] = {
          name: def?.name || aiType,
          category: def?.category || 'unknown',
          found: true,
          path: '',
          source: 'gateway-config',
          verified: true,
          port: gwConfig.port,
        }
      }
    }

    const gatewayStatus = gatewayManager.getAllStatus()
    for (const [aiType, status] of Object.entries(gatewayStatus)) {
      if (!configured[aiType] && status.status === 'running') {
        const def = AIDetector.getKnownList().find((k) => k.id === aiType)
        configured[aiType] = {
          name: def?.name || aiType,
          category: def?.category || 'unknown',
          found: true,
          path: '',
          source: 'gateway',
          verified: true,
        }
      }
    }

    const removedAIs = (ConfigManager.get('removedAIs') as string[]) || []
    for (const aiType of removedAIs) {
      delete configured[aiType]
    }

    await enrichWithHermesProfiles(gatewayStatus as unknown as GatewayStatusMap)

    return {
      detected: configured as unknown as AIDetected,
      gateways: gatewayStatus as unknown as GatewayStatusMap,
    }
  })

  router.handle('gateway:attach', async (aiType: string, port: number) => {
    const gatewayManager = getGatewayManager()
    if (!gatewayManager) return {}
    gatewayManager.attach(aiType, {
      pid: 0,
      port,
      url: `http://127.0.0.1:${port}`,
    })
    return gatewayManager.getAllStatus() as unknown as GatewayStatusMap
  })

  router.handle('gateway:start', async (params: GatewayStartParams) => {
    const { aiType, exePath, config, profileName } = params
    const gatewayManager = getGatewayManager()
    log.info(`[Gateway] Starting ${aiType} with exePath: ${exePath || 'undefined'}`)

    // Hermes 走专用逻辑
    if (aiType === 'hermes') {
      return handleHermesStart(exePath, profileName)
    }

    if (gatewayManager) {
      const result = await gatewayManager.start(aiType, exePath || '', (config || {}) as Record<string, unknown>)

      if (result.success && exePath) {
        const autoPaths = (ConfigManager.get('autoRecordedPaths') as Record<string, string>) || {}
        if (autoPaths[aiType] !== exePath) {
          autoPaths[aiType] = exePath
          ConfigManager.set('autoRecordedPaths', autoPaths)
          log.info(`[Gateway] 自动记录路径: ${aiType} -> ${exePath}`)
        }
      }

      return result
    }
    return { success: false, message: 'gatewayManager 未初始化' }
  })

  router.handle('gateway:stop', async (aiType: string, profileName?: string) => {
    const gatewayManager = getGatewayManager()
    log.info(`[Gateway:Stop] 收到停止请求: ${aiType}`)

    // Hermes profile 停止
    if (aiType === 'hermes' && profileName) {
      const result = await handleHermesStop(profileName)
      if (result !== null) return result
    }

    const adapter = adapters.get(aiType)
    log.info(`[Gateway:Stop] adapter 存在: ${!!adapter}`)
    if (adapter) {
      try { await adapter.stop() } catch (e) { log.warn(`[Gateway:Stop] adapter.stop 异常: ${e}`) }
    }

    if (gatewayManager) {
      const procInfo = (gatewayManager as unknown as { processes: Map<string, { pid?: number; status: string }> }).processes.get(aiType)
      log.info(`[Gateway:Stop] gatewayManager.processes[${aiType}]: ${procInfo ? `pid=${procInfo.pid}, status=${procInfo.status}` : '未找到'}`)
      const result = await gatewayManager.stop(aiType) as { success: boolean; message?: string }
      log.info(`[Gateway:Stop] gatewayManager.stop 结果: ${JSON.stringify(result)}`)
      return result
    }
    log.warn('[Gateway:Stop] gatewayManager 未初始化')
    return { success: true }
  })

  router.handle('gateway:restart', async (aiType: string) => {
    const gatewayManager = getGatewayManager()

    // Hermes 走专用逻辑
    if (aiType === 'hermes') {
      const result = await handleHermesRestart()
      if (result !== null) return result
    }

    if (gatewayManager) return gatewayManager.restart(aiType) as Promise<{ success: boolean; message?: string }>
    return { success: false, message: 'gatewayManager 未初始化' }
  })

  router.handle('gateway:status', async () => {
    const gatewayManager = getGatewayManager()
    if (!gatewayManager) return {}
    const status = gatewayManager.getAllStatus() as unknown as GatewayStatusMap
    await enrichWithHermesProfiles(status)
    return status
  })
}

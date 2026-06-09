import { BrowserWindow } from 'electron'
import { create as createLog } from './utils/console-logger'
import { AIDetector } from './detectors/ai-detector'
import { ConfigManager } from './managers/config-manager'
import { HermesAdapter, DIRECT_PORT as HERMES_PORT } from './adapters/hermes-adapter'
import type { GatewayManager } from './managers/gateway-manager'
import type { IpcRouter } from './ipc-router'
import { adapters } from './adapter-factory'
import { enrichWithHermesProfiles } from './ipc-handlers/hermes-handlers'

const log = createLog('StatusPolling')

// ── 依赖注入 ──────────────────────────────────────────────

interface StatusPollingDeps {
  getWindow: () => BrowserWindow | null
  getGatewayManager: () => GatewayManager | null
  getRouter: () => IpcRouter | null
}

let deps: StatusPollingDeps = {
  getWindow: () => null,
  getGatewayManager: () => null,
  getRouter: () => null,
}

export function initStatusPolling(d: StatusPollingDeps): void {
  deps = d
}

// ── 轮询状态 ──────────────────────────────────────────────

let statusPollTimer: ReturnType<typeof setInterval> | null = null
let pollCycleCount = 0

export function startStatusPolling(): void {
  if (statusPollTimer) clearInterval(statusPollTimer)
  statusPollTimer = setInterval(async () => {
    const mainWindow = deps.getWindow()
    const gatewayManager = deps.getGatewayManager()
    const ipcRouter = deps.getRouter()

    if (!mainWindow || mainWindow.isDestroyed() || !gatewayManager) return
    try {
      // 外部网关扫描（可配置间隔）
      pollCycleCount++
      const pollSettings = ConfigManager.get('settings') as Record<string, unknown> | undefined
      const scanIntervalSec = (pollSettings?.gatewayScanInterval as number) ?? 30
      const scanEvery = Math.max(1, Math.round(scanIntervalSec / 10))
      if (scanIntervalSec > 0 && pollCycleCount >= scanEvery) {
        pollCycleCount = 0
        try {
          const detected = await AIDetector.scanGateways()
          for (const [aiType, info] of Object.entries(detected)) {
            if (info.running && info.port) {
              gatewayManager.attach(aiType, {
                pid: info.pid,
                port: info.port,
                url: info.url || undefined
              })
            }
          }
        } catch (_e) {}
      }

      const gwStatus = gatewayManager.getAllStatus()

      // Health check: detect crashed gateways that weren't caught by process events
      for (const [aiType, info] of Object.entries(gwStatus)) {
        if (info.status === 'running' && info.port) {
          const alive = await gatewayManager.checkAlive(aiType)
          if (!alive) {
            info.status = 'stopped'
            ipcRouter?.send('gateway:statusChange', {
              aiType,
              status: 'stopped',
              timestamp: Date.now()
            } as never)
            log.info(`[HealthCheck] ${aiType} gateway is no longer alive (port ${info.port})`)
          }
        }
        // 检查 starting 的网关是否已就绪，提升为 running
        if (info.status === 'starting' && info.port) {
          const alive = await gatewayManager.checkAlive(aiType)
          if (alive) {
            info.status = 'running'
            const proc = (gatewayManager as unknown as { processes: Map<string, { status: string }> }).processes.get(aiType)
            if (proc) proc.status = 'running'
            ipcRouter?.send('gateway:statusChange', {
              aiType,
              status: 'running',
              port: info.port,
              timestamp: Date.now()
            } as never)
            log.info(`[HealthCheck] ${aiType} gateway is now ready (port ${info.port})`)
          }
        }
      }

      const hermesAdapter = adapters.get('hermes') as HermesAdapter | undefined
      if (hermesAdapter) {
        try {
          const hermesStatus = await hermesAdapter.getStatus()
          gwStatus.hermes = {
            ...gwStatus.hermes,
            status: hermesStatus.status,
            pid: hermesStatus.pid || gwStatus.hermes?.pid,
            port: HERMES_PORT,
            owned: true,
          }
          const hermesGw = (gatewayManager as unknown as { processes: Map<string, { status: string }> }).processes.get('hermes')
          if (hermesGw) hermesGw.status = hermesStatus.status
        } catch (_e) { log.warn('Hermes status poll failed:', (_e as Error).message) }

        // Profile agents 独立状态检测
        await enrichWithHermesProfiles(gwStatus)
      }

      ipcRouter?.send('gateway:statusAll', gwStatus as never)
    } catch (_e) { log.warn('Status polling cycle failed:', (_e as Error).message) }
  }, 10000)
}

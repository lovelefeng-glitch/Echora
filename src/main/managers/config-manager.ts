import * as fs from 'fs'
import { dirname } from 'path'
import type { AppConfig, AppSettings } from '../../shared/ipc-types'

const TAG = 'ConfigManager'

const DEFAULT_SETTINGS: AppSettings = {
  autoStartOnBoot: false,
  minimizeToTray: true,
  checkUpdates: true,
  timeout: 120000,
  timeoutPerAI: 0,
  pollInterval: 10000,
  maxMessages: 50
}

function createDefaultConfig(): AppConfig {
  return {
    firstRun: true,
    aiPaths: {},
    gatewayConfigs: {},
    autoRecordedPaths: {},
    lastActive: undefined,
    settings: { ...DEFAULT_SETTINGS },
    aiConfigPaths: {}
  }
}

let configPath: string | null = null
let configData: AppConfig = createDefaultConfig()

export const ConfigManager = {
  init(filePath: string): void {
    configPath = filePath
    const dir = dirname(filePath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    if (fs.existsSync(filePath)) {
      try {
        const raw = fs.readFileSync(filePath, 'utf-8')
        configData = { ...configData, ...JSON.parse(raw) }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e)
        console.warn(`[${TAG}] 配置文件加载失败，使用默认配置:`, msg)
      }
    }
  },

  get(key: string): unknown {
    return configData[key]
  },

  set(key: string, value: unknown): boolean {
    ;(configData as Record<string, unknown>)[key] = value
    this.save()
    return true
  },

  getAll(): AppConfig {
    return { ...configData }
  },

  save(): boolean {
    if (!configPath) return false
    try {
      fs.writeFileSync(configPath, JSON.stringify(configData, null, 2), 'utf-8')
      return true
    } catch (e: unknown) {
      console.error(`[${TAG}] 配置保存失败:`, e)
      return false
    }
  },

  reset(): void {
    configData = createDefaultConfig()
    this.save()
  }
}

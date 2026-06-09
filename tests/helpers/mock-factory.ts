import { vi } from 'vitest'
import type { AppConfig, AppSettings } from '../../src/shared/ipc-types'
import type { AdapterConfig, StartResult, StopResult, StatusResult, AdapterAgentItem, SendMessageResult } from '../../src/main/adapters/base-adapter'

export function createMockLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    success: vi.fn(),
    event: vi.fn(),
    raw: vi.fn(),
  }
}

export function createMockAdapterConfig(overrides?: Partial<AdapterConfig>): AdapterConfig {
  return {
    port: 8080,
    baseUrl: 'http://localhost:8080',
    token: 'test-token',
    ...overrides,
  }
}

export function createMockAppSettings(overrides?: Partial<AppSettings>): AppSettings {
  return {
    autoStartOnBoot: false,
    minimizeToTray: true,
    checkUpdates: true,
    timeout: 120000,
    timeoutPerAI: 0,
    pollInterval: 10000,
    maxMessages: 50,
    ...overrides,
  }
}

export function createMockAppConfig(overrides?: Partial<AppConfig>): AppConfig {
  return {
    firstRun: true,
    aiPaths: {},
    gatewayConfigs: {},
    lastActive: undefined,
    settings: createMockAppSettings(),
    aiConfigPaths: {},
    ...overrides,
  }
}

export function createMockStartResult(overrides?: Partial<StartResult>): StartResult {
  return {
    success: true,
    pid: 12345,
    ...overrides,
  }
}

export function createMockStopResult(overrides?: Partial<StopResult>): StopResult {
  return {
    success: true,
    ...overrides,
  }
}

export function createMockStatusResult(overrides?: Partial<StatusResult>): StatusResult {
  return {
    status: 'running',
    pid: 12345,
    uptime: 60000,
    hasChatAPI: true,
    ...overrides,
  }
}

export function createMockAgent(overrides?: Partial<AdapterAgentItem>): AdapterAgentItem {
  return {
    id: 'agent-1',
    name: 'Test Agent',
    emoji: '🤖',
    description: 'A test agent',
    ...overrides,
  }
}

export function createMockSendMessageResult(overrides?: Partial<SendMessageResult>): SendMessageResult {
  return {
    success: true,
    content: 'Test response',
    messageId: 'msg-123',
    ...overrides,
  }
}

export function createMockFsModule() {
  return {
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
    statSync: vi.fn(),
    readdirSync: vi.fn(),
  }
}

export function createMockExecSync() {
  return vi.fn()
}

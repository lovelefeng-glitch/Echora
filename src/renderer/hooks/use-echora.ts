import { useEffect, useRef, useCallback } from 'react'
import type {
  GatewayStatusChangeData,
  GatewayStatusMap,
  GatewayMessageData,
  MessageChunkData,
  MessageDoneData,
  MessageToolCallData,
  MessageUsageData,
  ThinkingInfo,
  ToolStepInfo
} from '../../shared/ipc-types'

interface OnStreamAPI {
  onChunk: (cb: (data: MessageChunkData) => void) => () => void
  onDone: (cb: (data: MessageDoneData) => void) => () => void
  onToolCall: (cb: (data: MessageToolCallData) => void) => () => void
  onThinking: (cb: (data: { msgId: string } & ThinkingInfo) => void) => () => void
  onToolStep: (cb: (data: { msgId: string } & ToolStepInfo) => void) => () => void
  onUsage: (cb: (data: MessageUsageData) => void) => () => void
  cleanup: () => void
}

interface OnStartupAPI {
  envCheck: (cb: (data: unknown) => void) => () => void
  aiDetected: (cb: (data: unknown) => void) => () => void
}

export interface ElectronAPI {
  window: {
    minimize: () => Promise<void>
    maximize: () => Promise<void>
    close: () => Promise<void>
    setTheme: (isLight: boolean) => Promise<void>
    isMaximized: () => Promise<boolean>
    onMaximized: (cb: (maximized: boolean) => void) => () => void
  }
  skills: {
    list: (aiType: string) => Promise<unknown>
  }
  gateway: {
    start: (aiKey: string, exePath?: string, config?: unknown, profileName?: string) => Promise<unknown>
    stop: (aiKey: string, profileName?: string) => Promise<unknown>
    restart: (aiKey: string) => Promise<unknown>
    status: () => Promise<GatewayStatusMap>
    refresh: () => Promise<unknown>
    attach: (aiType: string, port: number) => Promise<unknown>
    onStatusChange: (cb: (data: GatewayStatusChangeData) => void) => () => void
    onStatusAll: (cb: (data: GatewayStatusMap) => void) => () => void
    onMessage: (cb: (data: GatewayMessageData) => void) => () => void
  }
  config: {
    get: (key: string) => Promise<unknown>
    set: (key: string, value: unknown) => Promise<boolean>
    getAll: () => Promise<unknown>
  }
  conv: {
    list: (agentKey?: string) => Promise<unknown>
    get: (agentKey: string, convId: string) => Promise<unknown>
    save: (agentKey: string, convId: string, conv: unknown) => Promise<boolean>
    delete: (agentKey: string, convId: string) => Promise<boolean>
    deleteAll: (agentKey: string) => Promise<boolean>
  }
  conversations: {
    save: (data: unknown) => Promise<boolean>
    load: () => Promise<unknown>
  }
  ocSessions: {
    list: (aiType: string, opts?: unknown) => Promise<unknown[]>
    history: (sessionKey: string, limit?: number) => Promise<unknown[]>
    create: (params: unknown) => Promise<unknown>
    delete: (sessionKey: string) => Promise<boolean>
    reset: (sessionKey: string) => Promise<boolean>
  }
  aiConfig: {
    setPath: (aiType: string, filePath: string) => Promise<boolean>
    read: (aiType: string) => Promise<unknown>
    discover: () => Promise<unknown>
    list: () => Promise<unknown>
  }
  draft: {
    read: (aiType: string) => Promise<unknown>
    write: (aiType: string, data: unknown) => Promise<boolean>
    save: (aiType: string) => Promise<unknown>
    reset: (aiType: string) => Promise<unknown>
    backups: (aiType: string) => Promise<string[]>
    paths: () => Promise<unknown>
  }
  hermes: {
    profiles: () => Promise<unknown[]>
    config: () => Promise<unknown>
  }
  ai: {
    setPath: (aiType: string, exePath: string) => Promise<boolean>
    removePath: (aiType: string) => Promise<boolean>
    rescan: () => Promise<unknown>
    scan: () => Promise<unknown>
    scanFull: () => Promise<unknown>
    probePort: (port: number) => Promise<unknown>
    addDiscovered: (params: unknown) => Promise<unknown>
  }
  env: {
    check: () => Promise<unknown>
    install: (tool: string) => Promise<unknown>
  }
  dialog: {
    openFile: (options?: unknown) => Promise<unknown>
    openDir: (options?: unknown) => Promise<unknown>
  }
  agent: {
    list: (aiType: string) => Promise<unknown[]>
    modelInfo: (aiType: string, agentId?: string) => Promise<unknown>
    listModels: (aiType: string) => Promise<unknown[]>
    setModel: (aiType: string, modelId: string) => Promise<unknown>
  }
  message: {
    send: (params: unknown) => Promise<unknown>
    sendStream: (params: unknown) => void
    abortStream: (params: { msgId: string }) => void
    status: (aiType: string) => Promise<unknown>
    usage: (params: unknown) => Promise<unknown>
  }
  directApi: {
    send: (params: unknown) => Promise<unknown>
    sendStream: (params: unknown) => void
    abortStream: (params: { msgId: string }) => void
    listModels: () => Promise<unknown[]>
    listProviders: () => Promise<unknown[]>
    testConnection: (providerId: string) => Promise<unknown>
  }
  tool: {
    respondConfirm: (confirmed: boolean) => Promise<void>
    cancelConfirm: () => Promise<void>
    onConfirmRequest: (cb: (data: { toolName: string; dangerLevel: string; args: Record<string, unknown>; details: string }) => void) => () => void
  }
  onStream: OnStreamAPI
  onStartup: OnStartupAPI
}

declare global {
  interface Window {
    echora: ElectronAPI
  }
}

function getAPI(): ElectronAPI {
  return window.echora
}

export function useEchora(): ElectronAPI {
  return getAPI()
}

export function useGatewayEvents(handlers: {
  onStatusChange?: (data: GatewayStatusChangeData) => void
  onStatusAll?: (data: GatewayStatusMap) => void
  onMessage?: (data: GatewayMessageData) => void
}): void {
  const handlersRef = useRef(handlers)
  handlersRef.current = handlers

  useEffect(() => {
    const api = getAPI()
    const cleanups: Array<() => void> = []

    if (handlersRef.current.onStatusChange) {
      cleanups.push(api.gateway.onStatusChange((data) => handlersRef.current.onStatusChange?.(data)))
    }
    if (handlersRef.current.onStatusAll) {
      cleanups.push(api.gateway.onStatusAll((data) => handlersRef.current.onStatusAll?.(data)))
    }
    if (handlersRef.current.onMessage) {
      cleanups.push(api.gateway.onMessage((data) => handlersRef.current.onMessage?.(data)))
    }

    return () => {
      cleanups.forEach((cleanup) => cleanup())
    }
  }, [])
}

export function useStreamEvents(handlers: {
  onChunk?: (data: MessageChunkData) => void
  onDone?: (data: MessageDoneData) => void
  onToolCall?: (data: MessageToolCallData) => void
  onThinking?: (data: { msgId: string } & ThinkingInfo) => void
  onToolStep?: (data: { msgId: string } & ToolStepInfo) => void
  onUsage?: (data: MessageUsageData) => void
}): void {
  const handlersRef = useRef(handlers)
  handlersRef.current = handlers

  useEffect(() => {
    const api = getAPI()
    const cleanups: Array<() => void> = []

    cleanups.push(api.onStream.onChunk((data) => handlersRef.current.onChunk?.(data)))
    cleanups.push(api.onStream.onDone((data) => handlersRef.current.onDone?.(data)))
    cleanups.push(api.onStream.onToolCall((data) => handlersRef.current.onToolCall?.(data)))
    cleanups.push(api.onStream.onThinking((data) => handlersRef.current.onThinking?.(data)))
    cleanups.push(api.onStream.onToolStep((data) => handlersRef.current.onToolStep?.(data)))
    cleanups.push(api.onStream.onUsage((data) => handlersRef.current.onUsage?.(data)))

    return () => {
      cleanups.forEach((cleanup) => cleanup())
    }
  }, [])
}

export function useWindowEvents(handlers: {
  onMaximized?: (maximized: boolean) => void
}): void {
  const handlersRef = useRef(handlers)
  handlersRef.current = handlers

  useEffect(() => {
    const api = getAPI()
    const cleanups: Array<() => void> = []

    if (handlersRef.current.onMaximized) {
      cleanups.push(api.window.onMaximized((maximized) => handlersRef.current.onMaximized?.(maximized)))
    }

    return () => {
      cleanups.forEach((cleanup) => cleanup())
    }
  }, [])
}

export function useAsyncCall<T extends (...args: never[]) => Promise<unknown>>(
  fn: T
): [T, boolean, string | null] {
  const loadingRef = useRef(false)
  const errorRef = useRef<string | null>(null)

  const wrappedFn = useCallback(
    async (...args: Parameters<T>) => {
      loadingRef.current = true
      errorRef.current = null
      try {
        const result = await fn(...args)
        return result
      } catch (err) {
        errorRef.current = err instanceof Error ? err.message : String(err)
        throw err
      } finally {
        loadingRef.current = false
      }
    },
    [fn]
  ) as T

  return [wrappedFn, loadingRef.current, errorRef.current]
}

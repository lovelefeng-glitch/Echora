/**
 * 日志 Store - 捕获渲染进程的 console 输出
 */
import { create } from 'zustand'

export interface LogEntry {
  id: number
  level: 'info' | 'warn' | 'error' | 'debug'
  message: string
  timestamp: number
  source?: string
}

interface LogStore {
  logs: LogEntry[]
  addLog: (level: LogEntry['level'], message: string, source?: string) => void
  clearLogs: () => void
}

let logId = 0
let interceptorInstalled = false
let guardActive = false

export const useLogStore = create<LogStore>((set) => ({
  logs: [],
  
  addLog: (level, message, source) => {
    const entry: LogEntry = {
      id: logId++,
      level,
      message,
      timestamp: Date.now(),
      source,
    }
    set((state) => ({
      logs: [...state.logs.slice(-499), entry]
    }))
  },
  
  clearLogs: () => set({ logs: [] }),
}))

const _originalLog = console.log.bind(console)
const _originalWarn = console.warn.bind(console)
const _originalError = console.error.bind(console)
const _originalDebug = console.debug.bind(console)

function formatArgs(...args: unknown[]): string {
  return args.map(arg => {
    if (arg === undefined) return 'undefined'
    if (arg === null) return 'null'
    if (typeof arg === 'object') {
      try { return JSON.stringify(arg) } catch { return String(arg) }
    }
    return String(arg)
  }).join(' ')
}

function getSource(): string | undefined {
  try {
    const stack = new Error().stack
    if (!stack) return undefined
    const lines = stack.split('\n')
    for (let i = 2; i < Math.min(lines.length, 6); i++) {
      const match = lines[i].match(/at\s+(.+?):(\d+)/)
      if (match) {
        const parts = match[1].split(/[/\\]/)
        return `${parts[parts.length - 1]}:${match[2]}`
      }
    }
  } catch { /* ignore */ }
  return undefined
}

export function installConsoleInterceptor() {
  if (interceptorInstalled) return
  interceptorInstalled = true

  console.log = (...args: unknown[]) => {
    if (guardActive) { _originalLog(...args); return }
    guardActive = true
    try { _originalLog(...args) } catch { /* */ }
    guardActive = false
    try { useLogStore.getState().addLog('info', formatArgs(...args), getSource()) } catch { /* */ }
  }

  console.warn = (...args: unknown[]) => {
    if (guardActive) { _originalWarn(...args); return }
    guardActive = true
    try { _originalWarn(...args) } catch { /* */ }
    guardActive = false
    try { useLogStore.getState().addLog('warn', formatArgs(...args), getSource()) } catch { /* */ }
  }

  console.error = (...args: unknown[]) => {
    if (guardActive) { _originalError(...args); return }
    guardActive = true
    try { _originalError(...args) } catch { /* */ }
    guardActive = false
    try { useLogStore.getState().addLog('error', formatArgs(...args), getSource()) } catch { /* */ }
  }

  console.debug = (...args: unknown[]) => {
    if (guardActive) { _originalDebug(...args); return }
    guardActive = true
    try { _originalDebug(...args) } catch { /* */ }
    guardActive = false
    try { useLogStore.getState().addLog('debug', formatArgs(...args), getSource()) } catch { /* */ }
  }
}

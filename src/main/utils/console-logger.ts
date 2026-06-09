const S = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
  redBright: '\x1b[91m',
  greenBright: '\x1b[92m',
  yellowBright: '\x1b[93m',
  blueBright: '\x1b[94m',
  magentaBright: '\x1b[95m',
  cyanBright: '\x1b[96m'
}

type LogLevel = 'info' | 'warn' | 'error' | 'debug' | 'success' | 'event' | 'system'

const LEVELS: Record<LogLevel, { label: string; color: string; labelColor: string }> = {
  info:    { label: 'INFO ', color: S.green,       labelColor: S.greenBright + S.bold },
  warn:    { label: 'WARN ', color: S.yellow,      labelColor: S.yellowBright + S.bold },
  error:   { label: 'ERROR', color: S.red,         labelColor: S.redBright + S.bold },
  debug:   { label: 'DEBUG', color: S.cyan,        labelColor: S.cyanBright + S.bold },
  success: { label: ' OK  ', color: S.greenBright, labelColor: S.greenBright + S.bold },
  event:   { label: 'EVENT', color: S.magenta,     labelColor: S.magentaBright + S.bold },
  system:  { label: 'SYS  ', color: S.blue,        labelColor: S.blueBright + S.bold }
}

function timestamp(): string {
  return new Date().toLocaleTimeString('zh-CN', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

function formatMsg(level: LogLevel, tag: string, ...args: unknown[]): string {
  const cfg = LEVELS[level]
  const ts = S.dim + timestamp() + S.reset
  const lbl = cfg.labelColor + cfg.label + S.reset
  const tagStr = tag ? S.bold + `[${tag}]` + S.reset + ' ' : ''
  const msg = args
    .map((a) => (typeof a === 'string' ? cfg.color + a + S.reset : String(a)))
    .join(' ')
  return `${ts} ${lbl} ${tagStr}${msg}`
}

export interface Logger {
  info: (...args: unknown[]) => void
  warn: (...args: unknown[]) => void
  error: (...args: unknown[]) => void
  debug: (...args: unknown[]) => void
  success: (...args: unknown[]) => void
  event: (...args: unknown[]) => void
  raw: (text: string) => void
}

export function create(tag: string): Logger {
  return {
    info: (...args) => console.log(formatMsg('info', tag, ...args)),
    warn: (...args) => console.warn(formatMsg('warn', tag, ...args)),
    error: (...args) => console.error(formatMsg('error', tag, ...args)),
    debug: (...args) => console.log(formatMsg('debug', tag, ...args)),
    success: (...args) => console.log(formatMsg('success', tag, ...args)),
    event: (...args) => console.log(formatMsg('event', tag, ...args)),
    raw: (text) =>
      console.log(
        `${S.dim}${timestamp()}${S.reset} ${S.gray}│${S.reset} ${S.gray}[${tag}]${S.reset} ${text}`
      )
  }
}

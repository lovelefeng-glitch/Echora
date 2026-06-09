import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { execSync } from 'child_process'

interface AiStateDefinition {
  name: string
  stateFile?: string
  lockFile?: string
  pidFile?: string
  configFile?: string
  profilesDir?: string
  rootDir?: string
}

export interface GatewayStateResult {
  aiType: string
  name: string
  found: boolean
  running: boolean
  pid: number | null
  state: Record<string, unknown> | null
  hasLock: boolean
  configExists: boolean
  rootDir: string | null
  stateFile?: string | null
  argv?: unknown
  activeAgents?: number
  updatedAt?: string | null
  processAlive?: boolean
  stale?: boolean
}

export interface RootDiscovery {
  rootDir: string
  aiType: string
  name: string
  files: string[]
}

export interface StateDefinitionInfo {
  type: string
  name: string
  stateFile: string | undefined
  rootDir: string
}

const AI_STATE_FILES: Record<string, AiStateDefinition> = {
  hermes: {
    name: 'Hermes',
    stateFile: path.join(os.homedir(), 'AppData', 'Local', 'hermes', 'gateway_state.json'),
    lockFile: path.join(os.homedir(), 'AppData', 'Local', 'hermes', 'gateway.lock'),
    pidFile: path.join(os.homedir(), 'AppData', 'Local', 'hermes', 'gateway.pid'),
    configFile: path.join(os.homedir(), 'AppData', 'Local', 'hermes', 'config.yaml'),
    profilesDir: path.join(os.homedir(), 'AppData', 'Local', 'hermes', 'profiles'),
    rootDir: path.join(os.homedir(), 'AppData', 'Local', 'hermes'),
  },
  qclaw: {
    name: 'QClaw',
    stateFile: path.join(os.homedir(), 'AppData', 'Local', 'QClaw', 'gateway_state.json'),
    lockFile: path.join(os.homedir(), 'AppData', 'Local', 'QClaw', 'gateway.lock'),
    pidFile: path.join(os.homedir(), 'AppData', 'Local', 'QClaw', 'gateway.pid'),
  },
  openclaw: {
    name: 'OpenClaw',
    stateFile: path.join(os.homedir(), '.openclaw', 'gateway_state.json'),
    lockFile: path.join(os.homedir(), '.openclaw', 'gateway.lock'),
    pidFile: path.join(os.homedir(), '.openclaw', 'gateway.pid'),
  },
}

function isProcessAlive(pid: number): boolean {
  if (!pid || pid <= 0) return false
  try {
    const result = execSync(
      `tasklist /FI "PID eq ${pid}" /NH`,
      { encoding: 'utf-8', timeout: 3000, stdio: ['pipe', 'pipe', 'pipe'] }
    )
    return result.includes(String(pid))
  } catch {
    return false
  }
}

function readJsonFile(filePath: string): Record<string, unknown> | null {
  try {
    if (!fs.existsSync(filePath)) return null
    const raw = fs.readFileSync(filePath, 'utf-8')
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function readGatewayState(aiType: string): GatewayStateResult | null {
  const definition = AI_STATE_FILES[aiType]
  if (!definition) return null

  const result: GatewayStateResult = {
    aiType,
    name: definition.name,
    found: false,
    running: false,
    pid: null,
    state: null,
    hasLock: false,
    configExists: false,
    rootDir: definition.rootDir || null,
  }

  if (definition.stateFile) {
    const stateData = readJsonFile(definition.stateFile)
    if (stateData) {
      result.found = true
      result.state = stateData
      result.pid = (stateData.pid as number) || null
      result.stateFile = (stateData.gateway_state as string) || (stateData.status as string) || null
      result.running = result.stateFile === 'running'
      result.argv = stateData.argv || null
      result.activeAgents = (stateData.active_agents as number) || 0
      result.updatedAt = (stateData.updated_at as string) || null
    }
  }

  if (definition.lockFile) {
    result.hasLock = fs.existsSync(definition.lockFile)
  }

  if (definition.pidFile && !result.pid) {
    const pidData = readJsonFile(definition.pidFile)
    if (pidData && pidData.pid) {
      result.pid = pidData.pid as number
      result.found = true
    }
  }

  if (result.pid) {
    result.processAlive = isProcessAlive(result.pid)
    if (result.running && result.processAlive) {
    } else if (result.running && !result.processAlive) {
      result.running = false
      result.stale = true
    }
  }

  if (definition.configFile) {
    result.configExists = fs.existsSync(definition.configFile)
  }

  return result
}

export const StateReader = {
  readAll(): Record<string, GatewayStateResult | null> {
    const results: Record<string, GatewayStateResult | null> = {}
    for (const aiType of Object.keys(AI_STATE_FILES)) {
      results[aiType] = readGatewayState(aiType)
    }
    return results
  },

  readOne(aiType: string): GatewayStateResult | null {
    return readGatewayState(aiType)
  },

  discoverRoots(): RootDiscovery[] {
    const candidates = [
      { root: path.join(os.homedir(), 'AppData', 'Local', 'hermes'), type: 'hermes', name: 'Hermes' },
      { root: path.join(os.homedir(), 'AppData', 'Local', 'QClaw'), type: 'qclaw', name: 'QClaw' },
      { root: path.join(os.homedir(), '.openclaw'), type: 'openclaw', name: 'OpenClaw' },
      { root: path.join(os.homedir(), '.hermes'), type: 'hermes-alt', name: 'Hermes (alt)' },
      { root: 'C:\\Program Files', type: 'scanned', name: 'Program Files' },
      { root: path.join(os.homedir(), 'AppData', 'Local', 'Programs'), type: 'scanned', name: 'Local Programs' },
    ]

    const discovered: RootDiscovery[] = []

    for (const cand of candidates) {
      if (!fs.existsSync(cand.root)) continue

      const stateFiles = ['gateway_state.json', 'gateway.lock', 'gateway.pid']
      const foundFiles: string[] = []
      for (const sf of stateFiles) {
        if (fs.existsSync(path.join(cand.root, sf))) {
          foundFiles.push(sf)
        }
      }

      const configFiles = ['config.yaml', 'config.json', 'openclaw.json']
      for (const cf of configFiles) {
        if (fs.existsSync(path.join(cand.root, cf))) {
          foundFiles.push(cf)
        }
      }

      if (foundFiles.length > 0 && cand.type === 'scanned') {
        discovered.push({
          rootDir: cand.root,
          aiType: 'unknown',
          name: path.basename(cand.root),
          files: foundFiles,
        })
      }
    }

    return discovered
  },

  getDefinitions(): StateDefinitionInfo[] {
    return Object.entries(AI_STATE_FILES).map(([type, def]) => ({
      type,
      name: def.name,
      stateFile: def.stateFile,
      rootDir: def.rootDir || path.dirname(def.stateFile!),
    }))
  },
}

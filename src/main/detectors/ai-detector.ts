import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { execSync } from 'child_process'
import http from 'http'
import { PortScanner } from './port-scanner'
import type { PortScanDiscovery } from './port-scanner'
import { StateReader } from './state-reader'

interface GatewayPattern {
  processName: string
  cmdlineIncludes: string | null
}

interface AiSoftwareDefinition {
  name: string
  category: string
  exeNames: string[]
  searchPaths: string[]
  gatewayPatterns: GatewayPattern[]
  configPattern?: string | null
  apiServerPort?: number | null
  npmPackage?: string
}

interface FileScanResult {
  found: boolean
  path: string | null
  source: string | null
  verified: boolean
  version?: string
}

interface GatewayInfo {
  running: boolean
  pid: number
  port: number | null
  allPorts: number[]
  url: string | null
  alive?: boolean
  source?: string
}

export interface AiScanResult {
  name: string
  category: string
  found: boolean
  path: string | null
  source: string | null
  verified: boolean
  gateway: GatewayInfo | null
}

interface FullScanOptions {
  ignorePorts?: number[]
}

export interface FullScanResult {
  results: Record<string, AiScanResult>
  unknownGateways: PortScanDiscovery[]
  portDiscovered: PortScanDiscovery[]
}

interface KnownListItem {
  id: string
  name: string
  category: string
}

interface RegisterTypeParams {
  name?: string
  category?: string
  exeNames?: string[]
  searchPaths?: string[]
  gatewayPatterns?: GatewayPattern[]
  configPattern?: string | null
  apiServerPort?: number | null
  knownPorts?: number[]
  httpChecks?: Array<{ path: string; expectStatus: number[] }>
  responsePatterns?: RegExp[]
  processHints?: string[]
}

const KNOWN_AI_SOFTWARE: Record<string, AiSoftwareDefinition> = {
  hermes: {
    name: 'Hermes',
    category: 'agent',
    exeNames: ['hermes.exe', 'hermes-agent.exe'],
    searchPaths: [
      path.join(os.homedir(), 'AppData', 'Local', 'hermes'),
      path.join(os.homedir(), '.hermes'),
    ],
    gatewayPatterns: [
      { processName: 'python.exe', cmdlineIncludes: 'hermes' },
      { processName: 'hermes.exe', cmdlineIncludes: null },
      { processName: 'hermes-agent.exe', cmdlineIncludes: null },
    ],
    configPattern: 'config.yaml',
    apiServerPort: 8083,
  },
  qclaw: {
    name: 'QClaw',
    category: 'agent',
    exeNames: ['QClaw.exe'],
    searchPaths: [
      'C:\\Program Files\\QClaw',
      path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'QClaw'),
    ],
    gatewayPatterns: [
      { processName: 'QClaw.exe', cmdlineIncludes: 'openclaw-gateway' },
    ],
  },
  openclaw: {
    name: 'OpenClaw',
    category: 'agent',
    exeNames: ['openclaw.cmd', 'openclaw'],
    searchPaths: [
      path.join(os.homedir(), '.openclaw'),
      path.join(os.homedir(), 'AppData', 'Roaming', 'npm'),
      'C:\\Program Files\\OpenClaw',
    ],
    npmPackage: 'openclaw',
    gatewayPatterns: [
      { processName: 'node.exe', cmdlineIncludes: 'openclaw' },
    ],
  },
  cursor: {
    name: 'Cursor',
    category: 'ide',
    exeNames: ['Cursor.exe'],
    searchPaths: [
      path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'Cursor'),
    ],
    gatewayPatterns: [
      { processName: 'Cursor.exe', cmdlineIncludes: null },
    ],
  },
  windsurf: {
    name: 'Windsurf',
    category: 'ide',
    exeNames: ['Windsurf.exe'],
    searchPaths: [
      path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'Windsurf'),
    ],
    gatewayPatterns: [
      { processName: 'Windsurf.exe', cmdlineIncludes: null },
    ],
  },
  trae: {
    name: 'Trae',
    category: 'ide',
    exeNames: ['Trae.exe'],
    searchPaths: [
      path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'Trae'),
    ],
    gatewayPatterns: [
      { processName: 'Trae.exe', cmdlineIncludes: null },
    ],
  },
  vscode: {
    name: 'VS Code (Copilot)',
    category: 'ide',
    exeNames: ['Code.exe'],
    searchPaths: [
      path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'Microsoft VS Code'),
    ],
    gatewayPatterns: [],
  },
}

interface ProcessEntry {
  ProcessId: number
  Name: string
  CommandLine: string
}

function parseNetstat(): Map<number, number[]> {
  const portMap = new Map<number, number[]>()
  let raw: string
  try {
    raw = execSync('netstat -ano', { encoding: 'utf-8', timeout: 5000 })
  } catch {
    return portMap
  }

  for (const line of raw.split('\n')) {
    const m = line.match(/TCP\s+\S+:(\d+)\s+\S+\s+LISTENING\s+(\d+)/i)
    if (m) {
      const port = parseInt(m[1])
      const pid = parseInt(m[2])
      if (!portMap.has(pid)) portMap.set(pid, [])
      portMap.get(pid)!.push(port)
    }
  }
  return portMap
}

function getProcesses(): ProcessEntry[] {
  let raw: string
  try {
    raw = execSync(
      'powershell -NoProfile -Command "Get-CimInstance Win32_Process | Select-Object ProcessId,Name,CommandLine | ConvertTo-Json -Compress"',
      { encoding: 'utf-8', timeout: 10000, maxBuffer: 10 * 1024 * 1024 }
    )
  } catch (e) {
    console.error('进程扫描失败:', (e as Error).message)
    return []
  }

  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : [parsed]
  } catch (e) {
    console.error('进程 JSON 解析失败:', (e as Error).message)
    return []
  }
}

function verifyGateway(port: number): Promise<boolean> {
  if (!port) return Promise.resolve(false)
  return new Promise((resolve) => {
    const healthPaths = ['/health', '/v1/health', '/']
    let resolved = false

    const tryPath = (idx: number): void => {
      if (idx >= healthPaths.length) { resolved = true; return resolve(false) }
      const req = http.get(`http://127.0.0.1:${port}${healthPaths[idx]}`, { timeout: 2000 }, (res) => {
        if (!resolved) { resolved = true; resolve((res.statusCode ?? 0) >= 200 && (res.statusCode ?? 0) < 500) }
      })
      req.on('error', () => {
        setTimeout(() => tryPath(idx + 1), 50)
      })
      req.on('timeout', () => { req.destroy(); tryPath(idx + 1) })
    }
    tryPath(0)
  })
}

function scanFiles(existingPaths: Record<string, string> = {}): Record<string, FileScanResult> {
  const results: Record<string, FileScanResult> = {}
  for (const [aiType, def] of Object.entries(KNOWN_AI_SOFTWARE)) {
    if (existingPaths[aiType] && fs.existsSync(existingPaths[aiType])) {
      results[aiType] = { found: true, path: existingPaths[aiType], source: 'manual', verified: true }
      continue
    }

    let found: FileScanResult | null = null

    for (const searchPath of def.searchPaths) {
      for (const exeName of def.exeNames) {
        const candidate = path.join(searchPath, exeName)
        if (fs.existsSync(candidate)) {
          found = { found: true, path: candidate, source: 'auto', verified: true }
          break
        }
        const binCandidate = path.join(searchPath, 'bin', exeName)
        if (fs.existsSync(binCandidate)) {
          found = { found: true, path: binCandidate, source: 'auto', verified: true }
          break
        }
      }
      if (found) break
    }

    if (!found) {
      for (const exeName of def.exeNames) {
        try {
          const which = execSync(`where ${exeName} 2>nul`, { encoding: 'utf-8', timeout: 3000, stdio: ['pipe', 'pipe', 'pipe'] }).trim()
          if (which) {
            const exePath = which.split('\n')[0].trim()
            if (fs.existsSync(exePath)) {
              found = { found: true, path: exePath, source: 'path', verified: true }
              break
            }
          }
        } catch { /* exe not found via PATH */ }
      }
    }

    if (!found && def.npmPackage) {
      try {
        const npmList = execSync('npm list -g --depth=0 --json', { encoding: 'utf-8', timeout: 8000, stdio: ['pipe', 'pipe', 'pipe'] }).trim()
        if (npmList) {
          const parsed = JSON.parse(npmList)
          const deps = parsed.dependencies || {}
          if (deps[def.npmPackage]) {
            const ver: string = deps[def.npmPackage].version
            const npmRoot = execSync('npm root -g', { encoding: 'utf-8', timeout: 3000 }).trim()
            const pkgPath = path.join(npmRoot, def.npmPackage)
            const cliPath = fs.existsSync(path.join(pkgPath, 'bin', 'openclaw.js'))
              ? path.join(pkgPath, 'bin', 'openclaw.js')
              : pkgPath
            found = { found: true, path: cliPath, source: 'npm', version: ver, verified: true }
          }
        }
      } catch { /* npm not available or package not installed */ }
    }

    if (!found && aiType === 'qclaw') {
      const qclawConfig = path.join(os.homedir(), '.qclaw', 'openclaw.json')
      if (fs.existsSync(qclawConfig)) {
        found = { found: true, path: qclawConfig, source: 'config', verified: true }
      }
    }

    results[aiType] = found || { found: false, path: null, source: null, verified: false }
  }
  return results
}

async function scanGateways(): Promise<Record<string, GatewayInfo>> {
  const results: Record<string, GatewayInfo> = {}
  const portMap = parseNetstat()
  const procList = getProcesses()

  for (const [aiType, def] of Object.entries(KNOWN_AI_SOFTWARE)) {
    if (!def.gatewayPatterns || def.gatewayPatterns.length === 0) continue

    const candidates: GatewayInfo[] = []

    for (const proc of procList) {
      const cmd = (proc.CommandLine || '').toLowerCase()
      const pname = (proc.Name || '').toLowerCase()

      for (const pattern of def.gatewayPatterns) {
        const nameOk = pname === pattern.processName.toLowerCase()
        const cmdOk = !pattern.cmdlineIncludes || cmd.includes(pattern.cmdlineIncludes.toLowerCase())

        if (nameOk && cmdOk) {
          const pid = proc.ProcessId
          const ports = portMap.get(pid) || []
          ports.sort((a, b) => a - b)
          candidates.push({
            running: true, pid,
            port: ports.length > 0 ? ports[0] : null,
            allPorts: ports,
            url: ports.length > 0 ? `http://127.0.0.1:${ports[0]}` : null,
          })
          break
        }
      }
    }

    let selected: GatewayInfo | null = null
    for (const cand of candidates) {
      if (!cand.port) continue
      const dup = Object.values(results).find(r => r.port === cand.port)
      if (dup) continue

      cand.alive = await verifyGateway(cand.port)
      if (cand.alive && !selected) {
        selected = cand
        break
      }
    }

    if (!selected && candidates.length > 0) {
      for (const cand of candidates) {
        if (!cand.port) continue
        if (!Object.values(results).find(r => r.port === cand.port)) {
          cand.alive = await verifyGateway(cand.port)
          selected = cand
          break
        }
      }
    }

    if (selected) results[aiType] = selected
  }
  return results
}

export const AIDetector = {
  async scanAll(existingPaths: Record<string, string> = {}): Promise<Record<string, AiScanResult>> {
    const fileResults = scanFiles(existingPaths)
    const gatewayResults = await scanGateways()
    const results: Record<string, AiScanResult> = {}

    for (const [aiType, def] of Object.entries(KNOWN_AI_SOFTWARE)) {
      const f = fileResults[aiType] || { found: false, path: null, source: null }
      const gw = gatewayResults[aiType] || null
      const alreadyRunning = !!(gw && gw.running)

      results[aiType] = {
        name: def.name,
        category: def.category,
        found: f.found || alreadyRunning,
        path: f.found ? f.path : null,
        source: f.source || (alreadyRunning ? 'running' : null),
        verified: f.verified || false,
        gateway: gw,
      }
    }
    return results
  },

  scanFiles(existingPaths: Record<string, string> = {}): Record<string, FileScanResult> {
    return scanFiles(existingPaths)
  },

  async scanGateways(): Promise<Record<string, GatewayInfo>> {
    return scanGateways()
  },

  getKnownList(): KnownListItem[] {
    return Object.entries(KNOWN_AI_SOFTWARE).map(([key, val]) => ({
      id: key,
      name: val.name,
      category: val.category,
    }))
  },

  async scanByPorts(ignorePorts: number[] = []): Promise<PortScanDiscovery[]> {
    return PortScanner.scan(ignorePorts)
  },

  scanByStateFiles(): Record<string, import('./state-reader').GatewayStateResult | null> {
    return StateReader.readAll()
  },

  async scanFull(existingPaths: Record<string, string> = {}, options: FullScanOptions = {}): Promise<FullScanResult> {
    const results = await AIDetector.scanAll(existingPaths)

    const knownPorts = PortScanner.getKnownPorts()
    const portDiscovered = await AIDetector.scanByPorts([...knownPorts, ...(options.ignorePorts || [])])

    const stateResults = AIDetector.scanByStateFiles()

    for (const [aiType, stateInfo] of Object.entries(stateResults)) {
      if (stateInfo && stateInfo.found) {
        if (!results[aiType]) {
          results[aiType] = {
            name: stateInfo.name,
            category: 'agent',
            found: true,
            path: null,
            source: 'state-file',
            verified: false,
            gateway: null,
          }
        }
        if (stateInfo.running && (!results[aiType].gateway || !results[aiType].gateway!.running)) {
          results[aiType].gateway = {
            running: true,
            pid: stateInfo.pid!,
            port: null,
            allPorts: [],
            url: null,
            alive: true,
            source: 'state-file',
          }
          results[aiType].found = true
        }
      }
    }

    const unknownGateways = portDiscovered.filter(
      d => !results[d.aiType] || !results[d.aiType].found
    )

    return { results, unknownGateways, portDiscovered }
  },

  async probePort(port: number): Promise<import('./port-scanner').PortProbeResult> {
    return PortScanner.probePort(port)
  },

  registerType(aiType: string, definition: RegisterTypeParams): void {
    if (!KNOWN_AI_SOFTWARE[aiType]) {
      KNOWN_AI_SOFTWARE[aiType] = {
        name: definition.name || aiType,
        category: definition.category || 'agent',
        exeNames: definition.exeNames || [],
        searchPaths: definition.searchPaths || [],
        gatewayPatterns: definition.gatewayPatterns || [],
        configPattern: definition.configPattern || null,
        apiServerPort: definition.apiServerPort || null,
      }
    }
    if (definition.knownPorts) {
      PortScanner.registerFingerprint(aiType, {
        name: definition.name || aiType,
        category: definition.category || 'agent',
        knownPorts: definition.knownPorts,
        httpChecks: definition.httpChecks || [{ path: '/', expectStatus: [200, 404] }],
        responsePatterns: definition.responsePatterns || [],
        processHints: definition.processHints || [],
      })
    }
  },
}

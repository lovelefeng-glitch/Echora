import { execSync } from 'child_process'
import http from 'http'

interface HttpCheck {
  path: string
  expectStatus: number[]
}

interface GatewayFingerprint {
  name: string
  category: string
  knownPorts: number[]
  httpChecks: HttpCheck[]
  responsePatterns: RegExp[]
  processHints: string[]
  cmdlineHints?: string[]
  stateFiles?: Array<{ root: string; file: string }>
}

interface ListeningPortEntry {
  port: number
  address: string
}

interface HttpProbeResult {
  status: number
  body: string
  headers: http.IncomingHttpHeaders
}

interface ProcessInfo {
  name: string
  cmdline: string
}

export interface PortScanDiscovery {
  port: number
  pid: number
  aiType: string
  name: string
  category: string
  confidence: 'high' | 'medium'
  processName: string
  probeStatus: number
  probeBodySnippet: string
}

export interface PortProbeResult {
  port: number
  alive: boolean
  processes: Array<{ pid: number; name: string; cmdline: string }>
  httpResponses: Array<{ path: string; status: number; bodySnippet: string; contentType: string }>
}

export interface FingerprintInfo {
  type: string
  name: string
  category: string
  knownPorts: number[]
}

const GATEWAY_FINGERPRINTS: Record<string, GatewayFingerprint> = {
  qclaw: {
    name: 'QClaw',
    category: 'agent',
    knownPorts: [28789, 28791],
    httpChecks: [
      { path: '/', expectStatus: [200, 404] },
      { path: '/health', expectStatus: [200] },
    ],
    responsePatterns: [/openai|qclaw|gateway/i],
    processHints: ['QClaw.exe'],
  },
  openclaw: {
    name: 'OpenClaw',
    category: 'agent',
    knownPorts: [18789, 18791],
    httpChecks: [
      { path: '/health', expectStatus: [200] },
      { path: '/', expectStatus: [200, 404] },
    ],
    responsePatterns: [/openclaw|gateway/i],
    processHints: ['node.exe'],
    cmdlineHints: ['openclaw'],
  },
  hermes: {
    name: 'Hermes',
    category: 'agent',
    knownPorts: [8083, 8642],
    httpChecks: [
      { path: '/health', expectStatus: [200] },
      { path: '/v1/models', expectStatus: [200, 401] },
    ],
    responsePatterns: [/hermes|openai/i],
    processHints: ['hermes.exe', 'python.exe'],
    cmdlineHints: ['hermes'],
    stateFiles: [
      { root: '%LOCALAPPDATA%/hermes', file: 'gateway_state.json' },
    ],
  },
}

const KNOWN_PORTS = new Set<number>()
for (const fp of Object.values(GATEWAY_FINGERPRINTS)) {
  for (const p of fp.knownPorts) KNOWN_PORTS.add(p)
}

function parseListeningPorts(): Map<number, ListeningPortEntry[]> {
  const portMap = new Map<number, ListeningPortEntry[]>()
  let raw: string
  try {
    raw = execSync('netstat -ano', { encoding: 'utf-8', timeout: 5000 })
  } catch {
    return portMap
  }

  for (const line of raw.split('\n')) {
    const m = line.match(/TCP\s+(\S+):(\d+)\s+\S+\s+LISTENING\s+(\d+)/i)
    if (m) {
      const address = m[1]
      const port = parseInt(m[2])
      const pid = parseInt(m[3])
      if (address === '127.0.0.1' || address === '0.0.0.0' || address === '::1') {
        if (!portMap.has(pid)) portMap.set(pid, [])
        portMap.get(pid)!.push({ port, address })
      }
    }
  }
  return portMap
}

function httpProbe(port: number, path = '/', timeoutMs = 2000): Promise<HttpProbeResult | null> {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}${path}`, { timeout: timeoutMs }, (res) => {
      let body = ''
      res.on('data', (chunk: Buffer) => { body += chunk })
      res.on('end', () => {
        resolve({
          status: res.statusCode ?? 0,
          body: body.substring(0, 2000),
          headers: res.headers,
        })
      })
    })
    req.on('error', () => resolve(null))
    req.on('timeout', () => { req.destroy(); resolve(null) })
  })
}

function matchFingerprint(probeResult: HttpProbeResult, fingerprint: GatewayFingerprint): boolean {
  if (!probeResult) return false

  const statusMatch = fingerprint.httpChecks.some(check =>
    check.expectStatus.includes(probeResult.status)
  )
  if (!statusMatch) return false

  if (fingerprint.responsePatterns.length > 0) {
    return fingerprint.responsePatterns.some(pattern =>
      pattern.test(probeResult.body)
    )
  }

  return true
}

function getProcessInfo(pid: number): ProcessInfo | null {
  try {
    const raw = execSync(
      `powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter 'ProcessId=${pid}' | Select-Object Name,CommandLine | ConvertTo-Json -Compress"`,
      { encoding: 'utf-8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] }
    )
    const parsed = JSON.parse(raw)
    return {
      name: parsed.Name || '',
      cmdline: parsed.CommandLine || '',
    }
  } catch {
    return null
  }
}

function matchProcessHints(pid: number, fingerprint: GatewayFingerprint): boolean {
  const info = getProcessInfo(pid)
  if (!info) return false

  const nameLower = info.name.toLowerCase()
  const cmdLower = info.cmdline.toLowerCase()

  const nameMatch = fingerprint.processHints.some(hint =>
    nameLower === hint.toLowerCase()
  )
  if (!nameMatch) return false

  if (fingerprint.cmdlineHints && fingerprint.cmdlineHints.length > 0) {
    return fingerprint.cmdlineHints.some(hint =>
      cmdLower.includes(hint.toLowerCase())
    )
  }

  return true
}

export const PortScanner = {
  async scan(ignorePorts: number[] = []): Promise<PortScanDiscovery[]> {
    const ignoreSet = new Set(ignorePorts.map(Number))
    const portMap = parseListeningPorts()
    const discovered: PortScanDiscovery[] = []
    const scannedPorts = new Set<number>()

    for (const [pid, entries] of portMap) {
      for (const { port } of entries) {
        if (scannedPorts.has(port) || ignoreSet.has(port)) continue
        scannedPorts.add(port)

        const probeResult = await httpProbe(port, '/health')
        if (!probeResult) continue

        for (const [aiType, fingerprint] of Object.entries(GATEWAY_FINGERPRINTS)) {
          if (matchFingerprint(probeResult, fingerprint)) {
            const processMatch = matchProcessHints(pid, fingerprint)
            discovered.push({
              port,
              pid,
              aiType,
              name: fingerprint.name,
              category: fingerprint.category,
              confidence: processMatch ? 'high' : 'medium',
              processName: getProcessInfo(pid)?.name || 'unknown',
              probeStatus: probeResult.status,
              probeBodySnippet: probeResult.body.substring(0, 200),
            })
            break
          }
        }
      }
    }

    return discovered
  },

  async probePort(port: number): Promise<PortProbeResult> {
    const result: PortProbeResult = {
      port,
      alive: false,
      processes: [],
      httpResponses: [],
    }

    const portMap = parseListeningPorts()
    let foundPid: number | null = null
    for (const [pid, entries] of portMap) {
      if (entries.some(e => e.port === port)) {
        foundPid = pid
        break
      }
    }
    if (!foundPid) return result

    const procInfo = getProcessInfo(foundPid)
    if (procInfo) {
      result.processes.push({
        pid: foundPid,
        name: procInfo.name,
        cmdline: procInfo.cmdline.substring(0, 500),
      })
    }

    const probePaths = ['/health', '/', '/v1/models', '/api/status']
    for (const p of probePaths) {
      const resp = await httpProbe(port, p)
      if (resp) {
        result.alive = true
        result.httpResponses.push({
          path: p,
          status: resp.status,
          bodySnippet: resp.body.substring(0, 300),
          contentType: resp.headers['content-type'] || 'unknown',
        })
      }
    }

    return result
  },

  getFingerprints(): FingerprintInfo[] {
    return Object.entries(GATEWAY_FINGERPRINTS).map(([type, fp]) => ({
      type,
      name: fp.name,
      category: fp.category,
      knownPorts: fp.knownPorts,
    }))
  },

  getKnownPorts(): number[] {
    return [...KNOWN_PORTS]
  },

  registerFingerprint(aiType: string, fingerprint: GatewayFingerprint): void {
    GATEWAY_FINGERPRINTS[aiType] = fingerprint
    for (const p of fingerprint.knownPorts) {
      KNOWN_PORTS.add(p)
    }
  },
}

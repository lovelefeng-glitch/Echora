import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockExecSync = vi.fn()

vi.mock('child_process', async () => {
  return {
    __esModule: true,
    default: {
      execSync: (...args: any[]) => mockExecSync(...args),
    },
    execSync: (...args: any[]) => mockExecSync(...args),
  }
})

vi.mock('http', async () => {
  return {
    __esModule: true,
    default: {
      get: vi.fn(),
    },
    get: vi.fn(),
  }
})

import { PortScanner } from '../../../src/main/detectors/port-scanner'

describe('PortScanner', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getFingerprints', () => {
    it('should return known fingerprints', () => {
      const fingerprints = PortScanner.getFingerprints()

      expect(fingerprints).toBeInstanceOf(Array)
      expect(fingerprints.length).toBeGreaterThan(0)

      const qclaw = fingerprints.find(f => f.type === 'qclaw')
      expect(qclaw).toBeDefined()
      expect(qclaw!.name).toBe('QClaw')
      expect(qclaw!.category).toBe('agent')
      expect(qclaw!.knownPorts).toContain(28789)
    })

    it('should include openclaw fingerprint', () => {
      const fingerprints = PortScanner.getFingerprints()
      const openclaw = fingerprints.find(f => f.type === 'openclaw')

      expect(openclaw).toBeDefined()
      expect(openclaw!.name).toBe('OpenClaw')
      expect(openclaw!.knownPorts).toContain(18789)
    })

    it('should include hermes fingerprint', () => {
      const fingerprints = PortScanner.getFingerprints()
      const hermes = fingerprints.find(f => f.type === 'hermes')

      expect(hermes).toBeDefined()
      expect(hermes!.name).toBe('Hermes')
      expect(hermes!.knownPorts).toContain(8642)
    })
  })

  describe('getKnownPorts', () => {
    it('should return all known ports', () => {
      const ports = PortScanner.getKnownPorts()

      expect(ports).toBeInstanceOf(Array)
      expect(ports).toContain(28789)
      expect(ports).toContain(28791)
      expect(ports).toContain(18789)
      expect(ports).toContain(18791)
      expect(ports).toContain(8083)
      expect(ports).toContain(8642)
    })

    it('should not have duplicate ports', () => {
      const ports = PortScanner.getKnownPorts()
      const uniquePorts = [...new Set(ports)]
      expect(ports.length).toBe(uniquePorts.length)
    })
  })

  describe('scan', () => {
    it('should return empty array when no processes listening', async () => {
      mockExecSync.mockReturnValue('')

      const result = await PortScanner.scan()

      expect(result).toEqual([])
    })

    it('should return empty array when netstat fails', async () => {
      mockExecSync.mockImplementation(() => {
        throw new Error('netstat not available')
      })

      const result = await PortScanner.scan()

      expect(result).toEqual([])
    })
  })

  describe('probePort', () => {
    it('should return not alive when port not listening', async () => {
      mockExecSync.mockReturnValue('')

      const result = await PortScanner.probePort(8080)

      expect(result.alive).toBe(false)
      expect(result.processes).toEqual([])
      expect(result.httpResponses).toEqual([])
    })
  })
})

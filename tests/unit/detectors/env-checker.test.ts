import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockExecSync = vi.fn()
const mockExec = vi.fn()

vi.mock('child_process', async () => {
  return {
    __esModule: true,
    default: {
      execSync: (...args: any[]) => mockExecSync(...args),
      exec: (...args: any[]) => mockExec(...args),
    },
    execSync: (...args: any[]) => mockExecSync(...args),
    exec: (...args: any[]) => mockExec(...args),
  }
})

import { EnvChecker } from '../../../src/main/detectors/env-checker'

describe('EnvChecker', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('parseVersion', () => {
    it('should parse node version from v20.10.0', () => {
      const result = EnvChecker.parseVersion('v20.10.0', /v(\d+\.\d+\.\d+)/)
      expect(result).toBe('20.10.0')
    })

    it('should parse python version from Python 3.12.1', () => {
      const result = EnvChecker.parseVersion('Python 3.12.1', /Python\s+(\d+\.\d+\.\d+)/)
      expect(result).toBe('3.12.1')
    })

    it('should parse git version from git version 2.43.0', () => {
      const result = EnvChecker.parseVersion('git version 2.43.0', /git version (\d+\.\d+\.\d+)/)
      expect(result).toBe('2.43.0')
    })

    it('should parse npm version from 10.2.5', () => {
      const result = EnvChecker.parseVersion('10.2.5', /(\d+\.\d+\.\d+)/)
      expect(result).toBe('10.2.5')
    })

    it('should return null for non-matching output', () => {
      const result = EnvChecker.parseVersion('some random output', /v(\d+\.\d+\.\d+)/)
      expect(result).toBeNull()
    })
  })

  describe('compareVersion', () => {
    it('should return 0 for equal versions', () => {
      expect(EnvChecker.compareVersion('20.10.0', '20.10.0')).toBe(0)
    })

    it('should return 1 when v1 > v2 (major)', () => {
      expect(EnvChecker.compareVersion('21.0.0', '20.10.0')).toBe(1)
    })

    it('should return -1 when v1 < v2 (major)', () => {
      expect(EnvChecker.compareVersion('19.0.0', '20.10.0')).toBe(-1)
    })

    it('should return 1 when v1 > v2 (minor)', () => {
      expect(EnvChecker.compareVersion('20.11.0', '20.10.0')).toBe(1)
    })

    it('should return -1 when v1 < v2 (minor)', () => {
      expect(EnvChecker.compareVersion('20.9.0', '20.10.0')).toBe(-1)
    })

    it('should return 1 when v1 > v2 (patch)', () => {
      expect(EnvChecker.compareVersion('20.10.1', '20.10.0')).toBe(1)
    })

    it('should return -1 when v1 < v2 (patch)', () => {
      expect(EnvChecker.compareVersion('20.10.0', '20.10.1')).toBe(-1)
    })
  })

  describe('check', () => {
    it('should return installed true for node when available', async () => {
      mockExecSync.mockReturnValue('v20.10.0\n')

      const result = await EnvChecker.check('node')

      expect(result.installed).toBe(true)
      expect(result.name).toBe('Node.js')
      expect(result.version).toBe('20.10.0')
      expect(result.versionOk).toBe(true)
    })

    it('should return installed true for python when available', async () => {
      mockExecSync.mockReturnValue('Python 3.12.1\n')

      const result = await EnvChecker.check('python')

      expect(result.installed).toBe(true)
      expect(result.name).toBe('Python')
      expect(result.version).toBe('3.12.1')
      expect(result.versionOk).toBe(true)
    })

    it('should return installed true for git when available', async () => {
      mockExecSync.mockReturnValue('git version 2.43.0\n')

      const result = await EnvChecker.check('git')

      expect(result.installed).toBe(true)
      expect(result.name).toBe('Git')
      expect(result.version).toBe('2.43.0')
      expect(result.versionOk).toBe(true)
    })

    it('should return installed true for npm when available', async () => {
      mockExecSync.mockReturnValue('10.2.5\n')

      const result = await EnvChecker.check('npm')

      expect(result.installed).toBe(true)
      expect(result.name).toBe('npm')
      expect(result.version).toBe('10.2.5')
      expect(result.versionOk).toBe(true)
    })

    it('should return installed false when tool not found', async () => {
      mockExecSync.mockImplementation(() => {
        throw new Error('command not found')
      })

      const result = await EnvChecker.check('node')

      expect(result.installed).toBe(false)
      expect(result.version).toBeNull()
      expect(result.versionOk).toBe(false)
      expect(result.installUrl).toBeDefined()
    })

    it('should return versionOk false for old version', async () => {
      mockExecSync.mockReturnValue('v16.0.0\n')

      const result = await EnvChecker.check('node')

      expect(result.installed).toBe(true)
      expect(result.version).toBe('16.0.0')
      expect(result.versionOk).toBe(false)
    })

    it('should return error for unknown tool', async () => {
      const result = await EnvChecker.check('unknown-tool')

      expect(result.installed).toBe(false)
      expect(result.error).toBe('未知工具')
    })
  })

  describe('checkAll', () => {
    it('should check all defined tools', async () => {
      mockExecSync.mockReturnValue('v20.10.0\n')

      const results = await EnvChecker.checkAll()

      expect(results).toHaveProperty('node')
      expect(results).toHaveProperty('python')
      expect(results).toHaveProperty('git')
      expect(results).toHaveProperty('npm')
    })
  })
})

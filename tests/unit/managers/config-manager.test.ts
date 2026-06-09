import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockExistsSync = vi.fn()
const mockReadFileSync = vi.fn()
const mockWriteFileSync = vi.fn()
const mockMkdirSync = vi.fn()

vi.mock('fs', () => ({
  existsSync: (...args: any[]) => mockExistsSync(...args),
  readFileSync: (...args: any[]) => mockReadFileSync(...args),
  writeFileSync: (...args: any[]) => mockWriteFileSync(...args),
  mkdirSync: (...args: any[]) => mockMkdirSync(...args),
}))

import { ConfigManager } from '../../../src/main/managers/config-manager'

describe('ConfigManager', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ConfigManager.reset()
  })

  describe('init', () => {
    it('should create directory if not exists', () => {
      mockExistsSync.mockReturnValueOnce(false).mockReturnValueOnce(false)

      ConfigManager.init('/test/config.json')

      expect(mockMkdirSync).toHaveBeenCalledWith('/test', { recursive: true })
    })

    it('should load existing config file', () => {
      const existingConfig = { firstRun: false, lastActive: 'ai-1' }
      mockExistsSync.mockReturnValue(true)
      mockReadFileSync.mockReturnValue(JSON.stringify(existingConfig))

      ConfigManager.init('/test/config.json')

      const config = ConfigManager.getAll()
      expect(config.firstRun).toBe(false)
    })

    it('should handle invalid JSON gracefully', () => {
      mockExistsSync.mockReturnValue(true)
      mockReadFileSync.mockReturnValue('invalid json {{{')

      ConfigManager.init('/test/config.json')

      const config = ConfigManager.getAll()
      expect(config.firstRun).toBe(true)
    })
  })

  describe('get', () => {
    it('should return undefined for non-existent key', () => {
      mockExistsSync.mockReturnValue(false)
      ConfigManager.init('/test/config.json')

      expect(ConfigManager.get('nonExistentKey')).toBeUndefined()
    })

    it('should return value for existing key', () => {
      mockExistsSync.mockReturnValue(false)
      ConfigManager.init('/test/config.json')

      ConfigManager.set('testKey', 'testValue')
      expect(ConfigManager.get('testKey')).toBe('testValue')
    })
  })

  describe('set', () => {
    it('should set and persist value', () => {
      mockExistsSync.mockReturnValue(false)
      ConfigManager.init('/test/config.json')

      const result = ConfigManager.set('newKey', 'newValue')

      expect(result).toBe(true)
      expect(mockWriteFileSync).toHaveBeenCalled()
    })
  })

  describe('getAll', () => {
    it('should return copy of config', () => {
      mockExistsSync.mockReturnValue(false)
      ConfigManager.init('/test/config.json')

      const config1 = ConfigManager.getAll()
      const config2 = ConfigManager.getAll()

      expect(config1).not.toBe(config2)
      expect(config1).toEqual(config2)
    })
  })

  describe('save', () => {
    it('should save config to file', () => {
      mockExistsSync.mockReturnValue(false)
      ConfigManager.init('/test/config.json')

      const result = ConfigManager.save()

      expect(result).toBe(true)
      expect(mockWriteFileSync).toHaveBeenCalledWith(
        '/test/config.json',
        expect.any(String),
        'utf-8'
      )
    })
  })

  describe('reset', () => {
    it('should reset config to defaults', () => {
      mockExistsSync.mockReturnValue(false)
      ConfigManager.init('/test/config.json')

      ConfigManager.set('customKey', 'customValue')
      ConfigManager.reset()

      const config = ConfigManager.getAll()
      expect(config.firstRun).toBe(true)
      expect(config.settings?.autoStartOnBoot).toBe(false)
      expect(config.settings?.minimizeToTray).toBe(true)
    })
  })
})

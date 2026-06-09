import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  statSync: vi.fn(),
  readdirSync: vi.fn(),
}))

vi.mock('os', () => ({
  homedir: vi.fn().mockReturnValue('/home/user'),
}))

import * as fs from 'fs'
import { ConfigReader } from '../../../src/main/managers/config-reader'

const mockFs = vi.mocked(fs)

const qclawConfig = {
  gateway: {
    port: 28789,
    mode: 'local',
    bind: '127.0.0.1',
    auth: { mode: 'token' },
    http: {
      endpoints: {
        chatCompletions: { enabled: true },
      },
    },
  },
  agents: {
    list: [
      {
        id: 'default',
        identity: { name: 'Default Agent', emoji: '🤖' },
        model: { primary: 'gpt-4', fallbacks: ['gpt-3.5-turbo'] },
      },
    ],
  },
  models: {
    providers: [
      {
        provider: 'openai',
        base_url: 'https://api.openai.com/v1',
        models: [
          { id: 'gpt-4', name: 'GPT-4', contextWindow: 8192 },
        ],
      },
    ],
  },
  session: {
    resetMode: 'manual',
  },
  tools: {
    allowBash: true,
  },
}

const hermesConfig = {
  model: {
    default: 'claude-3-opus',
    max_tokens: 4096,
  },
  agent: {
    max_turns: 10,
  },
  api_server: {
    enabled: true,
    port: 8642,
  },
  api_key: 'secret-key-123',
  token: 'auth-token-456',
}

describe('ConfigReader', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('read', () => {
    it('should return error for empty path', () => {
      const result = ConfigReader.read('')
      expect(result.success).toBe(false)
      expect(result.error).toContain('未提供有效的配置文件路径')
    })

    it('should return error for non-existent file', () => {
      mockFs.existsSync.mockReturnValue(false)

      const result = ConfigReader.read('/nonexistent/config.json')
      expect(result.success).toBe(false)
      expect(result.error).toContain('配置文件不存在')
    })

    it('should return error for non-file path', () => {
      mockFs.existsSync.mockReturnValue(true)
      mockFs.statSync.mockReturnValue({ isFile: () => false } as any)

      const result = ConfigReader.read('/some/directory')
      expect(result.success).toBe(false)
      expect(result.error).toContain('路径不是文件')
    })

    it('should return error for empty file', () => {
      mockFs.existsSync.mockReturnValue(true)
      mockFs.statSync.mockReturnValue({ isFile: () => true } as any)
      mockFs.readFileSync.mockReturnValue('')

      const result = ConfigReader.read('/empty/config.json')
      expect(result.success).toBe(false)
      expect(result.error).toContain('配置文件为空')
    })

    it('should read valid JSON config', () => {
      mockFs.existsSync.mockReturnValue(true)
      mockFs.statSync.mockReturnValue({ isFile: () => true } as any)
      mockFs.readFileSync.mockReturnValue(JSON.stringify(qclawConfig))

      const result = ConfigReader.read('/valid/config.json')
      expect(result.success).toBe(true)
      expect(result.data).toBeDefined()
      expect(result.data!.gateway).toBeDefined()
    })

    it('should return error for invalid JSON', () => {
      mockFs.existsSync.mockReturnValue(true)
      mockFs.statSync.mockReturnValue({ isFile: () => true } as any)
      mockFs.readFileSync.mockReturnValue('invalid json {{{')

      const result = ConfigReader.read('/invalid/config.json')
      expect(result.success).toBe(false)
      expect(result.error).toContain('JSON 解析失败')
    })
  })

  describe('normalize', () => {
    it('should normalize qclaw config', () => {
      const result = ConfigReader.normalize('qclaw', qclawConfig)

      expect(result.port).toBe(28789)
      expect(result.gateway).toBeDefined()
      expect(result.agents).toBeInstanceOf(Array)
      expect(result.agents).toHaveLength(1)
      expect(result.models).toBeInstanceOf(Array)
    })

    it('should return empty result for null input', () => {
      const result = ConfigReader.normalize('qclaw', null as any)

      expect(result.gateway).toEqual({})
      expect(result.agents).toEqual([])
      expect(result.models).toEqual([])
      expect(result.port).toBeNull()
    })

    it('should extract agent details correctly', () => {
      const result = ConfigReader.normalize('qclaw', qclawConfig)
      const agent = result.agents[0] as any

      expect(agent.id).toBe('default')
      expect(agent.name).toBe('Default Agent')
      expect(agent.emoji).toBe('🤖')
      expect(agent.modelPrimary).toBe('gpt-4')
    })

    it('should extract session config', () => {
      const result = ConfigReader.normalize('qclaw', qclawConfig)

      expect(result.session).toBeDefined()
      expect((result.session as any).resetMode).toBe('manual')
    })

    it('should extract tools config', () => {
      const result = ConfigReader.normalize('qclaw', qclawConfig)

      expect(result.tools).toBeDefined()
      expect((result.tools as any).allowBash).toBe(true)
    })
  })

  describe('normalizeHermes', () => {
    it('should normalize hermes config', () => {
      const result = ConfigReader.normalizeHermes(hermesConfig)

      expect(result.port).toBe(8642)
      expect(result.model).toBeDefined()
      expect((result.model as any).default).toBe('claude-3-opus')
    })

    it('should filter sensitive data', () => {
      const result = ConfigReader.normalizeHermes(hermesConfig)

      expect(JSON.stringify(result)).not.toContain('secret-key-123')
      expect(JSON.stringify(result)).not.toContain('auth-token-456')
    })

    it('should return empty result for null input', () => {
      const result = ConfigReader.normalizeHermes(null as any)

      expect(result.model).toEqual({})
      expect(result.agent).toEqual({})
      expect(result.port).toBeNull()
    })
  })

  describe('discover', () => {
    it('should return null for non-existent configs', () => {
      mockFs.existsSync.mockReturnValue(false)

      const result = ConfigReader.discover()

      expect(result.qclaw).toBeNull()
      expect(result.openclaw).toBeNull()
      expect(result.hermes).toBeNull()
    })
  })
})

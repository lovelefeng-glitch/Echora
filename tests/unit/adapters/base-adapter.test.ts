import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../src/main/utils/console-logger', () => ({
  create: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    success: vi.fn(),
    event: vi.fn(),
    raw: vi.fn(),
  })),
}))

import {
  BaseAdapter,
  type AdapterConfig,
  type StartResult,
  type StopResult,
  type StatusResult,
  type AdapterAgentItem,
  type SendMessageResult,
} from '../../../src/main/adapters/base-adapter'

class ConcreteAdapter extends BaseAdapter {
  async start(): Promise<StartResult> {
    this.status = 'running'
    return { success: true, pid: 12345 }
  }

  async stop(): Promise<StopResult> {
    this.status = 'stopped'
    return { success: true }
  }

  async getStatus(): Promise<StatusResult> {
    return { status: this.status }
  }

  async listAgents(): Promise<AdapterAgentItem[]> {
    return [{ id: 'agent-1', name: 'Test Agent' }]
  }

  async sendMessage(_agentId: string, message: string): Promise<SendMessageResult> {
    return { success: true, content: `Echo: ${message}` }
  }
}

describe('BaseAdapter', () => {
  let adapter: ConcreteAdapter

  beforeEach(() => {
    adapter = new ConcreteAdapter()
  })

  describe('constructor', () => {
    it('should initialize with default values', () => {
      expect(adapter.name).toBe('base')
      expect(adapter.status).toBe('offline')
      expect(adapter.baseUrl).toBe('')
      expect(adapter._requestTimeout).toBe(300000)
      expect(adapter.config).toEqual({})
    })

    it('should accept custom config', () => {
      const config: AdapterConfig = { port: 8080, baseUrl: 'http://localhost' }
      const customAdapter = new ConcreteAdapter(config)
      expect(customAdapter.config).toEqual(config)
      expect(customAdapter.config.port).toBe(8080)
    })
  })

  describe('default implementations', () => {
    it('getModelInfo should return null values', async () => {
      const result = await adapter.getModelInfo()
      expect(result).toEqual({
        model: null,
        contextWindow: null,
        contextUsed: null,
        usagePct: null,
      })
    })

    it('listModels should return empty array', async () => {
      const result = await adapter.listModels()
      expect(result).toEqual([])
    })

    it('setModel should return failure', () => {
      const result = adapter.setModel('some-model')
      expect(result).toEqual({ success: false, model: null })
    })

    it('switchModel should return needsRestart false', async () => {
      const result = await adapter.switchModel('some-model')
      expect(result).toEqual({
        success: false,
        needsRestart: false,
        model: null,
      })
    })

    it('getCurrentModel should return null', () => {
      expect(adapter.getCurrentModel()).toBeNull()
    })

    it('sendMessageStream should return null', () => {
      const result = adapter.sendMessageStream('agent-1', 'hello')
      expect(result).toBeNull()
    })
  })

  describe('message callback', () => {
    it('onMessage should register callback', () => {
      const callback = vi.fn()
      adapter.onMessage(callback)
      expect(adapter._onMessageCallback).toBe(callback)
    })

    it('_emitMessage should call registered callback', () => {
      const callback = vi.fn()
      adapter.onMessage(callback)
      const msg = { type: 'test', content: 'hello' }
      adapter._emitMessage(msg)
      expect(callback).toHaveBeenCalledWith(msg)
    })

    it('_emitMessage should not throw when no callback registered', () => {
      expect(() => adapter._emitMessage({ type: 'test' })).not.toThrow()
    })
  })

  describe('abstract method implementations', () => {
    it('start should change status to running', async () => {
      const result = await adapter.start()
      expect(result.success).toBe(true)
      expect(adapter.status).toBe('running')
    })

    it('stop should change status to stopped', async () => {
      await adapter.start()
      const result = await adapter.stop()
      expect(result.success).toBe(true)
      expect(adapter.status).toBe('stopped')
    })

    it('getStatus should return current status', async () => {
      const result = await adapter.getStatus()
      expect(result.status).toBe('offline')
    })

    it('listAgents should return agents', async () => {
      const agents = await adapter.listAgents()
      expect(agents).toHaveLength(1)
      expect(agents[0].id).toBe('agent-1')
    })

    it('sendMessage should echo message', async () => {
      const result = await adapter.sendMessage('agent-1', 'hello')
      expect(result.success).toBe(true)
      expect(result.content).toBe('Echo: hello')
    })
  })
})

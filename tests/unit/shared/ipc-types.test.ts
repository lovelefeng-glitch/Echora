import { describe, it, expect } from 'vitest'
import { IPC_CHANNELS } from '../../../src/shared/ipc-channels'

describe('IPC Types and Channels', () => {
  describe('IPC_CHANNELS', () => {
    it('should define gateway channels', () => {
      expect(IPC_CHANNELS.GATEWAY_REFRESH).toBe('gateway:refresh')
      expect(IPC_CHANNELS.GATEWAY_START).toBe('gateway:start')
      expect(IPC_CHANNELS.GATEWAY_STOP).toBe('gateway:stop')
      expect(IPC_CHANNELS.GATEWAY_STATUS).toBe('gateway:status')
    })

    it('should define agent channels', () => {
      expect(IPC_CHANNELS.AGENT_LIST).toBe('agent:list')
      expect(IPC_CHANNELS.AGENT_MODEL_INFO).toBe('agent:modelInfo')
      expect(IPC_CHANNELS.AGENT_LIST_MODELS).toBe('agent:listModels')
      expect(IPC_CHANNELS.AGENT_SET_MODEL).toBe('agent:setModel')
    })

    it('should define message channels', () => {
      expect(IPC_CHANNELS.MESSAGE_SEND).toBe('message:send')
      expect(IPC_CHANNELS.MESSAGE_SEND_STREAM).toBe('message:sendStream')
      expect(IPC_CHANNELS.MESSAGE_ABORT_STREAM).toBe('message:abortStream')
    })

    it('should define config channels', () => {
      expect(IPC_CHANNELS.CONFIG_GET).toBe('config:get')
      expect(IPC_CHANNELS.CONFIG_SET).toBe('config:set')
      expect(IPC_CHANNELS.CONFIG_GET_ALL).toBe('config:getAll')
    })

    it('should define direct-api channels', () => {
      expect(IPC_CHANNELS.DIRECT_API_SEND).toBe('direct-api:send')
      expect(IPC_CHANNELS.DIRECT_API_SEND_STREAM).toBe('direct-api:sendStream')
      expect(IPC_CHANNELS.DIRECT_API_LIST_MODELS).toBe('direct-api:listModels')
    })

    it('should define window channels', () => {
      expect(IPC_CHANNELS.WINDOW_MINIMIZE).toBe('window:minimize')
      expect(IPC_CHANNELS.WINDOW_MAXIMIZE).toBe('window:maximize')
      expect(IPC_CHANNELS.WINDOW_CLOSE).toBe('window:close')
    })

    it('should have unique channel values', () => {
      const values = Object.values(IPC_CHANNELS)
      const uniqueValues = new Set(values)
      expect(values.length).toBe(uniqueValues.size)
    })
  })
})

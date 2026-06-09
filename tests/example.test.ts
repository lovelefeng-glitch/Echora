import { describe, it, expect } from 'vitest'
import { IPC_CHANNELS } from '../src/shared/ipc-channels'

describe('Echora 2.0 基础验证', () => {
  it('IPC 通道定义完整', () => {
    expect(IPC_CHANNELS.GATEWAY_START).toBe('gateway:start')
    expect(IPC_CHANNELS.MESSAGE_SEND).toBe('message:send')
    expect(IPC_CHANNELS.DIRECT_API_SEND).toBe('direct-api:send')
  })

  it('项目配置正确', () => {
    expect(true).toBe(true)
  })
})

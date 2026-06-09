/**
 * 群聊适配器注册中心
 */

import { create } from '../utils/console-logger'
import type {
  GroupChatAdapter,
  GroupChatAdapterConfig,
  GroupChatAdapterRegistration
} from './types'

const log = create('GroupChatAdapterRegistry')

/**
 * 群聊适配器注册中心
 * 单例模式，管理所有群聊适配器
 */
export class GroupChatAdapterRegistry {
  private static _instance: GroupChatAdapterRegistry | null = null

  /** 已注册的适配器类型 */
  private _registrations = new Map<string, GroupChatAdapterRegistration>()

  /** 已创建的适配器实例 */
  private _instances = new Map<string, GroupChatAdapter>()

  private constructor() {}

  /**
   * 获取单例实例
   */
  static getInstance(): GroupChatAdapterRegistry {
    if (!GroupChatAdapterRegistry._instance) {
      GroupChatAdapterRegistry._instance = new GroupChatAdapterRegistry()
    }
    return GroupChatAdapterRegistry._instance
  }

  /**
   * 注册适配器类型
   */
  register(registration: GroupChatAdapterRegistration): void {
    if (this._registrations.has(registration.type)) {
      log.warn(`适配器类型 "${registration.type}" 已存在，将被覆盖`)
    }
    this._registrations.set(registration.type, registration)
    log.info(`注册群聊适配器类型: ${registration.type} (${registration.name})`)
  }

  /**
   * 注销适配器类型
   */
  unregister(type: string): boolean {
    const registration = this._registrations.get(type)
    if (!registration) {
      return false
    }

    // 停止该类型的所有实例
    for (const [id, instance] of this._instances) {
      if (id.startsWith(type)) {
        instance.stop().catch(err => log.error('停止适配器失败:', err))
        this._instances.delete(id)
      }
    }

    this._registrations.delete(type)
    log.info(`注销群聊适配器类型: ${type}`)
    return true
  }

  /**
   * 创建适配器实例
   */
  create(type: string, config: GroupChatAdapterConfig): GroupChatAdapter {
    const registration = this._registrations.get(type)
    if (!registration) {
      throw new Error(`未注册的群聊适配器类型: ${type}`)
    }

    const instanceId = `${type}_${config.name}`
    const instance = registration.factory(config)
    this._instances.set(instanceId, instance)

    log.info(`创建群聊适配器实例: ${instanceId}`)
    return instance
  }

  /**
   * 获取适配器实例
   */
  get(id: string): GroupChatAdapter | undefined {
    return this._instances.get(id)
  }

  /**
   * 获取所有适配器实例
   */
  getAll(): GroupChatAdapter[] {
    return Array.from(this._instances.values())
  }

  /**
   * 获取已注册的适配器类型
   */
  getRegisteredTypes(): GroupChatAdapterRegistration[] {
    return Array.from(this._registrations.values())
  }

  /**
   * 启动所有适配器
   */
  async startAll(): Promise<void> {
    for (const [id, instance] of this._instances) {
      try {
        await instance.start()
        log.info(`启动群聊适配器: ${id}`)
      } catch (error) {
        log.error(`启动群聊适配器失败: ${id}`, error)
      }
    }
  }

  /**
   * 停止所有适配器
   */
  async stopAll(): Promise<void> {
    for (const [id, instance] of this._instances) {
      try {
        await instance.stop()
        log.info(`停止群聊适配器: ${id}`)
      } catch (error) {
        log.error(`停止群聊适配器失败: ${id}`, error)
      }
    }
  }

  /**
   * 销毁所有适配器
   */
  async destroyAll(): Promise<void> {
    await this.stopAll()
    this._instances.clear()
  }
}

/**
 * 获取全局群聊适配器注册中心实例
 */
export function getGroupChatAdapterRegistry(): GroupChatAdapterRegistry {
  return GroupChatAdapterRegistry.getInstance()
}

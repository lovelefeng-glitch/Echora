/**
 * Provider 注册中心
 * 管理所有 Provider 的注册、创建和生命周期
 */

import { create } from '../utils/console-logger'
import type { LLMProvider, ProviderFactory, ProviderRegistration } from './provider-interface'
import type { ProviderConfig } from './types'
import { createOpenAIProvider } from './openai-provider'

const log = create('ProviderRegistry')

/**
 * Provider 注册中心
 * 单例模式，管理所有 Provider 类型和实例
 */
export class ProviderRegistry {
  private static _instance: ProviderRegistry | null = null

  /** 已注册的 Provider 类型 */
  private _registrations = new Map<string, ProviderRegistration>()

  /** 已创建的 Provider 实例 */
  private _instances = new Map<string, LLMProvider>()

  private constructor() {
    // 注册内置的 OpenAI Provider
    this.register({
      type: 'openai',
      name: 'OpenAI 兼容',
      factory: createOpenAIProvider,
      isDefault: true
    })
  }

  /**
   * 获取单例实例
   */
  static getInstance(): ProviderRegistry {
    if (!ProviderRegistry._instance) {
      ProviderRegistry._instance = new ProviderRegistry()
    }
    return ProviderRegistry._instance
  }

  /**
   * 注册新的 Provider 类型
   */
  register(registration: ProviderRegistration): void {
    if (this._registrations.has(registration.type)) {
      log.warn(`Provider 类型 "${registration.type}" 已存在，将被覆盖`)
    }
    this._registrations.set(registration.type, registration)
    log.info(`注册 Provider 类型: ${registration.type} (${registration.name})`)
  }

  /**
   * 注销 Provider 类型
   */
  unregister(type: string): boolean {
    const registration = this._registrations.get(type)
    if (!registration) {
      return false
    }

    // 销毁该类型的所有实例
    for (const [id, instance] of this._instances) {
      if (instance.type === type) {
        instance.destroy()
        this._instances.delete(id)
      }
    }

    this._registrations.delete(type)
    log.info(`注销 Provider 类型: ${type}`)
    return true
  }

  /**
   * 创建 Provider 实例
   */
  create(config: ProviderConfig): LLMProvider {
    const type = config.type || 'openai'
    const registration = this._registrations.get(type)

    if (!registration) {
      throw new Error(`未注册的 Provider 类型: ${type}`)
    }

    // 检查是否已存在相同 ID 的实例
    if (this._instances.has(config.id)) {
      log.warn(`Provider 实例 "${config.id}" 已存在，将被销毁并重建`)
      this.destroy(config.id)
    }

    const instance = registration.factory(config)
    this._instances.set(config.id, instance)
    log.info(`创建 Provider 实例: ${config.id} (类型: ${type})`)

    return instance
  }

  /**
   * 获取 Provider 实例
   */
  get(id: string): LLMProvider | undefined {
    return this._instances.get(id)
  }

  /**
   * 获取所有 Provider 实例
   */
  getAll(): LLMProvider[] {
    return Array.from(this._instances.values())
  }

  /**
   * 获取已注册的 Provider 类型
   */
  getRegisteredTypes(): ProviderRegistration[] {
    return Array.from(this._registrations.values())
  }

  /**
   * 销毁 Provider 实例
   */
  destroy(id: string): boolean {
    const instance = this._instances.get(id)
    if (!instance) {
      return false
    }

    instance.destroy()
    this._instances.delete(id)
    log.info(`销毁 Provider 实例: ${id}`)

    return true
  }

  /**
   * 销毁所有 Provider 实例
   */
  destroyAll(): void {
    for (const [id, instance] of this._instances) {
      instance.destroy()
      log.info(`销毁 Provider 实例: ${id}`)
    }
    this._instances.clear()
  }

  /**
   * 验证所有 Provider 连接
   */
  async validateAll(): Promise<Map<string, boolean>> {
    const results = new Map<string, boolean>()

    for (const [id, instance] of this._instances) {
      try {
        const result = await instance.validate()
        results.set(id, result.success)
      } catch {
        results.set(id, false)
      }
    }

    return results
  }

  /**
   * 获取默认 Provider 类型
   */
  getDefaultType(): string {
    for (const registration of this._registrations.values()) {
      if (registration.isDefault) {
        return registration.type
      }
    }
    return 'openai'
  }
}

/**
 * 获取全局 Provider 注册中心实例
 */
export function getProviderRegistry(): ProviderRegistry {
  return ProviderRegistry.getInstance()
}

/**
 * Tool Registry
 * 工具注册中心，管理所有工具的注册、发现和调用
 */

import { create } from '../utils/console-logger'
import type {
  ToolDefinition,
  ToolHandler,
  ToolRegistration,
  ToolContext,
  ToolResult,
  ToolCallRequest,
  OpenAIFunction,
  ToolConfirmCallback,
  DangerLevel
} from './types'

const log = create('ToolRegistry')

/**
 * Tool Registry
 * 单例模式，管理所有工具
 */
export class ToolRegistry {
  private static _instance: ToolRegistry | null = null

  /** 工具注册表 */
  private _tools = new Map<string, ToolRegistration>()

  /** 危险操作确认回调 */
  private _confirmCallback: ToolConfirmCallback | null = null

  private constructor() {}

  /**
   * 获取单例实例
   */
  static getInstance(): ToolRegistry {
    if (!ToolRegistry._instance) {
      ToolRegistry._instance = new ToolRegistry()
    }
    return ToolRegistry._instance
  }

  /**
   * 设置危险操作确认回调
   */
  setConfirmCallback(callback: ToolConfirmCallback): void {
    this._confirmCallback = callback
  }

  /**
   * 注册工具
   */
  register(definition: ToolDefinition, handler: ToolHandler): void {
    if (this._tools.has(definition.name)) {
      log.warn(`工具 "${definition.name}" 已存在，将被覆盖`)
    }

    this._tools.set(definition.name, {
      definition,
      handler,
      registeredAt: Date.now()
    })

    log.info(`注册工具: ${definition.name} (危险等级: ${definition.dangerLevel})`)
  }

  /**
   * 注销工具
   */
  unregister(name: string): boolean {
    const result = this._tools.delete(name)
    if (result) {
      log.info(`注销工具: ${name}`)
    }
    return result
  }

  /**
   * 获取工具
   */
  get(name: string): ToolRegistration | undefined {
    return this._tools.get(name)
  }

  /**
   * 获取所有工具
   */
  getAll(): ToolRegistration[] {
    return Array.from(this._tools.values())
  }

  /**
   * 获取已启用的工具
   */
  getEnabled(): ToolRegistration[] {
    return this.getAll().filter(t => t.definition.enabled !== false)
  }

  /**
   * 按分类获取工具
   */
  getByCategory(category: string): ToolRegistration[] {
    return this.getAll().filter(t => t.definition.category === category)
  }

  /**
   * 按危险等级获取工具
   */
  getByDangerLevel(level: DangerLevel): ToolRegistration[] {
    return this.getAll().filter(t => t.definition.dangerLevel === level)
  }

  /**
   * 检查工具是否存在
   */
  has(name: string): boolean {
    return this._tools.has(name)
  }

  /**
   * 转换为 OpenAI Function 格式
   */
  toOpenAIFunctions(): OpenAIFunction[] {
    return this.getEnabled().map(reg => ({
      type: 'function' as const,
      function: {
        name: reg.definition.name,
        description: reg.definition.description,
        parameters: reg.definition.parameters
      }
    }))
  }

  /**
   * 执行工具调用
   */
  async execute(
    request: ToolCallRequest,
    context: ToolContext
  ): Promise<ToolResult> {
    const registration = this._tools.get(request.name)
    if (!registration) {
      return {
        success: false,
        output: '',
        error: `工具 "${request.name}" 不存在`
      }
    }

    const { definition, handler } = registration

    // 检查是否启用
    if (definition.enabled === false) {
      return {
        success: false,
        output: '',
        error: `工具 "${request.name}" 已禁用`
      }
    }

    // 验证参数
    const validationResult = this._validateParameters(definition, request.arguments)
    if (!validationResult.valid) {
      return {
        success: false,
        output: '',
        error: `参数验证失败: ${validationResult.error}`
      }
    }

    // 危险操作确认
    if (definition.dangerLevel !== 'safe' && this._confirmCallback) {
      const confirmed = await this._confirmCallback(definition, request.arguments, context)
      if (!confirmed) {
        return {
          success: false,
          output: '',
          error: '用户取消了危险操作'
        }
      }
    }

    // 执行工具
    const startTime = Date.now()
    try {
      log.info(`执行工具: ${request.name}`, request.arguments)
      const result = await handler(request.arguments, context)
      const duration = Date.now() - startTime

      log.info(`工具执行完成: ${request.name} (${duration}ms)`)

      return {
        ...result,
        duration
      }
    } catch (error) {
      const duration = Date.now() - startTime
      const errorMessage = error instanceof Error ? error.message : String(error)

      log.error(`工具执行失败: ${request.name}`, errorMessage)

      return {
        success: false,
        output: '',
        error: errorMessage,
        duration
      }
    }
  }

  /**
   * 验证参数
   */
  private _validateParameters(
    definition: ToolDefinition,
    args: Record<string, unknown>
  ): { valid: boolean; error?: string } {
    const { parameters } = definition

    // 检查必填参数
    if (parameters.required) {
      for (const requiredParam of parameters.required) {
        if (args[requiredParam] === undefined || args[requiredParam] === null) {
          return {
            valid: false,
            error: `缺少必填参数: ${requiredParam}`
          }
        }
      }
    }

    // 检查参数类型
    for (const [name, paramDef] of Object.entries(parameters.properties)) {
      const value = args[name]
      if (value === undefined || value === null) {
        continue
      }

      const typeValid = this._validateType(value, paramDef.type)
      if (!typeValid) {
        return {
          valid: false,
          error: `参数 "${name}" 类型错误: 期望 ${paramDef.type}，实际 ${typeof value}`
        }
      }

      // 检查枚举值
      if (paramDef.enum && !paramDef.enum.includes(String(value))) {
        return {
          valid: false,
          error: `参数 "${name}" 值无效: 必须是 ${paramDef.enum.join(', ')} 之一`
        }
      }
    }

    return { valid: true }
  }

  /**
   * 验证类型
   */
  private _validateType(value: unknown, expectedType: string): boolean {
    switch (expectedType) {
      case 'string':
        return typeof value === 'string'
      case 'number':
        return typeof value === 'number'
      case 'boolean':
        return typeof value === 'boolean'
      case 'object':
        return typeof value === 'object' && value !== null && !Array.isArray(value)
      case 'array':
        return Array.isArray(value)
      default:
        return true
    }
  }

  /**
   * 清除所有工具
   */
  clear(): void {
    this._tools.clear()
    log.info('清除所有工具')
  }
}

/**
 * 获取全局 Tool Registry 实例
 */
export function getToolRegistry(): ToolRegistry {
  return ToolRegistry.getInstance()
}

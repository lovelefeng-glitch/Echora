/**
 * 工具系统类型定义
 * 基于 OpenAI Function Calling 协议
 */

/** 工具危险等级 */
export type DangerLevel = 'safe' | 'confirm' | 'dangerous'

/** 工具参数类型 */
export type ParameterType = 'string' | 'number' | 'boolean' | 'object' | 'array'

/** 工具参数定义 */
export interface ParameterDefinition {
  type: ParameterType
  description: string
  enum?: string[]
  required?: boolean
  default?: unknown
  items?: ParameterDefinition // 用于 array 类型
  properties?: Record<string, ParameterDefinition> // 用于 object 类型
}

/** 工具定义 */
export interface ToolDefinition {
  /** 工具唯一标识 */
  name: string
  /** 工具描述 */
  description: string
  /** 参数 Schema（JSON Schema 格式） */
  parameters: {
    type: 'object'
    properties: Record<string, ParameterDefinition>
    required?: string[]
  }
  /** 危险等级 */
  dangerLevel: DangerLevel
  /** 工具分类 */
  category?: string
  /** 是否启用 */
  enabled?: boolean
}

/** 工具执行上下文 */
export interface ToolContext {
  /** 调用者 ID */
  callerId: string
  /** 会话 ID */
  sessionId?: string
  /** 工作目录 */
  workingDirectory?: string
  /** 额外上下文 */
  metadata?: Record<string, unknown>
}

/** 工具执行结果 */
export interface ToolResult {
  /** 是否成功 */
  success: boolean
  /** 输出内容 */
  output: string
  /** 错误信息（如果失败） */
  error?: string
  /** 额外数据 */
  data?: unknown
  /** 执行耗时（毫秒） */
  duration?: number
}

/** 工具执行函数 */
export type ToolHandler = (
  args: Record<string, unknown>,
  context: ToolContext
) => Promise<ToolResult>

/** 工具注册信息 */
export interface ToolRegistration {
  /** 工具定义 */
  definition: ToolDefinition
  /** 执行函数 */
  handler: ToolHandler
  /** 注册时间 */
  registeredAt: number
}

/** OpenAI Function 格式 */
export interface OpenAIFunction {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

/** 工具调用请求 */
export interface ToolCallRequest {
  /** 工具名称 */
  name: string
  /** 调用 ID */
  callId: string
  /** 参数 */
  arguments: Record<string, unknown>
}

/** 工具调用确认回调 */
export type ToolConfirmCallback = (
  tool: ToolDefinition,
  args: Record<string, unknown>,
  context: ToolContext
) => Promise<boolean>

/**
 * 安全模块类型定义
 */

/** 输入验证配置 */
export interface InputValidationConfig {
  /** 单条消息最大长度（字符数） */
  maxMessageLength: number
  /** 是否启用 Prompt 注入检测 */
  enablePromptInjectionDetection: boolean
  /** 敏感词列表 */
  sensitiveWords: string[]
}

/** 验证结果 */
export interface ValidationResult {
  /** 是否有效 */
  valid: boolean
  /** 错误信息 */
  error?: string
  /** 警告信息 */
  warning?: string
}

/** 安全事件类型 */
export type SecurityEventType =
  | 'input_too_long'
  | 'prompt_injection_detected'
  | 'sensitive_word_detected'
  | 'rate_limit_exceeded'

/** 安全事件 */
export interface SecurityEvent {
  type: SecurityEventType
  timestamp: number
  details: Record<string, unknown>
}

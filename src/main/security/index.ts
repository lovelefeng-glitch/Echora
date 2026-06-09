/**
 * 安全模块入口
 * 导出所有安全相关的类型和实现
 */

// 类型定义
export type {
  InputValidationConfig,
  ValidationResult,
  SecurityEventType,
  SecurityEvent
} from './types'

// 实现
export { InputValidator, createInputValidator } from './input-validator'

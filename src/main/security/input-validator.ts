/**
 * 输入验证器
 * 处理消息长度限制和安全检查
 */

import { create } from '../utils/console-logger'
import type { InputValidationConfig, ValidationResult, SecurityEvent } from './types'

const log = create('InputValidator')

/** 默认配置 */
const DEFAULT_CONFIG: InputValidationConfig = {
  maxMessageLength: 32 * 1024, // 32K 字符
  enablePromptInjectionDetection: true,
  sensitiveWords: []
}

/** Prompt 注入检测模式 */
const PROMPT_INJECTION_PATTERNS = [
  /忽略之前的所有指令/i,
  /ignore previous instructions/i,
  /ignore all previous/i,
  /disregard.*instructions/i,
  /you are now.*(?:dan|do anything)/i,
  /(?:jailbreak|jail break)/i,
  /(?:prompt|system)\s*(?:injection|inject)/i
]

/**
 * 输入验证器
 */
export class InputValidator {
  private _config: InputValidationConfig
  private _events: SecurityEvent[] = []

  constructor(config?: Partial<InputValidationConfig>) {
    this._config = { ...DEFAULT_CONFIG, ...config }
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<InputValidationConfig>): void {
    this._config = { ...this._config, ...config }
  }

  /**
   * 验证输入消息
   */
  validate(message: string): ValidationResult {
    // 检查长度
    if (message.length > this._config.maxMessageLength) {
      this._logEvent('input_too_long', {
        length: message.length,
        maxLength: this._config.maxMessageLength
      })
      return {
        valid: false,
        error: `消息长度超过限制（${message.length}/${this._config.maxMessageLength} 字符）`
      }
    }

    // 检查 Prompt 注入
    if (this._config.enablePromptInjectionDetection) {
      const injectionResult = this._detectPromptInjection(message)
      if (injectionResult) {
        this._logEvent('prompt_injection_detected', { pattern: injectionResult })
        return {
          valid: false,
          error: '检测到潜在的 Prompt 注入攻击'
        }
      }
    }

    // 检查敏感词
    if (this._config.sensitiveWords.length > 0) {
      const sensitiveResult = this._detectSensitiveWords(message)
      if (sensitiveResult) {
        this._logEvent('sensitive_word_detected', { word: sensitiveResult })
        return {
          valid: true,
          warning: `消息包含敏感词：${sensitiveResult}`
        }
      }
    }

    return { valid: true }
  }

  /**
   * 检测 Prompt 注入
   */
  private _detectPromptInjection(message: string): string | null {
    for (const pattern of PROMPT_INJECTION_PATTERNS) {
      if (pattern.test(message)) {
        log.warn('检测到 Prompt 注入模式:', pattern.source)
        return pattern.source
      }
    }
    return null
  }

  /**
   * 检测敏感词
   */
  private _detectSensitiveWords(message: string): string | null {
    const lowerMessage = message.toLowerCase()
    for (const word of this._config.sensitiveWords) {
      if (lowerMessage.includes(word.toLowerCase())) {
        return word
      }
    }
    return null
  }

  /**
   * 记录安全事件
   */
  private _logEvent(type: SecurityEvent['type'], details: Record<string, unknown>): void {
    const event: SecurityEvent = {
      type,
      timestamp: Date.now(),
      details
    }
    this._events.push(event)
    log.warn(`安全事件: ${type}`, details)
  }

  /**
   * 获取安全事件历史
   */
  getEvents(): SecurityEvent[] {
    return [...this._events]
  }

  /**
   * 清除事件历史
   */
  clearEvents(): void {
    this._events = []
  }
}

/**
 * 创建输入验证器实例
 */
export function createInputValidator(config?: Partial<InputValidationConfig>): InputValidator {
  return new InputValidator(config)
}

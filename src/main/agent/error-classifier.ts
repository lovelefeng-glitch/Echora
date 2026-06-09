/**
 * 错误分类器
 * 
 * 将错误分为可重试/不可重试，以及不同的严重程度
 * 
 * 来源：Sprint 11 Phase 3 - Echora Agent 核心能力提升
 * 输出：ErrorClassifier 类
 * 依赖：无
 */

import { create } from '../utils/console-logger'

const log = create('ErrorClassifier')

/** 错误类型 */
export type ErrorType = 
  | 'network'      // 网络错误（超时、连接重置）
  | 'rate_limit'   // 速率限制（429）
  | 'auth'         // 认证错误（401、403）
  | 'invalid'      // 参数错误（400）
  | 'server'       // 服务器错误（5xx）
  | 'timeout'      // 超时错误
  | 'unknown'      // 未知错误

/** 错误严重程度 */
export type ErrorSeverity = 
  | 'low'          // 低（可忽略）
  | 'medium'       // 中（需要重试）
  | 'high'         // 高（需要降级）
  | 'critical'     // 严重（需要终止）

/** 错误分类结果 */
export interface ErrorClassification {
  /** 错误类型 */
  type: ErrorType
  /** 错误严重程度 */
  severity: ErrorSeverity
  /** 是否可重试 */
  retryable: boolean
  /** 错误代码（如果有） */
  code?: number
  /** 建议的处理方式 */
  suggestion: string
}

/**
 * 错误分类器
 */
export class ErrorClassifier {
  /**
   * 分类错误
   */
  classify(error: Error): ErrorClassification {
    const message = error.message.toLowerCase()
    
    // 提取错误代码
    const codeMatch = message.match(/\b(\d{3})\b/)
    const code = codeMatch ? parseInt(codeMatch[1]) : undefined

    // 网络超时
    if (message.includes('timeout') || message.includes('timed out')) {
      return {
        type: 'timeout',
        severity: 'medium',
        retryable: true,
        suggestion: '网络超时，建议重试'
      }
    }

    // 速率限制
    if (code === 429 || message.includes('rate limit')) {
      return {
        type: 'rate_limit',
        severity: 'medium',
        retryable: true,
        code: 429,
        suggestion: '请求过于频繁，建议等待后重试'
      }
    }

    // 认证错误
    if (code === 401 || message.includes('unauthorized')) {
      return {
        type: 'auth',
        severity: 'high',
        retryable: false,
        code: 401,
        suggestion: '认证失败，请检查 API Key'
      }
    }

    if (code === 403 || message.includes('forbidden')) {
      return {
        type: 'auth',
        severity: 'high',
        retryable: false,
        code: 403,
        suggestion: '权限不足，请检查 API 权限'
      }
    }

    // 参数错误
    if (code === 400 || message.includes('bad request')) {
      return {
        type: 'invalid',
        severity: 'high',
        retryable: false,
        code: 400,
        suggestion: '请求参数错误，请检查输入'
      }
    }

    // 服务器错误
    if (code && code >= 500 && code < 600) {
      return {
        type: 'server',
        severity: 'medium',
        retryable: true,
        code,
        suggestion: '服务器错误，建议重试'
      }
    }

    // 网络连接错误
    if (message.includes('econnreset') || message.includes('connection reset') ||
        message.includes('econnrefused') || message.includes('connection refused')) {
      return {
        type: 'network',
        severity: 'medium',
        retryable: true,
        suggestion: '网络连接错误，建议重试'
      }
    }

    // DNS 错误
    if (message.includes('enotfound') || message.includes('getaddrinfo')) {
      return {
        type: 'network',
        severity: 'high',
        retryable: false,
        suggestion: 'DNS 解析失败，请检查网络连接'
      }
    }

    // 未知错误
    return {
      type: 'unknown',
      severity: 'medium',
      retryable: false,
      suggestion: '未知错误，请检查日志'
    }
  }

  /**
   * 检查是否可重试
   */
  isRetryable(error: Error): boolean {
    return this.classify(error).retryable
  }

  /**
   * 获取错误严重程度
   */
  getSeverity(error: Error): ErrorSeverity {
    return this.classify(error).severity
  }

  /**
   * 格式化错误信息
   */
  formatError(error: Error): string {
    const classification = this.classify(error)
    return `[${classification.type.toUpperCase()}] ${error.message} (${classification.suggestion})`
  }
}

/**
 * 创建默认的错误分类器
 */
export function createErrorClassifier(): ErrorClassifier {
  return new ErrorClassifier()
}

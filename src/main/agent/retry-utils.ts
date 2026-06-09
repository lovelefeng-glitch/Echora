/**
 * 重试工具
 * 
 * 实现 jittered_backoff（指数退避 + 随机抖动）重试策略
 * 
 * 来源：Sprint 11 Phase 3 - Echora Agent 核心能力提升
 * 输出：retryWithBackoff, jitteredBackoff
 * 依赖：无
 */

import { create } from '../utils/console-logger'

const log = create('RetryUtils')

/** 重试配置 */
export interface RetryConfig {
  /** 最大重试次数（默认 3） */
  maxRetries?: number
  /** 初始延迟（毫秒，默认 1000） */
  initialDelay?: number
  /** 最大延迟（毫秒，默认 30000） */
  maxDelay?: number
  /** 退避因子（默认 2） */
  backoffFactor?: number
  /** 抖动范围（0~1，默认 0.1） */
  jitter?: number
  /** 可重试错误判断函数 */
  isRetryable?: (error: Error) => boolean
  /** 重试回调 */
  onRetry?: (error: Error, attempt: number, delay: number) => void
}

/** 重试结果 */
export interface RetryResult<T> {
  /** 是否成功 */
  success: boolean
  /** 结果（如果成功） */
  result?: T
  /** 错误（如果失败） */
  error?: Error
  /** 重试次数 */
  attempts: number
  /** 总耗时（毫秒） */
  totalDuration: number
}

/**
 * 计算 jittered backoff 延迟
 * 
 * 公式：min(maxDelay, initialDelay * backoffFactor^attempt) + random jitter
 */
export function jitteredBackoff(
  attempt: number,
  config: {
    initialDelay?: number
    maxDelay?: number
    backoffFactor?: number
    jitter?: number
  } = {}
): number {
  const {
    initialDelay = 1000,
    maxDelay = 30000,
    backoffFactor = 2,
    jitter = 0.1
  } = config

  // 计算指数退避
  const exponentialDelay = initialDelay * Math.pow(backoffFactor, attempt)
  // 限制最大延迟
  const cappedDelay = Math.min(exponentialDelay, maxDelay)
  // 添加随机抖动
  const jitterAmount = cappedDelay * jitter * Math.random()
  
  return Math.floor(cappedDelay + jitterAmount)
}

/**
 * 延迟指定时间
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/** 
 * 带重试的异步函数执行
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  config: RetryConfig = {}
): Promise<RetryResult<T>> {
  const {
    maxRetries = 3,
    initialDelay = 1000,
    maxDelay = 30000,
    backoffFactor = 2,
    jitter = 0.1,
    isRetryable = () => true,
    onRetry
  } = config

  const startTime = Date.now()
  let lastError: Error | undefined
  let attempts = 0

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    attempts = attempt + 1
    try {
      const result = await fn()
      return {
        success: true,
        result,
        attempts,
        totalDuration: Date.now() - startTime
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))

      // 检查是否是最后一次尝试
      if (attempt >= maxRetries) {
        break
      }

      // 检查是否可重试
      if (!isRetryable(lastError)) {
        log.info(`错误不可重试: ${lastError.message}`)
        break
      }

      // 计算延迟时间
      const delayMs = jitteredBackoff(attempt, {
        initialDelay,
        maxDelay,
        backoffFactor,
        jitter
      })

      log.info(`重试 ${attempt + 1}/${maxRetries}，延迟 ${delayMs}ms: ${lastError.message}`)

      // 调用重试回调
      if (onRetry) {
        onRetry(lastError, attempt + 1, delayMs)
      }

      // 等待
      await delay(delayMs)
    }
  }

  return {
    success: false,
    error: lastError,
    attempts,
    totalDuration: Date.now() - startTime
  }
}

/**
 * 默认的可重试错误判断
 * 
 * 可重试的错误：
 * - 网络超时
 * - 速率限制（429）
 * - 服务器错误（5xx）
 * - 连接重置
 */
export function isRetryableError(error: Error): boolean {
  const message = error.message.toLowerCase()
  
  // 网络超时
  if (message.includes('timeout') || message.includes('timed out')) {
    return true
  }
  
  // 速率限制
  if (message.includes('429') || message.includes('rate limit')) {
    return true
  }
  
  // 服务器错误
  if (message.includes('500') || message.includes('502') || 
      message.includes('503') || message.includes('504')) {
    return true
  }
  
  // 连接重置
  if (message.includes('econnreset') || message.includes('connection reset')) {
    return true
  }
  
  // 连接拒绝
  if (message.includes('econnrefused') || message.includes('connection refused')) {
    return true
  }

  return false
}

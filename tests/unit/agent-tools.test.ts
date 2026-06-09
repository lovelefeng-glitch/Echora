/**
 * Agent 基础设施工具测试
 * 
 * 测试 TokenCounter, retryUtils, ErrorClassifier
 */

import { describe, it, expect, vi } from 'vitest'
import { TokenCounter } from '../../src/main/agent/token-counter'
import { retryWithBackoff, jitteredBackoff, isRetryableError } from '../../src/main/agent/retry-utils'
import { ErrorClassifier } from '../../src/main/agent/error-classifier'

describe('TokenCounter', () => {
  it('should count tokens for English text', () => {
    const counter = new TokenCounter()
    const tokens = counter.countTokens('Hello World')
    // "Hello World" = 11 chars, 4 chars per token = ~3 tokens
    expect(tokens).toBeGreaterThan(0)
    expect(tokens).toBeLessThan(5)
  })

  it('should count tokens for Chinese text', () => {
    const counter = new TokenCounter()
    const tokens = counter.countTokens('你好世界')
    // "你好世界" = 4 Chinese chars, 2 chars per token = ~2 tokens
    expect(tokens).toBeGreaterThan(0)
    expect(tokens).toBeLessThan(5)
  })

  it('should count message tokens with overhead', () => {
    const counter = new TokenCounter()
    const tokens = counter.countMessageTokens('user', 'Hello')
    // 4 overhead + tokens for "Hello"
    expect(tokens).toBeGreaterThan(4)
  })

  it('should count multiple messages', () => {
    const counter = new TokenCounter()
    const messages = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there' }
    ]
    const tokens = counter.countMessagesTokens(messages)
    expect(tokens).toBeGreaterThan(6) // 2 overhead + 2 messages * 4 overhead each
  })

  it('should handle empty text', () => {
    const counter = new TokenCounter()
    expect(counter.countTokens('')).toBe(0)
    expect(counter.countTokens(null as unknown as string)).toBe(0)
  })

  it('should cache results', () => {
    const counter = new TokenCounter({ enableCache: true })
    const tokens1 = counter.countTokens('Hello')
    const tokens2 = counter.countTokens('Hello')
    expect(tokens1).toBe(tokens2)
    expect(counter.cacheSize).toBe(1)
  })
})

describe('jitteredBackoff', () => {
  it('should calculate delay with jitter', () => {
    const delay = jitteredBackoff(0, {
      initialDelay: 1000,
      maxDelay: 30000,
      backoffFactor: 2,
      jitter: 0.1
    })
    // Should be around 1000 +/- 10%
    expect(delay).toBeGreaterThanOrEqual(900)
    expect(delay).toBeLessThanOrEqual(1100)
  })

  it('should increase delay exponentially', () => {
    const delay0 = jitteredBackoff(0, { initialDelay: 1000, jitter: 0 })
    const delay1 = jitteredBackoff(1, { initialDelay: 1000, jitter: 0 })
    const delay2 = jitteredBackoff(2, { initialDelay: 1000, jitter: 0 })
    
    expect(delay1).toBeGreaterThan(delay0)
    expect(delay2).toBeGreaterThan(delay1)
  })

  it('should cap at maxDelay', () => {
    const delay = jitteredBackoff(10, {
      initialDelay: 1000,
      maxDelay: 5000,
      backoffFactor: 2,
      jitter: 0
    })
    expect(delay).toBeLessThanOrEqual(5000)
  })
})

describe('retryWithBackoff', () => {
  it('should succeed on first attempt', async () => {
    const result = await retryWithBackoff(
      async () => 'success',
      { maxRetries: 3, initialDelay: 100 }
    )
    expect(result.success).toBe(true)
    expect(result.result).toBe('success')
    expect(result.attempts).toBe(1)
  })

  it('should retry on failure', async () => {
    let attempts = 0
    const result = await retryWithBackoff(
      async () => {
        attempts++
        if (attempts < 3) throw new Error('Temporary failure')
        return 'success'
      },
      { maxRetries: 3, initialDelay: 100 }
    )
    expect(result.success).toBe(true)
    expect(result.attempts).toBe(3)
  })

  it('should fail after max retries', async () => {
    const result = await retryWithBackoff(
      async () => { throw new Error('Permanent failure') },
      { maxRetries: 2, initialDelay: 100 }
    )
    expect(result.success).toBe(false)
    expect(result.error?.message).toBe('Permanent failure')
    expect(result.attempts).toBe(3)
  })

  it('should respect isRetryable', async () => {
    let attempts = 0
    const result = await retryWithBackoff(
      async () => {
        attempts++
        throw new Error('Non-retryable error')
      },
      {
        maxRetries: 3,
        initialDelay: 100,
        isRetryable: () => false
      }
    )
    expect(result.success).toBe(false)
    expect(result.attempts).toBe(1) // Should not retry
  })

  it('should call onRetry callback', async () => {
    const onRetry = vi.fn()
    await retryWithBackoff(
      async () => { throw new Error('Test') },
      { maxRetries: 2, initialDelay: 100, onRetry }
    )
    expect(onRetry).toHaveBeenCalledTimes(2)
  })
})

describe('isRetryableError', () => {
  it('should detect timeout errors', () => {
    expect(isRetryableError(new Error('Request timeout'))).toBe(true)
    expect(isRetryableError(new Error('Connection timed out'))).toBe(true)
  })

  it('should detect rate limit errors', () => {
    expect(isRetryableError(new Error('429 Too Many Requests'))).toBe(true)
    expect(isRetryableError(new Error('Rate limit exceeded'))).toBe(true)
  })

  it('should detect server errors', () => {
    expect(isRetryableError(new Error('500 Internal Server Error'))).toBe(true)
    expect(isRetryableError(new Error('503 Service Unavailable'))).toBe(true)
  })

  it('should detect connection errors', () => {
    expect(isRetryableError(new Error('ECONNRESET'))).toBe(true)
    expect(isRetryableError(new Error('ECONNREFUSED'))).toBe(true)
  })

  it('should not retry auth errors', () => {
    expect(isRetryableError(new Error('401 Unauthorized'))).toBe(false)
    expect(isRetryableError(new Error('403 Forbidden'))).toBe(false)
  })
})

describe('ErrorClassifier', () => {
  const classifier = new ErrorClassifier()

  it('should classify timeout errors', () => {
    const result = classifier.classify(new Error('Request timeout'))
    expect(result.type).toBe('timeout')
    expect(result.retryable).toBe(true)
    expect(result.severity).toBe('medium')
  })

  it('should classify rate limit errors', () => {
    const result = classifier.classify(new Error('429 Too Many Requests'))
    expect(result.type).toBe('rate_limit')
    expect(result.retryable).toBe(true)
    expect(result.code).toBe(429)
  })

  it('should classify auth errors', () => {
    const result = classifier.classify(new Error('401 Unauthorized'))
    expect(result.type).toBe('auth')
    expect(result.retryable).toBe(false)
    expect(result.severity).toBe('high')
  })

  it('should classify server errors', () => {
    const result = classifier.classify(new Error('500 Internal Server Error'))
    expect(result.type).toBe('server')
    expect(result.retryable).toBe(true)
    expect(result.code).toBe(500)
  })

  it('should classify network errors', () => {
    const result = classifier.classify(new Error('ECONNRESET'))
    expect(result.type).toBe('network')
    expect(result.retryable).toBe(true)
  })

  it('should classify unknown errors', () => {
    const result = classifier.classify(new Error('Something weird happened'))
    expect(result.type).toBe('unknown')
    expect(result.retryable).toBe(false)
  })

  it('should provide suggestions', () => {
    const result = classifier.classify(new Error('429 Rate Limit'))
    expect(result.suggestion).toContain('等待')
  })

  it('should format error messages', () => {
    const formatted = classifier.formatError(new Error('Test error'))
    expect(formatted).toContain('[')
    expect(formatted).toContain(']')
    expect(formatted).toContain('Test error')
  })
})

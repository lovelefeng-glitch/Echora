/**
 * Token 计数器（增强版）
 * 
 * 精确计算消息的 token 数量，支持多种 tokenizer
 * 
 * 策略：
 * 1. 优先使用 API 返回的 usage 数据（最准确）
 * 2. 如果没有，使用 tiktoken 库计算
 * 3. 如果 tiktoken 不可用，使用字符估算作为 fallback
 * 
 * 来源：Token 计数修复计划
 * 输出：TokenCounter 类
 * 依赖：./tiktoken-tokenizer.ts
 */

import { create } from '../utils/console-logger'
import { TikTokenTokenizer, createTikTokenTokenizer } from './tiktoken-tokenizer'

const log = create('TokenCounter')

/** Token 计数配置 */
export interface TokenCounterConfig {
  /** 模型名称（用于选择 tokenizer） */
  model?: string
  /** 是否启用缓存（默认 true） */
  enableCache?: boolean
  /** 是否优先使用 API usage（默认 true） */
  preferApiUsage?: boolean
}

/**
 * Token 计数器（增强版）
 * 
 * 使用混合策略精确计算 token 数：
 * 1. API usage（如果可用）
 * 2. tiktoken（本地精确计算）
 * 3. 字符估算（fallback）
 */
export class TokenCounter {
  private _model: string | undefined
  private _enableCache: boolean
  private _preferApiUsage: boolean
  private _tiktokenTokenizer: TikTokenTokenizer | null = null
  private _cache = new Map<string, number>()

  constructor(config?: TokenCounterConfig) {
    this._model = config?.model
    this._enableCache = config?.enableCache ?? true
    this._preferApiUsage = config?.preferApiUsage ?? true
    
    // 初始化 tiktoken tokenizer
    if (this._model) {
      this._tiktokenTokenizer = createTikTokenTokenizer(this._model)
    }
  }

  /**
   * 计算文本的 token 数
   * 
   * 策略：tiktoken → 字符估算
   */
  async countTokens(text: string): Promise<number> {
    if (!text) return 0

    // 检查缓存
    if (this._enableCache && this._cache.has(text)) {
      return this._cache.get(text)!
    }

    let tokens: number

    // 优先使用 tiktoken（精确计算）
    if (this._tiktokenTokenizer) {
      try {
        tokens = await this._tiktokenTokenizer.countTokens(text)
      } catch (error) {
        log.warn(`tiktoken 计算失败，使用 fallback: ${(error as Error).message}`)
        tokens = this._estimateTokens(text)
      }
    } else {
      // fallback 到字符估算
      tokens = this._estimateTokens(text)
    }

    // 缓存结果
    if (this._enableCache) {
      this._cache.set(text, tokens)
    }

    return tokens
  }

  /**
   * 同步计算 token 数（使用字符估算）
   * 
   * 用于需要同步计算的场景
   */
  countTokensSync(text: string): number {
    if (!text) return 0

    // 检查缓存
    if (this._enableCache && this._cache.has(text)) {
      return this._cache.get(text)!
    }

    // 使用字符估算
    const tokens = this._estimateTokens(text)

    // 缓存结果
    if (this._enableCache) {
      this._cache.set(text, tokens)
    }

    return tokens
  }

  /**
   * 计算消息的 token 数
   */
  async countMessageTokens(role: string, content: string): Promise<number> {
    // 每条消息有固定的 overhead（角色、分隔符等）
    const messageOverhead = 4
    const contentTokens = await this.countTokens(content)
    return messageOverhead + contentTokens
  }

  /**
   * 计算多条消息的总 token 数
   */
  async countMessagesTokens(messages: Array<{ role: string; content: string }>): Promise<number> {
    // 对话的固定 overhead
    const conversationOverhead = 2
    let totalTokens = conversationOverhead

    for (const msg of messages) {
      totalTokens += await this.countMessageTokens(msg.role, msg.content)
    }

    return totalTokens
  }

  /**
   * 字符估算（fallback）
   * 
   * 基于经验值：
   * - 英文：~4 字符 = 1 token
   * - 中文：~2 字符 = 1 token
   */
  private _estimateTokens(text: string): number {
    // 中文字符数
    const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length
    // 其他字符数
    const otherChars = text.length - chineseChars

    // 估算 token 数
    return Math.ceil(chineseChars / 2 + otherChars / 4)
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    this._cache.clear()
  }

  /**
   * 获取缓存大小
   */
  get cacheSize(): number {
    return this._cache.size
  }

  /**
   * 释放资源
   */
  dispose(): void {
    if (this._tiktokenTokenizer) {
      this._tiktokenTokenizer.dispose()
      this._tiktokenTokenizer = null
    }
    this._cache.clear()
  }
}

/**
 * 创建默认的 Token 计数器
 */
export function createTokenCounter(config?: TokenCounterConfig): TokenCounter {
  return new TokenCounter(config)
}

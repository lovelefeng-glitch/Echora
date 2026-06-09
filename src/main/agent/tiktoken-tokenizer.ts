/**
 * TikToken Tokenizer 封装
 * 
 * 使用 OpenAI 官方的 tiktoken 库精确计算 token 数
 * 
 * 来源：Token 计数修复计划
 * 输出：TikTokenTokenizer 类
 * 依赖：tiktoken
 */

import { create } from '../utils/console-logger'

const log = create('TikTokenTokenizer')

/** 模型到 encoder 的映射 */
const MODEL_ENCODER_MAP: Record<string, string> = {
  // GPT-4 系列
  'gpt-4': 'cl100k_base',
  'gpt-4-turbo': 'cl100k_base',
  'gpt-4-turbo-preview': 'cl100k_base',
  'gpt-4o': 'o200k_base',
  'gpt-4o-mini': 'o200k_base',
  
  // GPT-3.5 系列
  'gpt-3.5-turbo': 'cl100k_base',
  'gpt-3.5-turbo-16k': 'cl100k_base',
  
  // Claude 系列（使用 cl100k_base 作为近似）
  'claude-3-opus': 'cl100k_base',
  'claude-3-sonnet': 'cl100k_base',
  'claude-3-haiku': 'cl100k_base',
  'claude-3.5-sonnet': 'cl100k_base',
  
  // 其他模型默认使用 cl100k_base
  'default': 'cl100k_base'
}

/**
 * TikToken Tokenizer
 * 
 * 使用 tiktoken 库精确计算 token 数
 */
export class TikTokenTokenizer {
  private _encoder: any = null
  private _encoderName: string

  constructor(encoderName: string = 'cl100k_base') {
    this._encoderName = encoderName
  }

  /**
   * 初始化 encoder（懒加载）
   */
  private async _initEncoder(): Promise<void> {
    if (this._encoder) return

    try {
      const tiktoken = await import('tiktoken')
      const encoding = tiktoken.encoding_for_model(this._encoderName as any)
      this._encoder = encoding
      log.info(`TikToken encoder 已初始化: ${this._encoderName}`)
    } catch (error) {
      log.warn(`TikToken encoder 初始化失败: ${(error as Error).message}`)
      // fallback 到简单估算
      this._encoder = null
    }
  }

  /**
   * 计算文本的 token 数
   */
  async countTokens(text: string): Promise<number> {
    if (!text) return 0

    await this._initEncoder()

    // 如果 tiktoken 可用，使用精确计算
    if (this._encoder) {
      try {
        const tokens = this._encoder.encode(text)
        return tokens.length
      } catch (error) {
        log.warn(`TikToken 计算失败: ${(error as Error).message}`)
      }
    }

    // fallback 到字符估算
    return this._estimateTokens(text)
  }

  /**
   * 字符估算（fallback）
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
   * 释放资源
   */
  dispose(): void {
    if (this._encoder) {
      this._encoder.free()
      this._encoder = null
    }
  }
}

/**
 * 根据模型名称获取推荐的 encoder
 */
export function getEncoderForModel(model: string): string {
  // 查找精确匹配
  if (MODEL_ENCODER_MAP[model]) {
    return MODEL_ENCODER_MAP[model]
  }

  // 查找前缀匹配
  for (const [pattern, encoder] of Object.entries(MODEL_ENCODER_MAP)) {
    if (model.startsWith(pattern)) {
      return encoder
    }
  }

  // 默认使用 cl100k_base
  return MODEL_ENCODER_MAP['default']
}

/**
 * 创建 TikToken Tokenizer
 */
export function createTikTokenTokenizer(model?: string): TikTokenTokenizer {
  const encoder = model ? getEncoderForModel(model) : 'cl100k_base'
  return new TikTokenTokenizer(encoder)
}

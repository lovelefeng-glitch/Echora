/**
 * 摘要压缩器（增强版）
 * 
 * 实现 ContextCompressor 接口，使用简单的摘要策略压缩上下文
 * 
 * 策略：
 * - 保留最近 N 轮对话
 * - 对旧对话生成摘要
 * - 使用 TokenCounter 精确计算 token 数
 * - 支持后期替换为更高级策略（滑动窗口、重要性压缩等）
 * 
 * 来源：Sprint 11 Phase 3 - Echora Agent 核心能力提升
 * 输出：SummaryCompressor 类
 * 依赖：../../agent/token-counter.ts, ./interfaces.ts
 */

import { create } from '../../utils/console-logger'
import { TokenCounter, createTokenCounter } from '../../agent/token-counter'
import type { ContextCompressor, CompressedContext, Message } from '../interfaces'

const log = create('SummaryCompressor')

/** 摘要压缩器配置 */
export interface SummaryCompressorConfig {
  /** 保留最近的对话轮数（默认 10） */
  keepRecentRounds?: number
  /** 压缩触发阈值（token 数，默认 4000） */
  thresholdTokens?: number
  /** 每轮对话的估算 token 数（默认 500） */
  tokensPerRound?: number
  /** Token 计数器配置 */
  tokenCounterConfig?: {
    charsPerToken?: number
    charsPerTokenChinese?: number
  }
}

/**
 * 摘要压缩器（增强版）
 * 
 * 保留最近 N 轮对话，对旧对话生成简单摘要
 * 使用 TokenCounter 精确计算 token 数
 * 这是一个基础实现，后期可替换为更高级的压缩策略
 */
export class SummaryCompressor implements ContextCompressor {
  readonly name = 'summary'

  private _keepRecentRounds: number
  private _thresholdTokens: number
  private _tokensPerRound: number
  private _tokenCounter: TokenCounter

  constructor(config?: SummaryCompressorConfig) {
    this._keepRecentRounds = config?.keepRecentRounds ?? 10
    this._thresholdTokens = config?.thresholdTokens ?? 4000
    this._tokensPerRound = config?.tokensPerRound ?? 500
    this._tokenCounter = createTokenCounter(config?.tokenCounterConfig)
  }

  /**
   * 检查是否需要压缩
   * 
   * 使用 TokenCounter 精确计算 token 数
   */
  shouldCompress(messages: Message[], tokenCount?: number): boolean {
    // 如果提供了 token 数，直接使用
    // 否则使用 TokenCounter 计算
    const actualTokenCount = tokenCount ?? this._tokenCounter.countMessagesTokens(
      messages.map(m => ({ role: m.role, content: m.content }))
    )

    // 如果 token 数超过阈值，需要压缩
    if (actualTokenCount > this._thresholdTokens) {
      log.info(`需要压缩: token 数 ${actualTokenCount} 超过阈值 ${this._thresholdTokens}`)
      return true
    }

    // 如果消息数量超过保留轮数的 2 倍（每轮 = 用户 + 助手），需要压缩
    const maxMessages = this._keepRecentRounds * 2
    if (messages.length > maxMessages) {
      log.info(`需要压缩: 消息数 ${messages.length} 超过阈值 ${maxMessages}`)
      return true
    }

    return false
  }

  /**
   * 执行压缩
   */
  async compress(messages: Message[]): Promise<CompressedContext> {
    if (messages.length === 0) {
      return {
        kept: [],
        summary: undefined,
        ratio: 1,
        strategy: this.name
      }
    }

    // 计算保留的消息数量
    const keepCount = this._keepRecentRounds * 2
    const keepStart = Math.max(0, messages.length - keepCount)

    // 分离旧消息和新消息
    const oldMessages = messages.slice(0, keepStart)
    const keptMessages = messages.slice(keepStart)

    // 生成摘要（简单实现：统计旧消息的关键信息）
    let summary: string | undefined
    if (oldMessages.length > 0) {
      summary = this._generateSummary(oldMessages)
    }

    // 计算压缩比
    const ratio = keptMessages.length / messages.length

    log.info(`压缩完成: ${messages.length} 条消息 → ${keptMessages.length} 条保留 + 摘要`)

    return {
      kept: keptMessages,
      summary,
      ratio,
      strategy: this.name
    }
  }

  /**
   * 估算压缩后的 token 数
   * 
   * 使用 TokenCounter 精确计算
   */
  estimateTokens(compressed: CompressedContext): number {
    // 使用 TokenCounter 计算保留消息的 token 数
    const keptTokens = this._tokenCounter.countMessagesTokens(
      compressed.kept.map(m => ({ role: m.role, content: m.content }))
    )

    // 使用 TokenCounter 计算摘要的 token 数
    const summaryTokens = compressed.summary
      ? this._tokenCounter.countTokens(compressed.summary)
      : 0

    return keptTokens + summaryTokens
  }

  /**
   * 生成简单摘要
   */
  private _generateSummary(messages: Message[]): string {
    // 统计消息类型
    const userMessages = messages.filter(m => m.role === 'user')
    const assistantMessages = messages.filter(m => m.role === 'assistant')
    const toolMessages = messages.filter(m => m.role === 'system')

    // 提取关键信息
    const topics: string[] = []
    for (const msg of userMessages.slice(0, 5)) {
      // 取前 50 个字符作为主题
      const topic = msg.content.substring(0, 50).replace(/\n/g, ' ')
      if (topic.trim()) {
        topics.push(topic)
      }
    }

    // 构建摘要
    const parts: string[] = []
    parts.push(`对话历史摘要：共 ${messages.length} 条消息`)
    parts.push(`用户消息: ${userMessages.length} 条，助手回复: ${assistantMessages.length} 条`)

    if (toolMessages.length > 0) {
      parts.push(`工具调用: ${toolMessages.length} 条`)
    }

    if (topics.length > 0) {
      parts.push(`讨论主题: ${topics.join('；')}`)
    }

    return parts.join('\n')
  }
}

/**
 * 创建默认的摘要压缩器
 */
export function createSummaryCompressor(config?: SummaryCompressorConfig): SummaryCompressor {
  return new SummaryCompressor(config)
}

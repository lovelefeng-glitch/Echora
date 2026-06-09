import { useMemo } from 'react'
import type { Message } from '../stores/app-store'

export interface TokenInfo {
  /** 已使用的 token 总量（会话级别） */
  usedTokens: number
  /** 模型的上下文窗口大小（模型级别） */
  contextWindow: number | null
  /** 使用百分比 */
  usagePct: number
  /** 是否显示 token 信息（当无法获取 contextWindow 时为 false） */
  isVisible: boolean
}

/**
 * 计算 token 信息
 *
 * 数据来源：
 * - contextWindow: 模型级别，从 agent 获取
 * - contextUsed: 会话级别，从当前会话的最后一条消息获取
 *
 * 优先级：
 * 1. 模型返回的 contextUsed（最准确，反映实际上下文占用）
 * 2. 消息列表累计（fallback）
 * 3. 0（无法获取）
 *
 * 场景处理：
 * 1. 对话返回 token → 更新当前会话的 contextUsed
 * 2. 切换会话 → 使用该会话的 contextUsed
 * 3. 切换模型 → contextWindow 变化 → 重算百分比
 * 4. 切换 agent → agent 变化 → 获取新的 contextWindow
 * 5. 无法获取 token → contextWindow=null → 隐藏显示
 */
export function useTokenInfo(
  messages: Message[],
  contextWindow: number | null
): TokenInfo {
  return useMemo(() => {
    // 从当前会话获取 contextUsed（会话级别）
    // 优先使用最后一条 assistant 消息的 usage.contextUsed（模型返回的值）
    let usedTokens = 0

    // 查找最后一条有 usage 的 assistant 消息
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i]
      if (msg.role === 'assistant' && msg.usage) {
        // 优先使用 contextUsed（模型返回的实际上下文占用）
        if (msg.usage.contextUsed && msg.usage.contextUsed > 0) {
          usedTokens = msg.usage.contextUsed
          break
        }
        // fallback 到 totalTokens
        if (msg.usage.totalTokens && msg.usage.totalTokens > 0) {
          usedTokens = msg.usage.totalTokens
          break
        }
      }
    }

    // 如果没有找到模型返回的值，从消息列表累计（fallback）
    if (!usedTokens) {
      usedTokens = messages.reduce((total, msg) => {
        if (msg.role === 'assistant' && msg.usage) {
          return total + (msg.usage.totalTokens ?? msg.usage.input ?? 0)
        }
        return total
      }, 0)
    }

    // 计算使用百分比
    const usagePct = contextWindow && contextWindow > 0
      ? (usedTokens / contextWindow) * 100
      : 0

    // 是否显示：需要有 contextWindow 且 > 0
    const isVisible = contextWindow !== null && contextWindow > 0

    return {
      usedTokens,
      contextWindow,
      usagePct,
      isVisible
    }
  }, [messages, contextWindow])
}

/**
 * 格式化 token 数量显示
 * 1234567 → "1.2M"
 * 12345 → "12.3k"
 * 1234 → "1.2k"
 */
export function formatTokenCount(count: number | null | undefined): string {
  if (count === null || count === undefined) return '0'
  if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`
  if (count >= 1000) return `${(count / 1000).toFixed(1)}K`
  return count.toString()
}

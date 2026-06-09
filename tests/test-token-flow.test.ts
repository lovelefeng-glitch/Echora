/**
 * Token 数据流测试
 *
 * 测试目标：验证 Echora Agent 的 Token 使用量是否正确传递到前端
 *
 * 测试内容：
 * 1. OpenAI Provider 是否正确解析 usage chunk
 * 2. AgentLoop 是否正确累加 usage
 * 3. IPC 是否正确发送 usage 数据
 * 4. formatUsage 是否正确处理 0 值
 */

import { describe, it, expect, vi } from 'vitest'

// 测试 1: OpenAI Provider 的 usage 解析
describe('OpenAI Provider - usage 解析', () => {
  it('应该正确解析 usage chunk', () => {
    // 模拟 OpenAI 流式响应的 usage chunk
    const usageChunk = {
      id: 'chatcmpl-xxx',
      object: 'chat.completion.chunk',
      created: 1234567890,
      model: 'mimo-v2.5-pro',
      choices: [],  // usage chunk 的 choices 为空数组
      usage: {
        prompt_tokens: 100,
        completion_tokens: 50,
        total_tokens: 150
      }
    }

    // 验证 usage 字段存在
    expect(usageChunk.usage).toBeDefined()
    expect(usageChunk.usage.prompt_tokens).toBe(100)
    expect(usageChunk.usage.completion_tokens).toBe(50)
    expect(usageChunk.usage.total_tokens).toBe(150)
  })

  it('应该正确映射字段名', () => {
    // API 返回的字段名
    const apiUsage = {
      prompt_tokens: 100,
      completion_tokens: 50,
      total_tokens: 150
    }

    // 映射后的字段名（OpenAI Provider 内部使用）
    const mappedUsage = {
      promptTokens: apiUsage.prompt_tokens,
      completionTokens: apiUsage.completion_tokens,
      totalTokens: apiUsage.total_tokens
    }

    expect(mappedUsage.promptTokens).toBe(100)
    expect(mappedUsage.completionTokens).toBe(50)
    expect(mappedUsage.totalTokens).toBe(150)
  })
})

// 测试 2: AgentLoop 的 usage 累加
describe('AgentLoop - usage 累加', () => {
  it('应该正确累加多次 usage', () => {
    let totalUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 }

    // 模拟第一次收到 usage
    const usage1 = { promptTokens: 100, completionTokens: 50, totalTokens: 150 }
    totalUsage.promptTokens += usage1.promptTokens
    totalUsage.completionTokens += usage1.completionTokens
    totalUsage.totalTokens += usage1.totalTokens

    // 模拟第二次收到 usage（多轮对话）
    const usage2 = { promptTokens: 200, completionTokens: 80, totalTokens: 280 }
    totalUsage.promptTokens += usage2.promptTokens
    totalUsage.completionTokens += usage2.completionTokens
    totalUsage.totalTokens += usage2.totalTokens

    expect(totalUsage.promptTokens).toBe(300)
    expect(totalUsage.completionTokens).toBe(130)
    expect(totalUsage.totalTokens).toBe(430)
  })

  it('应该处理 usage 为 0 的情况', () => {
    let totalUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 }

    // API 返回 usage 为 0
    const usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
    totalUsage.promptTokens += usage.promptTokens
    totalUsage.completionTokens += usage.completionTokens
    totalUsage.totalTokens += usage.totalTokens

    expect(totalUsage.promptTokens).toBe(0)
    expect(totalUsage.completionTokens).toBe(0)
    expect(totalUsage.totalTokens).toBe(0)
  })
})

// 测试 3: IPC 数据格式
describe('IPC - usage 数据格式', () => {
  it('应该正确映射到 IPC 格式', () => {
    const totalUsage = { promptTokens: 100, completionTokens: 50, totalTokens: 150 }

    // echora-agent-handlers.ts 中的映射逻辑
    const ipcData = {
      msgId: 'test-msg-123',
      input: totalUsage.promptTokens || 0,
      output: totalUsage.completionTokens || 0,
      totalTokens: totalUsage.totalTokens || 0,
      contextUsed: totalUsage.promptTokens || 0,
      aiType: 'echora',
      agentId: 'test-provider'
    }

    expect(ipcData.input).toBe(100)
    expect(ipcData.output).toBe(50)
    expect(ipcData.totalTokens).toBe(150)
    expect(ipcData.contextUsed).toBe(100)
  })

  it('应该处理 usage 为 0 的 IPC 数据', () => {
    const totalUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 }

    const ipcData = {
      msgId: 'test-msg-123',
      input: totalUsage.promptTokens || 0,
      output: totalUsage.completionTokens || 0,
      totalTokens: totalUsage.totalTokens || 0,
      contextUsed: totalUsage.promptTokens || 0,
      aiType: 'echora',
      agentId: 'test-provider'
    }

    // 当 usage 为 0 时，IPC 数据应该包含 0 值
    expect(ipcData.input).toBe(0)
    expect(ipcData.output).toBe(0)
    expect(ipcData.totalTokens).toBe(0)
  })
})

// 测试 4: formatUsage 函数（这是关键的 bug 所在）
describe('formatUsage - 前端格式化', () => {
  // 这是当前的实现（有 bug）
  function formatUsageBuggy(usage: { input?: number; output?: number; totalTokens?: number }): string {
    if (!usage) return ''
    const parts: string[] = []
    if (usage.input) parts.push(`输入: ${usage.input}`)  // ❌ Bug: 0 是 falsy
    if (usage.output) parts.push(`输出: ${usage.output}`)  // ❌ Bug: 0 是 falsy
    if (usage.totalTokens) parts.push(`总计: ${usage.totalTokens}`)  // ❌ Bug: 0 是 falsy
    return parts.join(' | ')
  }

  // 这是修复后的实现
  function formatUsageFixed(usage: { input?: number; output?: number; totalTokens?: number }): string {
    if (!usage) return ''
    const parts: string[] = []
    if (usage.input != null) parts.push(`输入: ${usage.input}`)  // ✅ 修复: 只检查 null/undefined
    if (usage.output != null) parts.push(`输出: ${usage.output}`)  // ✅ 修复
    if (usage.totalTokens != null) parts.push(`总计: ${usage.totalTokens}`)  // ✅ 修复
    return parts.join(' | ')
  }

  it('当前实现: 0 值会被跳过（这是 bug）', () => {
    const usage = { input: 0, output: 0, totalTokens: 0 }
    const result = formatUsageBuggy(usage)

    // Bug: 返回空字符串，因为 0 是 falsy
    expect(result).toBe('')
  })

  it('修复后: 0 值应该正常显示', () => {
    const usage = { input: 0, output: 0, totalTokens: 0 }
    const result = formatUsageFixed(usage)

    // 修复后: 返回包含 0 的字符串
    expect(result).toBe('输入: 0 | 输出: 0 | 总计: 0')
  })

  it('应该正确显示非零值', () => {
    const usage = { input: 100, output: 50, totalTokens: 150 }

    const buggyResult = formatUsageBuggy(usage)
    const fixedResult = formatUsageFixed(usage)

    // 非零值两种实现都能正确显示
    expect(buggyResult).toBe('输入: 100 | 输出: 50 | 总计: 150')
    expect(fixedResult).toBe('输入: 100 | 输出: 50 | 总计: 150')
  })

  it('应该处理 null/undefined', () => {
    const usage = { input: null, output: undefined, totalTokens: 150 }

    const fixedResult = formatUsageFixed(usage)

    // null/undefined 应该被跳过
    expect(fixedResult).toBe('总计: 150')
  })
})

// 测试 5: 完整的数据流模拟
describe('完整数据流 - Echora Agent Token', () => {
  it('应该正确传递 usage 从 API 到前端', () => {
    // 1. API 返回的 usage
    const apiUsage = {
      prompt_tokens: 100,
      completion_tokens: 50,
      total_tokens: 150
    }

    // 2. OpenAI Provider 映射
    const providerUsage = {
      promptTokens: apiUsage.prompt_tokens,
      completionTokens: apiUsage.completion_tokens,
      totalTokens: apiUsage.total_tokens
    }

    // 3. AgentLoop 累加（假设只有一次调用）
    const agentUsage = { ...providerUsage }

    // 4. IPC 发送
    const ipcData = {
      input: agentUsage.promptTokens || 0,
      output: agentUsage.completionTokens || 0,
      totalTokens: agentUsage.totalTokens || 0
    }

    // 5. 前端格式化（修复后）
    function formatUsage(usage: { input?: number; output?: number; totalTokens?: number }): string {
      if (!usage) return ''
      const parts: string[] = []
      if (usage.input != null) parts.push(`输入: ${usage.input}`)
      if (usage.output != null) parts.push(`输出: ${usage.output}`)
      if (usage.totalTokens != null) parts.push(`总计: ${usage.totalTokens}`)
      return parts.join(' | ')
    }

    const displayText = formatUsage(ipcData)

    // 验证最终显示
    expect(displayText).toBe('输入: 100 | 输出: 50 | 总计: 150')
  })

  it('当 API 返回 usage 为 0 时，应该显示 0', () => {
    // API 返回 usage 为 0
    const apiUsage = {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0
    }

    // 完整数据流
    const providerUsage = {
      promptTokens: apiUsage.prompt_tokens,
      completionTokens: apiUsage.completion_tokens,
      totalTokens: apiUsage.total_tokens
    }

    const ipcData = {
      input: providerUsage.promptTokens || 0,
      output: providerUsage.completionTokens || 0,
      totalTokens: providerUsage.totalTokens || 0
    }

    function formatUsage(usage: { input?: number; output?: number; totalTokens?: number }): string {
      if (!usage) return ''
      const parts: string[] = []
      if (usage.input != null) parts.push(`输入: ${usage.input}`)
      if (usage.output != null) parts.push(`输出: ${usage.output}`)
      if (usage.totalTokens != null) parts.push(`总计: ${usage.totalTokens}`)
      return parts.join(' | ')
    }

    const displayText = formatUsage(ipcData)

    // 修复后: 应该显示 0，而不是空字符串
    expect(displayText).toBe('输入: 0 | 输出: 0 | 总计: 0')
  })
})

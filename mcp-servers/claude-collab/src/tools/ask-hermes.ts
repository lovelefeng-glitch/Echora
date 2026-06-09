import { z } from 'zod'
import { askHermes } from '../utils/http-client'

export const askHermesSchema = {
  message: z.string().describe('发送给 Hermes 的消息或指令'),
  model: z.string().optional().describe('指定使用的模型（可选）'),
  temperature: z.number().min(0).max(2).optional().describe('温度参数，0-2，默认 0.7'),
  maxTokens: z.number().positive().optional().describe('最大输出 token 数'),
  timeoutMs: z.number().positive().optional().describe('超时时间（毫秒），默认 300000（5分钟）')
}

export async function askHermesTool(args: {
  message: string
  model?: string
  temperature?: number
  maxTokens?: number
  timeoutMs?: number
}): Promise<string> {
  const result = await askHermes(args.message, {
    model: args.model,
    temperature: args.temperature,
    maxTokens: args.maxTokens,
    timeoutMs: args.timeoutMs
  })

  if (result.success) {
    let response = `✅ Hermes 响应成功\n\n`
    response += `**内容**:\n${result.content}\n\n`
    if (result.usage) {
      response += `**Token 使用**: ${result.usage.promptTokens} (输入) + ${result.usage.completionTokens} (输出) = ${result.usage.totalTokens} (总计)\n`
    }
    response += `**延迟**: ${result.latencyMs}ms`
    return response
  } else {
    return `❌ Hermes 响应失败\n\n**错误**: ${result.error}\n**延迟**: ${result.latencyMs}ms`
  }
}

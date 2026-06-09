import { z } from 'zod'
import { checkStatus } from '../utils/http-client'

export const checkStatusSchema = {
  hermesPort: z.number().positive().optional().describe('Hermes 端口（可选，默认从配置读取）'),
  openclawPort: z.number().positive().optional().describe('OpenClaw 端口（可选，默认从配置读取）')
}

export async function checkStatusTool(args: {
  hermesPort?: number
  openclawPort?: number
}): Promise<string> {
  const status = await checkStatus(args.hermesPort, args.openclawPort)

  let response = `🔍 AI 状态检查\n\n`

  // Hermes 状态
  response += `**Hermes** (端口 ${status.hermes.port}):\n`
  if (status.hermes.running) {
    response += `  ✅ 运行中`
    if (status.hermes.latencyMs !== undefined) {
      response += ` (延迟: ${status.hermes.latencyMs}ms)`
    }
    response += `\n`
  } else {
    response += `  ❌ 离线\n`
  }

  response += `\n`

  // OpenClaw 状态
  response += `**OpenClaw** (端口 ${status.openclaw.port}):\n`
  if (status.openclaw.running) {
    response += `  ✅ 运行中`
    if (status.openclaw.latencyMs !== undefined) {
      response += ` (延迟: ${status.openclaw.latencyMs}ms)`
    }
    response += `\n`
  } else {
    response += `  ❌ 离线\n`
  }

  return response
}

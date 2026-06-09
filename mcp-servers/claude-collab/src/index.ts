import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import { askHermesSchema, askHermesTool } from './tools/ask-hermes'
import { askOpenClawSchema, askOpenClawTool } from './tools/ask-openclaw'
import { checkStatusSchema, checkStatusTool } from './tools/check-status'

const server = new Server(
  {
    name: 'claude-collab',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
)

// 列出所有可用工具
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'ask_hermes',
        description: '向 Hermes AI 发送消息并获取响应。用于执行测试、运行脚本、获取结果等。',
        inputSchema: {
          type: 'object',
          properties: askHermesSchema,
          required: ['message']
        }
      },
      {
        name: 'ask_openclaw',
        description: '向 OpenClaw AI 发送消息并获取响应。用于执行测试、运行脚本、获取结果等。',
        inputSchema: {
          type: 'object',
          properties: askOpenClawSchema,
          required: ['message']
        }
      },
      {
        name: 'check_ai_status',
        description: '检查 Hermes 和 OpenClaw 的运行状态。',
        inputSchema: {
          type: 'object',
          properties: checkStatusSchema,
          required: []
        }
      }
    ]
  }
})

// 处理工具调用
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params

  try {
    let result: string

    switch (name) {
      case 'ask_hermes':
        result = await askHermesTool(args as Parameters<typeof askHermesTool>[0])
        break
      case 'ask_openclaw':
        result = await askOpenClawTool(args as Parameters<typeof askOpenClawTool>[0])
        break
      case 'check_ai_status':
        result = await checkStatusTool(args as Parameters<typeof checkStatusTool>[0])
        break
      default:
        throw new Error(`Unknown tool: ${name}`)
    }

    return {
      content: [
        {
          type: 'text',
          text: result
        }
      ]
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    return {
      content: [
        {
          type: 'text',
          text: `❌ 工具执行失败: ${errorMessage}`
        }
      ],
      isError: true
    }
  }
})

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error('Claude-Collab MCP 服务器已启动')
}

main().catch((error) => {
  console.error('服务器启动失败:', error)
  process.exit(1)
})

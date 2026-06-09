/**
 * 代码执行工具
 * dangerLevel: dangerous（需要二次确认）
 * v2 - 2026-06-09: 使用 Node.js vm 模块实现真实执行
 */

import { createContext, runInContext } from 'vm'
import type { ToolDefinition, ToolHandler } from '../types'

/** code_execute 工具定义 */
export const codeExecuteDefinition: ToolDefinition = {
  name: 'code_execute',
  description: '在安全沙箱中执行 JavaScript 代码。支持计算、数据处理、字符串操作。需要二次确认。',
  parameters: {
    type: 'object',
    properties: {
      language: {
        type: 'string',
        description: '编程语言',
        enum: ['javascript']
      },
      code: {
        type: 'string',
        description: '要执行的 JavaScript 代码'
      },
      timeout: {
        type: 'number',
        description: '超时时间（毫秒），默认 10000',
        default: 10000
      }
    },
    required: ['language', 'code']
  },
  dangerLevel: 'dangerous',
  category: 'code',
  enabled: true
}

/** code_execute 工具处理器 */
export const codeExecuteHandler: ToolHandler = async (args, _context) => {
  const language = args.language as string
  const code = args.code as string
  const timeout = Math.min((args.timeout as number) || 10000, 30000)  // 最大 30 秒

  if (language !== 'javascript') {
    return { success: false, output: '', error: `不支持的语言: ${language}（目前仅支持 JavaScript）` }
  }

  try {
    // 创建受限的沙箱上下文
    const sandbox = {
      console: {
        logs: [] as string[],
        log: (...args: unknown[]) => { sandbox.console.logs.push(args.map(String).join(' ')) },
        error: (...args: unknown[]) => { sandbox.console.logs.push('[ERROR] ' + args.map(String).join(' ')) }
      },
      Math, Date, JSON, parseInt, parseFloat, isNaN, isFinite,
      encodeURIComponent, decodeURIComponent,
      Array, Object, String, Number, Boolean, RegExp, Map, Set,
      Promise, setTimeout: undefined as unknown,  // 禁用 setTimeout
      fetch: undefined as unknown,  // 禁用网络
      require: undefined as unknown,  // 禁用模块
    }

    const context = createContext(sandbox, { name: 'echora-sandbox' })

    // 执行代码，带超时
    const result = runInContext(code, context, {
      timeout,
      displayErrors: true
    })

    // 合并 console 输出和返回值
    const logs = sandbox.console.logs.join('\n')
    const returnValue = result !== undefined ? String(result) : ''

    const output = [logs, returnValue].filter(Boolean).join('\n') || '(无输出)'

    return {
      success: true,
      output: output.substring(0, 5000),
      data: { language, codeLength: code.length, timeout, returnValue: result }
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    if (msg.includes('timed out')) {
      return { success: false, output: '', error: `代码执行超时（${timeout}ms）。请简化代码或增加 timeout 参数。` }
    }
    return { success: false, output: '', error: `执行错误: ${msg}` }
  }
}

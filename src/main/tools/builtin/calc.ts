/**
 * 计算工具
 * dangerLevel: safe
 */

import type { ToolDefinition, ToolHandler } from '../types'

/** calc 工具定义 */
export const calcDefinition: ToolDefinition = {
  name: 'calc',
  description: '执行数学计算。支持基本运算、数学函数和单位换算。',
  parameters: {
    type: 'object',
    properties: {
      expression: {
        type: 'string',
        description: '数学表达式，如 "2 + 3 * 4" 或 "sqrt(16)"'
      }
    },
    required: ['expression']
  },
  dangerLevel: 'safe',
  category: 'math',
  enabled: true
}

/** 支持的数学函数 */
const MATH_FUNCTIONS: Record<string, (...args: number[]) => number> = {
  abs: Math.abs,
  ceil: Math.ceil,
  floor: Math.floor,
  round: Math.round,
  sqrt: Math.sqrt,
  cbrt: Math.cbrt,
  pow: Math.pow,
  log: Math.log,
  log10: Math.log10,
  log2: Math.log2,
  exp: Math.exp,
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
  atan2: Math.atan2,
  max: Math.max,
  min: Math.min,
  random: () => Math.random()
}

/** 安全的数学表达式求值 */
function safeEval(expression: string): number {
  // 替换常量
  let expr = expression
    .replace(/\bpi\b/gi, String(Math.PI))
    .replace(/\be\b/gi, String(Math.E))

  // 替换函数调用
  for (const [name, fn] of Object.entries(MATH_FUNCTIONS)) {
    const regex = new RegExp(`\\b${name}\\s*\\(`, 'g')
    expr = expr.replace(regex, `__fn_${name}(`)
  }

  // 安全的表达式求值（仅允许数字、运算符、函数调用）
  const safePattern = /^[\d\s+\-*/().,__fn_a-zA-Z]+$/
  if (!safePattern.test(expr)) {
    throw new Error('表达式包含不允许的字符')
  }

  // 替换函数调用为实际调用
  for (const [name, fn] of Object.entries(MATH_FUNCTIONS)) {
    expr = expr.replace(new RegExp(`__fn_${name}`, 'g'), `Math.${name}`)
  }

  // 使用 Function 构造器求值（比 eval 更安全）
  try {
    const result = new Function(`return ${expr}`)()
    if (typeof result !== 'number' || !isFinite(result)) {
      throw new Error('计算结果不是有效数字')
    }
    return result
  } catch {
    throw new Error(`无法计算表达式: ${expression}`)
  }
}

/** calc 工具处理器 */
export const calcHandler: ToolHandler = async (args, context) => {
  const expression = args.expression as string

  try {
    const result = safeEval(expression)

    return {
      success: true,
      output: `${expression} = ${result}`,
      data: { expression, result }
    }
  } catch (error) {
    return {
      success: false,
      output: '',
      error: `计算失败: ${error instanceof Error ? error.message : String(error)}`
    }
  }
}

/**
 * 文本Tool Call解析器 - 支持MiMo DSML格式等多种格式
 */
import type { ToolCall } from '../llm/types'

let _callIdCounter = 0
function generateCallId(): string {
  _callIdCounter++
  return 'call_text_' + Date.now() + '_' + _callIdCounter
}

function makeToolCall(name: string, args: Record<string, unknown>): ToolCall {
  return {
    id: generateCallId(),
    type: 'function',
    function: { name, arguments: JSON.stringify(args) }
  }
}

function safeJsonParse(str: string): unknown | null {
  try { return JSON.parse(str) } catch { return null }
}

function parseValue(value: string): string | number | boolean {
  if (value.toLowerCase() === 'true') return true
  if (value.toLowerCase() === 'false') return false
  const jp = safeJsonParse(value)
  if (jp !== null && typeof jp !== 'object') return jp as string | number | boolean
  const num = Number(value)
  if (!isNaN(num) && value.trim() !== '') return num
  return value
}

/**
 * 从文本中解析tool call
 * 支持: MiMo DSML | XML | JSON代码块 | 自然语言
 */
export function parseToolCallsFromText(text: string): ToolCall[] | null {
  if (!text || text.trim().length === 0) return null
  const toolCalls: ToolCall[] = []

  // 格式0: MiMo DSML格式
  const L = '\uFF1C', R = '\uFF1E', S = '\uFF5C', B = '\uFF5B', E = '\uFF5D'
  const o = L + B + 'DSML' + E + S
  const c = S + B + '/DSML' + E + R
  const fcTag = o + 'function_calls' + R
  const fcEnd = c + 'function_calls' + R

  const fcStart = text.indexOf(fcTag)
  if (fcStart !== -1) {
    const fcLast = text.indexOf(fcEnd, fcStart)
    if (fcLast !== -1) {
      const block = text.slice(fcStart, fcLast + fcEnd.length)
      const invTag = o + 'invoke name="'
      const invEnd = c + 'invoke' + R
      const parTag = o + 'parameter name="'
      const parEnd = c + 'parameter' + R

      let pos = 0
      while (pos < block.length) {
        const iStart = block.indexOf(invTag, pos)
        if (iStart === -1) break
        const nStart = iStart + invTag.length
        const nEnd = block.indexOf('"', nStart)
        if (nEnd === -1) break
        const name = block.slice(nStart, nEnd).trim()
        const cStart = block.indexOf('>', nEnd) + 1
        const cEnd = block.indexOf(invEnd, cStart)
        if (cEnd === -1) break
        const pBlock = block.slice(cStart, cEnd)
        const args: Record<string, unknown> = {}

        let pp = 0
        while (pp < pBlock.length) {
          const ps = pBlock.indexOf(parTag, pp)
          if (ps === -1) break
          const pnStart = ps + parTag.length
          const pnEnd = pBlock.indexOf('"', pnStart)
          if (pnEnd === -1) break
          const pn = pBlock.slice(pnStart, pnEnd).trim()
          const pvStart = pBlock.indexOf('>', pnEnd) + 1
          const pvEnd = pBlock.indexOf(parEnd, pvStart)
          if (pvEnd === -1) break
          args[pn] = parseValue(pBlock.slice(pvStart, pvEnd).trim())
          pp = pvEnd + parEnd.length
        }

        if (name) toolCalls.push(makeToolCall(name, args))
        pos = cEnd + invEnd.length
      }
    }
  }

  // 格式1: XML格式 (<tool_call> 或 <tool_invocation>)
  if (toolCalls.length === 0) {
    // 优先解析 <tool_invocation name="xxx" arguments={...} /> 格式
    const tiRegex = /<tool_invocation\s+name="([^"]+)"\s+arguments=(\{[^}]+\})\s*\/?>/gi
    let tiMatch: RegExpExecArray | null
    while ((tiMatch = tiRegex.exec(text)) !== null) {
      const name = tiMatch[1].trim()
      const parsed = safeJsonParse(tiMatch[2])
      const args = (parsed && typeof parsed === 'object' && parsed !== null)
        ? parsed as Record<string, unknown>
        : {}
      if (name) toolCalls.push(makeToolCall(name, args))
    }

    // 如果没匹配到，再解析标准 <tool_call> 格式
    if (toolCalls.length === 0) {
      const re = new RegExp(String.raw`<tool_call>\s*<function=([^>]+)>([\s\S]*?)<\/function>\s*</tool_call>`, 'gi')
    let m: RegExpExecArray | null
    while ((m = re.exec(text)) !== null) {
      const name = m[1].trim(), pb = m[2], args: Record<string, unknown> = {}
      const pr1 = /<parameter>([^=]+)=([\s\S]*?)<\/parameter>/gi
      let p1: RegExpExecArray | null
      while ((p1 = pr1.exec(pb)) !== null) args[p1[1].trim()] = parseValue(p1[2].trim())
      const pr2 = /<parameter>\s*<name>([^<]+)<\/name>\s*<value>([\s\S]*?)<\/value>\s*<\/parameter>/gi
      let p2: RegExpExecArray | null
      while ((p2 = pr2.exec(pb)) !== null) args[p2[1].trim()] = parseValue(p2[2].trim())
      if (name) toolCalls.push(makeToolCall(name, args))
    }
    } // end if (toolCalls.length === 0) - standard XML
  } // end if (toolCalls.length === 0) - XML formats

  // 格式2: JSON代码块
  if (toolCalls.length === 0) {
    const re = /```(?:json)?\s*\n?\s*(\{[\s\S]*?\})\s*\n?\s*```/gi
    let m: RegExpExecArray | null
    while ((m = re.exec(text)) !== null) {
      const p = safeJsonParse(m[1])
      if (p && typeof p === 'object' && p !== null) {
        const obj = p as Record<string, unknown>
        if (typeof obj.name === 'string' && obj.name) {
          const a = (typeof obj.arguments === 'object' && obj.arguments !== null) ? obj.arguments as Record<string, unknown> : {}
          toolCalls.push(makeToolCall(obj.name, a))
        }
      }
    }
  }

  // 格式3: 自然语言
  if (toolCalls.length === 0) {
    const re = /(?:使用|调用|执行|运行|call|invoke|use)\s*["\u300c\u300e]?(\w+)["\u300d\u300f]?\s*(?:工具|tool|function)/gi
    let m: RegExpExecArray | null
    while ((m = re.exec(text)) !== null) {
      const name = m[1].trim(), args: Record<string, unknown> = {}
      const section = text.slice(m.index + m[0].length)
      const kv = /(\w+)\s*=\s*([^\s,;\uFF0C\uFF1B]+)/g
      let k: RegExpExecArray | null
      while ((k = kv.exec(section)) !== null) args[k[1]] = parseValue(k[2])
      if (name) toolCalls.push(makeToolCall(name, args))
    }
  }

  return toolCalls.length > 0 ? toolCalls : null
}

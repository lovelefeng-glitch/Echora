// 测试 mimo API 在有 tools 参数时是否返回 usage
const BASE_URL = 'https://token-plan-cn.xiaomimimo.com/v1'
const API_KEY = 'tp-cibbkyvpiycatzi08g6k0zni8im97eojebobcio4lbqutf9a'

async function testWithTools() {
  const body = {
    model: 'mimo-v2.5',
    messages: [
      { role: 'system', content: '你是一个助手。' },
      { role: 'user', content: '你好' }
    ],
    stream: true,
    stream_options: { include_usage: true },
    temperature: 0.7,
    max_tokens: 100,
    tools: [
      {
        type: 'function',
        function: {
          name: 'file_read',
          description: '读取文件',
          parameters: {
            type: 'object',
            properties: { path: { type: 'string', description: '文件路径' } },
            required: ['path']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'terminal',
          description: '执行命令',
          parameters: {
            type: 'object',
            properties: { command: { type: 'string', description: '命令' } },
            required: ['command']
          }
        }
      }
    ],
    tool_choice: 'auto'
  }

  console.log('=== 带 tools 的流式请求测试 ===\n')
  console.log('请求参数: stream=true, stream_options.include_usage=true, tools=2个\n')

  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${API_KEY}` },
    body: JSON.stringify(body)
  })

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let usage = null
  let content = ''
  let toolCalls = []
  let chunkCount = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''
    for (const line of lines) {
      const t = line.trim()
      if (!t || !t.startsWith('data: ')) continue
      const d = t.slice(6)
      if (d === '[DONE]') continue
      try {
        const p = JSON.parse(d)
        chunkCount++
        if (p.usage) {
          usage = p.usage
          console.log(`第 ${chunkCount} 个 chunk 有 usage:`, JSON.stringify(usage))
        }
        if (p.choices?.[0]?.delta?.content) content += p.choices[0].delta.content
        if (p.choices?.[0]?.delta?.tool_calls) {
          toolCalls.push(...p.choices[0].delta.tool_calls)
        }
        if (p.choices?.[0]?.finish_reason) {
          console.log(`finish_reason: ${p.choices[0].finish_reason}`)
        }
      } catch {}
    }
  }

  console.log(`\n结果:`)
  console.log(`  chunks: ${chunkCount}`)
  console.log(`  content: "${content.trim()}"`)
  console.log(`  tool_calls: ${toolCalls.length}`)
  console.log(`  usage: ${JSON.stringify(usage)}`)
  if (usage) {
    console.log(`  ✅ prompt_tokens=${usage.prompt_tokens} completion_tokens=${usage.completion_tokens} total_tokens=${usage.total_tokens}`)
  } else {
    console.log(`  ❌ 没有 usage 数据!`)
  }
}

testWithTools().catch(e => console.error('错误:', e.message))

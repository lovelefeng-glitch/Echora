// 复制 OpenAIProvider 的流式处理逻辑，验证 usage 事件是否正确触发
const BASE_URL = 'https://token-plan-cn.xiaomimimo.com/v1'
const API_KEY = 'tp-cibbkyvpiycatzi08g6k0zni8im97eojebobcio4lbqutf9a'

// 复制 OpenAIProvider._handleStreamChunk 的逻辑
function handleStreamChunk(chunk) {
  const results = []
  const choices = chunk.choices

  if (chunk.usage) {
    const usage = chunk.usage
    results.push({
      type: 'usage',
      usage: {
        promptTokens: usage.prompt_tokens || 0,
        completionTokens: usage.completion_tokens || 0,
        totalTokens: usage.total_tokens || 0
      }
    })
  }

  if (!choices?.length) return results

  const choice = choices[0]
  const finishReason = choice.finish_reason

  if (choice.delta?.content) {
    results.push({ type: 'token', content: choice.delta.content })
  }

  // 旧代码会在这里再发一次 usage（已修复移除）
  // if (finishReason && chunk.usage) { results.push({ type: 'usage', ... }) }

  if (finishReason) {
    results.push({ type: 'done', finishReason })
  }

  return results
}

// 复制 OpenAIProvider._streamRequest 的逻辑
async function streamRequest(messages, label) {
  const body = {
    model: 'mimo-v2.5',
    messages,
    stream: true,
    stream_options: { include_usage: true },
    temperature: 0.7,
    max_tokens: 80
  }

  const response = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${API_KEY}` },
    body: JSON.stringify(body)
  })

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let chunkCount = 0
  const usageEvents = []
  let content = ''

  // 模拟 AgentLoop 的 _totalUsage 累加
  let totalUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || !trimmed.startsWith('data: ')) continue
      const data = trimmed.slice(6)
      if (data === '[DONE]') continue

      try {
        const parsed = JSON.parse(data)
        chunkCount++
        const events = handleStreamChunk(parsed)

        for (const event of events) {
          if (event.type === 'usage') {
            usageEvents.push(event.usage)
            totalUsage.promptTokens += event.usage.promptTokens
            totalUsage.completionTokens += event.usage.completionTokens
            totalUsage.totalTokens += event.usage.totalTokens
          }
          if (event.type === 'token') {
            content += event.content
          }
        }
      } catch {}
    }
  }

  console.log(`  ${label}:`)
  console.log(`    chunks: ${chunkCount}, content: "${content.trim()}"`)
  console.log(`    usage 事件数: ${usageEvents.length}`)
  if (usageEvents.length > 0) {
    console.log(`    最后 usage: ${JSON.stringify(usageEvents[usageEvents.length - 1])}`)
  }
  console.log(`    累加 totalUsage: ${JSON.stringify(totalUsage)}`)
  console.log(`    ✅ prompt=${totalUsage.promptTokens} completion=${totalUsage.completionTokens} total=${totalUsage.totalTokens}`)
}

async function main() {
  console.log('=== OpenAI Provider 逻辑模拟测试 ===')
  console.log('测试: 每次请求后 usage 事件是否正确触发并累加\n')

  for (let i = 1; i <= 5; i++) {
    await streamRequest([{ role: 'user', content: `说数字${i}` }], `第 ${i} 次`)
    console.log()
  }
}

main()

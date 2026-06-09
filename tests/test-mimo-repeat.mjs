// 测试 mimo API 是否每次流式请求都返回 usage
const BASE_URL = 'https://token-plan-cn.xiaomimimo.com/v1'
const API_KEY = 'tp-cibbkyvpiycatzi08g6k0zni8im97eojebobcio4lbqutf9a'

async function testOnce(index, messages) {
  const body = {
    model: 'mimo-v2.5',
    messages,
    stream: true,
    stream_options: { include_usage: true },
    temperature: 0.7,
    max_tokens: 100
  }

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
        if (p.usage) usage = p.usage
        if (p.choices?.[0]?.delta?.content) content += p.choices[0].delta.content
      } catch {}
    }
  }
  return { index, usage, contentLen: content.length }
}

async function main() {
  console.log('=== mimo 连续 3 次流式请求 usage 测试 ===\n')

  const messages = [{ role: 'user', content: '说一个字：好' }]

  for (let i = 1; i <= 3; i++) {
    try {
      const result = await testOnce(i, messages)
      console.log(`第 ${i} 次: usage=${JSON.stringify(result.usage)} contentLen=${result.contentLen}`)
    } catch (e) {
      console.log(`第 ${i} 次: 错误 ${e.message}`)
    }
  }

  // 测试带历史的请求（模拟多轮对话）
  console.log('\n=== 带历史的多轮对话测试 ===\n')
  const history = [
    { role: 'user', content: '你好' },
    { role: 'assistant', content: '你好！有什么可以帮助你的吗？' },
    { role: 'user', content: '今天天气怎么样？' },
    { role: 'assistant', content: '我无法获取实时天气信息，建议你查看天气预报。' },
    { role: 'user', content: '谢谢' }
  ]
  try {
    const result = await testOnce(4, history)
    console.log(`多轮: usage=${JSON.stringify(result.usage)} contentLen=${result.contentLen}`)
  } catch (e) {
    console.log(`多轮: 错误 ${e.message}`)
  }
}

main()

/**
 * 测试 mimo API 流式 usage 返回
 * 验证 stream_options: { include_usage: true } 是否生效
 */

const BASE_URL = 'https://token-plan-cn.xiaomimimo.com/v1'
const API_KEY = 'tp-cibbkyvpiycatzi08g6k0zni8im97eojebobcio4lbqutf9a'
const MODEL = 'mimo-v2.5'

async function testStreamUsage() {
  console.log('=== mimo 流式 usage 测试 ===')
  console.log(`模型: ${MODEL}`)
  console.log(`baseUrl: ${BASE_URL}`)
  console.log(`stream_options: { include_usage: true }`)
  console.log('')

  const body = {
    model: MODEL,
    messages: [
      { role: 'user', content: '你好，请用一句话介绍你自己。' }
    ],
    stream: true,
    stream_options: { include_usage: true },
    temperature: 0.7,
    max_tokens: 100
  }

  try {
    const response = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`
      },
      body: JSON.stringify(body)
    })

    if (!response.ok) {
      console.error(`请求失败: ${response.status} ${response.statusText}`)
      const errorText = await response.text()
      console.error('错误详情:', errorText)
      return
    }

    console.log(`响应状态: ${response.status}`)
    console.log('--- 流式数据块 ---')

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let chunkCount = 0
    let hasUsage = false
    let usageData = null
    let lastChunks = []

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
        if (data === '[DONE]') {
          console.log('\n[DONE] 信号收到')
          continue
        }

        try {
          const parsed = JSON.parse(data)
          chunkCount++

          // 保存最后 3 个 chunk 用于分析
          lastChunks.push(parsed)
          if (lastChunks.length > 3) lastChunks.shift()

          // 检查是否有 usage
          if (parsed.usage) {
            hasUsage = true
            usageData = parsed.usage
            console.log(`\n✅ 第 ${chunkCount} 个 chunk 包含 usage:`)
            console.log(JSON.stringify(parsed.usage, null, 2))
          }

          // 打印每个 chunk 的关键信息
          const choice = parsed.choices?.[0]
          const delta = choice?.delta
          const finishReason = choice?.finish_reason

          if (delta?.content) {
            process.stdout.write(delta.content)
          }

          if (finishReason) {
            console.log(`\n[finish_reason: ${finishReason}]`)
          }

          // 打印 choices 为空的 chunk（通常是 usage chunk）
          if (!parsed.choices || parsed.choices.length === 0) {
            console.log(`\n📦 第 ${chunkCount} 个 chunk (choices 为空):`)
            console.log(JSON.stringify(parsed, null, 2))
          }

        } catch (e) {
          console.warn(`解析失败: ${data.substring(0, 100)}`)
        }
      }
    }

    console.log('\n=== 测试结果 ===')
    console.log(`总 chunk 数: ${chunkCount}`)
    console.log(`是否返回 usage: ${hasUsage ? '✅ 是' : '❌ 否'}`)

    if (hasUsage) {
      console.log('\nusage 数据详情:')
      console.log(JSON.stringify(usageData, null, 2))
      console.log('\n字段说明:')
      console.log(`  prompt_tokens (输入 token): ${usageData.prompt_tokens ?? '无'}`)
      console.log(`  completion_tokens (输出 token): ${usageData.completion_tokens ?? '无'}`)
      console.log(`  total_tokens (总 token): ${usageData.total_tokens ?? '无'}`)

      // 检查是否有额外字段
      const standardFields = ['prompt_tokens', 'completion_tokens', 'total_tokens']
      const extraFields = Object.keys(usageData).filter(k => !standardFields.includes(k))
      if (extraFields.length > 0) {
        console.log(`\n⚠️ 额外字段: ${extraFields.join(', ')}`)
        for (const field of extraFields) {
          console.log(`  ${field}: ${JSON.stringify(usageData[field])}`)
        }
      } else {
        console.log('\n✅ 只有标准字段，无额外字段')
      }
    }

    console.log('\n最后 3 个 chunk 的完整数据:')
    for (let i = 0; i < lastChunks.length; i++) {
      console.log(`\n--- Chunk ${chunkCount - lastChunks.length + i + 1} ---`)
      console.log(JSON.stringify(lastChunks[i], null, 2))
    }

  } catch (error) {
    console.error('请求错误:', error.message)
  }
}

testStreamUsage()

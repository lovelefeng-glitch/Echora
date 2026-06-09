// 用 OpenAIProvider 类直接测试，模拟 Echora Agent 的真实请求路径
import { createOpenAIProvider } from './src/main/llm/openai-provider.js'

const provider = createOpenAIProvider({
  id: 'test-mimo',
  name: 'mimo',
  baseUrl: 'https://token-plan-cn.xiaomimimo.com/v1',
  apiKey: 'tp-cibbkyvpiycatzi08g6k0zni8im97eojebobcio4lbqutf9a',
  models: ['mimo-v2.5'],
  defaultModel: 'mimo-v2.5'
})

async function testStream(index, messages) {
  return new Promise((resolve, reject) => {
    const events = []
    const controller = provider.chatStream(
      { model: 'mimo-v2.5', messages, stream: true, temperature: 0.7, max_tokens: 50 },
      (event) => {
        events.push({ ...event })
        if (event.type === 'usage') {
          console.log(`  [${index}] usage 事件:`, JSON.stringify(event.usage))
        }
        if (event.type === 'done') {
          const usageEvents = events.filter(e => e.type === 'usage')
          console.log(`  [${index}] done. 总事件数: ${events.length}, usage 事件数: ${usageEvents.length}`)
          if (usageEvents.length > 0) {
            console.log(`  [${index}] 最后 usage:`, JSON.stringify(usageEvents[usageEvents.length - 1].usage))
          } else {
            console.log(`  [${index}] ⚠️ 没有 usage 事件!`)
          }
          resolve(events)
        }
        if (event.type === 'error') {
          console.log(`  [${index}] 错误:`, event.error)
          reject(new Error(event.error))
        }
      }
    )
  })
}

async function main() {
  console.log('=== OpenAIProvider 流式测试 (模拟 Echora Agent 路径) ===\n')

  // 测试 1: 简单消息
  console.log('测试 1: 简单消息')
  await testStream(1, [{ role: 'user', content: '说一个字：好' }])

  // 测试 2: 带历史的多轮对话
  console.log('\n测试 2: 多轮对话')
  await testStream(2, [
    { role: 'user', content: '你好' },
    { role: 'assistant', content: '你好！' },
    { role: 'user', content: '1+1等于几？' }
  ])

  // 测试 3: 连续快速请求
  console.log('\n测试 3: 连续快速请求')
  for (let i = 3; i <= 5; i++) {
    console.log(`\n  --- 第 ${i - 2} 次 ---`)
    await testStream(i, [{ role: 'user', content: `数字${i}` }])
  }
}

main().catch(e => console.error('测试失败:', e.message))

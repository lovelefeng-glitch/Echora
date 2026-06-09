#!/usr/bin/env node

/**
 * 快速测试脚本：验证 Claude-Collab MCP 服务器
 *
 * 使用方法：
 * 1. 确保 Hermes/OpenClaw 正在运行
 * 2. 运行: node test-quick.js
 */

const axios = require('axios')

const HERMES_PORT = 8083
const OPENCLAW_PORT = 18789
const HERMES_API_KEY = 'echora-shared-secret'

async function testHermes() {
  console.log('🔍 测试 Hermes 连接...')
  try {
    const startTime = Date.now()
    const response = await axios.post(
      `http://127.0.0.1:${HERMES_PORT}/v1/chat/completions`,
      {
        messages: [{ role: 'user', content: '你好，请回复"连接成功"' }],
        stream: false,
        max_tokens: 50
      },
      {
        headers: {
          'Authorization': `Bearer ${HERMES_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      }
    )
    const latency = Date.now() - startTime
    console.log(`✅ Hermes 连接成功 (延迟: ${latency}ms)`)
    console.log(`   响应: ${response.data.choices[0]?.message?.content}`)
    return true
  } catch (error) {
    console.log(`❌ Hermes 连接失败: ${error.message}`)
    return false
  }
}

async function testOpenClaw() {
  console.log('\n🔍 测试 OpenClaw 连接...')
  try {
    const startTime = Date.now()
    const response = await axios.post(
      `http://127.0.0.1:${OPENCLAW_PORT}/v1/chat/completions`,
      {
        messages: [{ role: 'user', content: '你好，请回复"连接成功"' }],
        stream: false,
        max_tokens: 50
      },
      {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 10000
      }
    )
    const latency = Date.now() - startTime
    console.log(`✅ OpenClaw 连接成功 (延迟: ${latency}ms)`)
    console.log(`   响应: ${response.data.choices[0]?.message?.content}`)
    return true
  } catch (error) {
    console.log(`❌ OpenClaw 连接失败: ${error.message}`)
    return false
  }
}

async function main() {
  console.log('========================================')
  console.log('Claude-Collab 连接测试')
  console.log('========================================\n')

  const hermesOk = await testHermes()
  const openclawOk = await testOpenClaw()

  console.log('\n========================================')
  console.log('测试结果')
  console.log('========================================')
  console.log(`Hermes:   ${hermesOk ? '✅ 正常' : '❌ 离线'}`)
  console.log(`OpenClaw: ${openclawOk ? '✅ 正常' : '❌ 离线'}`)
  console.log('')

  if (hermesOk || openclawOk) {
    console.log('💡 至少一个 AI 可用，可以开始协作开发')
  } else {
    console.log('⚠️  两个 AI 都离线，请先启动 Hermes 或 OpenClaw')
  }
}

main().catch(console.error)

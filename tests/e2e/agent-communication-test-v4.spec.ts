/**
 * Echora Agent通讯测试 - V4 直接调试
 * 直接检查store状态和IPC通信
 */

import { test, _electron as electron, type Page, expect } from '@playwright/test'
import { join } from 'path'

const APP_PATH = join(__dirname, '..', '..')

async function waitForAppReady(page: Page, timeout = 25000) {
  await page.locator('#root').waitFor({ state: 'visible', timeout })
}

test.describe.serial('Echora Agent Communication Test V4', () => {
  let app: Awaited<ReturnType<typeof electron.launch>>
  let window: Page

  test.beforeAll(async () => {
    await new Promise((r) => setTimeout(r, 2000))
    app = await electron.launch({
      args: [APP_PATH, '--no-sandbox', '--disable-gpu']
    })
    window = await app.firstWindow()
    await waitForAppReady(window)
  })

  test.afterAll(async () => {
    if (app) {
      await app.close()
    }
  })

  test('Debug store state and message content', async () => {
    await window.waitForTimeout(3000)

    // 进入Echora Agent
    const echoraAgent = window.locator('[class*="agentItem"]').filter({ hasText: 'Echora Agent' }).first()
    let retries = 0
    while (await echoraAgent.count() === 0 && retries < 10) {
      await window.waitForTimeout(1000)
      retries++
    }
    if (await echoraAgent.count() === 0) {
      console.log('Echora Agent not found')
      return
    }
    await echoraAgent.click()
    await window.waitForTimeout(1000)

    // 检查当前store状态
    const storeState = await window.evaluate(() => {
      const store = (window as any).__ZUSTAND_STORE__
      if (!store) return null
      const state = store.getState()
      return {
        activeAgentKey: state.activeAgentKey,
        activeConversationId: state.activeConversationId,
        conversationsKeys: Object.keys(state.conversations || {}),
      }
    })
    console.log('Store state:', JSON.stringify(storeState))

    // 检查当前会话的消息
    const convState = await window.evaluate(() => {
      const store = (window as any).__ZUSTAND_STORE__
      if (!store) return null
      const state = store.getState()
      const agentKey = state.activeAgentKey
      const convId = state.activeConversationId[agentKey]
      if (!agentKey || !convId) return { error: 'no active conv', agentKey, convId }
      const conv = state.conversations[agentKey]?.[convId]
      if (!conv) return { error: 'no conv found' }
      return {
        convId,
        messageCount: conv.messages.length,
        messages: conv.messages.map((m: any) => ({
          id: m.id,
          role: m.role,
          content: m.content?.substring(0, 100),
          isStreaming: m.isStreaming,
          streamPhase: m.streamPhase
        }))
      }
    })
    console.log('Conversation state:', JSON.stringify(convState, null, 2))

    // 发送消息
    const textarea = window.locator('textarea')
    if (await textarea.isDisabled()) {
      console.log('Input is disabled')
      return
    }

    const testMessage = '你好'
    await textarea.fill(testMessage)
    await textarea.press('Enter')
    console.log('Message sent:', testMessage)

    // 等待并检查store状态
    for (let i = 0; i < 10; i++) {
      await window.waitForTimeout(2000)

      const msgState = await window.evaluate(() => {
        const store = (window as any).__ZUSTAND_STORE__
        if (!store) return null
        const state = store.getState()
        const agentKey = state.activeAgentKey
        const convId = state.activeConversationId[agentKey]
        if (!agentKey || !convId) return null
        const conv = state.conversations[agentKey]?.[convId]
        if (!conv) return null
        const lastMsg = conv.messages[conv.messages.length - 1]
        return {
          messageCount: conv.messages.length,
          lastRole: lastMsg?.role,
          lastContent: lastMsg?.content?.substring(0, 200),
          lastIsStreaming: lastMsg?.isStreaming,
          lastStreamPhase: lastMsg?.streamPhase,
          activeStreams: Object.keys(state.activeStreams || {}).length
        }
      })
      console.log(`\n--- Iteration ${i} ---`)
      console.log('Msg state:', JSON.stringify(msgState))
      
      if (msgState?.lastContent && msgState.lastContent.length > 5 && msgState.lastRole === 'assistant') {
        console.log('SUCCESS: Got content!')
        return
      }
    }

    // 截图
    await window.screenshot({ path: 'test-results/v4-debug.png', fullPage: true })
    console.log('\nFAILED: No content received')
  })
})

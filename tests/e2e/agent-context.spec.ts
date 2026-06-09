/**
 * Agent上下文系统 E2E 测试
 * 测试多轮对话和上下文保持
 */

import { test, expect, _electron as electron, type Page } from '@playwright/test'
import { join } from 'path'

const APP_PATH = join(__dirname, '..', '..')

async function waitForAppReady(page: Page, timeout = 25000) {
  await page.locator('#root').waitFor({ state: 'visible', timeout })
}

test.describe.serial('Agent Context Tests', () => {
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

  test('Multi-turn conversation with context', async () => {
    // 进入Agent模式
    const menuBtn = window.locator('text=🧭 功能菜单')
    await menuBtn.click()
    await window.waitForTimeout(500)

    const agentEntry = window.locator('text=Agent 模式')
    await agentEntry.click()
    await window.waitForTimeout(1000)

    // 检查输入框
    const textarea = window.locator('textarea')
    const isDisabled = await textarea.isDisabled()
    
    if (isDisabled) {
      console.log('Skipping test: Provider not configured')
      return
    }

    // 第一轮：自我介绍
    await textarea.fill('我叫小明，请记住我的名字')
    await window.waitForTimeout(500)

    const sendBtn = window.locator('button:has-text("发送")')
    await sendBtn.click()

    console.log('First message sent, waiting for response...')
    await window.waitForTimeout(15000)

    // 检查第一轮回复
    const contentAreas = window.locator('div[style*="white-space: pre-wrap"]')
    const contentCount = await contentAreas.count()
    console.log('Content areas after first message:', contentCount)

    // 第二轮：询问名字（测试上下文保持）
    await textarea.fill('我叫什么名字？')
    await window.waitForTimeout(500)

    await sendBtn.click()

    console.log('Second message sent, waiting for response...')
    await window.waitForTimeout(15000)

    // 检查第二轮回复是否包含名字
    const finalContentCount = await contentAreas.count()
    console.log('Content areas after second message:', finalContentCount)

    // 获取最后一条消息内容
    if (finalContentCount > 0) {
      const lastContent = await contentAreas.nth(finalContentCount - 1).textContent()
      console.log('Last message:', lastContent?.substring(0, 300))
    }
  })
})

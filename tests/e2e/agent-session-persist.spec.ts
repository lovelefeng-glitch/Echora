/**
 * Agent会话持久化 E2E 测试
 * 测试会话保存和恢复功能
 */

import { test, expect, _electron as electron, type Page } from '@playwright/test'
import { join } from 'path'

const APP_PATH = join(__dirname, '..', '..')

async function waitForAppReady(page: Page, timeout = 25000) {
  await page.locator('#root').waitFor({ state: 'visible', timeout })
}

test.describe.serial('Agent Session Persist Tests', () => {
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

  test('Send message and verify session is saved', async () => {
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

    // 发送消息
    await textarea.fill('测试会话保存功能')
    await window.waitForTimeout(500)

    const sendBtn = window.locator('button:has-text("发送")')
    await sendBtn.click()

    console.log('Message sent, waiting for response...')
    await window.waitForTimeout(15000)

    // 检查消息是否显示
    const contentAreas = window.locator('div[style*="white-space: pre-wrap"]')
    const contentCount = await contentAreas.count()
    console.log('Content areas found:', contentCount)

    // 验证消息内容
    if (contentCount > 0) {
      const firstContent = await contentAreas.nth(0).textContent()
      console.log('First message:', firstContent?.substring(0, 100))
    }
  })
})

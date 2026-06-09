/**
 * Agent 模式对话功能调试测试
 * 使用Playwright Trace捕获详细日志
 */

import { test, expect, _electron as electron, type Page } from '@playwright/test'
import { join } from 'path'

const APP_PATH = join(__dirname, '..', '..')

/** 等待应用完全加载 */
async function waitForAppReady(page: Page, timeout = 25000) {
  await page.locator('#root').waitFor({ state: 'visible', timeout })
}

/**
 * Agent 对话功能调试测试
 */
test.describe.serial('Agent Chat Debug Tests', () => {
  let app: Awaited<ReturnType<typeof electron.launch>>
  let window: Page
  let consoleLogs: string[] = []
  let pageErrors: string[] = []

  test.beforeAll(async () => {
    await new Promise((r) => setTimeout(r, 2000))
    app = await electron.launch({
      args: [APP_PATH, '--no-sandbox', '--disable-gpu']
    })
    window = await app.firstWindow()

    // 捕获所有控制台日志
    window.on('console', msg => {
      const text = `[${msg.type()}] ${msg.text()}`
      consoleLogs.push(text)
    })

    // 捕获页面错误
    window.on('pageerror', error => {
      pageErrors.push(error.message)
    })

    await waitForAppReady(window)
  })

  test.afterAll(async () => {
    // 输出所有日志
    console.log('\n=== All Console Logs ===')
    consoleLogs.forEach(log => console.log(log))
    console.log('\n=== Page Errors ===')
    pageErrors.forEach(err => console.log(err))
    console.log('=== End Logs ===\n')

    if (app) {
      await app.close()
    }
  })

  test('Send message and trace response', async () => {
    // 打开功能菜单
    const menuBtn = window.locator('text=🧭 功能菜单')
    await menuBtn.click()
    await window.waitForTimeout(500)

    // 点击 Agent 模式
    const agentEntry = window.locator('text=Agent 模式')
    await agentEntry.click()
    await window.waitForTimeout(1000)

    // 检查输入框
    const textarea = window.locator('textarea')
    const isDisabled = await textarea.isDisabled()
    
    if (isDisabled) {
      console.log('Input is disabled - Provider not configured')
      return
    }

    // 输入测试消息
    await textarea.fill('你好')
    await window.waitForTimeout(500)

    // 点击发送按钮
    const sendBtn = window.locator('button:has-text("发送")')
    await sendBtn.click()

    console.log('Message sent, waiting for response...')

    // 等待更长时间让LLM响应
    await window.waitForTimeout(20000)

    // 检查消息内容
    const contentAreas = window.locator('div[style*="white-space: pre-wrap"]')
    const contentCount = await contentAreas.count()
    
    console.log('Content areas found:', contentCount)

    // 获取所有消息内容
    for (let i = 0; i < Math.min(contentCount, 10); i++) {
      const content = await contentAreas.nth(i).textContent()
      console.log(`Message ${i}:`, content?.substring(0, 200) || 'empty')
    }

    // 检查是否有错误消息
    const errorMessages = window.locator('text=错误')
    const errorCount = await errorMessages.count()
    console.log('Error messages found:', errorCount)
  })
})

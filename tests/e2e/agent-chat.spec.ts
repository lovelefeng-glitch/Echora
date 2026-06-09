/**
 * Agent 模式对话功能 E2E 测试
 * 测试实际的对话发送和接收功能，并捕获控制台日志
 */

import { test, expect, _electron as electron, type Page } from '@playwright/test'
import { join } from 'path'

const APP_PATH = join(__dirname, '..', '..')

/** 等待应用完全加载 */
async function waitForAppReady(page: Page, timeout = 25000) {
  await page.locator('#root').waitFor({ state: 'visible', timeout })
}

/**
 * Agent 对话功能测试
 */
test.describe.serial('Agent Chat Tests', () => {
  let app: Awaited<ReturnType<typeof electron.launch>>
  let window: Page
  let consoleLogs: string[] = []

  test.beforeAll(async () => {
    await new Promise((r) => setTimeout(r, 2000))
    app = await electron.launch({
      args: [APP_PATH, '--no-sandbox', '--disable-gpu']
    })
    window = await app.firstWindow()

    // 捕获控制台日志
    window.on('console', msg => {
      const text = msg.text()
      consoleLogs.push(text)
      // 打印重要日志
      if (text.includes('Error') || text.includes('error') || text.includes('Agent') || text.includes('Provider') || text.includes('token')) {
        console.log(`[CONSOLE] ${text}`)
      }
    })

    // 捕获页面错误
    window.on('pageerror', error => {
      console.log(`[PAGE ERROR] ${error.message}`)
    })

    await waitForAppReady(window)
  })

  test.afterAll(async () => {
    // 输出所有日志
    console.log('\n=== All Console Logs ===')
    consoleLogs.forEach(log => console.log(log))
    console.log('=== End Logs ===\n')

    if (app) {
      await app.close()
    }
  })

  test('Navigate to Agent mode', async () => {
    // 打开功能菜单
    const menuBtn = window.locator('text=🧭 功能菜单')
    await menuBtn.click()
    await window.waitForTimeout(500)

    // 点击 Agent 模式
    const agentEntry = window.locator('text=Agent 模式')
    await agentEntry.click()
    await window.waitForTimeout(1000)

    // 验证 Agent 视图已加载
    const agentTitle = window.locator('text=Agent 模式')
    await expect(agentTitle.first()).toBeVisible()
  })

  test('Send message and capture response', async () => {
    // 检查输入框是否可用
    const textarea = window.locator('textarea')
    const isDisabled = await textarea.isDisabled()
    
    if (isDisabled) {
      console.log('Skipping test: Provider not configured or input disabled')
      return
    }

    // 输入测试消息
    await textarea.fill('你好，请介绍一下你自己')
    await window.waitForTimeout(500)

    // 点击发送按钮
    const sendBtn = window.locator('button:has-text("发送")')
    await sendBtn.click()

    console.log('Message sent, waiting for response...')

    // 等待响应
    await window.waitForTimeout(15000)

    // 检查消息内容
    const contentAreas = window.locator('div[style*="white-space: pre-wrap"]')
    const contentCount = await contentAreas.count()
    
    console.log('Content areas found:', contentCount)

    // 获取所有消息内容
    for (let i = 0; i < Math.min(contentCount, 5); i++) {
      const content = await contentAreas.nth(i).textContent()
      console.log(`Message ${i}:`, content?.substring(0, 100) || 'empty')
    }
  })

  test('Check for API errors in logs', async () => {
    // 检查日志中是否有API错误
    const errorLogs = consoleLogs.filter(log => 
      log.includes('Error') || 
      log.includes('error') || 
      log.includes('fail') ||
      log.includes('401') ||
      log.includes('403') ||
      log.includes('500')
    )

    console.log('Error logs found:', errorLogs.length)
    errorLogs.forEach(log => console.log('  -', log))

    // 如果有API错误，记录下来
    const apiErrors = consoleLogs.filter(log => 
      log.includes('API') && (log.includes('error') || log.includes('Error'))
    )
    console.log('API errors:', apiErrors.length)
  })
})

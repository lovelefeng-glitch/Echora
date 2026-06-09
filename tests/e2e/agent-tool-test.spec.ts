/**
 * Agent工具调用测试
 * 测试模型是否支持tool calling
 */

import { test, expect, _electron as electron, type Page } from '@playwright/test'
import { join } from 'path'

const APP_PATH = join(__dirname, '..', '..')

async function waitForAppReady(page: Page, timeout = 25000) {
  await page.locator('#root').waitFor({ state: 'visible', timeout })
}

test.describe.serial('Agent Tool Test', () => {
  let app: Awaited<ReturnType<typeof electron.launch>>
  let window: Page
  let consoleLogs: string[] = []

  test.beforeAll(async () => {
    await new Promise((r) => setTimeout(r, 2000))
    app = await electron.launch({
      args: [APP_PATH, '--no-sandbox', '--disable-gpu']
    })
    window = await app.firstWindow()

    window.on('console', msg => {
      const text = msg.text()
      consoleLogs.push(text)
      if (text.includes('Agent') || text.includes('tool') || text.includes('Tool') || text.includes('error') || text.includes('Error')) {
        console.log(`[CONSOLE] ${text}`)
      }
    })

    await waitForAppReady(window)
  })

  test.afterAll(async () => {
    console.log('\n=== All Console Logs ===')
    consoleLogs.forEach(log => console.log(log))
    console.log('=== End Logs ===\n')

    if (app) {
      await app.close()
    }
  })

  test('Send file creation request and check tool calling', async () => {
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

    // 发送文件创建请求
    await textarea.fill('请在桌面上创建一个文件夹"Echora"，里面创建一个hello.txt文件，内容写"Echora"')
    await window.waitForTimeout(500)

    const sendBtn = window.locator('button:has-text("发送")')
    await sendBtn.click()

    console.log('Message sent, waiting for response...')
    await window.waitForTimeout(30000)

    // 检查是否有执行步骤
    const steps = window.locator('text=/\\[thought\\]|\\[action\\]|\\[observation\\]/')
    const stepCount = await steps.count()
    console.log('Execution steps found:', stepCount)

    // 检查是否有工具调用
    const toolCalls = window.locator('text=/file_write|file_read|powershell_execute/')
    const toolCallCount = await toolCalls.count()
    console.log('Tool calls found:', toolCallCount)

    // 检查消息内容
    const contentAreas = window.locator('div[style*="white-space: pre-wrap"]')
    const contentCount = await contentAreas.count()
    
    for (let i = 0; i < Math.min(contentCount, 5); i++) {
      const content = await contentAreas.nth(i).textContent()
      console.log(`Message ${i}:`, content?.substring(0, 300) || 'empty')
    }
  })
})

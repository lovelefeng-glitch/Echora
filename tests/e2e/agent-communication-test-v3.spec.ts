/**
 * Echora Agent通讯测试 - V3 调试版
 * 使用截图和详细日志调试通讯问题
 */

import { test, _electron as electron, type Page, expect } from '@playwright/test'
import { join } from 'path'

const APP_PATH = join(__dirname, '..', '..')

async function waitForAppReady(page: Page, timeout = 25000) {
  await page.locator('#root').waitFor({ state: 'visible', timeout })
}

test.describe.serial('Echora Agent Communication Test V3', () => {
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

  test('Send message and receive actual content from Echora Agent', async () => {
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

    // 检查输入框
    const textarea = window.locator('textarea')
    if (await textarea.isDisabled()) {
      console.log('Input is disabled')
      return
    }

    // 发送消息
    const testMessage = '你好，请回复"通讯成功"'
    await textarea.fill(testMessage)
    await textarea.press('Enter')
    console.log('Message sent:', testMessage)

    // 等待响应（最多30秒）
    const startTime = Date.now()
    const timeout = 30000
    let responseFound = false

    while (Date.now() - startTime < timeout) {
      await window.waitForTimeout(2000)

      // 获取页面所有文本
      const allText = await window.locator('body').textContent()
      
      // 查找assistant消息 - 它们应该在messageAssistant类的div中
      const assistantMessages = window.locator('[class*="messageAssistant"]')
      const count = await assistantMessages.count()
      console.log(`Assistant messages: ${count}`)

      if (count > 0) {
        const lastAssistant = assistantMessages.last()
        const text = await lastAssistant.textContent()
        console.log('Last assistant text:', JSON.stringify(text?.substring(0, 300)))
        
        // 更严格的检查：
        // 1. 必须有实际文本（不只是emoji和时间戳）
        // 2. 至少20个字符
        // 3. 不只是emoji+时间戳格式
        if (text && text.trim().length > 20) {
          // 排除只包含emoji和时间戳的情况
          const cleaned = text.replace(/[🤖👤\d:：\s]/g, '').trim()
          if (cleaned.length > 5) {
            responseFound = true
            console.log('SUCCESS: Got actual response content:', text.substring(0, 200))
            break
          }
        }
      }
    }

    // 截图
    await window.screenshot({ path: 'test-results/v3-final.png', fullPage: true })

    if (!responseFound) {
      console.log('FAILED: No actual response content received')
      
      // 打印所有assistant消息的内容
      const assistantMessages = window.locator('[class*="messageAssistant"]')
      const count = await assistantMessages.count()
      console.log(`\nAll ${count} assistant messages:`)
      for (let i = 0; i < count; i++) {
        const msg = assistantMessages.nth(i)
        const text = await msg.textContent()
        console.log(`  [${i}] ${JSON.stringify(text?.substring(0, 100))}`)
      }
    }

    expect(responseFound).toBeTruthy()
  })
})

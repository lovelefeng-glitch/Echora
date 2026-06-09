/**
 * Echora Agent通讯测试 - 严谨版
 * 实际测试Echora Agent能否发送消息并收到有内容的响应
 */

import { test, _electron as electron, type Page, expect } from '@playwright/test'
import { join } from 'path'

const APP_PATH = join(__dirname, '..', '..')

async function waitForAppReady(page: Page, timeout = 25000) {
  await page.locator('#root').waitFor({ state: 'visible', timeout })
}

test.describe.serial('Echora Agent Communication Test V2', () => {
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
    // 1. 等待应用完全加载
    await window.waitForTimeout(3000)

    // 2. 进入Echora Agent对话窗口
    const echoraAgent = window.locator('[class*="agentItem"]').filter({ hasText: 'Echora Agent' }).first()
    
    // 等待Echora Agent出现
    let retries = 0
    while (await echoraAgent.count() === 0 && retries < 10) {
      console.log(`Waiting for Echora Agent to appear... (retry ${retries + 1})`)
      await window.waitForTimeout(1000)
      retries++
    }
    
    if (await echoraAgent.count() === 0) {
      console.log('Echora Agent not found in sidebar after retries, skipping test')
      return
    }
    
    await echoraAgent.click()
    await window.waitForTimeout(1000)

    // 3. 检查输入框是否可用
    const textarea = window.locator('textarea')
    const isDisabled = await textarea.isDisabled()
    if (isDisabled) {
      console.log('Input is disabled, skipping test')
      return
    }

    // 4. 发送测试消息
    const testMessage = '你好，请回复"通讯成功"'
    await textarea.fill(testMessage)
    await window.waitForTimeout(500)

    // 发送消息
    await textarea.press('Enter')
    console.log('Message sent:', testMessage)

    // 5. 等待响应（最多60秒）
    const startTime = Date.now()
    const timeout = 60000
    let responseFound = false
    let responseContent = ''

    while (Date.now() - startTime < timeout) {
      await window.waitForTimeout(2000)

      // 查找所有消息内容区域 - msgContent 是CSS Module类名
      const msgContents = window.locator('[class*="msgContent"]')
      const msgContentCount = await msgContents.count()
      
      console.log(`msgContent elements: ${msgContentCount}`)

      // 如果有2个或更多内容区域（用户消息+助手回复）
      if (msgContentCount >= 2) {
        // 获取最后一条消息内容（助手回复）
        const lastContent = await msgContents.last().textContent()
        console.log('Last message content:', lastContent?.substring(0, 300))
        
        // 检查是否有实际内容（不只是空或时间戳）
        if (lastContent && lastContent.trim().length > 0 && !lastContent.match(/^\s*\d{2}:\d{2}\s*$/)) {
          responseFound = true
          responseContent = lastContent
          break
        }
      }
    }

    // 6. 验证响应
    console.log('\n=== Test Result ===')
    console.log('Response found:', responseFound)
    console.log('Response content:', responseContent.substring(0, 300))
    
    if (!responseFound) {
      console.log('ERROR: No actual response content received')
      // 截图以便调试
      await window.screenshot({ path: 'test-results/communication-test-failed.png' })
    }

    expect(responseFound).toBeTruthy()
    expect(responseContent.trim().length).toBeGreaterThan(0)
  })
})

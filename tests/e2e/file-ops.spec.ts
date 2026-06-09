/**
 * 文件操作功能 E2E 测试
 * 测试file_read、file_write、powershell_execute工具
 */

import { test, expect, _electron as electron, type Page } from '@playwright/test'
import { join } from 'path'

const APP_PATH = join(__dirname, '..', '..')

/** 等待应用完全加载 */
async function waitForAppReady(page: Page, timeout = 25000) {
  await page.locator('#root').waitFor({ state: 'visible', timeout })
}

/**
 * 文件操作功能测试
 */
test.describe.serial('File Operations Tests', () => {
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

  test('Navigate to Agent mode', async () => {
    const menuBtn = window.locator('text=🧭 功能菜单')
    await menuBtn.click()
    await window.waitForTimeout(500)

    const agentEntry = window.locator('text=Agent 模式')
    await agentEntry.click()
    await window.waitForTimeout(1000)

    const agentTitle = window.locator('text=Agent 模式')
    await expect(agentTitle.first()).toBeVisible()
  })

  test('Send file creation request', async () => {
    const textarea = window.locator('textarea')
    const isDisabled = await textarea.isDisabled()
    
    if (isDisabled) {
      console.log('Skipping test: Provider not configured')
      return
    }

    // 发送文件创建请求
    await textarea.fill('请在我的桌面上创建一个名为"test_folder"的文件夹，里面创建一个名为"hello.txt"的文件，内容写"Echora"')
    await window.waitForTimeout(500)

    const sendBtn = window.locator('button:has-text("发送")')
    await sendBtn.click()

    console.log('File creation request sent, waiting for response...')
    await window.waitForTimeout(20000)

    // 检查是否有确认对话框
    const confirmDialog = window.locator('text=确认操作')
    const hasConfirm = await confirmDialog.isVisible()
    console.log('Confirm dialog visible:', hasConfirm)

    if (hasConfirm) {
      // 点击确认按钮
      const confirmBtn = window.locator('button:has-text("确认")')
      await confirmBtn.click()
      console.log('Confirmed file operation')
      await window.waitForTimeout(5000)
    }

    // 检查消息内容
    const contentAreas = window.locator('div[style*="white-space: pre-wrap"]')
    const contentCount = await contentAreas.count()
    console.log('Content areas found:', contentCount)

    for (let i = 0; i < Math.min(contentCount, 5); i++) {
      const content = await contentAreas.nth(i).textContent()
      console.log(`Message ${i}:`, content?.substring(0, 200) || 'empty')
    }
  })

  test('Navigate to Agent settings', async () => {
    const menuBtn = window.locator('text=🧭 功能菜单')
    await menuBtn.click()
    await window.waitForTimeout(500)

    const settingsEntry = window.locator('text=系统设置')
    await settingsEntry.click()
    await window.waitForTimeout(1000)

    const agentTab = window.locator('text=🤖 Agent').first()
    await agentTab.click()
    await window.waitForTimeout(1000)

    // 检查白名单配置区
    const whitelistTitle = window.locator('h3:has-text("文件操作白名单")')
    await expect(whitelistTitle).toBeVisible()
    console.log('Whitelist config section visible')
  })
})

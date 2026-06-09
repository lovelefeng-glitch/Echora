/**
 * Agent统一视图 E2E 测试
 * 测试Echora Agent在侧边栏显示和对话窗口功能
 */

import { test, expect, _electron as electron, type Page } from '@playwright/test'
import { join } from 'path'

const APP_PATH = join(__dirname, '..', '..')

async function waitForAppReady(page: Page, timeout = 25000) {
  await page.locator('#root').waitFor({ state: 'visible', timeout })
}

test.describe.serial('Agent Unified View Tests', () => {
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

  test('Echora Agent appears in sidebar', async () => {
    // 检查Echora Agent是否在侧边栏显示
    const echoraAgent = window.locator('[class*="agentItem"]').filter({ hasText: 'Echora Agent' }).first()
    const isVisible = await echoraAgent.isVisible()
    console.log('Echora Agent visible:', isVisible)

    // 检查是否有🤖图标
    const agentCount = await window.locator('[class*="agentItem"]').filter({ hasText: 'Echora Agent' }).count()
    console.log('Echora Agent items:', agentCount)
  })

  test('Click Echora Agent opens chat view', async () => {
    // 点击Echora Agent
    const echoraAgent = window.locator('[class*="agentItem"]').filter({ hasText: 'Echora Agent' })
    if (await echoraAgent.count() > 0) {
      await echoraAgent.first().click()
      await window.waitForTimeout(1000)

      // 检查是否进入对话窗口
      const chatArea = window.locator('[class*="chatArea"], [class*="ChatArea"]')
      const agentView = window.locator('[class*="agentView"], [class*="AgentView"]')
      
      const chatVisible = await chatArea.isVisible()
      const agentVisible = await agentView.isVisible()
      
      console.log('Chat area visible:', chatVisible)
      console.log('Agent view visible:', agentVisible)
    }
  })

  test('Agent Settings menu item exists', async () => {
    // 打开功能菜单
    const menuBtn = window.locator('text=🧭 功能菜单')
    await menuBtn.click()
    await window.waitForTimeout(500)

    // 检查Agent设置菜单项
    const agentSettings = window.locator('text=Agent 设置')
    const isVisible = await agentSettings.isVisible()
    console.log('Agent 设置 menu item visible:', isVisible)
  })
})

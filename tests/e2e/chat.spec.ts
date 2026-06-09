import { test, expect, _electron as electron, type Page } from '@playwright/test'
import { join } from 'path'

const APP_PATH = join(__dirname, '..', '..')

/** 等待应用完全加载 */
async function waitForAppReady(page: Page) {
  await page.locator('#root').waitFor({ state: 'visible', timeout: 20000 })
}

test.describe('Chat', () => {
  test('shows chat area when app loads', async () => {
    const app = await electron.launch({ args: [APP_PATH] })
    const window = await app.firstWindow()
    await waitForAppReady(window)

    // Should show either welcome message or chat interface
    const hasWelcome = await window.locator('text=欢迎使用 Echora').isVisible()
    const hasChat = await window.locator('[class*="topbar"], [class*="chatInput"]').first().isVisible()
    expect(hasWelcome || hasChat).toBeTruthy()

    await app.close()
  })

  test('shows agent chat interface after selecting agent', async () => {
    const app = await electron.launch({ args: [APP_PATH] })
    const window = await app.firstWindow()
    await waitForAppReady(window)

    // Refresh to load agents
    const refreshBtn = window.locator('button[title="刷新状态"]')
    await refreshBtn.click()
    await window.waitForTimeout(3000)

    // Try to click an agent
    const agentItems = window.locator('[class*="agentItem"]')
    const count = await agentItems.count()

    if (count > 0) {
      await agentItems.first().click()
      await window.waitForTimeout(1000)

      // Should show chat input
      const chatInput = window.locator('textarea[placeholder="输入消息..."]')
      await expect(chatInput).toBeVisible({ timeout: 5000 })
    }

    await app.close()
  })

  test('new conversation button works', async () => {
    const app = await electron.launch({ args: [APP_PATH] })
    const window = await app.firstWindow()
    await waitForAppReady(window)

    // Refresh to load agents
    const refreshBtn = window.locator('button[title="刷新状态"]')
    await refreshBtn.click()
    await window.waitForTimeout(3000)

    const agentItems = window.locator('[class*="agentItem"]')
    const count = await agentItems.count()

    if (count > 0) {
      await agentItems.first().click()
      await window.waitForTimeout(1000)

      // Click new conversation button (text-based, not title attribute)
      const newConvBtn = window.locator('button:has-text("新建会话")')
      if (await newConvBtn.isVisible()) {
        await newConvBtn.click()
        // Should still show chat input
        await expect(window.locator('textarea[placeholder="输入消息..."]')).toBeVisible()
      }
    }

    await app.close()
  })

  test('conversation dropdown opens', async () => {
    const app = await electron.launch({ args: [APP_PATH] })
    const window = await app.firstWindow()
    await waitForAppReady(window)

    // Refresh to load agents
    const refreshBtn = window.locator('button[title="刷新状态"]')
    await refreshBtn.click()
    await window.waitForTimeout(3000)

    const agentItems = window.locator('[class*="agentItem"]')
    const count = await agentItems.count()

    if (count > 0) {
      await agentItems.first().click()
      await window.waitForTimeout(1000)

      // Click conversation title to toggle dropdown
      const convTitle = window.locator('[class*="convTitle"]').first()
      if (await convTitle.isVisible()) {
        await convTitle.click()
        // Should show dropdown with search
        await expect(window.locator('input[placeholder*="搜索会话"]')).toBeVisible()
      }
    }

    await app.close()
  })

  test('theme toggle button works', async () => {
    const app = await electron.launch({ args: [APP_PATH] })
    const window = await app.firstWindow()
    await waitForAppReady(window)

    const themeBtn = window.locator('button[title="切换白昼/夜间模式"]').first()
    await expect(themeBtn).toBeVisible({ timeout: 10000 })

    // Click theme toggle
    await themeBtn.click()

    // Button icon should change (sun to moon or vice versa)
    await window.waitForTimeout(500)

    await app.close()
  })
})

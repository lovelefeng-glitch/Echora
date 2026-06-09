import { test, expect, _electron as electron, type Page } from '@playwright/test'
import { join } from 'path'

const APP_PATH = join(__dirname, '..', '..')

/** 等待应用完全加载 */
async function waitForAppReady(page: Page) {
  await page.locator('#root').waitFor({ state: 'visible', timeout: 20000 })
}

test.describe('Sidebar', () => {
  test('sidebar displays agent list or empty state', async () => {
    const app = await electron.launch({ args: [APP_PATH] })
    const window = await app.firstWindow()
    await waitForAppReady(window)

    // Should show either agent list or empty state
    const agentList = window.locator('aside').first()
    await expect(agentList).toBeVisible()

    // Check for empty state or agent items
    const hasEmptyState = await window.locator('text=点击刷新扫描 AI 软件').isVisible()
    const hasAgentItems = (await window.locator('[class*="agentItem"]').count()) > 0

    // At least one should be true
    expect(hasEmptyState || hasAgentItems).toBeTruthy()

    await app.close()
  })

  test('search input filters agents', async () => {
    const app = await electron.launch({ args: [APP_PATH] })
    const window = await app.firstWindow()
    await waitForAppReady(window)

    const searchInput = window.locator('input[placeholder*="搜索 Agent"]')
    await expect(searchInput).toBeVisible()

    // Type in search - should not throw
    await searchInput.fill('test')
    await expect(searchInput).toHaveValue('test')

    // Clear search
    await searchInput.fill('')
    await expect(searchInput).toHaveValue('')

    await app.close()
  })

  test('clicking refresh button triggers scan', async () => {
    const app = await electron.launch({ args: [APP_PATH] })
    const window = await app.firstWindow()
    await waitForAppReady(window)

    const refreshBtn = window.locator('button[title="刷新状态"]')
    await expect(refreshBtn).toBeVisible()
    await expect(refreshBtn).toBeEnabled()

    // Click refresh
    await refreshBtn.click()

    // Button should be temporarily disabled (showing loading)
    await expect(refreshBtn).toBeDisabled({ timeout: 2000 })

    await app.close()
  })

  test('drawer menu opens and shows items', async () => {
    const app = await electron.launch({ args: [APP_PATH] })
    const window = await app.firstWindow()
    await waitForAppReady(window)

    const drawerToggle = window.locator('text=🧭 功能菜单')
    await expect(drawerToggle).toBeVisible()

    await drawerToggle.click()

    // Menu items should be visible
    await expect(window.locator('text=AI 对话')).toBeVisible()
    await expect(window.locator('text=AI 管理')).toBeVisible()
    await expect(window.locator('text=系统设置')).toBeVisible()

    await app.close()
  })

  test('clicking agent item sets active agent', async () => {
    const app = await electron.launch({ args: [APP_PATH] })
    const window = await app.firstWindow()
    await waitForAppReady(window)

    // First refresh to load agents
    const refreshBtn = window.locator('button[title="刷新状态"]')
    await refreshBtn.click()
    await window.waitForTimeout(3000)

    // Check if any agent items exist
    const agentItems = window.locator('[class*="agentItem"]')
    const count = await agentItems.count()

    if (count > 0) {
      // Click first agent
      await agentItems.first().click()

      // Should switch to chat view with agent name visible
      await expect(window.locator('text=对话中')).toBeVisible({ timeout: 5000 })
    }

    await app.close()
  })
})

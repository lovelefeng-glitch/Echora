import { test, expect, _electron as electron, type Page } from '@playwright/test'
import { join } from 'path'

const APP_PATH = join(__dirname, '..', '..')

/** 等待应用完全加载（#root 从 visibility:hidden 变为可见） */
async function waitForAppReady(page: Page) {
  await page.locator('#root').waitFor({ state: 'visible', timeout: 20000 })
}

test.describe('App Launch', () => {
  test('app launches and shows main window', async () => {
    const app = await electron.launch({ args: [APP_PATH] })
    const window = await app.firstWindow()
    await waitForAppReady(window)

    await expect(window).toHaveTitle('Echora 2.0')

    // Sidebar should be visible
    const sidebar = window.locator('aside').first()
    await expect(sidebar).toBeVisible()

    // Logo should be present
    const logo = window.locator('img[alt="Echora"]').first()
    await expect(logo).toBeVisible()

    await app.close()
  })

  test('app shows search input in sidebar', async () => {
    const app = await electron.launch({ args: [APP_PATH] })
    const window = await app.firstWindow()
    await waitForAppReady(window)

    const searchInput = window.locator('input[placeholder*="搜索 Agent"]')
    await expect(searchInput).toBeVisible()

    await app.close()
  })

  test('app shows main content area', async () => {
    const app = await electron.launch({ args: [APP_PATH] })
    const window = await app.firstWindow()
    await waitForAppReady(window)

    // Main content should be visible (either welcome screen or chat with restored agent)
    const mainContent = window.locator('.main-content')
    await expect(mainContent).toBeVisible({ timeout: 10000 })

    // Should have either welcome message or chat interface
    const hasWelcome = await window.locator('text=欢迎使用 Echora').isVisible()
    const hasChat = await window.locator('[class*="topbar"], [class*="chatInput"]').first().isVisible()
    expect(hasWelcome || hasChat).toBeTruthy()

    await app.close()
  })

  test('app has menu drawer', async () => {
    const app = await electron.launch({ args: [APP_PATH] })
    const window = await app.firstWindow()
    await waitForAppReady(window)

    const menuBtn = window.locator('text=🧭 功能菜单')
    await expect(menuBtn).toBeVisible()

    await app.close()
  })
})

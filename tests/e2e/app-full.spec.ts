import { test, expect, _electron as electron, type Page } from '@playwright/test'
import { join } from 'path'

const APP_PATH = join(__dirname, '..', '..')

/** 等待应用完全加载（#root 从 visibility:hidden 变为可见） */
async function waitForAppReady(page: Page, timeout = 25000) {
  await page.locator('#root').waitFor({ state: 'visible', timeout })
}

/**
 * 全功能验证测试 - 串行运行，共享 Electron 实例
 * 检查：布局、侧边栏、搜索、菜单、聊天区、主题切换
 */
test.describe.serial('Echora 2.0 Full Functional Test', () => {
  let app: Awaited<ReturnType<typeof electron.launch>>
  let window: Page

  test('launch app and verify title', async () => {
    // 等待确保前一个 Electron 实例完全退出
    await new Promise((r) => setTimeout(r, 2000))

    app = await electron.launch({
      args: [APP_PATH, '--no-sandbox', '--disable-gpu']
    })
    window = await app.firstWindow()
    await waitForAppReady(window)

    await expect(window).toHaveTitle('Echora 2.0')
  })

  test('main layout structure is correct', async () => {
    await expect(window.locator('.app')).toBeVisible()
    await expect(window.locator('.app-body')).toBeVisible()
    await expect(window.locator('.main-content')).toBeVisible()
  })

  test('sidebar is visible with logo', async () => {
    const sidebar = window.locator('aside').first()
    await expect(sidebar).toBeVisible()
    const logo = window.locator('img[alt="Echora"]').first()
    await expect(logo).toBeVisible()
  })

  test('sidebar search input exists and is functional', async () => {
    const searchInput = window.locator('input[placeholder*="搜索 Agent"]')
    await expect(searchInput).toBeVisible()
    await searchInput.fill('test')
    await expect(searchInput).toHaveValue('test')
    await searchInput.fill('')
    await expect(searchInput).toHaveValue('')
  })

  test('sidebar shows agent list or empty state', async () => {
    const hasEmptyState = await window.locator('text=点击刷新扫描 AI 软件').isVisible()
    const hasAgentItems = (await window.locator('[class*="agentItem"]').count()) > 0
    expect(hasEmptyState || hasAgentItems).toBeTruthy()
  })

  test('sidebar refresh button works', async () => {
    const refreshBtn = window.locator('button[title="刷新状态"]')
    await expect(refreshBtn).toBeVisible()
    await expect(refreshBtn).toBeEnabled()
    await refreshBtn.click()
    // Button may briefly disable during refresh, then re-enable
    await expect(refreshBtn).toBeEnabled({ timeout: 15000 })
  })

  test('sidebar drawer menu opens with items', async () => {
    const drawerToggle = window.locator('text=🧭 功能菜单')
    await expect(drawerToggle).toBeVisible()
    await drawerToggle.click()
    await expect(window.locator('text=AI 对话')).toBeVisible()
    await expect(window.locator('text=AI 管理')).toBeVisible()
    await expect(window.locator('text=系统设置')).toBeVisible()
  })

  test('chat area shows content', async () => {
    const hasWelcome = await window.locator('text=欢迎使用 Echora').isVisible()
    const hasChat = await window.locator('[class*="topbar"], [class*="chatInput"]').first().isVisible()
    expect(hasWelcome || hasChat).toBeTruthy()
  })

  test('theme toggle works', async () => {
    const themeBtn = window.locator('button[title="切换白昼/夜间模式"]').first()
    await expect(themeBtn).toBeVisible({ timeout: 5000 })
    const textBefore = await themeBtn.textContent()
    await themeBtn.click()
    await window.waitForTimeout(500)
    const textAfter = await themeBtn.textContent()
    expect(textBefore).not.toBe(textAfter)
  })

  test('window control buttons exist', async () => {
    await expect(window.locator('button[title="最小化"]').first()).toBeVisible()
    await expect(window.locator('button[title="最大化"], button[title="还原"]').first()).toBeVisible()
    await expect(window.locator('button[title="关闭"]').first()).toBeVisible()
  })

  test('refresh and select agent shows chat', async () => {
    // Navigate back to chat
    const chatItem = window.locator('text=AI 对话')
    if (await chatItem.isVisible()) {
      await chatItem.click()
      await window.waitForTimeout(500)
    }

    // Refresh
    const refreshBtn = window.locator('button[title="刷新状态"]')
    await refreshBtn.click()
    await window.waitForTimeout(5000)

    // Select first agent if available
    const agentItems = window.locator('[class*="agentItem"]')
    const count = await agentItems.count()
    if (count > 0) {
      await agentItems.first().click()
      await window.waitForTimeout(1000)
      await expect(window.locator('textarea[placeholder="输入消息..."]')).toBeVisible({ timeout: 5000 })
      await expect(window.locator('button:has-text("新建会话")')).toBeVisible()
    }
  })

  test('conversation dropdown opens', async () => {
    const convTitle = window.locator('[class*="convTitle"]').first()
    if (await convTitle.isVisible()) {
      await convTitle.click()
      await expect(window.locator('input[placeholder*="搜索会话"]')).toBeVisible()
      await window.locator('.main-content').click()
    }
  })

  test('new conversation button works', async () => {
    const newConvBtn = window.locator('button:has-text("新建会话")')
    if (await newConvBtn.isVisible()) {
      await newConvBtn.click()
      await window.waitForTimeout(500)
      await expect(window.locator('textarea[placeholder="输入消息..."]')).toBeVisible()
    }
  })

  test('close app', async () => {
    try {
      await app.close()
    } catch {
      // ignore
    }
  })
})

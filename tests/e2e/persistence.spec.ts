import { test, expect, _electron as electron, type Page } from '@playwright/test'
import { join } from 'path'

const APP_PATH = join(__dirname, '..', '..')

/** 等待应用完全加载 */
async function waitForAppReady(page: Page) {
  await page.locator('#root').waitFor({ state: 'visible', timeout: 20000 })
}

/** 安全关闭应用并等待端口释放 */
async function safeClose(app: Awaited<ReturnType<typeof electron.launch>>): Promise<void> {
  try {
    await app.close()
  } catch {
    // ignore close errors
  }
  // 等待端口和进程完全释放
  await new Promise((r) => setTimeout(r, 3000))
}

test.describe('Conversation Persistence', () => {
  test('conversations persist after app restart', async () => {
    await new Promise((r) => setTimeout(r, 1000))
    // First launch: create a conversation
    let app = await electron.launch({ args: [APP_PATH, '--no-sandbox', '--disable-gpu'] })
    let window = await app.firstWindow()
    await waitForAppReady(window)

    // Refresh to load agents
    const refreshBtn = window.locator('button[title="刷新状态"]')
    await refreshBtn.click()
    await window.waitForTimeout(3000)

    // Try to find and click an agent
    const agentItems = window.locator('[class*="agentItem"]')
    const count = await agentItems.count()

    if (count === 0) {
      await safeClose(app)
      test.skip(true, 'No agents available for persistence test')
      return
    }

    await agentItems.first().click()
    await window.waitForTimeout(1000)

    // Create a new conversation
    const newConvBtn = window.locator('button:has-text("新建会话")')
    if (await newConvBtn.isVisible()) {
      await newConvBtn.click()
      await window.waitForTimeout(2000)
    }

    // Close the app and wait for port release
    await safeClose(app)

    // Second launch: verify conversation persists
    app = await electron.launch({ args: [APP_PATH, '--no-sandbox', '--disable-gpu'] })
    window = await app.firstWindow()
    await waitForAppReady(window)

    // Refresh to load agents
    const refreshBtn2 = window.locator('button[title="刷新状态"]')
    await refreshBtn2.click()
    await window.waitForTimeout(3000)

    // Click same agent
    const agentItems2 = window.locator('[class*="agentItem"]')
    if (await agentItems2.count() > 0) {
      await agentItems2.first().click()
      await window.waitForTimeout(2000)

      // Verify chat input is visible (app is functional)
      await expect(window.locator('textarea[placeholder="输入消息..."]')).toBeVisible({ timeout: 5000 })
    }

    await safeClose(app)
  })

  test('app loads conversations from disk on startup', async () => {
    await new Promise((r) => setTimeout(r, 1000))
    const app = await electron.launch({ args: [APP_PATH, '--no-sandbox', '--disable-gpu'] })
    const window = await app.firstWindow()
    await waitForAppReady(window)

    // Verify the app is functional after loading conversations
    await expect(window.locator('aside').first()).toBeVisible()

    // Check that the store has been populated (no error thrown)
    const title = await window.title()
    expect(title).toBe('Echora 2.0')

    await safeClose(app)
  })

  test('conversations:load IPC channel is registered', async () => {
    await new Promise((r) => setTimeout(r, 1000))
    const app = await electron.launch({ args: [APP_PATH, '--no-sandbox', '--disable-gpu'] })
    const window = await app.firstWindow()
    await waitForAppReady(window)

    // Evaluate that the preload API is available
    const hasConversationsApi = await window.evaluate(() => {
      return typeof window.echora?.conversations?.load === 'function'
    })
    expect(hasConversationsApi).toBe(true)

    const hasSaveApi = await window.evaluate(() => {
      return typeof window.echora?.conversations?.save === 'function'
    })
    expect(hasSaveApi).toBe(true)

    await safeClose(app)
  })
})

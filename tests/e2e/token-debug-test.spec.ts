/**
 * Token调试测试 - 检查全局变量
 */

import { test, _electron as electron, type Page } from '@playwright/test'
import { join } from 'path'

const APP_PATH = join(__dirname, '..', '..')

async function waitForAppReady(page: Page, timeout = 25000) {
  await page.locator('#root').waitFor({ state: 'visible', timeout })
}

test.describe.serial('Token Debug Test', () => {
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
    if (app) { await app.close() }
  })

  test('Check global variables', async () => {
    await window.waitForTimeout(3000)

    // 点击Echora Agent
    const echoraAgent = window.locator('[class*="agentItem"]').filter({ hasText: 'Echora Agent' }).first()
    if (await echoraAgent.count() > 0) {
      await echoraAgent.click()
      await window.waitForTimeout(3000)
      console.log('Clicked Echora Agent')
    }

    // 检查全局变量
    const globalVars = await window.evaluate(() => {
      return {
        fetchModelInfoCalled: (window as any).__fetchModelInfoCalled,
        fetchModelInfoKey: (window as any).__fetchModelInfoKey,
        modelInfoResult: (window as any).__modelInfoResult,
        contextWindow: document.querySelector('[class*="chatWrapper"]')?.getAttribute('data-context-window')
      }
    })
    console.log('Global vars:', JSON.stringify(globalVars, null, 2))

    // 截图
    await window.screenshot({ path: 'test-results/token-debug-global.png', fullPage: true })
  })
})

/**
 * HTML 文件预览 E2E 测试 - Store 状态检查
 */

import { test, expect, _electron as electron, type Page } from '@playwright/test'
import { join } from 'path'
import { execSync } from 'child_process'

const APP_PATH = join(__dirname, '..', '..')

function killPreviousProcesses() {
  try {
    execSync('taskkill /F /IM electron.exe', { stdio: 'ignore' })
  } catch { /* ignore */ }
}

test.describe.serial('HTML 文件预览测试', () => {
  let app: Awaited<ReturnType<typeof electron.launch>>
  let window: Page

  test.beforeAll(async () => {
    killPreviousProcesses()
    await new Promise((r) => setTimeout(r, 2000))
    
    app = await electron.launch({
      args: [APP_PATH, '--no-sandbox', '--disable-gpu']
    })
    window = await app.firstWindow()
    await window.locator('#root').waitFor({ state: 'visible', timeout: 30000 })
  })

  test.afterAll(async () => {
    if (app) await app.close()
    killPreviousProcesses()
  })

  test('检查 previewTarget 状态', async () => {
    // 打开工具面板
    const toolButton = window.locator('button[title="打开工具面板"]').first()
    await toolButton.click()
    await window.waitForTimeout(1000)

    // 点击文件按钮
    const fileButton = window.locator('button:has-text("📁")').first()
    await fileButton.click()
    await window.waitForTimeout(2000)

    // 检查初始状态
    const initialState = await window.evaluate(() => {
      // 尝试访问 Zustand store
      const store = (window as any).__ZUSTAND_STORE__
      if (store) {
        return {
          previewVisible: store.getState().previewVisible,
          previewTarget: store.getState().previewTarget,
        }
      }
      return { error: 'Store 未找到' }
    })
    console.log('[Test] 初始状态:', JSON.stringify(initialState, null, 2))

    // 查找并点击 test-preview.html
    const htmlFile = window.locator('text=test-preview.html').first()
    await htmlFile.click()
    await window.waitForTimeout(3000)

    // 检查点击后的状态
    const afterClickState = await window.evaluate(() => {
      const store = (window as any).__ZUSTAND_STORE__
      if (store) {
        const state = store.getState()
        return {
          previewVisible: state.previewVisible,
          previewTarget: state.previewTarget,
        }
      }
      return { error: 'Store 未找到' }
    })
    console.log('[Test] 点击后状态:', JSON.stringify(afterClickState, null, 2))

    // 截图
    await window.screenshot({ path: 'test-results/store-state-check.png' })
  })
})

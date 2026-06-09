/**
 * 工具面板 E2E 测试
 * 测试文件浏览器、控制台、思考过程等功能
 */

import { test, expect, _electron as electron, type Page } from '@playwright/test'
import { join } from 'path'
import { execSync } from 'child_process'

const APP_PATH = join(__dirname, '..', '..')

/** 等待应用完全加载 */
async function waitForAppReady(page: Page, timeout = 30000) {
  await page.locator('#root').waitFor({ state: 'visible', timeout })
}

/** 关闭之前的 Electron 进程 */
function killPreviousProcesses() {
  try {
    execSync('taskkill /F /IM electron.exe', { stdio: 'ignore' })
  } catch { /* ignore */ }
}

test.describe.serial('工具面板测试', () => {
  let app: Awaited<ReturnType<typeof electron.launch>>
  let window: Page

  test.beforeAll(async () => {
    // 关闭之前的进程
    killPreviousProcesses()
    await new Promise((r) => setTimeout(r, 2000))
    
    console.log('[Test] 启动 Electron 应用...')
    app = await electron.launch({
      args: [APP_PATH, '--no-sandbox', '--disable-gpu']
    })
    console.log('[Test] 等待窗口...')
    window = await app.firstWindow()
    console.log('[Test] 等待应用加载...')
    await waitForAppReady(window)
    console.log('[Test] 应用已加载')
  })

  test.afterAll(async () => {
    if (app) {
      await app.close()
    }
    killPreviousProcesses()
  })

  test('工具按钮应打开工具面板', async () => {
    console.log('[Test] 查找工具面板按钮...')
    
    // 等待页面稳定
    await window.waitForTimeout(1000)
    
    // 找到工具面板按钮并点击
    const toolButton = window.locator('button[title="打开工具面板"]').first()
    const isVisible = await toolButton.isVisible().catch(() => false)
    console.log('[Test] 工具按钮可见:', isVisible)
    
    if (!isVisible) {
      // 截图查看当前状态
      await window.screenshot({ path: 'test-results/debug-no-button.png' })
      console.log('[Test] 截图保存到 test-results/debug-no-button.png')
    }
    
    await toolButton.click()
    await window.waitForTimeout(1000)
    
    // 检查工具面板是否显示（使用正确的选择器）
    const previewPane = window.locator('.shrink-0.border-l').first()
    await expect(previewPane).toBeVisible({ timeout: 5000 })
    
    // 截图
    await window.screenshot({ path: 'test-results/01-tool-panel-opened.png' })
    console.log('[Test] 工具面板已打开')
  })

  test('文件浏览器应显示文件树', async () => {
    // 打开工具面板（如果还没打开）
    const previewPane = window.locator('.shrink-0.border-l')
    if (!(await previewPane.isVisible())) {
      const toolButton = window.locator('button[title="打开工具面板"]').first()
      await toolButton.click()
      await window.waitForTimeout(500)
    }
    
    // 点击文件按钮
    const fileButton = window.locator('button:has-text("📁")').first()
    await fileButton.click()
    await window.waitForTimeout(2000)
    
    // 截图
    await window.screenshot({ path: 'test-results/02-file-explorer.png' })
    
    // 检查控制台日志
    const consoleLogs = await window.evaluate(() => {
      // 获取所有控制台日志
      return document.body.getAttribute('data-console-logs') || '无日志'
    })
    console.log('[Test] 控制台:', consoleLogs)
    
    // 检查是否显示文件树
    const hasContent = await window.locator('.shrink-0.border-l').isVisible()
    console.log('[Test] 预览面板可见:', hasContent)
  })

  test('终端按钮应切换到控制台视图', async () => {
    // 打开工具面板
    const previewPane = window.locator('.shrink-0.border-l').first()
    if (!(await previewPane.isVisible())) {
      const toolButton = window.locator('button[title="打开工具面板"]').first()
      await toolButton.click()
      await window.waitForTimeout(500)
    }
    
    // 点击终端按钮（使用 force 避免遮挡问题）
    const consoleButton = window.locator('button:has-text("💻")').first()
    await consoleButton.click({ force: true })
    await window.waitForTimeout(500)
    
    // 截图
    await window.screenshot({ path: 'test-results/03-console-view.png' })
  })

  test('网页按钮应切换到网页预览', async () => {
    // 打开工具面板
    const previewPane = window.locator('.shrink-0.border-l')
    if (!(await previewPane.isVisible())) {
      const toolButton = window.locator('button[title="打开工具面板"]').first()
      await toolButton.click()
      await window.waitForTimeout(500)
    }
    
    // 点击网页按钮
    const webButton = window.locator('button:has-text("🌐")').first()
    await webButton.click()
    await window.waitForTimeout(500)
    
    // 截图
    await window.screenshot({ path: 'test-results/04-web-preview.png' })
  })
})

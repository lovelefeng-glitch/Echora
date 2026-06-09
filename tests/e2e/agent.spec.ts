/**
 * Agent 功能 E2E 测试
 * 测试 Agent 模式的入口、设置和基本功能
 */

import { test, expect, _electron as electron, type Page } from '@playwright/test'
import { join } from 'path'

const APP_PATH = join(__dirname, '..', '..')

/** 等待应用完全加载 */
async function waitForAppReady(page: Page, timeout = 25000) {
  await page.locator('#root').waitFor({ state: 'visible', timeout })
}

/**
 * Agent 功能验证测试 - 串行运行，共享 Electron 实例
 */
test.describe.serial('Agent Mode Tests', () => {
  let app: Awaited<ReturnType<typeof electron.launch>>
  let window: Page

  test.beforeAll(async () => {
    // 等待确保前一个 Electron 实例完全退出
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

  test('Agent mode entry is visible in sidebar menu', async () => {
    // 打开功能菜单
    const menuBtn = window.locator('text=🧭 功能菜单')
    await expect(menuBtn).toBeVisible()
    await menuBtn.click()

    // 检查 Agent 模式入口是否可见
    const agentEntry = window.locator('text=Agent 模式')
    await expect(agentEntry).toBeVisible()
  })

  test('Agent mode entry is clickable', async () => {
    // 检查是否可点击（不是灰色的）
    const agentEntry = window.locator('text=Agent 模式')
    await expect(agentEntry).toBeVisible()
    
    // 检查父按钮的 opacity
    const button = agentEntry.locator('..')
    const opacity = await button.evaluate(el => {
      return window.getComputedStyle(el).opacity
    })
    expect(opacity).toBe('1')
  })

  test('Agent view loads when clicking Agent mode', async () => {
    // 点击 Agent 模式入口
    const agentEntry = window.locator('text=Agent 模式')
    await agentEntry.click()

    // 等待 Agent 视图加载
    await window.waitForTimeout(1000)

    // 检查 Agent 视图是否显示
    const agentTitle = window.locator('text=Agent 模式')
    await expect(agentTitle.first()).toBeVisible()

    // 检查是否有输入框
    const inputArea = window.locator('textarea')
    await expect(inputArea).toBeVisible()
  })

  test('Agent settings page is accessible', async () => {
    // 打开功能菜单
    const menuBtn = window.locator('text=🧭 功能菜单')
    await menuBtn.click()

    // 点击系统设置
    const settingsEntry = window.locator('text=系统设置')
    await settingsEntry.click()

    // 等待设置页面加载
    await window.waitForTimeout(1000)

    // 点击 Agent 标签页
    const agentTab = window.locator('text=🤖 Agent').first()
    await expect(agentTab).toBeVisible()
    await agentTab.click()

    // 等待 Agent 设置页面加载
    await window.waitForTimeout(1000)

    // 检查是否有功能开关
    const enableAgentSwitch = window.locator('text=启用 Agent 模式')
    await expect(enableAgentSwitch).toBeVisible()
  })

  test('Add Provider button is visible in Agent settings', async () => {
    // 检查添加 Provider 按钮
    const addProviderBtn = window.locator('text=+ 添加 Provider')
    await expect(addProviderBtn).toBeVisible()
  })
})

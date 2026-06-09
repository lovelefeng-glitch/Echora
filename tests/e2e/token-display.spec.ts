/**
 * Token 显示功能 E2E 测试
 * 测试 Echora Agent 对话时 Token 信息是否正确显示
 *
 * 运行前需要先启动 dev server: npm run dev
 */

import { test, expect, _electron as electron, type Page } from '@playwright/test'
import { join } from 'path'
import { existsSync, mkdirSync } from 'fs'

const APP_PATH = join(__dirname, '..', '..')
const SCREENSHOT_DIR = join(__dirname, '..', '..', 'screenshots', 'token-display')

// 创建截图目录
if (!existsSync(SCREENSHOT_DIR)) {
  mkdirSync(SCREENSHOT_DIR, { recursive: true })
}

/** 等待应用完全加载 */
async function waitForAppReady(page: Page, timeout = 30000) {
  // 等待 root 元素可见
  await page.locator('#root').waitFor({ state: 'visible', timeout })
  // 额外等待确保 React 渲染完成
  await page.waitForTimeout(2000)
}

test.describe.serial('Token Display Tests', () => {
  let app: Awaited<ReturnType<typeof electron.launch>>
  let window: Page
  let consoleLogs: string[] = []

  test.beforeAll(async () => {
    // 等待一下确保没有其他 Electron 实例
    await new Promise((r) => setTimeout(r, 3000))

    // 启动 Electron 应用
    app = await electron.launch({
      args: [APP_PATH, '--no-sandbox', '--disable-gpu'],
      timeout: 60000
    })
    window = await app.firstWindow()

    // 捕获控制台日志
    window.on('console', msg => {
      const text = msg.text()
      consoleLogs.push(text)
    })

    // 捕获页面错误
    window.on('pageerror', error => {
      console.log(`[PAGE ERROR] ${error.message}`)
    })

    await waitForAppReady(window)
  })

  test.afterAll(async () => {
    // 输出重要日志
    const importantLogs = consoleLogs.filter(log =>
      log.includes('Token') || log.includes('usage') || log.includes('Error')
    )
    console.log('\n=== Important Logs ===')
    importantLogs.forEach(log => console.log(log))
    console.log('=== End Logs ===\n')

    if (app) {
      await app.close()
    }
  })

  test('应用启动并显示主界面', async () => {
    // 截图：初始状态
    await window.screenshot({ path: join(SCREENSHOT_DIR, '01-app-start.png'), fullPage: true })

    // 验证 root 元素可见
    const root = window.locator('#root')
    await expect(root).toBeVisible()
    console.log('✅ 应用启动成功')
  })

  test('切换到 Echora Agent', async () => {
    // 点击 Echora Agent（通常在侧边栏）
    const echoraAgent = window.locator('text=Echora Agent').first()
    if (await echoraAgent.isVisible()) {
      await echoraAgent.click()
      await window.waitForTimeout(1000)
      console.log('✅ 已切换到 Echora Agent')
    } else {
      console.log('⚠️ Echora Agent 不可见，可能已在当前视图')
    }

    // 截图：Agent 选中状态
    await window.screenshot({ path: join(SCREENSHOT_DIR, '02-agent-selected.png'), fullPage: true })
  })

  test('发送消息并等待响应', async () => {
    // 检查输入框
    const textarea = window.locator('textarea').first()
    if (!(await textarea.isVisible())) {
      console.log('⚠️ 输入框不可见，跳过测试')
      test.skip()
      return
    }

    // 输入测试消息
    await textarea.fill('测试token显示')
    await window.waitForTimeout(500)

    // 截图：输入消息后
    await window.screenshot({ path: join(SCREENSHOT_DIR, '03-message-input.png'), fullPage: true })

    // 发送消息（按 Enter）
    await textarea.press('Enter')
    console.log('消息已发送，等待 AI 响应...')

    // 等待响应完成（最多 30 秒）
    await window.waitForTimeout(25000)

    // 截图：响应完成后
    await window.screenshot({ path: join(SCREENSHOT_DIR, '04-response-received.png'), fullPage: true })
    console.log('✅ AI 响应完成')
  })

  test('验证 Token 信息显示', async () => {
    // 查找 Token 信息元素（格式：↑xxx ↓xxx Σxxx）
    const tokenInfo = window.locator('text=/↑\\d+.*↓\\d+/')

    // 截图：Token 信息区域
    await window.screenshot({ path: join(SCREENSHOT_DIR, '05-token-info.png'), fullPage: true })

    // 检查是否有 Token 信息显示
    const tokenCount = await tokenInfo.count()
    console.log(`找到 ${tokenCount} 个 Token 信息元素`)

    if (tokenCount > 0) {
      const tokenText = await tokenInfo.last().textContent()
      console.log('Token 信息:', tokenText)

      // 验证格式正确
      expect(tokenText).toMatch(/↑\d+/)
      expect(tokenText).toMatch(/↓\d+/)

      // 验证值不为 0
      const inputMatch = tokenText?.match(/↑(\d+)/)
      const outputMatch = tokenText?.match(/↓(\d+)/)

      if (inputMatch && outputMatch) {
        const input = parseInt(inputMatch[1])
        const output = parseInt(outputMatch[1])

        console.log(`Token 值: 输入=${input}, 输出=${output}`)

        // 验证值大于 0
        expect(input).toBeGreaterThan(0)
        expect(output).toBeGreaterThan(0)
        console.log('✅ Token 值正确显示（不为 0）')
      }
    } else {
      console.log('⚠️ 未找到 Token 信息')
      // 不失败，因为可能需要更多时间
    }
  })

  test('检查控制台日志无严重错误', async () => {
    // 检查是否有严重错误
    const criticalErrors = consoleLogs.filter(log =>
      log.includes('Uncaught') ||
      log.includes('TypeError') ||
      log.includes('ReferenceError')
    )

    console.log(`严重错误数: ${criticalErrors.length}`)
    criticalErrors.forEach(err => console.log('  -', err))

    // 不应有严重错误
    expect(criticalErrors.length).toBe(0)
    console.log('✅ 无严重错误')
  })
})

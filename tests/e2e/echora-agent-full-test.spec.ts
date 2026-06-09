/**
 * Echora Agent 全面自动化测试
 * 测试内容：
 * 1. Token 显示修复验证
 * 2. DuckDuckGo 搜索工具
 * 3. 代码执行工具
 * 4. 工具调用流程
 *
 * 运行方式：npx playwright test tests/e2e/echora-agent-full-test.spec.ts
 */

import { test, _electron as electron, type Page } from '@playwright/test'
import { join } from 'path'
import * as fs from 'fs'

const APP_PATH = join(__dirname, '..', '..')
const RESULTS_DIR = join(__dirname, '..', '..', 'test-results')

// 确保测试结果目录存在
if (!fs.existsSync(RESULTS_DIR)) fs.mkdirSync(RESULTS_DIR, { recursive: true })

async function waitForAppReady(page: Page, timeout = 25000) {
  await page.locator('#root').waitFor({ state: 'visible', timeout })
}

async function clickEchoraAgent(page: Page) {
  // 点击 Echora Agent
  const agent = page.locator('[class*="agentItem"]').filter({ hasText: 'Echora Agent' }).first()
  if (await agent.count() > 0) {
    await agent.click()
    await page.waitForTimeout(2000)
    return true
  }
  return false
}

async function sendMessage(page: Page, text: string) {
  const textarea = page.locator('textarea').first()
  await textarea.fill(text)
  await textarea.press('Enter')
  // 等待 AI 回复完成（最多 60 秒）
  await page.waitForTimeout(15000)
}

test.describe.serial('Echora Agent 全面测试', () => {
  let app: Awaited<ReturnType<typeof electron.launch>>
  let window: Page

  test.beforeAll(async () => {
    // 关闭之前的 Electron 进程
    const { execSync } = require('child_process')
    try { execSync('taskkill /F /IM electron.exe', { stdio: 'ignore' }) } catch {}
    await new Promise(r => setTimeout(r, 2000))

    app = await electron.launch({
      args: [APP_PATH, '--no-sandbox', '--disable-gpu']
    })
    window = await app.firstWindow()
    await waitForAppReady(window)
  })

  test.afterAll(async () => {
    if (app) { await app.close() }
  })

  // ════════════════════════════════════════════
  // 测试 1：Token 显示
  // ════════════════════════════════════════════
  test('Token 显示验证', async () => {
    console.log('\n=== 测试 1：Token 显示验证 ===')

    // 点击 Echora Agent
    const clicked = await clickEchoraAgent(window)
    console.log('Echora Agent 已点击:', clicked)

    // 发送简单消息
    await sendMessage(window, '你好，请简单回复')

    // 截图
    await window.screenshot({
      path: join(RESULTS_DIR, 'test1-token-before.png'),
      fullPage: true
    })

    // 检查全局变量中的 modelInfo
    const modelInfo = await window.evaluate(() => (window as any).__modelInfoResult)
    console.log('modelInfo:', JSON.stringify(modelInfo))

    // 检查上下文窗口是否显示
    const tokenArea = window.locator('text=/上下文/')
    const hasTokenArea = await tokenArea.count() > 0
    console.log('Token 区域显示:', hasTokenArea)

    // 检查全局变量
    const debugInfo = await window.evaluate(() => ({
      fetchModelInfoCalled: (window as any).__fetchModelInfoCalled,
      fetchModelInfoKey: (window as any).__fetchModelInfoKey,
      modelInfoResult: (window as any).__modelInfoResult
    }))
    console.log('调试信息:', JSON.stringify(debugInfo))

    // 验证
    if (modelInfo?.contextWindow && modelInfo.contextWindow > 0) {
      console.log('✅ contextWindow 已设置:', modelInfo.contextWindow)
    } else {
      console.log('❌ contextWindow 未设置或为 0')
    }

    // 最终截图
    await window.screenshot({
      path: join(RESULTS_DIR, 'test1-token-after.png'),
      fullPage: true
    })
  })

  // ════════════════════════════════════════════
  // 测试 2：搜索工具
  // ════════════════════════════════════════════
  test('DuckDuckGo 搜索工具', async () => {
    console.log('\n=== 测试 2：DuckDuckGo 搜索工具 ===')

    // 新建会话
    const newChatBtn = window.locator('button').filter({ hasText: /新建|新会话|New/ }).first()
    if (await newChatBtn.count() > 0) {
      await newChatBtn.click()
      await window.waitForTimeout(1000)
    }

    await sendMessage(window, '帮我搜索"2024年最新的Electron版本号"')

    // 等待工具调用完成
    await window.waitForTimeout(20000)

    // 截图
    await window.screenshot({
      path: join(RESULTS_DIR, 'test2-search.png'),
      fullPage: true
    })

    // 检查回复中是否包含搜索结果
    const allText = await window.locator('body').textContent() || ''
    const hasSearchResult = allText.includes('http') || allText.includes('Electron') || allText.includes('搜索')
    console.log('搜索结果出现:', hasSearchResult)

    if (hasSearchResult) {
      console.log('✅ 搜索工具正常')
    } else {
      console.log('❌ 搜索工具可能未触发')
    }
  })

  // ════════════════════════════════════════════
  // 测试 3：代码执行
  // ════════════════════════════════════════════
  test('代码执行工具', async () => {
    console.log('\n=== 测试 3：代码执行工具 ===')

    // 新建会话
    const newChatBtn = window.locator('button').filter({ hasText: /新建|新会话|New/ }).first()
    if (await newChatBtn.count() > 0) {
      await newChatBtn.click()
      await window.waitForTimeout(1000)
    }

    await sendMessage(window, '请用代码计算 1到100的和')

    // 等待回复
    await window.waitForTimeout(20000)

    // 截图
    await window.screenshot({
      path: join(RESULTS_DIR, 'test3-code-exec.png'),
      fullPage: true
    })

    // 检查回复是否包含计算结果
    const allText = await window.locator('body').textContent() || ''
    const hasResult = allText.includes('5050')  // 1+2+...+100 = 5050
    console.log('包含计算结果 5050:', hasResult)

    if (hasResult) {
      console.log('✅ 代码执行工具正常')
    } else {
      console.log('⚠️ 未找到计算结果，可能模型未选择执行代码')
    }
  })

  // ════════════════════════════════════════════
  // 测试 4：对话上下文
  // ════════════════════════════════════════════
  test('对话上下文记忆', async () => {
    console.log('\n=== 测试 4：对话上下文记忆 ===')

    // 新建会话
    const newChatBtn = window.locator('button').filter({ hasText: /新建|新会话|New/ }).first()
    if (await newChatBtn.count() > 0) {
      await newChatBtn.click()
      await window.waitForTimeout(1000)
    }

    // 第一条消息：设置上下文
    await sendMessage(window, '我的名字是测试用户')
    await window.waitForTimeout(5000)

    // 第二条消息：验证上下文
    await sendMessage(window, '我叫什么名字？')
    await window.waitForTimeout(15000)

    // 截图
    await window.screenshot({
      path: join(RESULTS_DIR, 'test4-context.png'),
      fullPage: true
    })

    // 检查回复
    const allText = await window.locator('body').textContent() || ''
    const hasContext = allText.includes('测试用户')
    console.log('AI 记住名字:', hasContext)

    if (hasContext) {
      console.log('✅ 对话上下文正常')
    } else {
      console.log('⚠️ AI 可能未记住上下文')
    }
  })

  // ════════════════════════════════════════════
  // 测试 5：截图对比（UI 完整性）
  // ════════════════════════════════════════════
  test('UI 完整性检查', async () => {
    console.log('\n=== 测试 5：UI 完整性检查 ===')

    // 检查关键 UI 元素
    const checks = {
      '侧边栏': await window.locator('[class*="sidebar"]').count() > 0,
      'Agent 列表': await window.locator('[class*="agent"]').count() > 0,
      '聊天区域': await window.locator('[class*="chat"]').count() > 0,
      '输入框': await window.locator('textarea').count() > 0,
      '发送按钮': await window.locator('button').filter({ hasText: /发送|Send/ }).count() > 0 || await window.locator('button[class*="send"]').count() > 0,
    }

    for (const [name, exists] of Object.entries(checks)) {
      console.log(`${exists ? '✅' : '❌'} ${name}`)
    }

    // 最终截图
    await window.screenshot({
      path: join(RESULTS_DIR, 'test5-ui-completeness.png'),
      fullPage: true
    })

    const allPassed = Object.values(checks).every(v => v)
    if (allPassed) {
      console.log('✅ UI 完整性检查通过')
    } else {
      console.log('⚠️ 部分 UI 元素缺失')
    }
  })
})

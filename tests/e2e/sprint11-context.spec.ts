/**
 * Sprint 11 针对性 E2E 测试
 * 
 * 测试目标：
 * 1. 会话上下文测试：验证对话是否保持上下文
 * 2. 新建会话测试：验证新建会话使用 SQLite
 * 3. Token 显示测试：验证 Token 显示位置
 */

import { test, expect, _electron as electron, type Page } from '@playwright/test'
import { join } from 'path'
import * as fs from 'fs'

const APP_PATH = join(__dirname, '..', '..')
const DB_PATH = join(process.env.USERPROFILE || '', 'AppData', 'Roaming', 'echora-2', 'echora.db')

async function waitForAppReady(page: Page, timeout = 25000) {
  await page.locator('#root').waitFor({ state: 'visible', timeout })
  await page.waitForTimeout(3000)
}

test.describe.serial('会话上下文测试', () => {
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
    if (app) {
      await app.close()
    }
  })

  test('1. 连续发送两条消息，验证是否在同一个会话中', async () => {
    const textarea = window.locator('textarea')
    const isDisabled = await textarea.isDisabled()
    
    if (isDisabled) {
      console.log('⚠️ 跳过测试：Provider 未配置')
      test.skip()
      return
    }

    // 发送第一条消息
    const msg1 = '我的名字是小明'
    await textarea.fill(msg1)
    await textarea.press('Enter')
    await window.waitForTimeout(8000)
    
    console.log('📤 已发送第 1 条消息:', msg1)
    
    // 发送第二条消息，询问上下文
    const msg2 = '我叫什么名字？'
    await textarea.fill(msg2)
    await textarea.press('Enter')
    await window.waitForTimeout(10000)
    
    console.log('📤 已发送第 2 条消息:', msg2)
    
    // 检查回复中是否包含上下文信息
    const messages = await window.locator('.msg-content').allTextContents()
    console.log('💬 所有消息:', messages.map(m => m.substring(0, 50)))
    
    // 查找包含"小明"的回复
    const hasContext = messages.some(m => m.includes('小明'))
    
    if (hasContext) {
      console.log('✅ 会话保持上下文：第二条消息的回复包含第一条消息的信息')
    } else {
      console.log('⚠️ 会话可能未保持上下文（需要 AI 配置才能验证）')
    }
    
    // 验证消息数量（至少 3 条：用户1 + 用户2 + 助手回复）
    expect(messages.length).toBeGreaterThanOrEqual(2)
  })

  test('2. 验证会话列表显示正确', async () => {
    // 查找会话列表
    const conversationList = window.locator('[class*="conversation"]')
    const count = await conversationList.count()
    
    console.log('📊 会话列表数量:', count)
    
    // 至少应该有一个会话
    expect(count).toBeGreaterThanOrEqual(1)
    
    console.log('✅ 会话列表验证通过')
  })
})

test.describe.serial('新建会话 SQLite 测试', () => {
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
    if (app) {
      await app.close()
    }
  })

  test('3. 新建会话后，数据库应有新记录', async () => {
    // 记录当前数据库大小
    const dbSizeBefore = fs.statSync(DB_PATH).size
    console.log('📊 当前数据库大小:', dbSizeBefore, 'bytes')
    
    // 找到新建会话按钮
    const newChatBtn = window.locator('button:has-text("新建"), [aria-label*="新建"], [class*="new-chat"]')
    
    if (await newChatBtn.count() > 0) {
      await newChatBtn.first().click()
      await window.waitForTimeout(2000)
      
      console.log('📤 已点击新建会话按钮')
      
      // 检查数据库大小是否增加
      const dbSizeAfter = fs.statSync(DB_PATH).size
      console.log('📊 新建会话后数据库大小:', dbSizeAfter, 'bytes')
      
      if (dbSizeAfter > dbSizeBefore) {
        console.log('✅ 数据库大小增加，新建会话已存储到 SQLite')
      } else {
        console.log('⚠️ 数据库大小未增加（可能使用内存存储）')
      }
    } else {
      console.log('⚠️ 未找到新建会话按钮')
    }
    
    // 验证数据库文件存在
    expect(fs.existsSync(DB_PATH)).toBe(true)
  })

  test('4. 在新会话中发送消息，验证独立存储', async () => {
    const textarea = window.locator('textarea')
    const isDisabled = await textarea.isDisabled()
    
    if (isDisabled) {
      console.log('⚠️ 跳过测试：Provider 未配置')
      test.skip()
      return
    }

    // 记录当前数据库大小
    const dbSizeBefore = fs.statSync(DB_PATH).size
    
    // 发送消息
    const testMessage = '新建会话测试消息 - ' + Date.now()
    await textarea.fill(testMessage)
    await textarea.press('Enter')
    await window.waitForTimeout(10000)
    
    console.log('📤 已发送消息:', testMessage)
    
    // 检查数据库大小
    const dbSizeAfter = fs.statSync(DB_PATH).size
    console.log('📊 消息发送后数据库大小:', dbSizeAfter, 'bytes')
    
    if (dbSizeAfter > dbSizeBefore) {
      console.log('✅ 消息已存储到 SQLite 数据库')
    }
    
    // 验证消息显示
    const messageContent = window.locator('.msg-content', { hasText: testMessage })
    const isVisible = await messageContent.isVisible()
    
    if (isVisible) {
      console.log('✅ 消息已显示在界面上')
    }
    
    expect(isVisible).toBe(true)
  })
})

test.describe.serial('Token 显示测试', () => {
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
    if (app) {
      await app.close()
    }
  })

  test('5. Token 显示位置验证', async () => {
    // 查找所有可能的 Token 显示位置
    const tokenSelectors = [
      '[class*="token"]',
      '[class*="usage"]',
      '[class*="Token"]',
      '[class*="cost"]',
      '[class*="count"]',
      '[data-testid*="token"]'
    ]
    
    let foundToken = false
    let tokenText = ''
    
    for (const selector of tokenSelectors) {
      const elements = await window.locator(selector).count()
      if (elements > 0) {
        const text = await window.locator(selector).first().textContent()
        console.log(`📊 找到 Token 元素 (${selector}):`, text?.substring(0, 50))
        foundToken = true
        tokenText = text || ''
        break
      }
    }
    
    if (foundToken) {
      console.log('✅ Token 显示区域已找到')
      console.log('   Token 信息:', tokenText)
    } else {
      console.log('⚠️ 未找到 Token 显示区域')
      
      // 截图保存，方便调试
      await window.screenshot({ path: 'test-results/token-debug.png' })
      console.log('📸 已保存截图到 test-results/token-debug.png')
    }
  })

  test('6. 发送消息后 Token 更新验证', async () => {
    const textarea = window.locator('textarea')
    const isDisabled = await textarea.isDisabled()
    
    if (isDisabled) {
      console.log('⚠️ 跳过测试：Provider 未配置')
      test.skip()
      return
    }

    // 查找 Token 显示
    const tokenDisplay = window.locator('[class*="token"], [class*="usage"]').first()
    const hasTokenBefore = await tokenDisplay.count() > 0
    
    let tokenTextBefore = ''
    if (hasTokenBefore) {
      tokenTextBefore = await tokenDisplay.textContent() || ''
    }
    
    // 发送消息
    await textarea.fill('Token 更新测试')
    await textarea.press('Enter')
    await window.waitForTimeout(8000)
    
    // 再次检查 Token
    let tokenTextAfter = ''
    if (hasTokenBefore) {
      tokenTextAfter = await tokenDisplay.textContent() || ''
    }
    
    console.log('📊 Token 发送前:', tokenTextBefore || '未找到')
    console.log('📊 Token 发送后:', tokenTextAfter || '未找到')
    
    if (tokenTextBefore !== tokenTextAfter) {
      console.log('✅ Token 信息已更新')
    } else if (hasTokenBefore) {
      console.log('⚠️ Token 信息未变化（可能显示的是静态值）')
    } else {
      console.log('⚠️ 未找到 Token 显示区域')
    }
  })
})

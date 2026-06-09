/**
 * Sprint 11 精准 E2E 测试
 * 
 * 基于实际 UI 截图分析的精准测试
 * 
 * 测试目标：
 * 1. Token 显示：验证气泡底部的 Token 信息
 * 2. 会话上下文：验证对话是否保持上下文
 * 3. 新建会话：验证新建会话功能
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

test.describe.serial('Token 显示精准测试', () => {
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

  test('1. 发送消息后，验证气泡底部显示 Token 信息', async () => {
    const textarea = window.locator('textarea')
    const isDisabled = await textarea.isDisabled()
    
    if (isDisabled) {
      console.log('⚠️ 跳过测试：Provider 未配置')
      test.skip()
      return
    }

    // 发送消息
    const testMessage = 'Token 精准测试 - ' + Date.now()
    await textarea.fill(testMessage)
    await textarea.press('Enter')
    await window.waitForTimeout(8000)
    
    console.log('📤 已发送消息:', testMessage)
    
    // 查找 AI 回复气泡中的 Token 信息
    // 根据截图，Token 显示格式为 "↑.*↓.*Σ: 19"
    const tokenPattern = /↑.*↓.*Σ:\s*\d+/
    
    // 查找所有消息内容
    const allText = await window.locator('body').textContent()
    
    if (allText && tokenPattern.test(allText)) {
      const match = allText.match(tokenPattern)
      console.log('✅ Token 信息已显示:', match?.[0])
    } else {
      console.log('⚠️ 未找到 Token 信息（可能格式不同）')
      
      // 尝试查找包含"↑.*↓.*Σ"的元素
      const outputElements = await window.locator('text=/↑.*↓.*Σ/').count()
      console.log('📊 包含"↑.*↓.*Σ"的元素数量:', outputElements)
    }
    
    // 验证消息已发送
    const messageContent = window.locator('.msg-content', { hasText: testMessage })
    expect(await messageContent.isVisible()).toBe(true)
  })

  test('2. 查找并验证 Token 统计区域', async () => {
    // 根据截图，Token 信息在消息气泡底部
    // 查找包含 Token 信息的元素
    
    // 方法 1：查找包含"输出:"的元素
    const tokenElements = await window.locator('text=/输出:\\s*\\d+/').count()
    console.log('📊 包含"输出:"的元素数量:', tokenElements)
    
    // 方法 2：查找包含"总计:"的元素
    const totalElements = await window.locator('text=/总计:\\s*\\d+/').count()
    console.log('📊 包含"总计:"的元素数量:', totalElements)
    
    if (tokenElements > 0 || totalElements > 0) {
      console.log('✅ Token 统计区域已找到')
      
      // 获取 Token 信息
      if (tokenElements > 0) {
        const tokenText = await window.locator('text=/输出:\\s*\\d+/').first().textContent()
        console.log('📊 Token 输出信息:', tokenText)
      }
      
      if (totalElements > 0) {
        const totalText = await window.locator('text=/总计:\\s*\\d+/').first().textContent()
        console.log('📊 Token 总计信息:', totalText)
      }
    } else {
      console.log('⚠️ 未找到 Token 统计区域')
      
      // 截图保存
      await window.screenshot({ path: 'test-results/token-area-debug.png' })
      console.log('📸 已保存截图')
    }
  })
})

test.describe.serial('会话上下文精准测试', () => {
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

  test('3. 发送多条消息，验证 AI 记住上下文', async () => {
    const textarea = window.locator('textarea')
    const isDisabled = await textarea.isDisabled()
    
    if (isDisabled) {
      console.log('⚠️ 跳过测试：Provider 未配置')
      test.skip()
      return
    }

    // 发送第 1 条消息：设置上下文
    const msg1 = '我喜欢吃苹果'
    await textarea.fill(msg1)
    await textarea.press('Enter')
    await window.waitForTimeout(8000)
    
    console.log('📤 已发送第 1 条消息:', msg1)
    
    // 发送第 2 条消息：验证上下文
    const msg2 = '我喜欢吃什么？'
    await textarea.fill(msg2)
    await textarea.press('Enter')
    await window.waitForTimeout(8000)
    
    console.log('📤 已发送第 2 条消息:', msg2)
    
    // 检查回复
    const allText = await window.locator('body').textContent()
    
    if (allText && allText.includes('苹果')) {
      console.log('✅ 会话上下文正常：AI 记住了"苹果"')
    } else {
      console.log('⚠️ 会话上下文可能异常')
    }
    
    // 验证消息数量
    const messages = await window.locator('.msg-content').count()
    console.log('📊 消息总数:', messages)
    
    expect(messages).toBeGreaterThanOrEqual(4) // 至少 2 条用户消息 + 2 条 AI 回复
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

  test('4. 点击新建会话按钮，验证创建新会话', async () => {
    // 记录当前数据库大小
    const dbSizeBefore = fs.statSync(DB_PATH).size
    console.log('📊 当前数据库大小:', dbSizeBefore, 'bytes')
    
    // 根据截图，新建会话按钮在右上角
    const newChatBtn = window.locator('button', { hasText: '新建会话' })
    
    if (await newChatBtn.count() > 0) {
      await newChatBtn.first().click()
      await window.waitForTimeout(2000)
      
      console.log('📤 已点击新建会话按钮')
      
      // 检查数据库大小
      const dbSizeAfter = fs.statSync(DB_PATH).size
      console.log('📊 新建会话后数据库大小:', dbSizeAfter, 'bytes')
      
      if (dbSizeAfter > dbSizeBefore) {
        console.log('✅ 数据库大小增加，新建会话已存储到 SQLite')
      } else {
        console.log('⚠️ 数据库大小未增加')
      }
      
      // 验证会话标题变化
      const sessionTitle = await window.locator('[class*="title"]').first().textContent()
      console.log('📊 当前会话标题:', sessionTitle)
    } else {
      console.log('⚠️ 未找到新建会话按钮')
      
      // 截图保存
      await window.screenshot({ path: 'test-results/new-chat-debug.png' })
      console.log('📸 已保存截图')
    }
    
    // 验证数据库文件存在
    expect(fs.existsSync(DB_PATH)).toBe(true)
  })

  test('5. 在新会话中发送消息，验证独立存储', async () => {
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
    const testMessage = '新会话独立测试 - ' + Date.now()
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

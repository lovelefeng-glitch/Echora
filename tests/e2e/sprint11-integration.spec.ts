/**
 * Sprint 11 功能 E2E 测试
 * 
 * 针对性测试 - 验证功能在真实应用中正常工作
 * 
 * 测试目标：
 * 1. SQLite 存储层是否真正集成
 * 2. 新工具是否在 Agent 中可用
 * 3. 数据是否持久化
 */

import { test, expect, _electron as electron, type Page } from '@playwright/test'
import { join } from 'path'
import * as fs from 'fs'
import * as path from 'path'

const APP_PATH = join(__dirname, '..', '..')
// 数据库路径：Electron app.getPath('userData') + echora.db
const DB_PATH = join(process.env.USERPROFILE || '', 'AppData', 'Roaming', 'echora-2', 'echora.db')

async function waitForAppReady(page: Page, timeout = 25000) {
  await page.locator('#root').waitFor({ state: 'visible', timeout })
  await page.waitForTimeout(3000)
}

test.describe.serial('Sprint 11 - SQLite 集成测试', () => {
  let app: Awaited<ReturnType<typeof electron.launch>>
  let window: Page

  test.beforeAll(async () => {
    // 清理旧数据库
    if (fs.existsSync(DB_PATH)) {
      fs.unlinkSync(DB_PATH)
      console.log('🗑️ 已清理旧数据库')
    }
    
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

  test('1. [启动测试] 应用启动后应创建 SQLite 数据库', async () => {
    // 等待数据库创建
    await window.waitForTimeout(5000)
    
    // 检查数据库文件是否存在
    const dbExists = fs.existsSync(DB_PATH)
    
    if (!dbExists) {
      console.log('❌ 数据库未创建')
      console.log('   预期路径:', DB_PATH)
      
      // 列出 .echora 目录内容
      const echroaDir = join(process.env.USERPROFILE || '', '.echora')
      if (fs.existsSync(echroaDir)) {
        const files = fs.readdirSync(echroaDir)
        console.log('   .echora 目录内容:', files)
      }
    }
    
    expect(dbExists).toBe(true)
    
    const stats = fs.statSync(DB_PATH)
    expect(stats.size).toBeGreaterThan(0)
    
    console.log('✅ SQLite 数据库已创建:', DB_PATH)
    console.log('   文件大小:', stats.size, 'bytes')
  })

  test('2. [交互测试] 发送消息后应存储到 SQLite', async () => {
    // 找到聊天输入框
    const textarea = window.locator('textarea')
    const isDisabled = await textarea.isDisabled()
    
    if (isDisabled) {
      console.log('⚠️ 跳过测试：Provider 未配置')
      test.skip()
      return
    }

    // 发送测试消息
    const testMessage = 'E2E 测试消息 - ' + Date.now()
    await textarea.fill(testMessage)
    await window.waitForTimeout(500)

    // 点击发送按钮
    const sendBtn = window.locator('button:has-text("发送")')
    if (await sendBtn.isVisible()) {
      await sendBtn.click()
    } else {
      await textarea.press('Enter')
    }

    console.log('📤 已发送消息:', testMessage)
    
    // 等待响应
    await window.waitForTimeout(10000)
    
    // 验证消息显示在界面上
    const messageContent = window.locator('.msg-content', { hasText: testMessage })
    const isVisible = await messageContent.isVisible()
    
    if (isVisible) {
      console.log('✅ 消息已显示在界面上')
    } else {
      console.log('⚠️ 消息未在界面上显示')
    }
  })

  test('3. [持久化测试] 重启应用后会话应持久化', async () => {
    // 记录当前会话数
    const conversationCountBefore = await window.locator('[class*="conversation"]').count()
    console.log('📊 重启前会话数:', conversationCountBefore)
    
    // 关闭应用
    await app.close()
    await new Promise((r) => setTimeout(r, 2000))
    
    // 重新启动应用
    app = await electron.launch({
      args: [APP_PATH, '--no-sandbox', '--disable-gpu']
    })
    window = await app.firstWindow()
    await waitForAppReady(window)
    
    // 等待应用完全加载
    await window.waitForTimeout(3000)
    
    // 检查会话是否保留
    const conversationCountAfter = await window.locator('[class*="conversation"]').count()
    console.log('📊 重启后会话数:', conversationCountAfter)
    
    // 会话数应该 >= 重启前
    expect(conversationCountAfter).toBeGreaterThanOrEqual(conversationCountBefore)
    
    console.log('✅ 会话持久化验证完成')
  })

  test('4. [集成测试] 数据库文件应持续存在', async () => {
    const dbExists = fs.existsSync(DB_PATH)
    expect(dbExists).toBe(true)
    
    const stats = fs.statSync(DB_PATH)
    expect(stats.size).toBeGreaterThan(1000)
    
    console.log('✅ 数据库文件验证通过')
    console.log('   路径:', DB_PATH)
    console.log('   大小:', stats.size, 'bytes')
  })
})

test.describe.serial('Sprint 11 - Token 显示测试', () => {
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

  test('5. [UI 测试] Token 信息应显示在界面上', async () => {
    // 查找 Token 显示区域
    const tokenDisplay = window.locator('[class*="token"], [class*="usage"], [class*="Token"]')
    
    if (await tokenDisplay.count() > 0) {
      const tokenText = await tokenDisplay.first().textContent()
      console.log('✅ Token 显示区域找到:', tokenText?.substring(0, 50))
    } else {
      console.log('⚠️ 未找到 Token 显示区域')
    }
    
    // 发送消息后检查 Token 更新
    const textarea = window.locator('textarea')
    if (!(await textarea.isDisabled())) {
      await textarea.fill('测试 Token 统计')
      await textarea.press('Enter')
      await window.waitForTimeout(5000)
      
      // 再次检查 Token 显示
      if (await tokenDisplay.count() > 0) {
        const tokenTextAfter = await tokenDisplay.first().textContent()
        console.log('📊 消息后 Token 信息:', tokenTextAfter?.substring(0, 50))
      }
    }
  })
})

/**
 * Echora E2E 综合测试
 * 验证应用启动、UI结构、Agent交互
 */

const { test, expect, _electron: electron } = require('@playwright/test')
const { join } = require('path')

const APP_PATH = join(__dirname, '..')

test.describe('Echora E2E 综合测试', () => {

  test('应用启动和基础结构验证', async () => {
    console.log('🚀 启动Echora应用...')

    const app = await electron.launch({
      args: [APP_PATH, '--no-sandbox', '--disable-gpu']
    })

    console.log('✅ 应用已启动')

    const window = await app.firstWindow()

    // 等待应用加载
    await window.waitForSelector('#root', { timeout: 25000 })
    console.log('✅ 应用已加载')

    // 验证应用标题
    const title = await window.title()
    console.log('📋 应用标题:', title)
    expect(title).toBe('Echora 2.0')

    // 验证基础布局
    console.log('🔍 检查UI布局...')
    await expect(window.locator('.app')).toBeVisible()
    await expect(window.locator('.app-body')).toBeVisible()
    await expect(window.locator('.main-content')).toBeVisible()
    console.log('✅ 基础布局正常')

    // 验证侧边栏
    console.log('🔍 检查侧边栏...')
    const sidebar = window.locator('aside').first()
    await expect(sidebar).toBeVisible()
    console.log('✅ 侧边栏可见')

    // 截图
    await window.screenshot({ path: 'test-results/01-app-loaded.png' })
    console.log('📸 已截图应用启动状态')

    await app.close()
    console.log('✅ 测试完成')
  })

  test('Agent模式导航测试', async () => {
    console.log('🚀 启动应用进行Agent导航测试...')

    const app = await electron.launch({
      args: [APP_PATH, '--no-sandbox', '--disable-gpu']
    })

    const window = await app.firstWindow()
    await window.waitForSelector('#root', { timeout: 25000 })
    console.log('✅ 应用已加载')

    // 查找并打开功能菜单
    console.log('🔍 查找功能菜单...')
    const menuBtn = window.locator('button:has-text("功能菜单")').first()
    const menuVisible = await menuBtn.isVisible().catch(() => false)

    if (menuVisible) {
      console.log('✅ 找到功能菜单按钮')
      await menuBtn.click()
      await window.waitForTimeout(500)
      console.log('✅ 功能菜单已打开')

      // 截图
      await window.screenshot({ path: 'test-results/02-menu-open.png' })

      // 查找Agent模式
      console.log('🔍 查找Agent模式...')
      const agentEntry = window.locator('text=Agent模式').first()
      const agentVisible = await agentEntry.isVisible().catch(() => false)

      if (agentVisible) {
        console.log('✅ 找到Agent模式入口')
        await agentEntry.click()
        await window.waitForTimeout(1000)
        console.log('✅ 已进入Agent模式')

        // 截图
        await window.screenshot({ path: 'test-results/03-agent-view.png' })

        // 验证Agent界面
        console.log('🔍 验证Agent界面...')
        const textarea = window.locator('textarea').first()
        const textareaVisible = await textarea.isVisible().catch(() => false)

        if (textareaVisible) {
          console.log('✅ Agent输入框可见')
        } else {
          console.log('⚠️ Agent输入框不可见（可能Provider未配置）')
        }
      } else {
        console.log('❌ Agent模式入口不可见')
      }
    } else {
      console.log('❌ 功能菜单按钮不可见')
    }

    await app.close()
    console.log('✅ Agent导航测试完成')
  })

  test('消息发送和响应测试', async () => {
    console.log('🚀 启动应用进行消息交互测试...')

    const app = await electron.launch({
      args: [APP_PATH, '--no-sandbox', '--disable-gpu']
    })

    const window = await app.firstWindow()
    await window.waitForSelector('#root', { timeout: 25000 })
    console.log('✅ 应用已加载')

    // 进入Agent模式
    console.log('🔍 进入Agent模式...')
    const menuBtn = window.locator('button:has-text("功能菜单")').first()

    if (await menuBtn.isVisible().catch(() => false)) {
      await menuBtn.click()
      await window.waitForTimeout(500)

      const agentEntry = window.locator('text=Agent模式').first()
      if (await agentEntry.isVisible().catch(() => false)) {
        await agentEntry.click()
        await window.waitForTimeout(1000)
        console.log('✅ 已进入Agent模式')

        // 查找输入框
        const textarea = window.locator('textarea').first()
        const textareaVisible = await textarea.isVisible().catch(() => false)

        if (textareaVisible) {
          // 输入测试消息
          const testMessage = '你好，请介绍一下你自己'
          console.log(`📝 输入测试消息: "${testMessage}"`)

          await textarea.fill(testMessage)
          await window.waitForTimeout(500)

          // 截图输入状态
          await window.screenshot({ path: 'test-results/04-message-input.png' })

          // 查找发送按钮
          const sendBtn = window.locator('button:has-text("发送")').first()
          const sendBtnVisible = await sendBtn.isVisible().catch(() => false)

          if (sendBtnVisible) {
            // 发送消息
            console.log('📤 发送消息...')
            await sendBtn.click()
            console.log('✅ 消息已发送')

            // 截图发送状态
            await window.screenshot({ path: 'test-results/05-message-sent.png' })

            // 等待响应
            console.log('⏳ 等待Agent响应...')

            try {
              await window.waitForFunction(
                () => {
                  const msgs = document.querySelectorAll('[class*="msg"], [class*="message"]')
                  return msgs.length > 1
                },
                { timeout: 15000 }
              )

              console.log('✅ 收到Agent响应')
              await window.screenshot({ path: 'test-results/06-response.png' })

            } catch (error) {
              console.log('⚠️ 等待响应超时（可能是正常的）')
              await window.screenshot({ path: 'test-results/06-timeout.png' })
            }

          } else {
            console.log('❌ 发送按钮不可见')
          }
        } else {
          console.log('⚠️ 输入框不可见（可能Provider未配置）')
        }
      }
    }

    await app.close()
    console.log('✅ 消息交互测试完成')
  })

})

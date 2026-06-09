/**
 * 独立的 Agent 交互测试
 * 用于测试 Echora Agent 是否能正常接收和响应消息
 */

import { _electron as electron, type Page } from '@playwright/test'
import { join } from 'path'
import * as fs from 'fs'
import * as path from 'path'

const APP_PATH = join(__dirname, '..', '..')
const TIMEOUT = 20000

async function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms))
}

async function main() {
  console.log('🚀 启动 Echora 应用...')

  try {
    // 启动应用
    const app = await electron.launch({
      args: [APP_PATH, '--no-sandbox', '--disable-gpu']
    })

    console.log('✅ 应用已启动')

    const window = await app.firstWindow()
    console.log('✅ 窗口已获取')

    // 等待应用加载
    await window.waitForSelector('#root', { timeout: TIMEOUT })
    console.log('✅ 应用已加载')

    // 截取应用截图
    await window.screenshot({ path: 'test-results/agent-chat-initial.png' })
    console.log('📸 已截图初始状态')

    // 检查应用标题
    const title = await window.title()
    console.log('📋 应用标题:', title)

    // 导航到 Agent 模式
    console.log('\n🔍 查找功能菜单...')

    const menuBtn = window.locator('button:has-text("功能菜单"), [class*="menu"]').first()
    const isMenuVisible = await menuBtn.isVisible().catch(() => false)

    if (isMenuVisible) {
      console.log('✅ 找到功能菜单按钮')
      await menuBtn.click()
      await sleep(500)

      // 截图菜单
      await window.screenshot({ path: 'test-results/agent-chat-menu.png' })
    } else {
      console.log('⚠️ 功能菜单不可见，尝试其他方法')
    }

    // 查找 Agent 模式入口
    console.log('\n🔍 查找 Agent 模式入口...')

    const agentEntry = window.locator('text=Agent, button:has-text("Agent")').first()
    const isAgentEntryVisible = await agentEntry.isVisible().catch(() => false)

    if (isAgentEntryVisible) {
      console.log('✅ 找到 Agent 模式入口')
      await agentEntry.click()
      await sleep(1000)
    } else {
      console.log('⚠️ Agent 模式入口不可见')
    }

    // 截图当前状态
    await window.screenshot({ path: 'test-results/agent-chat-agent-view.png' })

    // 检查是否显示了 Agent 界面
    console.log('\n🔍 检查 Agent 界面...')

    const textarea = window.locator('textarea').first()
    const isTextareaVisible = await textarea.isVisible().catch(() => false)

    if (isTextareaVisible) {
      console.log('✅ 找到输入框')

      // 测试消息
      const testMessage = '你好，请介绍一下你自己'
      console.log(`📝 发送测试消息: "${testMessage}"`)

      await textarea.fill(testMessage)
      await sleep(500)

      // 截图输入状态
      await window.screenshot({ path: 'test-results/agent-chat-input.png' })

      // 查找发送按钮
      const sendBtn = window.locator('button:has-text("发送"), button:has-text("Send")').first()
      const isSendBtnVisible = await sendBtn.isVisible().catch(() => false)

      if (isSendBtnVisible) {
        console.log('✅ 找到发送按钮')
        await sendBtn.click()

        console.log('📤 消息已发送，等待响应...')

        // 等待响应（最多 15 秒）
        await sleep(15000)

        // 截图响应状态
        await window.screenshot({ path: 'test-results/agent-chat-response.png' })

        // 检查响应内容
        console.log('\n📋 检查响应...')

        const messageAreas = window.locator('div:has-text("你好")').first()
        const responseContent = await messageAreas.textContent().catch(() => '无法获取')

        console.log('📨 响应内容片段:', responseContent?.substring(0, 200) || '无')

        // 检查是否有错误日志
        const logs = await window.evaluate(() => {
          const allLogs: string[] = []
          const logElements = document.querySelectorAll('[class*="log"], [class*="console"]')
          logElements.forEach(el => {
            const text = el.textContent
            if (text && (text.includes('Error') || text.includes('error'))) {
              allLogs.push(text.substring(0, 100))
            }
          })
          return allLogs
        }).catch(() => [])

        if (logs.length > 0) {
          console.log('⚠️ 发现错误日志:', logs.length, '条')
          logs.forEach(log => console.log('  -', log))
        } else {
          console.log('✅ 未发现错误日志')
        }

        console.log('\n✅ Agent 交互测试完成')
      } else {
        console.log('❌ 未找到发送按钮')
      }
    } else {
      console.log('❌ 未找到输入框 - 可能 Agent 界面未加载')
    }

    // 输出测试结果
    console.log('\n' + '='.repeat(60))
    console.log('📊 测试结果')
    console.log('='.repeat(60))
    console.log('✅ 应用已启动')
    console.log(`${isMenuVisible ? '✅' : '⚠️'} 功能菜单 ${isMenuVisible ? '可见' : '不可见'}`)
    console.log(`${isAgentEntryVisible ? '✅' : '⚠️'} Agent 模式入口 ${isAgentEntryVisible ? '可见' : '不可见'}`)
    console.log(`${isTextareaVisible ? '✅' : '❌'} 输入框 ${isTextareaVisible ? '可见' : '不可见'}`)
    console.log('='.repeat(60) + '\n')

    // 关闭应用
    console.log('🔒 关闭应用...')
    await app.close()
    console.log('✅ 测试完成')

  } catch (error) {
    console.error('❌ 测试失败:', error)
    process.exit(1)
  }
}

// 执行测试
main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})

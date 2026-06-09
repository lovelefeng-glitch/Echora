/**
 * Echora Agent通讯测试 - V5
 * 使用console.log拦截来调试
 */

import { test, _electron as electron, type Page, expect } from '@playwright/test'
import { join } from 'path'

const APP_PATH = join(__dirname, '..', '..')

async function waitForAppReady(page: Page, timeout = 25000) {
  await page.locator('#root').waitFor({ state: 'visible', timeout })
}

test.describe.serial('Echora Agent Communication Test V5', () => {
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

  test('Debug with console log interception', async () => {
    await window.waitForTimeout(3000)

    // 拦截console.log
    const consoleLogs: string[] = []
    window.on('console', (msg) => {
      const text = msg.text()
      if (text.includes('[AgentView]') || text.includes('[Preload]') || text.includes('stream')) {
        consoleLogs.push(text)
        console.log('[CONSOLE]', text.substring(0, 200))
      }
    })

    // 进入Echora Agent
    const echoraAgent = window.locator('[class*="agentItem"]').filter({ hasText: 'Echora Agent' }).first()
    let retries = 0
    while (await echoraAgent.count() === 0 && retries < 10) {
      await window.waitForTimeout(1000)
      retries++
    }
    if (await echoraAgent.count() === 0) {
      console.log('Echora Agent not found')
      return
    }
    await echoraAgent.click()
    await window.waitForTimeout(1000)

    // 检查配置
    const config = await window.evaluate(async () => {
      const api = (window as any).echora
      if (!api?.config) return null
      const all = await api.config.getAll()
      return {
        agentProviders: all.agentProviders || [],
        directApiConfigs: all.directApiConfigs || []
      }
    })
    console.log('Config:', JSON.stringify(config, null, 2))

    // 发送消息
    const textarea = window.locator('textarea')
    if (await textarea.isDisabled()) {
      console.log('Input is disabled')
      return
    }

    const testMessage = '你好'
    await textarea.fill(testMessage)
    await textarea.press('Enter')
    console.log('Message sent:', testMessage)

    // 等待并检查
    for (let i = 0; i < 10; i++) {
      await window.waitForTimeout(2000)
      
      // 检查是否有streaming状态的消息
      const streamingStatus = await window.evaluate(() => {
        const loadingStatus = document.querySelectorAll('[class*="loadingStatus"]')
        const streamingDots = document.querySelectorAll('[class*="streamingDot"]')
        return {
          loadingStatusCount: loadingStatus.length,
          streamingDotCount: streamingDots.length,
          loadingStatusTexts: Array.from(loadingStatus).map(el => el.textContent)
        }
      })
      console.log(`\n--- Iteration ${i} ---`)
      console.log('Streaming status:', JSON.stringify(streamingStatus))

      // 检查msgContent内容
      const msgContents = await window.evaluate(() => {
        const els = document.querySelectorAll('[class*="msgContent"]')
        return Array.from(els).map(el => ({
          text: el.textContent?.substring(0, 200),
          html: el.innerHTML?.substring(0, 200)
        }))
      })
      console.log('msgContent count:', msgContents.length)
      if (msgContents.length > 0) {
        console.log('Last msgContent:', JSON.stringify(msgContents[msgContents.length - 1]))
      }
    }

    // 打印所有拦截的console日志
    console.log('\n=== Console Logs ===')
    consoleLogs.forEach(log => console.log(log))
    
    await window.screenshot({ path: 'test-results/v5-debug.png', fullPage: true })
  })
})

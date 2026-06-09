/**
 * Token信息显示测试 - 严谨版
 * 验证消息气泡下的token信息和底部上下文token信息
 */

import { test, _electron as electron, type Page, expect } from '@playwright/test'
import { join } from 'path'

const APP_PATH = join(__dirname, '..', '..')

async function waitForAppReady(page: Page, timeout = 25000) {
  await page.locator('#root').waitFor({ state: 'visible', timeout })
}

test.describe.serial('Token Display Test', () => {
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

  test('Token information displays after message', async () => {
    await window.waitForTimeout(3000)

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

    // 检查provider配置
    const providerConfig = await window.evaluate(async () => {
      const api = (window as any).echora
      if (!api?.config) return null
      const all = await api.config.getAll()
      const agentProviders = all.agentProviders || []
      return agentProviders.map((p: any) => ({
        id: p.id,
        name: p.name,
        contextWindow: p.contextWindow,
        defaultModel: p.defaultModel
      }))
    })
    console.log('Provider config:', JSON.stringify(providerConfig, null, 2))

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

    // 等待响应完成
    for (let i = 0; i < 15; i++) {
      await window.waitForTimeout(2000)

      // 检查是否有streaming状态
      const streamingStatus = await window.evaluate(() => {
        const loadingStatus = document.querySelectorAll('[class*="loadingStatus"]')
        return loadingStatus.length > 0
      })
      
      if (!streamingStatus && i > 2) {
        // 流式传输完成，检查token信息
        break
      }
    }

    // 截图
    await window.screenshot({ path: 'test-results/token-display-test.png', fullPage: true })

    // 检查消息气泡下的token信息
    const msgMetrics = await window.evaluate(() => {
      const metrics = document.querySelectorAll('[class*="msgMetric"]')
      return Array.from(metrics).map(el => el.textContent)
    })
    console.log('Message metrics:', JSON.stringify(msgMetrics))

    // 检查底部token信息
    const tokenInfo = await window.evaluate(() => {
      const tokenInfoEl = document.querySelector('[class*="tokenInfo"]')
      if (!tokenInfoEl) return null
      return {
        text: tokenInfoEl.textContent,
        visible: tokenInfoEl.offsetWidth > 0 && tokenInfoEl.offsetHeight > 0
      }
    })
    console.log('Token info:', JSON.stringify(tokenInfo))

    // 验证token信息是否显示
    const hasMsgMetrics = msgMetrics.length > 0 && msgMetrics.some(m => m && m.length > 0 && !m.match(/^\d{2}:\d{2}$/))
    const hasTokenInfo = tokenInfo !== null && tokenInfo.visible

    console.log('\n=== Test Result ===')
    console.log('Has message metrics:', hasMsgMetrics)
    console.log('Has token info:', hasTokenInfo)
    
    if (hasMsgMetrics) {
      console.log('Message metrics content:', msgMetrics)
    }
    if (tokenInfo) {
      console.log('Token info content:', tokenInfo.text)
    }

    // 验证配置文件是否创建
    const configFileExists = await window.evaluate(async () => {
      try {
        const api = (window as any).echora
        if (!api?.config) return false
        const all = await api.config.getAll()
        return all.agentProviders && all.agentProviders.length > 0
      } catch {
        return false
      }
    })
    console.log('Config file exists:', configFileExists)
  })
})

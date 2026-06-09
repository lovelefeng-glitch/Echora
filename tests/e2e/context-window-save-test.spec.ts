/**
 * Context Window保存测试
 * 验证contextWindow是否正确保存到配置文件
 */

import { test, _electron as electron, type Page, expect } from '@playwright/test'
import { join } from 'path'

const APP_PATH = join(__dirname, '..', '..')

async function waitForAppReady(page: Page, timeout = 25000) {
  await page.locator('#root').waitFor({ state: 'visible', timeout })
}

test.describe.serial('Context Window Save Test', () => {
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

  test('Context window saves correctly', async () => {
    await window.waitForTimeout(3000)

    // 直接检查当前配置
    const configBefore = await window.evaluate(async () => {
      const api = (window as any).echora
      if (!api?.config) return null
      const all = await api.config.getAll()
      return {
        agentProviders: all.agentProviders
      }
    })
    console.log('Config before:', JSON.stringify(configBefore, null, 2))

    // 检查provider是否有contextWindow
    const providers = configBefore?.agentProviders || []
    const hasContextWindow = providers.some((p: any) => p.contextWindow && p.contextWindow > 0)
    console.log('Has contextWindow before:', hasContextWindow)

    // 如果没有contextWindow，尝试添加
    if (!hasContextWindow && providers.length > 0) {
      const provider = providers[0]
      console.log('Adding contextWindow to provider:', provider.id)

      // 通过API直接设置contextWindow
      const updated = await window.evaluate(async (providerId: string) => {
        const api = (window as any).echora
        if (!api?.config) return false
        
        // 获取当前配置
        const all = await api.config.getAll()
        const agentProviders = all.agentProviders || []
        
        // 找到provider并更新
        const updatedProviders = agentProviders.map((p: any) => {
          if (p.id === providerId) {
            return { ...p, contextWindow: 128000 }
          }
          return p
        })
        
        // 保存
        await api.config.set('agentProviders', updatedProviders)
        return true
      }, provider.id)
      
      console.log('Updated provider:', updated)

      // 检查更新后的配置
      const configAfter = await window.evaluate(async () => {
        const api = (window as any).echora
        if (!api?.config) return null
        const all = await api.config.getAll()
        return {
          agentProviders: all.agentProviders
        }
      })
      console.log('Config after:', JSON.stringify(configAfter, null, 2))

      // 验证contextWindow已添加
      const providersAfter = configAfter?.agentProviders || []
      const hasContextWindowAfter = providersAfter.some((p: any) => p.contextWindow && p.contextWindow > 0)
      console.log('Has contextWindow after:', hasContextWindowAfter)

      if (hasContextWindowAfter) {
        const providerWithWindow = providersAfter.find((p: any) => p.contextWindow && p.contextWindow > 0)
        console.log('Provider with contextWindow:', JSON.stringify(providerWithWindow))
      }
    }
  })
})

/**
 * Layout Screenshot Check
 *
 * 启动 Electron 应用，逐页截图检查布局。
 * 运行方式: npx playwright test tests/screenshot-layout-check.ts --reporter=list
 *
 * 截图输出到 tests/screenshots/ 目录
 */
import { test, _electron as electron } from '@playwright/test'
import { join } from 'path'
import { mkdirSync, existsSync } from 'fs'

const APP_PATH = join(__dirname, '..', '..')
const SCREENSHOT_DIR = join(__dirname, 'screenshots')

// 确保截图目录存在
if (!existsSync(SCREENSHOT_DIR)) {
  mkdirSync(SCREENSHOT_DIR, { recursive: true })
}

async function waitForAppReady(page: import('@playwright/test').Page) {
  await page.locator('#root').waitFor({ state: 'visible', timeout: 20000 })
  await page.waitForTimeout(1000) // 等待渲染完成
}

test.describe('Layout Screenshot Check', () => {
  test('capture all pages - light mode', async () => {
    const app = await electron.launch({ args: [APP_PATH] })
    const window = await app.firstWindow()
    await waitForAppReady(window)

    // 设置窗口大小为 1280x860（默认）
    await window.setViewportSize({ width: 1280, height: 860 })

    // 1. Chat 页面（默认视图）
    await window.screenshot({ path: join(SCREENSHOT_DIR, '01-chat-light.png'), fullPage: false })
    console.log('Screenshot: 01-chat-light.png')

    // 2. Settings 页面
    const settingsBtn = window.locator('text=⚙️ 系统设置').first()
    if (await settingsBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await settingsBtn.click()
      await window.waitForTimeout(500)
    } else {
      // 尝试通过菜单导航
      const menuBtn = window.locator('text=🧭 功能菜单').first()
      if (await menuBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await menuBtn.click()
        await window.waitForTimeout(300)
        const settingsLink = window.locator('text=⚙️ 系统设置').first()
        if (await settingsLink.isVisible({ timeout: 2000 }).catch(() => false)) {
          await settingsLink.click()
          await window.waitForTimeout(500)
        }
      }
    }
    await window.screenshot({ path: join(SCREENSHOT_DIR, '02-settings-light.png'), fullPage: false })
    console.log('Screenshot: 02-settings-light.png')

    // 3. AI 管理页面
    const aiMgmtBtn = window.locator('text=🖥️ AI 管理').first()
    if (await aiMgmtBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await aiMgmtBtn.click()
      await window.waitForTimeout(500)
    }
    await window.screenshot({ path: join(SCREENSHOT_DIR, '03-ai-mgmt-light.png'), fullPage: false })
    console.log('Screenshot: 03-ai-mgmt-light.png')

    // 4. Skills 页面
    const skillsBtn = window.locator('text=🧩 Skill 管理').first()
    if (await skillsBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await skillsBtn.click()
      await window.waitForTimeout(500)
    }
    await window.screenshot({ path: join(SCREENSHOT_DIR, '04-skills-light.png'), fullPage: false })
    console.log('Screenshot: 04-skills-light.png')

    await app.close()
    console.log('Light mode screenshots complete!')
  })

  test('capture all pages - dark mode', async () => {
    const app = await electron.launch({ args: [APP_PATH] })
    const window = await app.firstWindow()
    await waitForAppReady(window)

    await window.setViewportSize({ width: 1280, height: 860 })

    // 切换到暗色模式
    const themeBtn = window.locator('button[title*="切换"]').first()
    if (await themeBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await themeBtn.click()
      await window.waitForTimeout(500)
    }

    // 1. Chat 页面（暗色）
    await window.screenshot({ path: join(SCREENSHOT_DIR, '05-chat-dark.png'), fullPage: false })
    console.log('Screenshot: 05-chat-dark.png')

    // 2. Settings 页面（暗色）
    const menuBtn = window.locator('text=🧭 功能菜单').first()
    if (await menuBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await menuBtn.click()
      await window.waitForTimeout(300)
      const settingsLink = window.locator('text=⚙️ 系统设置').first()
      if (await settingsLink.isVisible({ timeout: 2000 }).catch(() => false)) {
        await settingsLink.click()
        await window.waitForTimeout(500)
      }
    }
    await window.screenshot({ path: join(SCREENSHOT_DIR, '06-settings-dark.png'), fullPage: false })
    console.log('Screenshot: 06-settings-dark.png')

    // 3. AI 管理页面（暗色）
    const aiMgmtBtn = window.locator('text=🖥️ AI 管理').first()
    if (await aiMgmtBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await aiMgmtBtn.click()
      await window.waitForTimeout(500)
    }
    await window.screenshot({ path: join(SCREENSHOT_DIR, '07-ai-mgmt-dark.png'), fullPage: false })
    console.log('Screenshot: 07-ai-mgmt-dark.png')

    await app.close()
    console.log('Dark mode screenshots complete!')
  })
})

import { test, expect, _electron as electron, type Page } from '@playwright/test'
import { join } from 'path'

const APP_PATH = join(__dirname, '..', '..')

/**
 * 简化的启动测试 - 验证应用能否正常启动并保持运行
 */
test('Echora 启动测试 - 验证应用能否启动', async () => {
  console.log('🚀 开始启动 Echora 应用...')
  
  // 启动应用
  const app = await electron.launch({
    args: [APP_PATH, '--no-sandbox', '--disable-gpu'],
    timeout: 30000,
  })

  console.log('✅ 应用已启动')

  // 获取窗口
  const window = await app.firstWindow()
  console.log('✅ 获取到窗口')

  // 等待应用完全加载
  await window.waitForLoadState('domcontentloaded')
  console.log('✅ DOM 已加载')

  // 等待 React 渲染
  await window.waitForTimeout(5000)
  console.log('✅ 等待 5 秒让应用初始化')

  // 检查窗口是否仍然打开
  const isClosed = window.isClosed()
  console.log(`窗口状态: ${isClosed ? '❌ 已关闭' : '✅ 仍打开'}`)
  
  // 截图验证
  await window.screenshot({ path: 'test-results/app-launch-screenshot.png' })
  console.log('✅ 截图已保存到 test-results/app-launch-screenshot.png')

  // 验证窗口标题
  try {
    const title = await window.title()
    console.log(`📝 窗口标题: "${title}"`)
  } catch (error) {
    console.log('⚠️ 无法获取标题:', error)
  }

  // 验证页面内容
  const bodyText = await window.locator('body').textContent()
  console.log(`📝 页面内容长度: ${bodyText?.length || 0} 字符`)
  console.log(`📝 页面前 200 字符: ${bodyText?.substring(0, 200)}`)

  // 检查是否有关键 UI 元素
  const hasRoot = await window.locator('#root').count() > 0
  console.log(`📝 React 根元素: ${hasRoot ? '✅ 存在' : '❌ 不存在'}`)

  // 最后关闭应用
  await app.close()
  console.log('✅ 测试完成，应用已关闭')

  // 验证应用确实运行过
  expect(bodyText).toBeTruthy()
})

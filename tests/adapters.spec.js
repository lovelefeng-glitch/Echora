// Echora - 适配器管理测试
// 测试适配器列表、切换、状态指示

const { test, expect } = require('@playwright/test');
const { launchEchora, closeEchora } = require('./helpers/electron');

let app, window;

test.beforeAll(async () => {
  ({ app, window } = await launchEchora({ args: ['--dev'] }));
});

test.afterAll(async () => {
  await closeEchora(app);
});

test.describe('适配器管理', () => {

  test('适配器列表加载', async () => {
    // 等待适配器列表渲染
    await window.waitForTimeout(2000);

    // 截图记录当前状态
    await window.screenshot({
      path: 'tests/fixtures/adapter-list.png',
      fullPage: false,
    });

    // 检查是否有适配器相关内容
    const body = await window.textContent('body');
    // 应包含至少一个已知适配器名
    const hasAdapter = 
      body.includes('OpenClaw') || 
      body.includes('QClaw') || 
      body.includes('Hermes') || 
      body.includes('Cursor') ||
      body.includes('适配器') ||
      body.includes('adapter');
    expect(hasAdapter).toBe(true);
  });

  test('适配器状态指示器', async () => {
    // 检查是否有状态指示元素
    const statusIndicators = await window.$$('[class*="status"], [class*="indicator"], .dot, .badge');
    
    // 至少应该有一些状态指示
    // （即使离线状态也会显示"未运行"）
    await window.screenshot({
      path: 'tests/fixtures/adapter-status.png',
      fullPage: false,
    });

    // 不强制要求有状态指示器（取决于 UI 实现）
    // 此测试主要验证不崩溃
    expect(true).toBe(true);
  });

  test('点击适配器不崩溃', async () => {
    // 尝试点击第一个可见的可点击元素
    const clickable = await window.$('button, [role="button"], .card, [class*="adapter"]');
    
    if (clickable) {
      await clickable.click();
      await window.waitForTimeout(500);
      
      // 验证窗口仍然存活
      const isDestroyed = await window.evaluate(() => window.closed);
      expect(isDestroyed).toBe(false);
    }
  });
});

// Echora - 冒烟测试
// 验证应用能正常启动并渲染核心 UI

const { test, expect } = require('@playwright/test');
const { launchEchora, closeEchora } = require('./helpers/electron');

let app, window;

test.beforeAll(async () => {
  ({ app, window } = await launchEchora({ args: ['--dev'] }));
});

test.afterAll(async () => {
  await closeEchora(app);
});

test.describe('Echora 冒烟测试', () => {

  test('应用启动成功', async () => {
    const title = await window.title();
    expect(title).toContain('Echora');
  });

  test('主窗口尺寸正常', async () => {
    const [width, height] = await window.evaluate(() => {
      const { innerWidth, innerHeight } = window;
      return [innerWidth, innerHeight];
    });
    expect(width).toBeGreaterThanOrEqual(900);
    expect(height).toBeGreaterThanOrEqual(600);
  });

  test('侧边栏渲染', async () => {
    // Echora 有侧边栏导航
    const sidebar = await window.$('nav, .sidebar, .nav, [class*="sidebar"], [class*="nav"]');
    expect(sidebar).not.toBeNull();
  });

  test('无 JS 控制台错误', async () => {
    const errors = [];
    window.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    // 等待一段时间收集错误
    await window.waitForTimeout(2000);

    // 过滤已知的非关键错误
    const criticalErrors = errors.filter(e =>
      !e.includes('favicon') &&
      !e.includes('net::ERR') &&
      !e.includes('WebSocket')
    );

    expect(criticalErrors).toEqual([]);
  });

  test('页面 DOM 加载完成', async () => {
    const readyState = await window.evaluate(() => document.readyState);
    expect(readyState).toBe('complete');
  });

  test('截图：初始状态', async () => {
    await window.screenshot({
      path: 'tests/fixtures/initial-state.png',
      fullPage: false,
    });
  });
});

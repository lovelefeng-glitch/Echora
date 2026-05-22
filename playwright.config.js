// Echora - Playwright 配置
// Electron 自动化测试
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.js',
  
  // Electron 测试不需要 web 服务器
  webServer: undefined,

  // 测试超时：Electron 启动较慢
  timeout: 30_000,
  expect: { timeout: 10_000 },

  // 失败重试
  retries: 1,

  // 并发：Electron 测试建议串行
  workers: 1,

  // 报告
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
  ],

  // 输出目录：全部收到 tests/output/
  outputDir: './tests/output',

  // 全局设置
  use: {
    // 截图保存
    screenshot: 'only-on-failure',
    // 跟踪录制
    trace: 'on-first-retry',
  },
});

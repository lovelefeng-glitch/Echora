// Echora - Playwright Electron 测试辅助
// 封装 Electron 启动/关闭逻辑

const { _electron: electron } = require('playwright');
const path = require('path');

const ECHORA_ROOT = path.resolve(__dirname, '../..');

/**
 * 启动 Echora 应用
 * @param {object} options - 可选配置
 * @param {string[]} options.args - 额外启动参数
 * @param {object} options.env - 环境变量
 * @returns {Promise<{app, window}>}
 */
async function launchEchora(options = {}) {
  const {
    args = ['--dev'],        // 默认 dev 模式
    env = {},
  } = options;

  const app = await electron.launch({
    args: ['main.js', ...args],
    cwd: ECHORA_ROOT,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      ...env,
    },
    // 不启动代理服务器（测试环境可能端口冲突）
    // 如需测试代理，可设置 PROXY_PORT 环境变量
  });

  // 等待主窗口
  const window = await app.firstWindow();
  
  // 等待窗口加载完成
  await window.waitForLoadState('domcontentloaded');

  return { app, window };
}

/**
 * 安全关闭应用
 */
async function closeEchora(app) {
  if (app) {
    try {
      await app.close();
    } catch (e) {
      // 进程可能已退出
    }
  }
}

/**
 * 获取窗口标题
 */
async function getTitle(window) {
  return window.title();
}

/**
 * 等待特定元素出现
 */
async function waitForSelector(window, selector, timeout = 10_000) {
  return window.waitForSelector(selector, { timeout });
}

/**
 * 检查侧边栏/导航是否存在
 */
async function checkSidebar(window) {
  // Echora 的侧边栏通常是 nav 元素
  const sidebar = await window.$('nav, .sidebar, .nav, [class*="sidebar"]');
  return sidebar !== null;
}

/**
 * 获取所有适配器卡片
 */
async function getAdapterCards(window) {
  return window.$$('[class*="adapter"], [class*="card"], [data-adapter]');
}

module.exports = {
  launchEchora,
  closeEchora,
  getTitle,
  waitForSelector,
  checkSidebar,
  getAdapterCards,
  ECHORA_ROOT,
};

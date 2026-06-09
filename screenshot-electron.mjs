/**
 * Playwright + Electron 自动截图脚本
 * 截取真实 Electron 应用的各个页面
 */
import { _electron as electron } from 'playwright';
import { mkdirSync } from 'fs';

mkdirSync('screenshots/electron', { recursive: true });

const app = await electron.launch({
  args: ['.'],
  env: { ...process.env, NODE_ENV: 'production' }
});

// 等待窗口加载
await app.waitForEvent('window');
await new Promise(r => setTimeout(r, 2000));

// 找到主窗口（URL 包含 index.html 的那个）
const allWindows = app.windows();
console.log(`Found ${allWindows.length} windows`);
let window = null;
for (const w of allWindows) {
  const url = w.url();
  console.log(`  Window: ${url.substring(0, 80)}`);
  if (url.includes('index.html') || url.includes('renderer')) {
    window = w;
  }
}
// 如果没找到，取第一个非 devtools 的窗口
if (!window) {
  for (const w of allWindows) {
    if (!w.url().includes('devtools')) {
      window = w;
      break;
    }
  }
}
if (!window) window = await app.firstWindow();

// 关闭 DevTools 窗口
for (const w of allWindows) {
  if (w.url().includes('devtools')) {
    try { await w.close(); } catch {}
  }
}

await window.waitForLoadState('domcontentloaded');
await window.waitForTimeout(3000);

// 设置窗口大小
await window.setViewportSize({ width: 1280, height: 800 });
await window.waitForTimeout(1000);

// ===== 截图 1: 默认聊天页（无 Agent 选中）=====
await window.screenshot({ path: 'screenshots/electron/01-chat-default.png' });
console.log('1: chat default');

// ===== 截图 2: 点击一个 Agent =====
const agentItems = await window.locator('[class*="agentItem"]').all();
if (agentItems.length > 0) {
  await agentItems[0].click();
  await window.waitForTimeout(1000);
}
await window.screenshot({ path: 'screenshots/electron/02-chat-agent.png' });
console.log('2: chat with agent');

// ===== 截图 3: 打开功能菜单 =====
const drawerToggle = window.locator('[class*="drawerToggle"]');
if (await drawerToggle.count() > 0) {
  await drawerToggle.click();
  await window.waitForTimeout(800);
}
await window.screenshot({ path: 'screenshots/electron/03-drawer-open.png' });
console.log('3: drawer open');

// ===== 截图 4: 系统设置 - 全局 =====
const settingsItem = window.locator('[class*="drawerMenuItem"]').filter({ hasText: '系统设置' });
if (await settingsItem.count() > 0) {
  await settingsItem.click();
  await window.waitForTimeout(1000);
}
await window.screenshot({ path: 'screenshots/electron/04-settings-global.png' });
console.log('4: settings global');

// ===== 截图 5: 系统设置 - openclaw 配置 =====
const openclawTab = window.locator('button').filter({ hasText: 'openclaw' }).first();
if (await openclawTab.count() > 0 && await openclawTab.isVisible()) {
  await openclawTab.click();
  await window.waitForTimeout(1000);
}
await window.screenshot({ path: 'screenshots/electron/05-settings-openclaw.png' });
console.log('5: settings openclaw');

// ===== 截图 6: 滚动 openclaw 配置页面 =====
await window.evaluate(() => {
  const scrollable = document.querySelector('[class*="main"]');
  if (scrollable) scrollable.scrollTop = 400;
});
await window.waitForTimeout(500);
await window.screenshot({ path: 'screenshots/electron/06-settings-openclaw-scroll.png' });
console.log('6: settings openclaw scrolled');

// ===== 截图 7: 系统设置 - hermes 配置 =====
const hermesTab = window.locator('button').filter({ hasText: 'hermes' }).first();
if (await hermesTab.count() > 0 && await hermesTab.isVisible()) {
  await hermesTab.click();
  await window.waitForTimeout(1000);
}
await window.screenshot({ path: 'screenshots/electron/07-settings-hermes.png' });
console.log('7: settings hermes');

// ===== 截图 8: AI 管理 =====
const drawerToggle2 = window.locator('[class*="drawerToggle"]');
if (await drawerToggle2.count() > 0) {
  await drawerToggle2.click();
  await window.waitForTimeout(500);
}
const aiMgmtItem = window.locator('[class*="drawerMenuItem"]').filter({ hasText: 'AI 管理' });
if (await aiMgmtItem.count() > 0) {
  await aiMgmtItem.click();
  await window.waitForTimeout(1000);
}
await window.screenshot({ path: 'screenshots/electron/08-ai-mgmt.png' });
console.log('8: AI management');

// ===== 截图 9: Skill 管理 =====
const drawerToggle3 = window.locator('[class*="drawerToggle"]');
if (await drawerToggle3.count() > 0) {
  await drawerToggle3.click();
  await window.waitForTimeout(500);
}
const skillsItem = window.locator('[class*="drawerMenuItem"]').filter({ hasText: 'Skill' });
if (await skillsItem.count() > 0) {
  await skillsItem.click();
  await window.waitForTimeout(1000);
}
await window.screenshot({ path: 'screenshots/electron/09-skills.png' });
console.log('9: skills');

// ===== 截图 10: 回到聊天页 =====
const drawerToggle4 = window.locator('[class*="drawerToggle"]');
if (await drawerToggle4.count() > 0) {
  await drawerToggle4.click();
  await window.waitForTimeout(500);
}
const chatItem = window.locator('[class*="drawerMenuItem"]').filter({ hasText: 'AI 对话' });
if (await chatItem.count() > 0) {
  await chatItem.click();
  await window.waitForTimeout(800);
}
await window.screenshot({ path: 'screenshots/electron/10-chat-final.png' });
console.log('10: chat final');

// 关闭应用
await app.close();
console.log('Done - screenshots saved to screenshots/electron/');

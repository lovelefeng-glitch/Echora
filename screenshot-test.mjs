import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

mkdirSync('screenshots', { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
await page.waitForTimeout(3000);

// Screenshot 1: Default page (chat empty state)
await page.screenshot({ path: 'screenshots/01-chat-default.png', fullPage: false });
console.log('1: chat default');

// Click drawer toggle to open menu
const drawerToggle = page.locator('[class*="drawerToggle"]');
if (await drawerToggle.count() > 0) {
  await drawerToggle.click({ force: true });
  await page.waitForTimeout(800);
}
await page.screenshot({ path: 'screenshots/02-drawer-open.png', fullPage: false });
console.log('2: drawer open');

// Click settings menu item
const settingsItem = page.locator('[class*="drawerMenuItem"]').filter({ hasText: '系统设置' });
if (await settingsItem.count() > 0) {
  await settingsItem.click({ force: true });
  await page.waitForTimeout(800);
}
await page.screenshot({ path: 'screenshots/03-settings-global.png', fullPage: false });
console.log('3: settings global');

// Click openclaw tab if visible
const openclawTab = page.locator('button').filter({ hasText: 'openclaw' }).first();
if (await openclawTab.count() > 0 && await openclawTab.isVisible()) {
  await openclawTab.click({ force: true });
  await page.waitForTimeout(800);
}
await page.screenshot({ path: 'screenshots/04-settings-openclaw.png', fullPage: false });
console.log('4: settings openclaw');

// Navigate to AI Management
const drawerToggle2 = page.locator('[class*="drawerToggle"]');
if (await drawerToggle2.count() > 0) {
  await drawerToggle2.click({ force: true });
  await page.waitForTimeout(500);
}
const aiMgmtItem = page.locator('[class*="drawerMenuItem"]').filter({ hasText: 'AI 管理' });
if (await aiMgmtItem.count() > 0) {
  await aiMgmtItem.click({ force: true });
  await page.waitForTimeout(800);
}
await page.screenshot({ path: 'screenshots/05-ai-mgmt.png', fullPage: false });
console.log('5: AI management');

// Navigate to Skills
const drawerToggle3 = page.locator('[class*="drawerToggle"]');
if (await drawerToggle3.count() > 0) {
  await drawerToggle3.click({ force: true });
  await page.waitForTimeout(500);
}
const skillsItem = page.locator('[class*="drawerMenuItem"]').filter({ hasText: 'Skill' });
if (await skillsItem.count() > 0) {
  await skillsItem.click({ force: true });
  await page.waitForTimeout(800);
}
await page.screenshot({ path: 'screenshots/06-skills.png', fullPage: false });
console.log('6: skills');

// Go back to chat and click an agent
const drawerToggle4 = page.locator('[class*="drawerToggle"]');
if (await drawerToggle4.count() > 0) {
  await drawerToggle4.click({ force: true });
  await page.waitForTimeout(500);
}
const chatItem = page.locator('[class*="drawerMenuItem"]').filter({ hasText: 'AI 对话' });
if (await chatItem.count() > 0) {
  await chatItem.click({ force: true });
  await page.waitForTimeout(500);
}
const agentItem = page.locator('[class*="agentItem"]').first();
if (await agentItem.count() > 0) {
  await agentItem.click({ force: true });
  await page.waitForTimeout(800);
}
await page.screenshot({ path: 'screenshots/07-chat-with-agent.png', fullPage: false });
console.log('7: chat with agent');

await browser.close();
console.log('Done - screenshots in screenshots/');

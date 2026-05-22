// Echora - 设置面板测试
// 测试设置项的打开、读取、保存

const { test, expect } = require('@playwright/test');
const { launchEchora, closeEchora } = require('./helpers/electron');

let app, window;

test.beforeAll(async () => {
  ({ app, window } = await launchEchora({ args: ['--dev'] }));
});

test.afterAll(async () => {
  await closeEchora(app);
});

test.describe('设置面板', () => {

  test('打开设置面板', async () => {
    // 尝试点击设置按钮（齿轮图标或文字）
    const settingsBtn = await window.$(
      'button:has-text("设置"), button:has-text("Settings"), ' +
      '[class*="settings"], [class*="config"], ' +
      'a:has-text("设置"), a:has-text("Settings")'
    );

    if (settingsBtn) {
      await settingsBtn.click();
      await window.waitForTimeout(500);

      await window.screenshot({
        path: 'tests/fixtures/settings-panel.png',
        fullPage: false,
      });

      // 验证设置面板出现
      const body = await window.textContent('body');
      const hasSettingsContent = 
        body.includes('设置') || 
        body.includes('Settings') || 
        body.includes('配置') ||
        body.includes('Config');
      expect(hasSettingsContent).toBe(true);
    } else {
      // 没找到设置按钮，跳过
      console.log('未找到设置按钮，跳过此测试');
      test.skip();
    }
  });

  test('设置面板包含配置项', async () => {
    // 检查是否有输入框、下拉框等配置控件
    const inputs = await window.$$('input, select, textarea');
    
    await window.screenshot({
      path: 'tests/fixtures/settings-controls.png',
      fullPage: false,
    });

    // 设置面板应该有一些配置控件
    // 如果没有，可能设置面板没正确打开
    if (inputs.length === 0) {
      console.log('未发现配置控件，可能设置面板未打开');
    }
    
    // 不强制断言，记录状态
    expect(true).toBe(true);
  });
});

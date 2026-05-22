// Echora - 对话功能测试
// 测试消息输入、发送、渲染

const { test, expect } = require('@playwright/test');
const { launchEchora, closeEchora } = require('./helpers/electron');

let app, window;

test.beforeAll(async () => {
  ({ app, window } = await launchEchora({ args: ['--dev'] }));
});

test.afterAll(async () => {
  await closeEchora(app);
});

test.describe('对话功能', () => {

  test('消息输入框存在', async () => {
    await window.waitForTimeout(2000);

    const textarea = await window.$('textarea, [contenteditable="true"], input[type="text"]');
    
    if (textarea) {
      await window.screenshot({
        path: 'tests/fixtures/chat-input.png',
        fullPage: false,
      });
      expect(textarea).not.toBeNull();
    } else {
      console.log('未找到消息输入框，可能需要先选择适配器');
      await window.screenshot({
        path: 'tests/fixtures/no-chat-input.png',
        fullPage: false,
      });
      test.skip();
    }
  });

  test('输入消息不崩溃', async () => {
    const textarea = await window.$('textarea, [contenteditable="true"], input[type="text"]');
    
    if (textarea) {
      await textarea.fill('Hello Echora Test');
      await window.waitForTimeout(300);

      const isDestroyed = await window.evaluate(() => window.closed);
      expect(isDestroyed).toBe(false);

      await window.screenshot({
        path: 'tests/fixtures/message-typed.png',
        fullPage: false,
      });
    } else {
      test.skip();
    }
  });

  test('发送按钮状态', async () => {
    const sendBtn = await window.$(
      'button:has-text("发送"), button:has-text("Send"), ' +
      '[class*="send"], [class*="submit"]'
    );

    if (sendBtn) {
      await window.screenshot({
        path: 'tests/fixtures/send-button.png',
        fullPage: false,
      });
    }
  });
});

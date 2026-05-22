# Echora 测试

基于 Playwright Electron 自动化的端到端测试。

## 快速开始

```bash
# 安装依赖
npm install

# 运行所有测试（无头模式）
npm test

# 带浏览器窗口运行（调试用）
npm run test:headed

# 交互式调试
npm run test:debug

# 查看测试报告
npm run test:report
```

## 测试文件

| 文件 | 说明 |
|------|------|
| `smoke.spec.js` | 冒烟测试：启动、窗口、DOM、控制台错误 |
| `adapters.spec.js` | 适配器管理：列表、状态、切换 |
| `settings.spec.js` | 设置面板：打开、配置项、保存 |
| `chat.spec.js` | 对话功能：输入框、输入、发送按钮 |

## 辅助工具

`helpers/electron.js` 封装了 Echora 启动/关闭逻辑：

```js
const { launchEchora, closeEchora } = require('./helpers/electron');

const { app, window } = await launchEchora({ args: ['--dev'] });
// ... 测试逻辑
await closeEchora(app);
```

## 输出目录

所有测试产物统一放在 `tests/` 下：

```
tests/
├── fixtures/        # 手动截图（测试中主动保存）
├── output/          # Playwright 自动产物（失败截图、trace）
└── *.spec.js
```

## 注意事项

- Electron 启动较慢，超时设为 30 秒
- 测试默认串行执行（`workers: 1`）
- 失败时自动截图到 `tests/output/`，重试时录制 trace
- 部分测试使用 `test.skip()` 优雅跳过（UI 未就绪时）

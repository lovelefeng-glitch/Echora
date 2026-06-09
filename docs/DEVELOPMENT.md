# Echora 2.0 开发文档

## 环境要求

| 依赖 | 最低版本 | 推荐版本 |
|------|----------|----------|
| Node.js | 18.0 | 20.x LTS |
| npm | 9.0 | 10.x |
| Git | 2.30 | 最新 |
| Python | 3.10 | 3.12 (可选，用于某些 AI) |

## 快速开始

### 1. 克隆仓库

```bash
git clone <repository-url>
cd "Echora 2.0"
```

### 2. 安装依赖

```bash
npm install
```

### 3. 启动开发服务器

```bash
npm run dev
```

这会同时启动：
- Vite 开发服务器 (渲染进程热重载)
- Electron 主进程 (自动重启)

## 项目结构

```
Echora 2.0/
├── src/                    # 源代码
│   ├── main/               # 主进程代码
│   │   ├── index.ts        # 入口文件
│   │   ├── ipc-router.ts   # IPC 路由
│   │   ├── api-server.ts   # HTTP API
│   │   ├── adapters/       # AI 适配器
│   │   ├── detectors/      # 检测器
│   │   ├── managers/       # 管理器
│   │   └── utils/          # 工具函数
│   ├── preload/            # 预加载脚本
│   │   └── index.ts
│   ├── renderer/           # 渲染进程
│   │   ├── components/     # React 组件
│   │   ├── hooks/          # 自定义 Hooks
│   │   ├── stores/         # Zustand Store
│   │   └── styles/         # 样式文件
│   └── shared/             # 共享类型
│       ├── ipc-channels.ts # IPC 通道常量
│       ├── ipc-types.ts    # IPC 类型定义
│       └── types.ts        # 通用类型
├── tests/                  # 测试文件
│   ├── unit/               # 单元测试
│   ├── helpers/            # 测试工具
│   └── setup.ts            # 测试配置
├── build/                  # 构建资源 (图标等)
├── out/                    # 构建产物
├── release/                # 打包产物
├── docs/                   # 文档
├── electron.vite.config.ts # Vite 配置
├── tsconfig.json           # TypeScript 配置
├── vitest.config.ts        # Vitest 配置
├── playwright.config.ts    # Playwright 配置
└── package.json            # 项目配置
```

## 常用命令

### 开发

```bash
# 启动开发服务器
npm run dev

# 预览构建产物
npm run preview

# 启动应用 (使用构建产物)
npm run start
```

### 构建

```bash
# 构建所有平台
npm run build

# 仅构建不解包
npm run build:unpack

# 构建 Windows 安装包 (NSIS + Portable)
npm run build:win

# 构建 macOS DMG
npm run build:mac

# 构建 Linux AppImage
npm run build:linux

# 构建 Windows 便携版
npm run build:portable
```

### 测试

```bash
# 运行所有单元测试
npm test

# 运行测试 (详细输出)
npm run test:unit

# 监视模式运行测试
npm run test:watch

# 运行 E2E 测试
npm run test:e2e

# 运行测试并生成覆盖率报告
npm run test:coverage
```

### 代码质量

```bash
# 运行 ESLint 检查
npm run lint

# 运行 ESLint 并自动修复
npm run lint:fix

# 运行 Prettier 格式化
npm run format
```

## TypeScript 配置

项目使用多个 TypeScript 配置文件：

| 文件 | 用途 |
|------|------|
| `tsconfig.json` | 基础配置，引用其他配置 |
| `tsconfig.main.json` | 主进程代码 |
| `tsconfig.preload.json` | 预加载脚本 |
| `tsconfig.web.json` | 渲染进程代码 |
| `tsconfig.node.json` | Node.js 工具代码 |

## 代码规范

### ESLint 配置

项目使用 ESLint 9 扁平配置 (`eslint.config.mjs`)，包含：
- `@typescript-eslint/eslint-plugin` - TypeScript 规则
- `@typescript-eslint/parser` - TypeScript 解析器
- `eslint-plugin-react-hooks` - React Hooks 规则

### Prettier 配置

```json
{
  "semi": false,
  "singleQuote": true,
  "tabWidth": 2,
  "trailingComma": "es5",
  "printWidth": 100,
  "bracketSpacing": true,
  "arrowParens": "always"
}
```

### 命名约定

| 类型 | 约定 | 示例 |
|------|------|------|
| 文件名 | kebab-case | `config-manager.ts` |
| 组件名 | PascalCase | `ChatArea.tsx` |
| CSS Module | PascalCase.module.css | `Chat.module.css` |
| 接口 | PascalCase | `GatewayStatus` |
| 类型别名 | PascalCase | `IpcChannel` |
| 常量 | UPPER_SNAKE_CASE | `IPC_CHANNELS` |
| 函数 | camelCase | `getOrCreateAdapter` |
| 变量 | camelCase | `mainWindow` |

## 添加新功能

### 1. 添加新的 IPC 通道

**步骤 1: 定义通道常量**

编辑 `src/shared/ipc-channels.ts`：

```typescript
export const IPC_CHANNELS = {
  // ... 现有通道
  NEW_FEATURE_ACTION: 'new-feature:action',
} as const
```

**步骤 2: 定义类型**

编辑 `src/shared/ipc-types.ts`：

```typescript
export type IpcHandleChannels = {
  // ... 现有通道
  'new-feature:action': {
    request: [param1: string, param2: number]
    response: { success: boolean; data?: unknown }
  }
}
```

**步骤 3: 注册处理器**

编辑 `src/main/index.ts` 的 `setupIPC()` 函数：

```typescript
ipcRouter.handle('new-feature:action', async (param1: string, param2: number) => {
  // 实现逻辑
  return { success: true, data: {} }
})
```

**步骤 4: 暴露 API**

编辑 `src/preload/index.ts`：

```typescript
const electronAPI = {
  // ... 现有 API
  newFeature: {
    action: (param1: string, param2: number) =>
      ipcRenderer.invoke('new-feature:action', param1, param2),
  },
}
```

**步骤 5: 在渲染进程中使用**

```typescript
const result = await window.echora.newFeature.action('test', 123)
```

### 2. 添加新的适配器

**步骤 1: 创建适配器文件**

创建 `src/main/adapters/new-adapter.ts`：

```typescript
import { BaseAdapter, type StartResult, type StopResult, type StatusResult } from './base-adapter'

export class NewAdapter extends BaseAdapter {
  constructor(config: AdapterConfig) {
    super(config)
    this.name = 'new-ai'
  }

  async start(): Promise<StartResult> {
    // 启动逻辑
    return { success: true }
  }

  async stop(): Promise<StopResult> {
    // 停止逻辑
    return { success: true }
  }

  async getStatus(): Promise<StatusResult> {
    // 状态检查
    return { status: 'offline' }
  }

  async listAgents(): Promise<AdapterAgentItem[]> {
    // 获取 Agent 列表
    return []
  }

  async sendMessage(agentId: string, message: string, userId?: string): Promise<SendMessageResult> {
    // 发送消息
    return { success: true, content: '响应' }
  }
}
```

**步骤 2: 注册适配器**

编辑 `src/main/index.ts` 的 `getOrCreateAdapter()` 函数：

```typescript
function getOrCreateAdapter(aiType: string): BaseAdapter {
  // ... 现有逻辑

  if (aiType === 'new-ai') {
    adapter = new NewAdapter({ port: 8080, baseUrl: 'http://127.0.0.1:8080' })
  }

  // ...
}
```

### 3. 添加新的 React 组件

**步骤 1: 创建组件**

创建 `src/renderer/components/NewComponent.tsx`：

```typescript
import styles from './NewComponent.module.css'
import { useAppStore } from '../stores/app-store'

export function NewComponent() {
  const { currentView, setView } = useAppStore()

  return (
    <div className={styles.container}>
      <h2>New Component</h2>
    </div>
  )
}
```

**步骤 2: 创建样式**

创建 `src/renderer/styles/NewComponent.module.css`：

```css
.container {
  display: flex;
  flex-direction: column;
  gap: var(--gap-md);
  padding: var(--padding-md);
}
```

**步骤 3: 在 App.tsx 中使用**

```typescript
import { NewComponent } from './components/NewComponent'

function App() {
  return (
    <div className="app">
      <NewComponent />
    </div>
  )
}
```

## 调试技巧

### 主进程调试

开发模式下会自动打开 DevTools。要在主进程中设置断点：

1. 在代码中添加 `debugger` 语句
2. 启动开发服务器 `npm run dev`
3. DevTools 会自动暂停在断点处

### 渲染进程调试

1. 启动应用后，使用 `Ctrl+Shift+I` 打开 DevTools
2. 在 Console 中可以访问 `window.echora` API

### 日志查看

主进程日志会输出到控制台。使用自定义 logger：

```typescript
import { create } from './utils/console-logger'

const log = create('ModuleName')
log.info('消息')
log.warn('警告')
log.error('错误')
log.success('成功')
log.debug('调试信息')
```

## 常见问题

### Q: 开发时页面空白？

A: 检查是否有 TypeScript 错误，运行 `npm run build` 查看详细错误信息。

### Q: IPC 调用无响应？

A: 
1. 检查通道名称是否正确
2. 确认主进程已注册处理器
3. 查看控制台是否有错误信息

### Q: 样式不生效？

A: 
1. 确认使用 CSS Modules 语法 `styles.className`
2. 检查变量名是否正确
3. 确认样式文件已正确导入

### Q: 测试运行失败？

A:
1. 确保已安装所有依赖 `npm install`
2. 检查测试配置 `vitest.config.ts`
3. 查看测试输出的详细错误信息

## 贡献指南

### 分支命名

- `feature/功能名称` - 新功能
- `bugfix/问题描述` - Bug 修复
- `docs/文档名称` - 文档更新
- `refactor/重构描述` - 代码重构

### Commit 规范

使用 Conventional Commits：

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

类型：
- `feat` - 新功能
- `fix` - Bug 修复
- `docs` - 文档更新
- `style` - 代码格式 (不影响功能)
- `refactor` - 重构
- `test` - 测试相关
- `chore` - 构建/工具相关

示例：
```
feat(adapter): 添加 Hermes 适配器流式支持

- 实现 sendMessageStream 方法
- 添加 WebSocket 连接支持
- 处理断线重连逻辑

Closes #123
```

### Pull Request 流程

1. 从 `main` 分支创建功能分支
2. 完成开发后运行测试 `npm test`
3. 运行 lint 检查 `npm run lint`
4. 提交 PR 并描述变更内容
5. 等待 Code Review
6. 合并到 `main` 分支

## 相关资源

- [Electron 文档](https://www.electronjs.org/docs)
- [electron-vite 文档](https://electron-vite.org/)
- [React 文档](https://react.dev/)
- [Zustand 文档](https://docs.pmnd.rs/zustand/getting-started/introduction)
- [Vitest 文档](https://vitest.dev/)
- [Playwright 文档](https://playwright.dev/)

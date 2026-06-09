# Echora 2.0 - 项目上下文

## 项目概述
Echora 2.0 是一个**全能 AI 工作台**桌面应用，支持本地网关管理 + 直连 API。基于 Electron 构建，提供多 AI 代理管理、对话、工具调用等功能。

## 技术栈

### 核心框架
- **Electron** 42.x - 桌面应用框架
- **Vite** + **electron-vite** - 构建工具
- **React** 19.x - UI 框架
- **TypeScript** 5.7+ - 类型系统

### 状态管理 & UI
- **Zustand** 5.x - 轻量级状态管理
- **Tailwind CSS** 4.x - 样式框架
- **Shiki** - 代码高亮
- **Marked** - Markdown 渲染

### 测试
- **Vitest** - 单元测试
- **Playwright** - E2E 测试
- **Testing Library** - React 组件测试

### 其他依赖
- **tiktoken** - Token 计数
- **ws** - WebSocket 通信
- **electron-store** - 配置存储
- **js-yaml** - YAML 解析

## 项目结构

```
src/
├── main/                    # Electron 主进程
│   ├── index.ts            # 应用入口
│   ├── ipc-router.ts       # IPC 路由
│   ├── ipc-handlers/       # IPC 处理器
│   ├── adapters/           # AI 网关适配器
│   │   ├── base-adapter.ts # 适配器基类
│   │   ├── hermes-adapter.ts
│   │   ├── openclaw-adapter.ts
│   │   ├── qclaw-adapter.ts
│   │   └── direct-api/     # 直连 API 适配器
│   ├── agent/              # Agent 系统 (ReAct 框架)
│   │   ├── agent-loop.ts   # Agent 主循环
│   │   ├── agent-manager.ts
│   │   ├── planner.ts      # 规划器
│   │   └── tools/          # 内置工具
│   ├── llm/                # LLM Provider 抽象层
│   │   ├── openai-provider.ts
│   │   └── provider-registry.ts
│   ├── tools/              # 工具系统
│   │   ├── builtin/        # 内置工具
│   │   │   ├── terminal.ts
│   │   │   ├── file-ops.ts
│   │   │   ├── web-search.ts
│   │   │   └── ...
│   │   └── tool-registry.ts
│   ├── managers/           # 管理器
│   │   ├── config-manager.ts
│   │   ├── gateway-manager.ts
│   │   └── draft-manager.ts
│   ├── store/              # 数据存储 (SQLite)
│   ├── kb/                 # 知识库系统
│   ├── security/           # 安全模块
│   └── utils/              # 工具函数
├── renderer/               # React 渲染进程
│   ├── App.tsx             # 根组件
│   ├── components/         # UI 组件
│   │   ├── Sidebar.tsx
│   │   ├── ChatArea.tsx
│   │   ├── SettingsPanel.tsx
│   │   └── ...
│   ├── hooks/              # 自定义 Hooks
│   ├── stores/             # Zustand 状态
│   │   └── app-store.ts    # 主状态存储
│   └── views/              # 页面视图
├── preload/                # 预加载脚本
└── shared/                 # 共享类型
    ├── types.ts
    ├── ipc-channels.ts
    └── ipc-types.ts
```

## 架构设计

### IPC 通信
- 主进程与渲染进程通过 IPC 通信
- 使用 `IpcRouter` 统一管理 IPC 通道
- 所有 IPC 通道定义在 `src/shared/ipc-channels.ts`

### 适配器模式
- `BaseAdapter` 抽象类定义统一接口
- 支持多种 AI 网关：Hermes、OpenClaw、QClaw
- 支持直连 API（OpenAI 兼容协议）

### Agent 系统
- 基于 ReAct 框架（Reasoning + Acting）
- 支持工具调用（Function Calling）
- 内置工具：终端、文件操作、Web 搜索、代码执行等
- 支持上下文压缩和 Token 计数

### 状态管理
- 使用 Zustand 管理全局状态
- 主要状态：agents、conversations、gatewayStatus、theme

## 开发命令

```bash
# 开发
npm run dev              # 启动开发服务器

# 构建
npm run build            # 构建应用
npm run build:win        # 构建 Windows 版本
npm run build:portable   # 构建便携版

# 测试
npm run test             # 运行单元测试
npm run test:e2e         # 运行 E2E 测试
npm run test:watch       # 监听模式

# 代码质量
npm run lint             # ESLint 检查
npm run lint:fix         # 自动修复
npm run format           # Prettier 格式化
```

## 代码规范

### TypeScript
- 严格模式启用
- 使用 `interface` 定义对象类型
- 使用 `type` 定义联合类型和工具类型
- 未使用变量以 `_` 前缀忽略

### React
- 使用函数组件 + Hooks
- 使用 Zustand 管理状态
- 组件文件使用 `.tsx` 扩展名

### 样式
- 使用 Tailwind CSS 工具类
- 支持深色/浅色主题切换
- CSS 变量定义在 `global.css`

### Prettier 配置
- 无分号
- 单引号
- 2 空格缩进
- 100 字符行宽
- LF 换行符

## 关键配置文件

- `echora-config.json` - 应用配置
- `echora-conversations.json` - 对话数据
- `electron.vite.config.ts` - Vite 配置
- `playwright.config.ts` - E2E 测试配置
- `.prettierrc` - Prettier 配置
- `eslint.config.mjs` - ESLint 配置

## 注意事项

1. **端口冲突检测**：应用启动时检测端口 18790 是否被占用
2. **单实例锁**：防止应用多开
3. **系统托盘**：关闭窗口时最小化到托盘
4. **CDN 防盗链**：自动注入 Referer 头解决图片 403 问题
5. **配置迁移**：支持从 AppData 迁移配置到项目目录

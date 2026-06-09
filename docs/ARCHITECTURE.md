# Echora 2.0 架构文档

## 概述

Echora 2.0 是一个基于 Electron 的全能 AI 工作台，采用 **三进程架构**（Main / Preload / Renderer），通过类型安全的 IPC 通道通信，支持本地 AI 网关管理和直连 API 两种模式。

## 技术栈

| 层级 | 技术 |
|------|------|
| 框架 | Electron 42 + electron-vite 2 |
| 前端 | React 19 + TypeScript 5.7 |
| 状态管理 | Zustand 5 |
| 样式 | CSS Modules + CSS Variables |
| 构建 | electron-vite (Vite) |
| 测试 | Vitest (单元) + Playwright (E2E) |
| 代码规范 | ESLint 9 + Prettier 3 |

## 架构总览

```
┌──────────────────────────────────────────────────────────────┐
│                     Electron Application                     │
├────────────────┬─────────────────┬───────────────────────────┤
│   Main Process │  Preload Script │    Renderer Process       │
│   (Node.js)    │  (Bridge)       │    (Chromium + React)     │
├────────────────┼─────────────────┼───────────────────────────┤
│                │                 │                           │
│  ┌──────────┐  │  ┌───────────┐  │  ┌─────────────────────┐ │
│  │ IPC      │◄─┼─►│ Context   │◄─┼─►│  App Store (Zustand)│ │
│  │ Router   │  │  │ Bridge    │  │  └────────┬────────────┘ │
│  └────┬─────┘  │  └───────────┘  │           │              │
│       │        │                 │  ┌────────▼────────────┐ │
│  ┌────▼─────┐  │                 │  │  React Components   │ │
│  │ Managers │  │                 │  │  ┌───────────────┐  │ │
│  │ Adapters │  │                 │  │  │ ChatArea      │  │ │
│  │ Detectors│  │                 │  │  │ Sidebar       │  │ │
│  └────┬─────┘  │                 │  │  │ SettingsPanel │  │ │
│       │        │                 │  │  │ ...           │  │ │
│  ┌────▼─────┐  │                 │  │  └───────────────┘  │ │
│  │ API      │  │                 │  └─────────────────────┘ │
│  │ Server   │  │                 │                           │
│  └──────────┘  │                 │                           │
│       │        │                 │                           │
└───────┼────────┴─────────────────┴───────────────────────────┘
        │
   ┌────▼──────────────────┐
   │  External AI Gateways │
   │  ┌─────┐ ┌────────┐  │
   │  │Hermes│ │OpenClaw│  │
   │  └─────┘ └────────┘  │
   │  ┌─────┐ ┌────────┐  │
   │  │QClaw │ │ Cursor │  │
   │  └─────┘ └────────┘  │
   └───────────────────────┘
```

## 模块结构

### Main Process (`src/main/`)

主进程负责所有 Node.js 操作，包括进程管理、文件系统访问和网络通信。

```
src/main/
├── index.ts              # 应用入口，窗口创建，生命周期管理
├── ipc-router.ts         # 类型安全的 IPC 路由器
├── api-server.ts         # HTTP API 服务器 (端口 9300)
├── adapters/             # AI 网关适配器
│   ├── base-adapter.ts   # 适配器基类 (抽象)
│   ├── hermes-adapter.ts # Hermes AI 适配器
│   ├── openclaw-adapter.ts # OpenClaw 适配器
│   ├── openclaw-ws.ts    # OpenClaw WebSocket 支持
│   ├── qclaw-adapter.ts  # QClaw 适配器
│   ├── qclaw-ws.ts       # QClaw WebSocket 支持
│   ├── cursor-adapter.ts # Cursor IDE 适配器
│   └── direct-api/       # 直连 API 适配器
│       ├── adapter.ts
│       └── types.ts
├── detectors/            # 环境和 AI 检测
│   ├── ai-detector.ts    # AI 软件检测 (文件/进程/端口)
│   ├── env-checker.ts    # 开发环境检查 (Node/Python/Git/npm)
│   ├── port-scanner.ts   # 端口扫描和指纹识别
│   └── state-reader.ts   # AI 状态文件读取
├── managers/             # 业务管理器
│   ├── config-manager.ts # 应用配置持久化 (electron-store)
│   ├── config-reader.ts  # AI 配置文件读取和规范化
│   ├── draft-manager.ts  # 配置草稿管理 (读/写/备份)
│   └── gateway-manager.ts # 网关进程生命周期管理
├── proxy/
│   └── echora-proxy.ts   # 本地代理服务
└── utils/
    └── console-logger.ts # 统一日志工具
```

### Preload Script (`src/preload/`)

预加载脚本通过 `contextBridge` 暴露类型安全的 API 给渲染进程。

```typescript
// 安全地暴露 API
contextBridge.exposeInMainWorld('echora', electronAPI)
```

暴露的 API 命名空间：

| 命名空间 | 功能 |
|----------|------|
| `window` | 窗口控制 (最小化/最大化/关闭/主题) |
| `gateway` | 网关生命周期 (启动/停止/重启/状态) |
| `agent` | Agent 管理 (列表/模型/切换) |
| `message` | 消息发送 (普通/流式/中断) |
| `config` | 配置读写 |
| `conv` | 会话管理 |
| `ocSessions` | OpenClaw 会话管理 |
| `aiConfig` | AI 配置管理 |
| `draft` | 配置草稿管理 |
| `hermes` | Hermes 专用功能 |
| `ai` | AI 扫描和路径管理 |
| `env` | 环境检查和安装 |
| `dialog` | 系统对话框 |
| `skills` | 技能列表 |
| `onStream` | 流式事件监听 |
| `onStartup` | 启动事件监听 |

### Renderer Process (`src/renderer/`)

渲染进程使用 React + Zustand 构建，采用组件化架构。

```
src/renderer/
├── main.tsx              # React 入口
├── App.tsx               # 根组件
├── index.html            # HTML 模板
├── env.d.ts              # 全局类型声明
├── components/           # UI 组件
│   ├── TitleBar.tsx      # 自定义标题栏
│   ├── Sidebar.tsx       # 侧边栏导航
│   ├── ChatArea.tsx      # 聊天区域
│   ├── ChatInput.tsx     # 消息输入框
│   ├── MessageBubble.tsx # 消息气泡
│   ├── AgentList.tsx     # Agent 列表
│   ├── ConversationList.tsx # 会话列表
│   ├── ConversationSearch.tsx # 会话搜索
│   ├── SettingsPanel.tsx # 设置面板
│   ├── AIManagementPanel.tsx # AI 管理面板
│   ├── SkillsPage.tsx    # 技能页面
│   ├── Modal.tsx         # 模态框
│   ├── ThemeProvider.tsx # 主题提供者
│   ├── DirectApiSettings.tsx # 直连 API 设置
│   ├── DirectApiIndicator.tsx # 直连 API 状态指示
│   └── EnvironmentCheck.tsx # 环境检查显示
├── hooks/                # 自定义 Hooks
│   ├── use-echora.ts     # Electron API 封装
│   ├── use-conversations.ts # 会话管理 Hook
│   └── use-streaming.ts  # 流式消息 Hook
├── stores/               # 状态管理
│   └── app-store.ts      # Zustand 全局 Store
└── styles/               # 样式文件
    ├── global.css        # 全局样式和 CSS Variables
    ├── Chat.module.css   # 聊天组件样式
    ├── Sidebar.module.css # 侧边栏样式
    ├── Settings.module.css # 设置样式
    └── ...               # 其他组件样式
```

## IPC 通信模式

Echora 2.0 使用三种 IPC 模式：

### 1. Handle 模式 (请求-响应)

```
Renderer                    Main
   │                          │
   │──invoke(channel, args)──►│
   │                          │──handler(args)
   │◄──response──────────────│
   │                          │
```

用于需要返回值的操作，如获取配置、发送消息等。

### 2. On 模式 (单向发送)

```
Renderer                    Main
   │                          │
   │──send(channel, params)──►│
   │                          │──handler(params)
   │                          │
```

用于不需要响应的操作，如流式消息发送、中断请求等。

### 3. Push 模式 (主进程推送)

```
Main                       Renderer
   │                          │
   │──send(channel, data)────►│
   │                          │──callback(data)
   │                          │
```

用于主进程主动推送事件，如状态变更、流式数据块等。

## 数据流

### 消息发送流程

```
用户输入
    │
    ▼
ChatInput ──► useStreaming Hook
    │              │
    │              ▼
    │         window.echora.message.sendStream()
    │              │
    │              ▼ (IPC: message:sendStream)
    │         IpcRouter.on()
    │              │
    │              ▼
    │         getOrCreateAdapter()
    │              │
    │              ▼
    │         adapter.sendMessageStream()
    │              │
    │    ┌─────────┼─────────┐
    │    ▼         ▼         ▼
    │ onChunk   onDone   onError
    │    │         │         │
    │    ▼         ▼         ▼
    │ IpcRouter.push() ──────►──┐
    │                           │
    │    ┌──────────────────────┘
    │    ▼
    │ useStreaming Hook
    │    │
    │    ▼
    │ appStore.appendToMessage()
    │    │
    │    ▼
    │ ChatArea 重新渲染
```

### 网关状态同步

```
Main Process (每 10 秒轮询)
    │
    ▼
GatewayManager.getAllStatus()
    │
    ▼
HermesAdapter.getStatus()
    │
    ▼
ipcRouter.send('gateway:statusAll', status)
    │
    ▼ (IPC Push)
Renderer: gateway.onStatusAll()
    │
    ▼
appStore.setGatewayStatus()
    │
    ▼
Sidebar / GatewayStatusIndicator 更新
```

## 状态管理 (Zustand)

### Store 结构

```typescript
interface AppState {
  // 视图状态
  currentView: 'chat' | 'settings' | 'ai-mgmt' | 'skills' | 'direct-api-settings'
  sidebarCollapsed: boolean

  // Agent 管理
  agents: Map<string, AgentInfo>  // key: "aiType:agentId"
  activeAgentKey: string | null

  // 会话管理
  conversations: Map<string, Map<string, Conversation>>  // agentKey -> convId -> conv
  activeConversationId: Map<string, string | null>

  // 网关状态
  gatewayStatus: GatewayStatusMap  // aiType -> status
  detectedAI: AIDetected

  // 应用设置
  settings: AppSettings
  theme: 'dark' | 'light'

  // 直连 API
  directApiConfigs: DirectApiConfig[]
  directApiProviders: DirectApiProvider[]
}
```

### 状态更新流程

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Component  │────►│   Action    │────►│    Store    │
│  (React)    │     │  (Zustand)  │     │   (State)   │
└─────────────┘     └─────────────┘     └──────┬──────┘
       ▲                                       │
       │                                       ▼
       └───────────────────────────────────────┘
                    重新渲染
```

## 样式系统

### CSS Variables

全局定义在 `global.css` 的 `:root` 中：

```css
:root {
  --bg-primary: #1a1b2e;      /* 主背景色 */
  --bg-secondary: #232440;    /* 次背景色 */
  --text-primary: #ffffff;    /* 主文字色 */
  --accent: #6c5ce7;          /* 强调色 */
  --success: #00d68f;         /* 成功色 */
  --error: #ff4757;           /* 错误色 */
  --border: #3a3b5c;          /* 边框色 */
  --radius: 6px;              /* 圆角 */
  --shadow: 0 2px 8px rgba(0, 0, 0, 0.25);  /* 阴影 */
}
```

### 主题切换

通过 `[data-theme="light"]` 选择器覆盖变量：

```css
[data-theme="light"] {
  --bg-primary: #f5f5f5;
  --text-primary: #1a1a2e;
  /* ... 其他变量 */
}
```

### CSS Modules

组件样式使用 CSS Modules 避免冲突：

```typescript
// ChatArea.tsx
import styles from './Chat.module.css'

function ChatArea() {
  return <div className={styles.container}>...</div>
}
```

## 适配器模式

### BaseAdapter 抽象类

所有 AI 适配器继承自 `BaseAdapter`：

```typescript
abstract class BaseAdapter<C extends AdapterConfig> {
  // 必须实现
  abstract start(): Promise<StartResult>
  abstract stop(): Promise<StopResult>
  abstract getStatus(): Promise<StatusResult>
  abstract listAgents(): Promise<AdapterAgentItem[]>
  abstract sendMessage(agentId: string, message: string, userId?: string): Promise<SendMessageResult>

  // 可选实现
  async getModelInfo(agentId?: string): Promise<AdapterModelInfo>
  async listModels(): Promise<AdapterModelItem[]>
  setModel(modelId: string | null): SetModelResult
  async switchModel(modelId: string | null): Promise<SwitchModelResult>
  sendMessageStream(agentId: string, message: string, callbacks?: StreamCallbacks, userId?: string): unknown
}
```

### 适配器类型

| 适配器 | AI 类型 | 通信方式 |
|--------|---------|----------|
| `HermesAdapter` | hermes | HTTP API |
| `OpenClawAdapter` | openclaw | HTTP + WebSocket |
| `QClawAdapter` | qclaw | HTTP + WebSocket |
| `CursorAdapter` | cursor | 内部 API |
| `DirectApiAdapter` | 直连 | OpenAI 兼容 API |

## 安全设计

1. **上下文隔离**: `contextIsolation: true` 确保渲染进程无法直接访问 Node.js API
2. **禁用 Node 集成**: `nodeIntegration: false` 防止渲染进程执行 Node.js 代码
3. **类型安全**: 所有 IPC 通道都有完整的 TypeScript 类型定义
4. **CORS 头**: HTTP API 服务器设置 `Access-Control-Allow-Origin: *` (仅本地使用)

## 构建产物

```
out/
├── main/
│   └── index.js        # 主进程打包产物
├── preload/
│   └── index.js        # 预加载脚本打包产物
└── renderer/
    ├── index.html      # 渲染进程 HTML
    └── assets/
        ├── index-*.js  # React 应用打包
        └── index-*.css # 样式打包
```

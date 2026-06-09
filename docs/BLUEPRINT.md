# Echora 2.0 蓝图

> **⚠️ 字段名唯一来源**: 所有数据结构定义以本文档第四节为准。
> **最后更新**: 2026-06-07

---

## 一、项目愿景

Echora 2.0 是一个 **全能 AI 工作台**，核心目标：

1. **统一接入**: 本地 AI 网关管理（Hermes / OpenClaw / QClaw / Cursor）+ 直连 API
2. **对话管理**: 多 Agent 多会话，流式消息，Token 用量追踪
3. **配置管理**: AI 软件自动检测、网关进程管理、配置草稿编辑
4. **桌面体验**: Electron 三进程架构，自定义窗口，主题切换

**与 1.0 的核心区别**: 2.0 完全复用 OpenClaw RPC，不自建会话系统。

---

## 二、技术架构

### 三进程架构

```
┌──────────────────────────────────────────────────────────────┐
│                     Electron Application                     │
├────────────────┬─────────────────┬───────────────────────────┤
│   Main Process │  Preload Script │    Renderer Process       │
│   (Node.js)    │  (Bridge)       │    (Chromium + React)     │
├────────────────┼─────────────────┼───────────────────────────┤
│  IPC Router    │  Context Bridge │  React Components         │
│  Adapters      │  Type Safety    │  Zustand Store            │
│  Managers      │                 │  CSS Modules              │
│  Detectors     │                 │                           │
│  API Server    │                 │                           │
└────────────────┴─────────────────┴───────────────────────────┘
```

### 技术栈

| 层级 | 技术 | 版本 |
|------|------|------|
| 框架 | Electron + electron-vite | 42+ / 2.x |
| 前端 | React + TypeScript | 19 / 5.7 |
| 状态管理 | Zustand | 5.x |
| 样式 | CSS Modules + CSS Variables | — |
| 构建 | Vite (electron-vite) | — |
| 测试 | Vitest + Playwright | — |
| 代码规范 | ESLint + Prettier | 9 / 3 |

---

## 三、数据流向

### 消息发送流程

```
用户输入 → ChatInput → useStreaming Hook
  → window.echora.message.sendStream() [IPC]
  → IpcRouter.on('message:sendStream')
  → getOrCreateAdapter(aiType)
  → adapter.sendMessageStream()
  → onChunk / onDone / onError
  → IpcRouter.push() [IPC Push]
  → useStreaming Hook → appStore.appendToMessage()
  → ChatArea 重新渲染
```

### 网关状态同步

```
Main Process (每 10 秒轮询)
  → GatewayManager.getAllStatus()
  → adapter.getStatus()
  → ipcRouter.push('gateway:statusAll')
  → Renderer: appStore.setGatewayStatus()
  → Sidebar / GatewayStatusIndicator 更新
```

### AI 检测流程

```
应用启动 → AiDetector.scan()
  → 文件检测 (配置文件是否存在)
  → 进程检测 (是否运行中)
  → 端口扫描 (指纹识别)
  → ipcRouter.push('startup:ai-detected')
  → Renderer: appStore.setDetectedAI()
```

---

## 四、关键数据结构（⚠️ 严禁瞎改）

> **铁律**: 字段名必须与此处定义完全一致。禁止凭记忆写字段名。

### AppConfig — 应用配置

```typescript
interface AppConfig {
  firstRun?: boolean                   // 是否首次运行
  lastActive?: string                  // 最后活跃时间
  aiPaths?: Record<string, string>     // AI 类型 → 安装路径
  gatewayConfigs?: Record<string, { port?: number; exePath?: string }>  // AI 类型 → 网关配置
  autoRecordedPaths?: Record<string, string>  // 自动记录的路径
  settings?: AppSettings               // 应用设置
  aiConfigPaths?: Record<string, string>  // AI 配置文件路径
  [key: string]: unknown               // 可扩展
}
```

### AppSettings — 应用设置

```typescript
interface AppSettings {
  autoStartOnBoot?: boolean    // 开机自启
  minimizeToTray?: boolean     // 最小化到托盘
  checkUpdates?: boolean       // 检查更新
  timeout?: number             // 全局超时 (ms)
  timeoutPerAI?: number        // 每个 AI 超时 (ms)
  pollInterval?: number        // 轮询间隔 (ms)
  gatewayScanInterval?: number // 网关扫描间隔 (ms)
  maxMessages?: number         // 最大消息数
}
```

### GatewayConfig — 网关配置

```typescript
interface GatewayConfig {
  exePath: string      // 可执行文件路径
  aiType: string       // AI 类型标识
  gatewayPort?: number // 网关端口（可选）
}
```

### DirectApiConfig — 直连 API 配置

```typescript
interface DirectApiConfig {
  id: string           // 唯一标识
  name: string         // 显示名称
  baseUrl: string      // API 基础 URL
  apiKey: string       // API 密钥
  models: string[]     // 可用模型列表
  defaultModel: string // 默认模型
  contextWindow?: number          // 模型上下文窗口大小（token数），用户手动填写
  contextCompression?: {          // 上下文压缩配置
    enabled?: boolean             // 是否启用上下文压缩
    thresholdPct?: number         // 压缩阈值百分比（默认80）
    targetPct?: number            // 压缩目标百分比（默认50）
  }
}
```

### AgentInfo — Agent 信息

```typescript
interface AgentInfo {
  key: string          // 唯一标识，格式: "aiType:agentId"
  name: string         // 显示名称
  aiType: string       // AI 类型 (hermes/openclaw/qclaw/cursor/direct-api)
  status: AgentStatus  // 状态
  gatewayPort?: number // 网关端口
  owned: boolean       // 是否拥有
}
```

### AgentStatus — Agent 状态枚举

```typescript
type AgentStatus = 'running' | 'offline' | 'starting' | 'error' | 'stopped'
```

### Conversation — 会话

```typescript
interface Conversation {
  id: string           // 会话 ID
  agentKey: string     // 所属 Agent 的 key
  title: string        // 会话标题
  messages: Message[]  // 消息列表
  createdAt: number    // 创建时间戳
  updatedAt: number    // 更新时间戳
}
```

### Message — 消息（Store 层）

```typescript
interface Message {
  id: string                    // 消息 ID
  role: 'user' | 'assistant' | 'system'  // 角色
  content: string               // 消息内容
  timestamp: number             // 时间戳
  isStreaming?: boolean         // 是否正在流式传输
  usage?: UsageInfo             // Token 用量
  toolCalls?: Array<{           // 工具调用列表
    name: string
    emoji?: string
    status?: string
    detail?: string
    error?: string
  }>
  // 流式状态（后台流式持久化）
  streamPhase?: 'idle' | 'thinking' | 'streaming' | 'tool' | 'done' | 'error'
  streamStatus?: string
  streamError?: string
  streamStartTime?: number
  streamDuration?: number
  // Hermes 响应元数据
  latency?: number
  firstChunkLatency?: number
  finishReason?: string
  // 附件（仅用户消息）
  attachments?: Array<{ name: string; mimeType: string }>
}
```

### TokenUsage — Token 用量

```typescript
interface TokenUsage {
  promptTokens: number      // 输入 Token 数
  completionTokens: number  // 输出 Token 数
  totalTokens: number       // 总 Token 数
}
```

### ChatRequest — 聊天请求

```typescript
interface ChatRequest {
  agentKey: string        // Agent 标识
  conversationId: string  // 会话 ID
  message: string         // 消息内容
  model?: string          // 指定模型
}
```

### StreamChunk — 流式数据块

```typescript
interface StreamChunk {
  type: 'token' | 'done' | 'error' | 'tool_call'  // 数据类型
  content?: string        // 内容（token 类型）
  error?: string          // 错误信息（error 类型）
  usage?: TokenUsage      // Token 用量（done 类型）
}
```

### ActiveStreamState — 活跃流式状态（Store 层）

```typescript
interface ActiveStreamState {
  phase: StreamPhase      // 'idle' | 'thinking' | 'streaming' | 'tool' | 'done' | 'error'
  statusText: string      // 状态描述文本
  content: string         // 已接收内容
  msgId: string           // 消息 ID
  error: string | null    // 错误信息
  usage: UsageInfo | null // Token 用量
  toolCalls: Array<{ name: string; emoji?: string; status?: string }>
  startTime: number       // 开始时间戳
  duration: number        // 持续时间
  agentKey: string        // Agent 标识
  convId: string          // 会话 ID
}
```

### UsageInfo — Token 用量信息

```typescript
interface UsageInfo {
  input?: number          // 输入 Token
  output?: number         // 输出 Token
  totalTokens?: number    // 总 Token
  cacheRead?: number      // 缓存读取
  cacheWrite?: number     // 缓存写入
  cost?: number           // 费用
  aiType?: string         // AI 类型
  agentId?: string        // Agent ID
}
```

### GatewayStatus — 网关状态

```typescript
interface GatewayStatus {
  status: 'running' | 'offline' | 'starting' | 'error' | 'stopped'
  pid?: number
  port?: number
  url?: string
  uptime?: number
  alive?: boolean
  owned?: boolean
}
```

### AdapterStatus — 适配器状态枚举

```typescript
type AdapterStatus = 'offline' | 'starting' | 'running' | 'error' | 'needs_restart' | 'stopped'
```

### View — 视图类型

```typescript
type View = 'chat' | 'settings' | 'ai-mgmt' | 'skills' | 'direct-api-settings' | 'agent-settings' | 'groupchat'
```

---

## 五、模块索引

> 详细映射见 [code-index/MASTER.md](code-index/MASTER.md)

### 主进程模块 (`src/main/`)

| 模块 | 路径 | 职责 |
|------|------|------|
| 入口 | `index.ts` | 应用生命周期、窗口创建、IPC 注册 |
| IPC 路由 | `ipc-router.ts` | 类型安全的 IPC 路由器 |
| API 服务器 | `api-server.ts` | HTTP API (端口 9300) |
| 适配器 | `adapters/` | AI 网关通信（5 种适配器） |
| 检测器 | `detectors/` | AI 软件检测、环境检查、端口扫描 |
| 管理器 | `managers/` | 配置、网关进程、草稿管理 |
| 代理 | `proxy/` | Echora 本地代理服务 |
| 工具 | `utils/` | 日志等工具函数 |

### 渲染进程模块 (`src/renderer/`)

| 模块 | 路径 | 职责 |
|------|------|------|
| 入口 | `main.tsx` | React 入口 |
| 根组件 | `App.tsx` | 路由和布局 |
| 组件 | `components/` | UI 组件（20+ 个） |
| Hooks | `hooks/` | 自定义 Hooks（5 个） |
| Store | `stores/app-store.ts` | Zustand 全局状态 |
| 样式 | `styles/` | CSS Modules |

### 共享层 (`src/shared/`)

| 文件 | 职责 |
|------|------|
| `types.ts` | 通用类型定义（本文档第四节的来源） |
| `ipc-channels.ts` | IPC 通道常量 |
| `ipc-types.ts` | IPC 类型定义 |

---

## 六、当前已知问题

> 从 .trae/memory/PENDING.md 和 .trae/documents/ 整理

| 问题 | 状态 | 来源 |
|------|------|------|
| 手动移除 OpenClaw 后自动检测未识别有效路径 | ⚠️ 待观察 | PENDING.md |
| Echora 1.0 renderer.js 2730 行巨石文件（2.0 已重构） | ✅ 已解决 | 迁移文档 |
| 流式回调不能被 currentAgentKey 门控 | ✅ 已知规则 | pitfalls 记录 |

---

## 七、IPC 通道速览

> 完整定义见 [IPC-REFERENCE.md](IPC-REFERENCE.md)

### 三种 IPC 模式

| 模式 | 方向 | 机制 | 示例 |
|------|------|------|------|
| Handle | Renderer → Main | `ipcRenderer.invoke()` | `gateway:start`, `agent:list` |
| On | Renderer → Main | `ipcRenderer.send()` | `message:sendStream`, `message:abortStream` |
| Push | Main → Renderer | `webContents.send()` | `gateway:statusAll`, `gateway:messageChunk` |

### 通道分布

| 类别 | 通道数 | 模式 | 常量前缀 |
|------|--------|------|----------|
| Gateway | 15 | Handle + Push | `GATEWAY_*` |
| Agent | 4 | Handle | `AGENT_*` |
| Message | 5 | Handle + On + Push | `MESSAGE_*` |
| Config | 3 | Handle | `CONFIG_*` |
| Draft | 6 | Handle | `DRAFT_*` |
| AI Config | 4 | Handle | `AI_CONFIG_*` |
| AI 管理 | 7 | Handle | `AI_*` |
| Hermes | 2 | Handle | `HERMES_*` |
| Env | 2 | Handle | `ENV_*` |
| Dialog | 2 | Handle | `DIALOG_*` |
| Conversation | 7 | Handle | `CONV_*` |
| OC Sessions | 5 | Handle | `OC_SESSIONS_*` |
| Skills | 1 | Handle | `SKILLS_*` |
| Window | 6 | Handle + Push | `WINDOW_*` |
| Startup | 2 | Push | `STARTUP_*` |
| Direct API | 5 | Handle + On | `DIRECT_API_*` |

**总计**: ~76 个 IPC 通道

### Preload API 命名空间

渲染进程通过 `window.echora.*` 访问以下命名空间：

| 命名空间 | 功能 | 方法数 |
|----------|------|--------|
| `window` | 窗口控制 (最小化/最大化/关闭/主题) | 6 |
| `gateway` | 网关生命周期 (启动/停止/重启/状态) | 8 |
| `agent` | Agent 管理 (列表/模型/切换) | 4 |
| `message` | 消息发送 (普通/流式/中断) | 5 |
| `config` | 配置读写 | 3 |
| `conv` | 会话管理 | 5 |
| `conversations` | 会话批量操作 | 2 |
| `ocSessions` | OpenClaw 会话管理 | 5 |
| `aiConfig` | AI 配置管理 | 4 |
| `draft` | 配置草稿管理 | 6 |
| `hermes` | Hermes 专用功能 | 2 |
| `ai` | AI 扫描和路径管理 | 7 |
| `env` | 环境检查和安装 | 2 |
| `dialog` | 系统对话框 | 2 |
| `skills` | 技能列表 | 1 |
| `onStream` | 流式事件监听 | 6 |
| `onStartup` | 启动事件监听 | 2 |

**总计**: ~70 个 API 方法

# Echora 2.0 代码索引 · 总览

> **用途**: 快速定位源码模块及其文档
> **最后更新**: 2026-06-09

---

## 模块地图

### Main Process (`src/main/`)

| 模块 | 文件 | 职责 | 关键类型/方法 |
|------|------|------|--------------|
| **入口** | `index.ts` | 应用生命周期、窗口创建、IPC 注册、启动检测 | `createWindow()`, `runStartupChecks()`, `getOrCreateAdapter()` |
| **IPC 路由** | `ipc-router.ts` | 类型安全的 IPC 路由器 (Handle/On/Push 三模式) | `IpcRouter.handle()`, `.on()`, `.send()` |
| **API 服务器** | `api-server.ts` | HTTP API (端口 9300, 15 个端点) | `GET /api/ping`, `POST /api/send`, `POST /api/send-stream` |
| **适配器基类** | `adapters/base-adapter.ts` | 适配器抽象基类 (10 方法) | `start()`, `stop()`, `getStatus()`, `listAgents()`, `sendMessage()`, `sendMessageStream()` |
| **Hermes 适配器** | `adapters/hermes-adapter.ts` | Hermes AI 网关通信 (HTTP + Profile 管理) | `HermesAdapter`, `DIRECT_PORT=8083`, Profile 多实例, config.yaml 解析 |
| **OpenClaw 适配器** | `adapters/openclaw-adapter.ts` | OpenClaw HTTP + WebSocket | `OpenClawAdapter`, 双模式(WS优先/HTTP降级), session 管理 |
| **OpenClaw WS** | `adapters/openclaw-ws.ts` | OpenClaw WebSocket 客户端 | `OpenClawWSClient`, JSON-RPC 2.0, 自动重连, chat 事件 |
| **QClaw 适配器** | `adapters/qclaw-adapter.ts` | QClaw 网关通信 | `QClawAdapter`, 类似 OpenClaw 架构 |
| **QClaw WS** | `adapters/qclaw-ws.ts` | QClaw WebSocket 客户端 | `QClawWSClient` |
| **Cursor 适配器** | `adapters/cursor-adapter.ts` | Cursor IDE 启动/状态检测 | `CursorAdapter`, 进程检测, 路径发现 |
| **直连 API** | `adapters/direct-api/adapter.ts` | OpenAI 兼容 API 直连 | DirectApiAdapter, HTTP REST API, 模型列表 |
| **直连 API 类型** | `adapters/direct-api/types.ts` | 直连 API 类型定义 | DirectApiConfig, DirectApiAgent |
| **AI 检测器** | `detectors/ai-detector.ts` | AI 软件检测 (文件/进程/端口/指纹) | `AIDetector.scanGateways()`, `scanAll()`, `getKnownList()` |
| **环境检查器** | `detectors/env-checker.ts` | 开发环境检查 (Node/Python/Git/npm) | `EnvChecker.checkAll()` |
| **端口扫描器** | `detectors/port-scanner.ts` | 端口扫描和 AI 指纹识别 | `PortScanner`, `PortScanDiscovery` |
| **状态读取器** | `detectors/state-reader.ts` | AI 状态文件读取 | `StateReader` |
| **配置管理器** | `managers/config-manager.ts` | 应用配置持久化 (JSON 文件) | `ConfigManager.init()`, `.get()`, `.set()`, `.getAll()` |
| **配置读取器** | `managers/config-reader.ts` | AI 配置文件读取和规范化 | `ConfigReader` |
| **草稿管理器** | `managers/draft-manager.ts` | 配置草稿管理 (读/写/备份/重置) | `DraftManager` |
| **网关管理器** | `managers/gateway-manager.ts` | 网关进程生命周期管理 | `GatewayManager.start()`, `.stop()`, `.attach()`, `.getAllStatus()` |
| **代理服务** | `proxy/echora-proxy.ts` | Echora 本地代理 (端口 8085) | ⚠️ 已停用 (代码中 import 被注释) |
| **日志工具** | `utils/console-logger.ts` | 统一日志工具 (ANSI 着色, 模块标签) | `create(tag)`, `log.info()/.warn()/.error()/.success()` |
| **存储层** | `store/` | SQLite 存储层（可插拔架构） | `SessionStore`, `MemoryStore`, `ContextCompressor` 接口 |
| **SQLite 封装** | `store/sqlite.ts` | node:sqlite 封装 | `SQLiteDatabase`, `createSQLiteDB()` |
| **Schema 定义** | `store/schema.ts` | 数据库 Schema (sessions + messages + FTS5) | `createSchema()`, `needsUpgrade()` |
| **SQLite 会话存储** | `store/sqlite-session-store.ts` | SQLite 版会话存储 | `SqliteSessionStore` |
| **SQLite 记忆存储** | `store/sqlite-memory-store.ts` | SQLite 版记忆存储 | `SqliteMemoryStore` |
| **摘要压缩器** | `store/compressors/summary.ts` | 上下文压缩（TokenCounter 集成） | `SummaryCompressor` |
| **Agent 管理器** | `agent/agent-manager.ts` | Agent 生命周期管理 | `AgentManager.createAgent()`, `.runAgentStream()` |
| **Agent Loop** | `agent/agent-loop.ts` | ReAct 框架（Observe-Think-Act） | `AgentLoop.run()`, `.runStream()` |
| **Token 计数器** | `agent/token-counter.ts` | 精确计算 token 数 | `TokenCounter.countTokens()`, `.countMessagesTokens()` |
| **重试工具** | `agent/retry-utils.ts` | jittered_backoff 重试策略 | `retryWithBackoff()`, `jitteredBackoff()` |
| **错误分类器** | `agent/error-classifier.ts` | 错误分类（可重试/不可重试） | `ErrorClassifier.classify()`, `.isRetryable()` |
| **记忆管理器** | `agent/memory-manager.ts` | Agent 记忆管理（JSON 文件） | `AgentMemoryManager` |
| **会话管理器** | `agent/session-manager.ts` | Agent 会话管理（JSONL 文件） | `SessionManager` |
| **SQLite 适配器** | `agent/sqlite-adapters.ts` | SQLite 存储适配器 | `SQLiteSessionManagerAdapter`, `SQLiteMemoryManagerAdapter` |

> ⚠️ **两条消息流路径说明**（2026-06-09）
>
> Echora 有两条独立的消息流路径，代码不互相调用：
>
> | 维度 | Echora Agent（直连 API） | 接入 Agent（Hermes/OpenClaw/QClaw/Cursor） |
> |------|--------------------------|-------------------------------------------|
> | 代码位置 | `agent/` + `llm/` + `ipc-handlers/echora-agent-handlers.ts` | `adapters/` + `ipc-handlers/common-handlers.ts` |
> | IPC 入口 | `agent:runStream` | `message:sendStream` |
> | LLM 通信 | `OpenAIProvider`（fetch + SSE） | 各适配器自有实现 |
> | Token 流 | OpenAIProvider → AgentLoop 累加 → IPC | adapter.onUsage 回调 → IPC |
> | 推送通道 | `gateway:messageUsage` / `gateway:messageDone` | 同左（共享前端通道） |
> | contextUsed | 用 promptTokens 近似 | 各适配器自行计算 |

### Preload Script (`src/preload/`)

| 文件 | 职责 | 关键内容 |
|------|------|----------|
| `index.ts` | Context Bridge 暴露 API | 17 个命名空间, ~70 个 API 方法, `window.echora.*` |

### Renderer Process (`src/renderer/`)

| 模块 | 文件 | 职责 |
|------|------|------|
| **入口** | `main.tsx` | React 入口 |
| **根组件** | `App.tsx` | 路由和布局 |
| **标题栏** | `components/TitleBar.tsx` | 自定义标题栏 |
| **侧边栏** | `components/Sidebar.tsx` | 侧边栏导航 |
| **聊天区域** | `components/ChatArea.tsx` | 聊天主区域 |
| **聊天输入** | `components/ChatInput.tsx` | 消息输入框 |
| **消息气泡** | `components/MessageBubble.tsx` | 消息显示 |
| **Agent 列表** | `components/AgentList.tsx` | Agent 列表 |
| **会话列表** | `components/ConversationList.tsx` | 会话列表 |
| **会话搜索** | `components/ConversationSearch.tsx` | 会话搜索 |
| **设置面板** | `components/SettingsPanel.tsx` | 设置面板 |
| **AI 管理** | `components/AIManagementPanel.tsx` | AI 管理面板 |
| **技能页面** | `components/SkillsPage.tsx` | 技能页面 |
| **模态框** | `components/Modal.tsx` | 模态框 |
| **主题** | `components/ThemeProvider.tsx` | 主题提供者 |
| **直连 API 设置** | `components/DirectApiSettings.tsx` | 直连 API 设置 |
| **直连 API 指示** | `components/DirectApiIndicator.tsx` | 直连 API 状态 |
| **环境检查** | `components/EnvironmentCheck.tsx` | 环境检查显示 |
| **错误边界** | `components/ErrorBoundary.tsx` | 错误处理 |
| **网关状态** | `components/GatewayStatusIndicator.tsx` | 网关状态指示 |
| **页面头部** | `components/PageHeader.tsx` | 页面头部 |
| **聊天子组件** | `components/chat/*.tsx` | 聊天相关子组件 (7 个) |
| **Hooks** | `hooks/use-echora.ts` | Electron API 封装 |
| **会话 Hook** | `hooks/use-conversations.ts` | 会话管理 |
| **流式 Hook** | `hooks/use-streaming.ts` | 流式消息 |
| **Token Hook** | `hooks/use-token-info.ts` | Token 用量 |
| **Agent 回退** | `hooks/use-agent-fallback.ts` | Agent 回退逻辑 |
| **Store** | `stores/app-store.ts` | Zustand 全局状态 |
| **聊天工具** | `utils/chat-helpers.ts` | 聊天辅助函数 |
| **浏览器 Mock** | `browser-mock.ts` | 浏览器环境 Mock |

### Shared (`src/shared/`)

| 文件 | 职责 | 详细文档 |
|------|------|----------|
| `types.ts` | 通用类型定义 | [BLUEPRINT.md](../BLUEPRINT.md#四关键数据结构) |
| `ipc-channels.ts` | IPC 通道常量 (~63 个) | [IPC-REFERENCE.md](../IPC-REFERENCE.md) |
| `ipc-types.ts` | IPC 类型定义 | [IPC-REFERENCE.md](../IPC-REFERENCE.md) |

### MCP Servers (`mcp-servers/`)

| 模块 | 文件 | 职责 | 关键工具/方法 |
|------|------|------|--------------|
| **Claude-Collab** | `claude-collab/` | Claude-Hermes-OpenClaw 独立通讯 | `ask_hermes`, `ask_openclaw`, `check_ai_status` |
| | `src/index.ts` | MCP 服务器入口 | Server, tool registration |
| | `src/tools/ask-hermes.ts` | Hermes 通讯工具 | `askHermesTool()` |
| | `src/tools/ask-openclaw.ts` | OpenClaw 通讯工具 | `askOpenClawTool()` |
| | `src/tools/check-status.ts` | 状态检查工具 | `checkStatusTool()` |
| | `src/utils/http-client.ts` | HTTP 客户端封装 | `askHermes()`, `askOpenClaw()`, `checkStatus()` |
| | `src/utils/config.ts` | 配置管理 | `loadConfig()` |

> **用途**: 即使 Echora 关闭，Claude 也能和 Hermes/OpenClaw 通讯，实现多 AI 协作开发。
> **详细文档**: [SKILL.md](../../mcp-servers/claude-collab/SKILL.md)

---

## 文件统计

| 目录 | 文件数 | 说明 |
|------|--------|------|
| `src/main/` | 77 | 主进程 (适配器 7 + 检测器 4 + 管理器 4 + 其他 62) |
| `src/preload/` | 1 | 预加载脚本 (17 命名空间, ~70 API 方法) |
| `src/renderer/` | 51 | 渲染进程 (组件 20+ + hooks 5 + stores 1 + styles 10+) |
| `src/shared/` | 3 | 共享类型 (~76 IPC 通道定义) |
| **总计** | **132** | — |

---

## IPC 通道统计

| 模式 | 通道数 | 说明 |
|------|--------|------|
| Handle (请求-响应) | ~50 | `ipcRenderer.invoke()` → `ipcMain.handle()` |
| On (单向发送) | ~4 | `ipcRenderer.send()` → `ipcMain.on()` |
| Push (主进程推送) | ~12 | `webContents.send()` → `ipcRenderer.on()` |
| **总计** | **~76** | 类型安全 (`IpcHandleChannels` / `IpcOnChannels` / `IpcPushChannels`) |

### 通道分布

| 类别 | 通道数 | 常量前缀 |
|------|--------|----------|
| Gateway | 15 | `GATEWAY_*` |
| Agent | 4 | `AGENT_*` |
| Message | 5 | `MESSAGE_*` |
| Config | 3 | `CONFIG_*` |
| Draft | 6 | `DRAFT_*` |
| AI Config | 4 | `AI_CONFIG_*` |
| AI 管理 | 7 | `AI_*` |
| Hermes | 2 | `HERMES_*` |
| Env | 2 | `ENV_*` |
| Dialog | 2 | `DIALOG_*` |
| Conversation | 7 | `CONV_*` |
| OC Sessions | 5 | `OC_SESSIONS_*` |
| Skills | 1 | `SKILLS_*` |
| Window | 6 | `WINDOW_*` |
| Startup | 2 | `STARTUP_*` |
| Direct API | 5 | `DIRECT_API_*` |

---

## 适配器接口 (BaseAdapter)

```typescript
abstract class BaseAdapter<C extends AdapterConfig = AdapterConfig> {
  // 公共属性
  public config: C
  public name: string
  public status: AdapterStatus  // 'offline' | 'starting' | 'running' | 'error' | 'needs_restart' | 'stopped'
  public baseUrl: string
  public _requestTimeout: number  // 默认 300000ms (5分钟)

  // 必须实现
  abstract start(): Promise<StartResult>
  abstract stop(): Promise<StopResult>
  abstract getStatus(): Promise<StatusResult>
  abstract listAgents(): Promise<AdapterAgentItem[]>
  abstract sendMessage(agentId: string, message: string, userId?: string): Promise<SendMessageResult>

  // 可选实现 (有默认实现)
  async getModelInfo(agentId?: string): Promise<AdapterModelInfo>
  async listModels(): Promise<AdapterModelItem[]>
  setModel(modelId: string | null): SetModelResult
  async switchModel(modelId: string | null): Promise<SwitchModelResult>
  getCurrentModel(): string | null
  sendMessageStream(agentId: string, message: string, callbacks?: StreamCallbacks, userId?: string, attachments?: AdapterAttachment[]): unknown

  // 消息回调
  onMessage(callback: MessageCallback): void
  _emitMessage(msg: Record<string, unknown>): void
}
```

### AdapterConfig — 适配器配置

```typescript
interface AdapterConfig {
  exePath?: string      // 可执行文件路径
  port?: number         // 端口
  token?: string        // 认证 token
  baseUrl?: string      // 基础 URL
  configPath?: string   // 配置文件路径
  useWebSocket?: boolean // 是否使用 WebSocket
  hermesRoot?: string   // Hermes 根目录
  apiPort?: number      // API 端口
  apiKey?: string       // API 密钥
  execPath?: string     // 执行路径
  [key: string]: unknown
}
```

### 适配器实现对比

| 适配器 | AI 类型 | 通信方式 | 默认端口 | 特殊功能 |
|--------|---------|----------|----------|----------|
| `HermesAdapter` | hermes | HTTP API | 8083 | Profile 多实例, config.yaml 解析, 进程管理 |
| `OpenClawAdapter` | openclaw | HTTP + WebSocket | 18789 | JSON-RPC WS, session 管理, 模型切换 |
| `QClawAdapter` | qclaw | HTTP + WebSocket | 28789 | 类似 OpenClaw 架构 |
| `CursorAdapter` | cursor | 进程检测 | — | 启动/停止 Cursor IDE, 路径发现 |
| `DirectApiAdapter` | direct-api | OpenAI 兼容 | — | ⚠️ 代码为空，待实现 |

---

## .trae/ 文档索引

> Trea 产生的技术文档，按需参考

### 规则文件 (`.trae/rules/`)

| 文件 | 用途 |
|------|------|
| `project-standards.md` | 7 条核心原则 (alwaysApply) |
| `coding-conventions.md` | 编码规范 + 禁止事项 |
| `docs-sync.md` | 文档同步规则 |
| `dev-standards.md` | 记忆系统指引 |

### Bug 修复文档 (`.trae/documents/`)

共 30+ 个修复文档，涵盖：Hermes 配置、流式状态同步、Agent 回退、网关检测、UI 修复等。

### 功能规格 (`.trae/specs/`)

| 规格 | 状态 |
|------|------|
| chat-input-toolbar | ✅ 完成 |
| fix-multi-agent-session-isolation | ✅ 完成 |
| hermes-model-switch-ui | ✅ 完成 |
| hermes-profile-id-fix | ✅ 完成 |
| hermes-tokenlabel-and-status | ✅ 完成 |
| openclaw-slash-commands | ✅ 完成 |
| ui-gateway-feedback-and-layout | ✅ 完成 |

### 技术参考 (`.trae/skills/references/`)

| 文件 | 内容 |
|------|------|
| `pitfalls-2026-05.md` | 踩坑记录汇总 |
| `multi-panel-architecture.md` | 多面板架构模式 |
| `markdown-render-pattern.md` | Markdown 渲染模式 |
| `hermes-profile-management.md` | Hermes Profile 管理 |
| `electron-custom-window-controls.md` | Electron 自定义窗口 |
| `echora-ui-template-architecture.md` | UI 模版架构 |
| `evolution-2026-05-28-state-refactoring.md` | 状态重构演进 |
| `evolution-2026-05-29-resource-reuse.md` | 资源复用演进 |
| `openclaw-skill-architecture.md` | OpenClaw 技能架构 |

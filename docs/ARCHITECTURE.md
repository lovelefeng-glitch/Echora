# Echora 系统架构全景

> **最后更新**: 2026-05-23  
> **版本**: v0.4.0  
> **目的**: 完整理解 Echora 是怎么设计的，出问题能定位到模块

---

## 一、系统定位

**Echora** = 本地 AI 软件网关统一控制台

- 一个 Electron 桌面应用，管理所有本地 AI（QClaw/OpenClaw/Hermes/Cursor）
- 自动发现 + 自动接管已运行的网关进程
- 统一对话界面，跨 AI 无缝切换
- SSE 流式消息 + Markdown 渲染 + 工具调用展示

---

## 二、架构总览

```
┌─────────────────────────────────────────────────────────────────┐
│                    Electron 主进程 (main.js, 843行)              │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────────┐  │
│  │ ConfigManager│  │DraftManager  │  │ GatewayManager        │  │
│  │ 配置持久化    │  │草稿文件系统   │  │ 网关生命周期管理       │  │
│  └──────┬───────┘  └──────┬───────┘  └───────────┬───────────┘  │
│         │                 │                      │              │
│  ┌──────┴───────┐  ┌──────┴───────┐  ┌───────────┴───────────┐  │
│  │ConfigReader  │  │              │  │  适配器层 (adapters/)  │  │
│  │JSON/YAML解析 │  │              │  │  ┌─────────────────┐  │  │
│  │normalize     │  │              │  │  │ BaseAdapter     │  │  │
│  └──────────────┘  │              │  │  │ 接口规范        │  │  │
│                    │              │  │  └────────┬────────┘  │  │
│  ┌──────────────┐  │              │  │     ┌─────┼─────┐     │  │
│  │ 检测器层      │  │              │  │     │     │     │     │  │
│  │ AIDetector   │  │              │  │  OpenClaw QClaw Hermes│  │
│  │ EnvChecker   │  │              │  │  Adapter  Adapter  Adapter│
│  │ PortScanner  │  │              │  │     │     │     │     │  │
│  │ StateReader  │  │              │  │  CursorAdapter   │     │  │
│  └──────────────┘  │              │  └─────────────────┘  │  │
│                    │              │                        │  │
│  ┌─────────────────┴──────────────┴────────────────────────┘  │
│  │              IPC Router (setupIPC)                         │
│  │   38个 handle通道 + 2个 on通道 + 推送事件                    │
│  └────────────────────┬──────────────────────────────────────┘  │
│                       │                                        │
│  ┌────────────────────┴──────────────────────────────────────┐  │
│  │ Echora Proxy (port 8085)  │  API Server (port 8086)      │  │
│  │ SSE中间层+metrics注入      │  HTTP API接口                 │  │
│  └──────────────────────────────────────────────────────────┘  │
└───────────────────────────┬─────────────────────────────────────┘
                            │ IPC (contextBridge)
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Renderer 进程 (renderer.js, 2125行)           │
│                                                                 │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐   │
│  │ 侧边栏   │ │ 聊天区   │ │ AI管理   │ │ 设置面板         │   │
│  │ sidebar  │ │ chat     │ │ ai-mgmt  │ │ settings         │   │
│  └──────────┘ └──────────┘ └──────────┘ └──────────────────┘   │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ STATE (全局状态)                                         │   │
│  │ - agents[], selectedAI, conversations{}, activeStreams   │   │
│  │ - settings{}, draftData{}, selectedModel{}              │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                    外部 AI 网关 (独立进程)                        │
│                                                                 │
│  QClaw Gateway (port 28789)    ← openclaw.json 配置             │
│  OpenClaw Gateway (port 18789) ← openclaw.json 配置             │
│  Hermes Gateway (port 8083)    ← config.yaml 配置               │
│  Cursor (本地检测)              ← 无网关，进程检测                │
└─────────────────────────────────────────────────────────────────┘
```

---

## 三、模块依赖关系

```
main.js
├── ConfigManager (config-manager.js)
├── ConfigReader (config-reader.js)
├── DraftManager (draft-manager.js)
│   └── ConfigReader (normalize/denormalize)
├── GatewayManager (gateway-manager.js)
├── AIDetector (ai-detector.js)
│   ├── PortScanner (port-scanner.js)
│   └── StateReader (state-reader.js)
├── EnvChecker (env-checker.js)
├── OpenClawAdapter (openclaw-adapter.js)
│   └── BaseAdapter (base-adapter.js)
├── QClawAdapter (qclaw-adapter.js)
│   └── BaseAdapter
├── HermesAdapter (hermes-adapter.js)
│   └── BaseAdapter
├── CursorAdapter (cursor-adapter.js)
│   └── BaseAdapter
├── EchoraProxy (echora-proxy.js)
└── APIServer (api-server.js)

preload.js
└── contextBridge → 暴露 12 个 API 命名空间

renderer.js
└── 依赖 preload.js 暴露的所有 API
```

---

## 四、核心设计模式

### 4.1 适配器模式 (Adapter Pattern)

每种 AI 软件实现 `BaseAdapter` 接口，main.js 统一管理：

```
BaseAdapter
├── start()         → 启动网关
├── stop()          → 停止网关
├── getStatus()     → 获取状态
├── listAgents()    → 枚举 Agent
├── sendMessage()   → 发送消息（非流式）
├── sendMessageStream() → 发送消息（流式）
├── getModelInfo()  → 获取模型信息
├── listModels()    → 列出可用模型
├── setModel()      → 切换模型
└── onMessage()     → 注册消息回调
```

**关键**: main.js 用 `adapters` Map 管理所有适配器实例，key 是 `aiType`。

### 4.2 草稿文件模式 (Draft File Pattern)

配置编辑的安全隔离层：

```
原配置 (只读) → normalize → 草稿文件 (可编辑) → denormalize → 原配置 (写入)
```

**关键**: `ConfigReader.normalize()` 和 `DraftManager.denormalize()` 是对称的。

### 4.3 SSE 代理模式 (SSE Proxy Pattern)

Echora Proxy 透明拦截 Hermes SSE 流：

```
Client → Proxy(8085) → Hermes(8083)
           ↓ 解析 SSE
           ↓ 提取 usage/tokens
           ↓ 注入 echora.metrics 事件
           ↓ 转发给 Client
```

### 4.4 状态轮询模式 (Status Polling)

main.js 每 10 秒轮询所有网关状态：

```
startStatusPolling() → 每 10s → gatewayManager.getAllStatus()
                                    ↓
                              safeSend('gateway:statusAll', status)
                                    ↓
                              renderer 更新状态灯
```

---

## 五、关键文件速查

| 文件 | 行数 | 职责 | 改动风险 |
|------|------|------|---------|
| `main.js` | 843 | 应用入口、IPC 路由、生命周期 | 🔴 高（改错全局崩） |
| `preload.js` | 163 | 安全 IPC 桥梁 | 🔴 高（改错渲染器断连） |
| `renderer.js` | 2125 | 全部 UI 逻辑 | 🔴 高（单文件巨大） |
| `draft-manager.js` | 313 | 配置草稿系统 | 🟡 中（改错配置丢失） |
| `config-reader.js` | 430 | 配置解析+normalize | 🟡 中（改错显示异常） |
| `gateway-manager.js` | 346 | 网关生命周期 | 🟡 中（改错网关失控） |
| `hermes-adapter.js` | 1046 | Hermes 适配器 | 🟡 中（最大适配器） |
| `echora-proxy.js` | 296 | SSE 代理 | 🟢 低（独立模块） |
| `config-manager.js` | 85 | 配置持久化 | 🟢 低（简单 CRUD） |

---

## 六、设计决策记录

| 日期 | 决策 | 原因 | 影响 |
|------|------|------|------|
| 2026-05-17 | Electron 架构 | 桌面应用需要本地文件+进程管理 | 整体技术栈 |
| 2026-05-18 | contextBridge 隔离 | Electron 安全最佳实践 | renderer 不能直接 require |
| 2026-05-19 | ConfigReader normalize | 三种 AI 配置格式差异大 | 所有配置读取经过 normalize |
| 2026-05-20 | SSE 代理而非直连 | 需要拦截提取 metrics | 新增 Proxy 模块 |
| 2026-05-21 | 流式消息用 IPC on | fire-and-forget 模式 | message:sendStream 不走 handle |
| 2026-05-22 | QClaw 独立适配器 | 与 OpenClaw 配置路径/端口/token 冲突 | qclaw-adapter.js 新建 |
| 2026-05-23 | 草稿文件+normalize | 设置页参数丢失 | DraftManager 完整重构 |

---

*最后更新: 2026-05-23 | 作者: 小雪*

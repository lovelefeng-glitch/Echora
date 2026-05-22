# Echora 项目蓝图 v0.4.0

> **唯一真实来源（Single Source of Truth）**  
> 任何开发前必须先读此文件和对应的模块文档。  
> AI 不得凭记忆猜测数据结构，必须以本文档为准。

---

## 一、项目愿景

**Echora** = 本地 AI 软件网关统一控制台

- 一个界面管理所有本地 AI（QClaw/OpenClaw/Cursor/Windsurf...）
- 自动发现 + 自动接管已运行的网关
- 统一的对话界面，跨 AI 无缝切换
- 未来：跨 AI 上下文传递、AI 协作编排

---

## 二、技术架构

```
┌───────────┐
│                    Electron 主进程 (main.js)                │
│  - 生命周期管理                                           │
│  - 启动检查流程（环境 + AI 发现 + 网关接管）               │
│  - IPC 路由（renderer ↔ main ↔ gateway）                  │
└──────────────┬──────────────────────────────┬─────────────┘
               │ IPC (contextBridge)          │ child_process
               ▼                              ▼
┌─────────────────────┐           ┌──────────────────────────┐
│  Renderer (UI)      │           │  GatewayManager          │
│  - sidebar + chat   │           │  - attach() 接管外部进程 │
│  - ai-list          │           │  - start/stop/restart    │
│  - status dots      │           │  - process 生命周期管理   │
└─────────────────────┘           └──────────────────────────┘
               │                              │
               ▼                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    模块层                                   │
│  detectors/ai-detector.js   → 文件扫描 + 进程检测 + 端口映射 │
│  detectors/env-checker.js   → 环境依赖检查                   │
│  detectors/port-scanner.js  → 端口扫描 + HTTP 探测          │
│  detectors/state-reader.js  → 网关状态文件读取               │
│  manager/config-manager.js  → 配置持久化                     │
│  manager/config-reader.js   → AI 配置解析 + normalize        │
│  manager/draft-manager.js   → 配置草稿系统 + denormalize     │
│  adapters/base-adapter.js   → 适配器接口规范                │
│  adapters/openclaw-adapter.js → OpenClaw/QClaw API 实现     │
│  adapters/hermes-adapter.js → Hermes Gateway API 实现       │
│  adapters/cursor-adapter.js → Cursor 本地检测               │
└─────────────────────────────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────────────┐
│                  AI 软件网关（外部进程）                      │
│  QClaw Gateway (port 28789)                                 │
│  OpenClaw Gateway (port 18789)                             │
│  Hermes Gateway API Server (port 8083)                     │
└─────────────────────────────────────────────────────────────┘
```

---

## 三、数据流向

### 3.1 启动流程

```
app.whenReady()
    │
    ▼
ConfigManager.init()  ← 读取 %APPDATA%/echora/echora-config.json
    │
    ▼
runStartupChecks()
    │
    ├─ EnvChecker.checkAll()  →  { node, python, git, npm }
    │                           发送到 renderer: startup:env-check
    │
    ├─ AIDetector.scanAll(config.aiPaths)
    │     │
    │     ├─ scanFiles()      → 文件系统扫描
    │     └─ scanGateways()   → 进程扫描 + netstat + HTTP 验证
    │                           返回 { qclaw: {running,pid,port,alive}, ... }
    │
    ├─ gatewayManager.attach(aiType, gatewayInfo)
    │     接管已运行的网关（不启动新进程）
    │
    └─ 发送 gateway:statusAll 到 renderer
```

### 3.2 配置编辑数据流（DraftManager）

```
启动: 原配置文件 ──read──→ rawData ──normalize──→ 草稿文件 (drafts/)
编辑: UI 渲染器 ←──readDraft──→ 草稿文件 ←──writeDraft──→ UI
保存: 草稿文件 ──read──→ draftData ──denormalize──→ 原配置文件
                      └── 备份原配置 → backups/
重置: 原配置文件 ──readRaw──→ rawData ──normalize──→ 覆盖草稿
```

> ⚠️ **normalize/denormalize 必要性**: 原配置的嵌套结构（如 `gateway.auth.mode`）
> 与 UI 渲染器期望的扁平结构（如 `gateway.authMode`）不一致。
> 详见 `docs/code-index/draft-manager.md` 和 `docs/code-index/config-reader.md`。

### 3.3 用户操作数据流

| 操作 | Renderer 事件 | Main IPC | 结果 |
|------|---------------|---------|------|
| 点击 AI | `selectAI(ai)` | — | 更新聊天区状态 |
| 点击启动 | `startGateway()` | `gateway:start` | GatewayManager.start() |
| 点击刷新 | `doScan()` | `gateway:refresh` | 重新 scanAll + attach |
| 发送消息 | `sendMessage()` | `gateway:send` (待实现) | Adapter.sendMessage() |

---

## 四、关键数据结构（⚠️ 严禁瞎改）

### 4.1 Config (`echora-config.json`)

```jsonc
{
  "firstRun": false,           // boolean - 是否首次运行
  "aiPaths": {                // object  - AI类型 → 可执行文件路径
    "qclaw": "C:\\Program Files\\QClaw\\QClaw.exe",
    "openclaw": "C:\\Users\\ohfen\\AppData\\Roaming\\npm\\node_modules\\openclaw\\dist\\index.js"
  },
  "gatewayConfigs": {         // object - AI类型 → 网关启动配置
    "qclaw": { "port": 28789 },
    "openclaw": { "port": 18789 }
  },
  "lastActive": null,          // string|null - 上次活动的 AI 类型
  "settings": {
    "autoStartOnBoot": false,
    "minimizeToTray": true,
    "checkUpdates": true
  }
}
```

### 4.2 AIDetector.scanAll() 返回值

```jsonc
{
  "qclaw": {
    "name": "QClaw",
    "category": "agent",
    "found": true,              // 文件是否存在
    "path": "C:\\...\\QClaw.exe",
    "source": "auto|manual|path|running",
    "verified": false,
    "gateway": {                // null = 未运行
      "running": true,
      "pid": 13140,
      "port": 28789,
      "allPorts": [28789, 28791],
      "url": "http://127.0.0.1:28789",
      "alive": true             // HTTP 验证结果
    }
  }
}
```

### 4.3 DraftManager 草稿文件结构（normalized）

草稿文件存储在 `drafts/{aiType}.json`，格式由 `ConfigReader.normalize()` 生成：

```jsonc
// drafts/openclaw.json 示例（已 normalize）
{
  "gateway": {
    "port": 18789,
    "authMode": "token",           // ← 原始: gateway.auth.mode
    "controlUiAllowInsecure": true  // ← 原始: gateway.controlUi.allowInsecureAuth
  },
  "agents": [                       // ← 原始: agents.list (对象→数组)
    { "id": "xue", "name": "小雪", "modelPrimary": "xiaomi-coding/mimo-v2.5", ... }
  ],
  "models": [                       // ← 原始: models.providers (对象→数组)
    { "provider": "xiaomi-coding", "baseUrl": "...", "models": [...] }
  ],
  "session": { "resetMode": "daily", ... },
  "tools": { "allowBash": true, ... },
  "browser": { "enabled": true, ... }
}
```

> ⚠️ **踩坑记录 (2026-05-23)**: 最初未经过 normalize，直接复制原配置到草稿，
> 导致 UI 渲染器读到嵌套结构，设置页参数大量“丢失”。

### 4.4 GatewayManager.processes 内部结构

```js
// this.processes: Map<aiType, procInfo>
procInfo = {
  process: ChildProcess | null,  // null = 外部进程（attach）
  pid: number,
  status: 'starting' | 'running' | 'stopped' | 'error',
  aiType: string,
  port: number | null,
  url: string | null,
  owned: boolean,        // true = Echora 启动的，可 kill
  startTime: number,     // Date.now()
  exePath: string,       // owned=true 时有值
  config: object,        // 启动配置
}
```

### 4.4 BaseAdapter 接口契约

```js
class BaseAdapter {
  constructor(config)   // config: { exePath?, port?, token? }

  async start()          // → { success: boolean, message: string, pid?: number }
  async stop()           // → { success: boolean }
  async getStatus()      // → { status: string, pid?: number, uptime?: number }
  async listAgents()    // → [{ id: string, name: string, description?: string }]
  async sendMessage(agentId, message)  // → { success: boolean, messageId?: string }
  onMessage(callback)   // callback: (message) => void
}
```

---

## 五、模块索引

| 模块 | 文件 | 职责 | 状态 |
|------|------|------|------|
| 主进程 | `main.js` | 生命周期、IPC 路由、启动流程 | ✅ 完成 |
| 预加载 | `preload.js` | contextBridge 安全 IPC | ✅ 完成 |
| 渲染进程 | `src/ui/renderer.js` | UI 逻辑、事件绑定 | ✅ 基本完成 |
| 样式 | `src/ui/styles.css` | 所有 CSS 变量和组件样式 | ✅ 基本完成 |
| HTML | `src/index.html` | 主界面结构 | ✅ 完成 |
| AI 检测器 | `src/detectors/ai-detector.js` | 文件+进程扫描 | ✅ v0.2 完成 |
| 环境检查器 | `src/detectors/env-checker.js` | Node/Python/Git/npm 检测 | ✅ 完成 |
| 网关管理器 | `src/manager/gateway-manager.js` | 网关生命周期 | ✅ v0.2 完成 |
| 配置管理器 | `src/manager/config-manager.js` | 持久化配置 | ✅ 完成 |
| 配置读取器 | `src/manager/config-reader.js` | AI 配置解析 + normalize + 发现 | ✅ v2.0 |
| 草稿管理器 | `src/manager/draft-manager.js` | 配置草稿系统 + denormalize | ✅ v1.0 |
| 适配器基类 | `src/adapters/base-adapter.js` | 接口规范 | ✅ 完成 |
| OpenClaw 适配器 | `src/adapters/openclaw-adapter.js` | OpenClaw/QClaw API | ✅ v1.2 |
| QClaw 适配器 | `src/adapters/qclaw-adapter.js` | QClaw 独立适配器 | ✅ v1.0 |
| Hermes 适配器 | `src/adapters/hermes-adapter.js` | Hermes Gateway API Server | ✅ v3.2 |
| Cursor 适配器 | `src/adapters/cursor-adapter.js` | Cursor 本地检测 | ✅ v1.0 |
| 端口扫描器 | `src/detectors/port-scanner.js` | 端口扫描 + HTTP 探测 | ✅ 完成 |
| 状态读取器 | `src/detectors/state-reader.js` | 网关状态文件读取 | ✅ 完成 |
| Echora Proxy | `src/proxy/echora-proxy.js` | SSE 拦截 + metrics 注入 | ✅ v1.0 |
| API Server | `src/api-server.js` | HTTP API 接口 | ✅ v1.0 |
| 测试套件 | `tests/` | Playwright Electron 自动化测试 | ✅ 脚手架 |

---

## 六、开发规范（⚠️ 必须遵守）

### 6.1 数据契约规则
1. **任何模块的输入/输出必须有文档** — 见 `docs/code-index/<module>.md`
2. **修改数据结构必须同步更新** `BLUEPRINT.md` 第四节
3. **AI 不得猜测字段名** — 不确定时先读文档

### 6.2 IPC 通信规则
1. IPC 通道命名: `模块:动作` (例: `gateway:start`, `config:get`)
2. 渲染进程 **只能通过 `preload.js` 暴露的接口** 与主线通信
3. 新增 IPC 通道必须同时更新 `preload.js` 和 `main.js`

### 6.3 网关检测规则
1. 进程扫描用 `Get-CimInstance Win32_Process`（PowerShell）
2. 端口映射用 `netstat -ano`
3. HTTP 验证用 `http.get` 检查 `/` 路径（返回任何 HTTP 状态码都算 alive）
4. QClaw 网关进程特征: `QClaw.exe --title=openclaw-gateway`
5. OpenClaw 网关进程特征: `node.exe ...openclaw...gateway`

---

## 七、当前已知问题

1. **Hermes 模型问题** — `qwen/qwen3.5-122b-a10b`（NVIDIA API）返回空响应，需配置 fallback 到 `deepseek-ai/deepseek-v4-pro`
2. **Hermes 会话隔离** — 已修复（v3.2），通过 `X-Hermes-Session-Id` 头传递 session ID，state.db 独立存储
3. **GPU cache 权限报错** — Windows 安全限制，不影响功能
4. **Hermes 状态检测** — 已修复（v3.2），改用 `gateway_state.json` + PID 存活检测

---

## 八、下一步计划

- [ ] P1-4 跨 AI 消息路由
- [ ] P2-5 聊天消息持久化（历史记录）
- [ ] P3-2 新增 Windsurf 适配器
- [ ] P3-3 AI 进程性能监控面板
- [ ] P3-4 跨 AI 上下文传递
- [ ] P3-7 Hermes profile 切换

---

**最后更新**: 2026-05-23 04:55  
**更新人**: 小雪 (xue)  
**审核人**: 老板

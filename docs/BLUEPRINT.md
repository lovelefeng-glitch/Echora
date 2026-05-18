# Echora 项目蓝图 v0.2

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
│  manager/config-manager.js  → 配置持久化                     │
│  adapters/base-adapter.js   → 适配器接口规范                │
│  adapters/openclaw-adapter.js → OpenClaw API 实现（待完成） │
└─────────────────────────────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────────────┐
│                  AI 软件网关（外部进程）                      │
│  QClaw Gateway (port 28789)                                 │
│  OpenClaw Gateway (port 18789)                             │
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

### 3.2 用户操作数据流

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

### 4.3 GatewayManager.processes 内部结构

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
| 适配器基类 | `src/adapters/base-adapter.js` | 接口规范 | ✅ 完成 |
| OpenClaw 适配器 | `src/adapters/openclaw-adapter.js` | OpenClaw API | ⚠️ 待修复（API 路径错误）|

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

1. **OpenClaw 适配器 API 路径错误** — `/api/status` 返回 404，需要对照真实 Gateway API 文档修正
2. **`openclaw-adapter.js` 有 bug** — `exePath` 拼写为 `exePath`（第 14 行），导致 start() 永远失败
3. **GPU cache 权限报错** — Windows 安全限制，不影响功能
4. **`aiPaths` 未自动保存 OpenClaw 路径** — 仅通过进程检测接管，未写入配置

---

## 八、下一步计划

- [ ] 修复 `openclaw-adapter.js` 的 `exePath` 拼写错误
- [ ] 对接真实 OpenClaw Gateway API（需要 API 文档）
- [ ] 实现 `BaseAdapter` 的 QClaw 适配器
- [ ] 实现聊天消息的实时接收（WebSocket/SSE）
- [ ] 添加系统托盘图标和最小化到托盘
- [ ] 添加"关于"页面和版本检查

---

**最后更新**: 2026-05-17  
**更新人**: AI Assistant  
**审核人**: （待填写）

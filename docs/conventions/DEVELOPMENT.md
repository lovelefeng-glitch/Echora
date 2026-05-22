# 开发公约 · AI 开发强制规范

> **目的**: 防止 AI 开发过程中出现幻觉——乱改数据结构、用错参数名、篡改接口契约  
> **强制程度**: ⚠️ 所有开发必须遵守，违反者视为开发事故

---

## 一、数据结构契约（最核心）

### 1.1 字段名必须 1 对 1 对应

**禁止凭记忆猜测字段名。** 以下是对比表：

| 实际字段名 | 常见幻觉写法（❌禁止） | 所属 |
|-----------|----------------------|------|
| `exePath` | ~~`executablePath`~~ ~~`path`~~ | config, adapter config |
| `aiPaths` | ~~`aiPath`~~ ~~`paths`~~ | config |
| `gatewayConfigs` | ~~`gatewayConfig`~~ ~~`configs`~~ | config |
| `firstRun` | ~~`firstRun`~~ ~~`isFirstRun`~~ | config |
| `lastActive` | ~~`lastActiveAI`~~ ~~`activeAI`~~ | config |
| `aiType` | ~~`aiType` or `type`~~ | 所有地方 |
| `ProcessId` | ~~`pid`~~ ~~`processId`~~ | Get-CimInstance 返回值 |
| `CommandLine` | ~~`cmd`~~ ~~`command`~~ ~~`args`~~ | Get-CimInstance 返回值 |
| `owned` | ~~`isOwned`~~ ~~`external`~~ | GatewayManager |
| `alive` | ~~`responsive`~~ ~~`online`~~ ~~`connected`~~ | AIDetector |
| `gatewayPort` | ~~`port`~~ | renderer AIListItem |

### 1.2 IPC 通道名必须一致

| 通道名 | 禁止改写为 |
|--------|-----------|
| `gateway:start` | ~~`startGateway`~~ ~~`gateway/start`~~ |
| `gateway:refresh` | ~~`refreshGateway`~~ ~~`rescan`~~ |
| `gateway:statusAll` | ~~`gatewayStatusAll`~~ ~~`allStatus`~~ |
| `gateway:statusChange` | ~~`onStatusChange`~~ ~~`statusUpdate`~~ |
| `config:getAll` | ~~`getConfig`~~ ~~`readConfig`~~ |
| `ai:rescan` | ~~`rescanAI`~~ ~~`rescanAi`~~ |
| `startup:ai-detected` | ~~`startup:aiDetected`~~ ~~`aiDetected`~~ |
| `draft:read` | ~~`draftRead`~~ ~~`draft/get`~~ |
| `draft:write` | ~~`draftWrite`~~ ~~`draft/set`~~ |
| `draft:save` | ~~`draftSave`~~ ~~`draft/persist`~~ |
| `draft:reset` | ~~`draftReset`~~ ~~`draft/restore`~~ |
| `draft:backups` | ~~`draftBackups`~~ ~~`draft/list`~~ |
| `draft:paths` | ~~`draftPaths`~~ ~~`draft/info`~~ |

### 1.3 状态枚举值

| 合法值 | 禁止改写为 |
|--------|-----------|
| `'running'` | ~~`'started'`~~ ~~`'active'`~~ |
| `'offline'` | ~~`'stopped'`~~ ~~`'down'`~~ |
| `'starting'` | ~~`'pending'`~~ ~~`'booting'`~~ |
| `'error'` | ~~`'failed'`~~ ~~`'broken'`~~ |
| `'stopped'` | ~~`'killed'`~~ ~~`'terminated'`~~ |

---

## 二、文件修改规范

### 2.1 修改前必读

修改任何 `.js` 文件前，必须：

1. **读对应模块文档** (`docs/code-index/<module>.md`)
2. **读 BLUEPRINT.md 第四节**（数据结构）
3. **搜索文件中正在修改的字段名**（确保没有拼写错误）

### 2.2 修改后必做

1. **更新对应模块文档**（如果有接口变更）
2. **搜索全文确保字段名一致**（跨模块调用）
3. **检查 preload.js ↔ main.js IPC 通道是否配对**
4. **运行 `node -c` 语法检查**

### 2.3 禁止行为

- ❌ 凭记忆写字段名（必须查文档）
- ❌ 修改数据结构不更新 BLUEPRINT.md
- ❌ 新增 IPC 通道不在 preload.js 注册
- ❌ 新增 AI 类型不在 `KNOWN_AI_SOFTWARE` 注册
- ❌ 在渲染进程直接调用 `require('electron')`（必须通过 preload）

---

## 三、关键边界规则

### 3.1 网关进程安全红线

```
外部进程 (owned=false):
  ✅ attach()      — 可以接管
  ✅ stop()        — 只从列表移除，不 kill
  ❌ taskkill      — 绝不 kill 用户进程

Echora 进程 (owned=true):
  ✅ stop()        — taskkill 安全
  ✅ restart()     — 安全
```

### 3.2 端口检测规则

```
QClaw gateway:   PID 13140 → 端口 28789 (IIS 管理端口)
QClaw gateway:   PID 13140 → 端口 28791
OpenClaw gateway: PID 8536  → 端口 18789
OpenClaw gateway: PID 8536  → 端口 18791

特征: 主端口 = 最小端口号
```

### 3.3 浏览器安全

- 所有外部链接必须有 `target="_blank"`
- Electron 不加载不可信的外部 URL
- User data 不包含 token/密码（如有，必须加密存储）

---

## 四、代码审查清单

每次 PR/提交前自查：

```
□ 新增/修改的数据结构与 BLUEPRINT.md 一致？
□ 字段名没有拼写错误？
□ 状态枚举值使用合法值？
□ IPC 通道已在 preload.js 注册？
□ 对应模块文档已更新？
□ 跨文件字段名已全文搜索确认？
□ node -c 语法检查通过？
□ 外部进程没有使用 taskkill？
```

---

## 五、版本管理

### 版本号规则

```
v0.x  → 开发阶段
v0.1  → MVP：检测 + 管理
v0.2  → 网关自动检测（当前）
v0.3  → 消息通道打通（下一个）
v1.0  → 首个可用版
```

### 文档同步规则

每次版本号变化时，必须更新：
- `BLUEPRINT.md` → 最后更新日期
- `docs/taskboard/KANBAN.md` → 变更记录
- 受影响的模块文档 → 最后更新日期

---

## 四、代码修改策略（禁止全文件重写）

**规则**：修改文件时，只用 `edit` 工具改需要变的部分，**禁止**用 `write` 工具重写整个文件。

**原因**：
- 长上下文被挤压 → 写到一半中断 → 文件损坏
- 全写 64KB 文件时，AI 注意力分散 → 引入新 bug

**正确做法**：
```js
// ❌ 错误：用 write 重写整个 renderer.js（64KB）
write(path="renderer.js", content=entireNewContent)

// ✅ 正确：用 edit 只改 5 行
edit(path="renderer.js", edits=[{oldText:"...", newText:"..."}])
```

**例外**：文件 < 5KB 且改动 > 50% 时，才考虑全写。

---

## 五、模块化注释规范

**规则**：拆分模块时，每个函数/模块顶部**必须**写「来源」和「输出目标」注释。

**模板**：
```js
// 来源: renderer-core.js init() 调用
// 依赖: STATE.aiList（由 loadAllAgents() 填充）
// 输出: 写入 #agent-list DOM
// 关联 IPC: window.echora.agent.list()
function renderAgentList() { ... }
```

**跨模块数据流注释**：
```js
// ===== 数据流: renderer.js → preload.js → main.js =====
// renderer:  window.echora.message.send(aiType, agentId, text, userId)
//   ↓
// preload:  ipcRenderer.invoke('message:send', {...})
//   ↓
// main:     ipcMain.handle('message:send', async (event, {...}) => { ... })
```

**模块顶部必须声明**：
```js
// renderer-chat.js — 消息发送/接收/流式渲染
// 依赖: renderer-core.js（STATE 初始化）
// 输出: #chat-messages DOM + 调用 window.echora.message.sendStream()
// 关联: main.js message:sendStream 处理器
```

---

## 六、后台功能安全规则（零隐藏 Token 消耗）

**规则**：任何后台运行的功能（轮询、状态检测、自动刷新）**禁止调用 LLM API**。

**允许的轻量级检测**：
- `net.Socket` TCP 连接检查（< 1ms，0 token）
- `http.get` `/health` 端点（< 50ms，0 token）
- `fs.existsSync()` 文件检查（< 1ms，0 token）
- `process.kill(pid, 0)` PID 存活检查（< 1ms，0 token）

**禁止的后台调用**：
- `POST /v1/chat/completions` — 消耗 token
- `axios.post` 到任何 AI API — 消耗 token
- 任何包含 `model:` 参数的请求 — 消耗 token

**违反后果**：用户以为「只是开着软件」，结果发现 token 余额被后台消耗光。

---

## 七、增量推进策略

**规则**：每次只做一个功能，改完 → 语法检查 → 用户验证 → 再做下一个。

**流程**：
```
1. 读相关文件（< 5 个）
2. 做 1 个功能（改动 < 50 行）
3. node --check 全部改动文件
4. 汇报用户：「X 功能完成，请测试」
5. 用户确认 → 再做下一个功能
```

**禁止**：
- 一次做 3 个功能然后一起交付
- 不做语法检查就交付
- 功能之间互相依赖但不声明

---

## 八、IPC 通道集中定义

**规则**：所有 IPC 通道（`ipcMain.handle` / `ipcRenderer.invoke`）**必须**在 `preload.js` 中集中声明，**禁止**在 renderer 模块中直接调用 `ipcRenderer`。

**正确架构**：
```
renderer.js ──调用──→ window.echora.xxx()
       ↓
preload.js ──桥接──→ ipcRenderer.invoke('channel:action', ...)
       ↓
main.js ──处理──→ ipcMain.handle('channel:action', ...)
```

**preload.js 模板**：
```js
contextBridge.exposeInMainWorld('echora', {
  gateway: {
    start: (aiType, exePath) => ipcRenderer.invoke('gateway:start', aiType, exePath),
    // ... 只在此处定义一次
  },
  // 禁止在 renderer 模块中直接写 ipcRenderer.invoke()
});
```

---

## 九、文档与代码同步更新

**规则**：改代码时，同步更新对应的 `docs/code-index/*.md` 文档。**禁止**代码改完、文档过时。

**最低要求**：
| 代码改动 | 必须更新的文档 |
|---------|----------|
| 新增 IPC 通道 | `docs/code-index/MASTER.md` IPC 表 |
| 修改适配器方法 | `docs/code-index/adapters.md` |
| 修改网关管理逻辑 | `docs/code-index/gateway-manager.md` |
| 新增配置项 | `docs/code-index/config-manager.md` |

**检查步骤**（交付前必须做）：
1. 列出本次改动的所有文件
2. 对照 `docs/code-index/` 检查是否有对应文档
3. 更新文档中版本号和最后更新时间

---

## 十、KANBAN 驱动开发

**规则**：所有开发任务**必须**先写入 `docs/taskboard/KANBAN.md`，按优先级排序后**再开始写代码**。

**禁止**：
- 用户说「加个 XX 功能」→ 直接写代码（不写 KANBAN）
- 代码写完了才补 KANBAN

**正确流程**：
1. 用户提需求 → 写入 KANBAN（P1-xx 或 P2-xx）
2. 确认优先级 → 排到对应 Sprint
3. 开发完成 → 更新 KANBAN 状态（📅 → ✅）
4. 写 `task-artifact_YYYY-MM-DD_xxx.md` 记录技术决策

---

## 十一、交付前检查清单

每次交付前自查：

- [ ] 只用 `edit` 改文件，没有用 `write` 全写
- [ ] 所有模块间函数都有「来源/输出」注释
- [ ] 后台功能没有调用 LLM API（0 token 消耗）
- [ ] 每次只做了一个功能，语法检查通过
- [ ] IPC 通道只在 `preload.js` 定义，renderer 没有直接 `ipcRenderer`
- [ ] `docs/code-index/` 对应文档已同步更新
- [ ] `KANBAN.md` 任务状态已更新
- [ ] 写了 `task-artifact_YYYY-MM-DD_xxx.md`

---

*本文档随项目迭代更新，记录在 `project-dev` skill 的 `EVOLUTION.md`*

**最后更新**: 2026-05-21（合并 7 条开发规范）
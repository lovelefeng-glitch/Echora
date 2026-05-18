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

**最后更新**: 2026-05-17  
**创建人**: AI Assistant (基于 Echora 实际代码分析)  
**批准人**: (待填写)
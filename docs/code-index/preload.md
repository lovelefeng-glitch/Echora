# preload.js — IPC 桥梁

> **文件**: `preload.js`  
> **职责**: contextBridge 安全暴露主进程 API 到渲染进程  
> **最后更新**: 2026-05-21

---

## 暴露对象: `window.echora`

所有渲染进程代码必须通过 `window.echora.*` 访问主进程能力。

---

## 完整 API 表

### `echora.gateway` — 网关管理

| 方法 | 类型 | IPC 通道 | 参数 | 返回 |
|------|------|----------|------|------|
| `.start(aiType, exePath, config?)` | invoke | `gateway:start` | `aiType, exePath, config` | `StartResult` |
| `.stop(aiType)` | invoke | `gateway:stop` | `aiType` | `StopResult` |
| `.restart(aiType)` | invoke | `gateway:restart` | `aiType` | `StartResult` |
| `.status()` | invoke | `gateway:status` | — | `GatewayStatusMap` |
| `.refresh()` | invoke | `gateway:refresh` | — | `{ detected, gateways }` |
| `.attach(aiType, port)` | invoke | `gateway:attach` | `aiType, port` | `GatewayStatusMap` |
| `.onStatusChange(callback)` | on | `gateway:statusChange` | callback(data) | unsubscribe() |
| `.onStatusAll(callback)` | on | `gateway:statusAll` | callback(statuses) | unsubscribe() |
| `.onMessage(callback)` | on | `gateway:message` | callback(msg) | unsubscribe() |

### `echora.config` — 配置管理

| 方法 | 类型 | IPC 通道 | 参数 | 返回 |
|------|------|----------|------|------|
| `.get(key)` | invoke | `config:get` | key | value |
| `.set(key, value)` | invoke | `config:set` | key, value | true |
| `.getAll()` | invoke | `config:getAll` | — | Config |

### `echora.ai` — AI 软件管理

| 方法 | 类型 | IPC 通道 | 参数 | 返回 |
|------|------|----------|------|------|
| `.setPath(aiType, exePath)` | invoke | `ai:setPath` | aiType, exePath | true |
| `.removePath(aiType)` | invoke | `ai:removePath` | aiType | true |
| `.rescan()` | invoke | `ai:rescan` | — | AIDetected |

### `echora.env` — 环境检查

| 方法 | 类型 | IPC 通道 | 参数 | 返回 |
|------|------|----------|------|------|
| `.check()` | invoke | `env:check` | — | EnvResults |
| `.install(tool)` | invoke | `env:install` | tool | InstallResult |

### `echora.dialog` — 文件对话框

| 方法 | 类型 | IPC 通道 | 参数 | 返回 |
|------|------|----------|------|------|
| `.openFile(options)` | invoke | `dialog:openFile` | options | `{canceled, filePaths}` |

### `echora.onStartup` — 启动事件（一次性推送）

| 方法 | 类型 | IPC 通道 | 参数 |
|------|------|----------|------|
| `.envCheck(callback)` | on | `startup:env-check` | callback(envResult) |
| `.aiDetected(callback)` | on | `startup:ai-detected` | callback(detected) |

### `echora.agent` — Agent 管理

| 方法 | 类型 | IPC 通道 | 参数 | 返回 |
|------|------|----------|------|------|
| `.list(aiType)` | invoke | `agent:list` | aiType | `[{ id, name, emoji, description }]` |
| `.modelInfo(aiType)` | invoke | `agent:modelInfo` | aiType | `{ model, contextWindow, usage }` |
| `.listModels(aiType)` | invoke | `agent:listModels` | aiType | `[{ id, name }]` |
| `.setModel(aiType, modelId)` | invoke | `agent:setModel` | aiType, modelId | `{ success, currentModel }` |

### `echora.message` — 消息通道

| 方法 | 类型 | IPC 通道 | 参数 | 返回 |
|------|------|----------|------|------|
| `.send(aiType, agentId, text, userId)` | invoke | `message:send` | `{ aiType, agentId, text, userId }` | `{ success, content? }` |
| `.sendStream(aiType, agentId, text, userId, msgId)` | send | `message:sendStream` | `{ ... }` | —（fire-and-forget，流式结果独立推送） |
| `.status(aiType)` | invoke | `message:status` | aiType | `{ status }` |

### `echora.onStream` — 流式事件

| 方法 | 类型 | IPC 通道 | 参数 | 返回 |
|------|------|----------|------|------|
| `.onChunk(callback)` | on | `gateway:messageChunk` | callback({ msgId, delta, content }) | unsubscribe() |
| `.onDone(callback)` | on | `gateway:messageDone` | callback({ msgId, content, error? }) | unsubscribe() |

### `echora.aiConfig` — AI 配置只读

| 方法 | 类型 | IPC 通道 | 参数 | 返回 |
|------|------|----------|------|------|
| `.setPath(aiType, filePath)` | invoke | `ai-config:set-path` | | true |
| `.read(aiType)` | invoke | `ai-config:read` | | config |
| `.discover()` | invoke | `ai-config:discover` | | paths |
| `.list()` | invoke | `ai-config:list` | | configs |

### `echora.hermes` — Hermes 专用

| 方法 | 类型 | IPC 通道 | 参数 | 返回 |
|------|------|----------|------|------|
| `.profiles()` | invoke | `hermes:profiles` | — | `[{ name, config }]` |
| `.config()` | invoke | `hermes:config` | — | config.yaml |

### `echora.markdown` — Markdown 渲染

| 方法 | 类型 | 来源 | 参数 | 返回 |
|------|------|------|------|------|
| `.parse(text)` | sync | CDN `marked` | Markdown | HTML |

> ⚠️ `marked` 通过 CDN 加载，不用 `require('marked')`（后者在 preload 中静默失败 → contextBridge 崩溃）

### `echora.ai` — 补充方法

| 方法 | 类型 | IPC 通道 | 参数 | 返回 |
|------|------|----------|------|------|
| `.scan()` | invoke | `ai:scan` | — | AIDetected |
| `.scanFull()` | invoke | `ai:scanFull` | — | `{ results, unknownGateways }` |
| `.probePort(port)` | invoke | `ai:probePort` | port | 端口详情 |
| `.addDiscovered(data)` | invoke | `ai:addDiscovered` | `{ aiType, name, port }` | true |

---

## IPC 通道注册清单

| 通道 | 方向 | 类型 |
|------|------|------|
| `gateway:start/stop/restart` | renderer→main | handle |
| `gateway:status/refresh/attach` | renderer→main | handle |
| `gateway:statusChange/statusAll` | main→renderer | on |
| `gateway:message` | main→renderer | on |
| `gateway:messageChunk/messageDone` | main→renderer | on（流式 v0.5） |
| `config:get/set/getAll` | renderer→main | handle |
| `ai:setPath/removePath/rescan/scan/scanFull/probePort/addDiscovered` | renderer→main | handle |
| `ai-config:set-path/read/discover/list` | renderer→main | handle |
| `hermes:profiles/config` | renderer→main | handle |
| `agent:list/listModels/setModel/modelInfo` | renderer→main | handle |
| `message:send/sendStream/status` | renderer→main | handle/send |
| `env:check/install` | renderer→main | handle |
| `dialog:openFile/openDir` | renderer→main | handle |
| `startup:env-check/ai-detected` | main→renderer | on |

---

## 修改注意事项

- **新增 IPC 必须三处同步**: `preload.js` 暴露 + `main.js` handle + 渲染进程调用
- **所有 invoke 返回 Promise** — 渲染进程必须 await
- **所有 on 监听器返回取消函数** — 组件销毁时调用
- `message.sendStream` 用 `ipcRenderer.send`（fire-and-forget，不是 `invoke`）
- **不要 `require('marked')`** — preload 中 Node 模块可能静默失败，Markdown 走 CDN
- 不要在 preload 做业务逻辑 — 纯通道
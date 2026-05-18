# preload.js — IPC 桥梁

> **文件**: `preload.js`  
> **职责**: contextBridge 安全暴露主进程 API 到渲染进程  
> **最后更新**: 2026-05-17 (v0.2)

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

---

## IPC 通道注册清单

| 通道 | 方向 | 类型 |
|------|------|------|
| `gateway:start` | renderer→main | handle |
| `gateway:stop` | renderer→main | handle |
| `gateway:restart` | renderer→main | handle |
| `gateway:status` | renderer→main | handle |
| `gateway:refresh` | renderer→main | handle |
| `gateway:attach` | renderer→main | handle |
| `gateway:statusChange` | main→renderer | on |
| `gateway:statusAll` | main→renderer | on |
| `gateway:message` | main→renderer | on |
| `config:get/set/getAll` | renderer→main | handle |
| `ai:setPath/removePath/rescan` | renderer→main | handle |
| `env:check/install` | renderer→main | handle |
| `dialog:openFile` | renderer→main | handle |
| `startup:env-check/ai-detected` | main→renderer | on |

---

## 修改注意事项

- **新增 IPC 必须三处同步**: `preload.js` 暴露 + `main.js` handle + 渲染进程调用
- **所有 invoke 返回 Promise** — 渲染进程必须 await
- **所有 on 监听器返回取消函数** — 记得在组件销毁时调用
- 不要在 preload 里做任何业务逻辑 — 它是纯通道
# 代码索引 · 总览

> **⚠️ 开发前的强制步骤**  
> 1. 先读本文档找到相关模块  
> 2. 再读对应模块的详细索引  
> 3. 确认数据结构与 `BLUEPRINT.md` 一致  
> 4. 确认 IPC 通道在 `preload.js` 中已注册

---

## 模块地图

| 模块 | 文件 | 详细索引 | 行数 | 状态 |
|------|------|----------|------|------|
| 主进程 | `main.js` | [→](#mainjs) | ~843 | ✅ |
| 预加载 | `preload.js` | [preload.md](preload.md) | ~85 | ✅ |
| 渲染进程 | `src/ui/renderer.js` | [renderer.md](renderer.md) | ~2125 | ✅ |
| AI 检测器 | `src/detectors/ai-detector.js` | [ai-detector.md](ai-detector.md) | ~350 | ✅ v0.3 三层发现 |
| 环境检查器 | src/detectors/env-checker.js | [env-checker.md](env-checker.md) | ~170 | ✅ |\n| 端口扫描器 | src/detectors/port-scanner.js | [port-scanner.md](port-scanner.md) | ~220 | ✅ 新增 F-3 |\n| 状态读取器 | src/detectors/state-reader.js | [state-reader.md](state-reader.md) | ~170 | ✅ 新增 F-3 |
| 网关管理器 | `src/manager/gateway-manager.js` | [gateway-manager.md](gateway-manager.md) | ~160 | ✅ |
| 配置管理器 | `src/manager/config-manager.js` | [config-manager.md](config-manager.md) | ~80 | ✅ |
| 配置读取器 | `src/manager/config-reader.js` | [config-reader.md](config-reader.md) | ~430 | ✅ v2.0 |
| 草稿管理器 | `src/manager/draft-manager.js` | [draft-manager.md](draft-manager.md) | ~313 | ✅ v1.0 |
| 适配器基类 | `src/adapters/base-adapter.js` | [adapters.md](adapters.md) | ~72 | ✅ |
| QClaw 适配器 | `src/adapters/qclaw-adapter.js` | [adapters.md](adapters.md) | ~150 | ✅ v1.0 |
| OpenClaw 适配器 | `src/adapters/openclaw-adapter.js` | [adapters.md](adapters.md) | ~150 | ✅ v1.2 |
| Hermes 适配器 | `src/adapters/hermes-adapter.js` | [adapters.md](adapters.md) | ~1046 | ✅ v3.2 |
| Echora Proxy | `src/proxy/echora-proxy.js` | [echora-proxy.md](echora-proxy.md) | ~296 | ✅ v1.0 |
| API Server | `src/api-server.js` | [api-server.md](api-server.md) | ~118 | ✅ v1.0 |
| 测试套件 | `tests/` | — | — | ✅ Playwright 脚手架 |

---

## main.js

**角色**: 应用入口，生命周期管理，IPC 路由

### IPC 处理表

| 通道 | 类型 | 处理函数 | 输入 | 输出 |
|------|------|----------|------|------|
| `gateway:refresh` | handle | — | — | `{ detected, gateways }` |
| `gateway:attach` | handle | — | `(aiType, port)` | `gatewayStatus` |
| `gateway:start` | handle | — | `{ aiType, exePath, config }` | `{ success, pid?, message? }` |
| `gateway:stop` | handle | — | `aiType` | `{ success }` |
| `gateway:restart` | handle | — | `aiType` | `{ success, message? }` |
| `gateway:status` | handle | — | — | `gatewayStatus` |
| `config:get` | handle | — | `key` | `value` |
| `config:set` | handle | — | `(key, value)` | `true` |
| `config:getAll` | handle | — | — | `configObject` |
| `ai:setPath` | handle | — | `(aiType, exePath)` | `true` |
| `ai:removePath` | handle | — | `aiType` | `true` |
| `ai:rescan` | handle | — | — | `detected` |
| `ai:scan` | handle | — | — | `detected` (user-triggered only) |
| `env:check` | handle | — | — | `envResult` |
| `env:install` | handle | — | `tool` | `{ success, message }` |
| `message:send` | handle | — | `{ aiType, agentId, text }` | `{ success, content?, message? }` |
| `message:sendStream` | on（fire-and-forget） | — | `{ aiType, agentId, text, userId, msgId }` | —（流式，结果通过推送事件返回） |
| `message:status` | handle | — | `aiType` | `{ status }` |
| `agent:list` | handle | — | `aiType` | `[{ id, name, emoji, description }]` |
| `dialog:openFile` | handle | — | `options` | `{ canceled, filePaths }` |
| `dialog:openDir` | handle | — | `options` | `{ canceled, filePaths }` |
| `draft:read` | handle | — | `aiType` | `{ success, data }` |
| `draft:write` | handle | — | `(aiType, data)` | `{ success }` |
| `draft:save` | handle | — | `aiType` | `{ success, error? }` |
| `draft:reset` | handle | — | `aiType` | `{ success, error? }` |
| `draft:backups` | handle | — | `aiType` | `string[]` |
| `draft:paths` | handle | — | — | `{ qclaw:{original,draft}, ... }` |
| `ai-config:set-path` | handle | — | `(aiType, filePath)` | `true` |
| `ai-config:read` | handle | — | `aiType` | `{ success, data }` |
| `ai-config:discover` | handle | — | — | `{ qclaw, openclaw, hermes }` |
| `ai-config:list` | handle | — | — | `{ aiType: {path,status,preview} }` |

### 推送事件

| 通道 | 触发时机 | 数据格式 |
|------|----------|----------|
| `startup:env-check` | 首次启动 | `{ node:EnvDetail, python:EnvDetail, ... }` |
| `startup:ai-detected` | 首次启动 | `AIDetected` |
| `gateway:statusAll` | 启动检查完成 / 定期轮询 | `{ qclaw:GatewayStatus, ... }` |
| `gateway:message` | 非流式适配器收到 AI 回复 | `{ aiType, agentId, role, content }` |
| `gateway:messageChunk` | 流式消息增量推送 | `{ msgId, delta, content }` |
| `gateway:messageDone` | 流式消息完成（或报错） | `{ msgId, content, error? }` |

### 辅助函数

| 函数 | 用途 |
|------|------|
| `runStartupChecks()` | 启动四步流程 |
| `safeSend(channel, data)` | 安全推送（窗口可能已销毁） |
| `createWindow()` | Electron BrowserWindow 创建 |

---

**最后更新**: 2026-05-23 04:55  
**更新人**: 小雪 (xue)


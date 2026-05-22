# adapters — AI 适配器层

> **文件**: `src/adapters/base-adapter.js`, `src/adapters/openclaw-adapter.js`, `src/adapters/qclaw-adapter.js`, `src/adapters/hermes-adapter.js`, `src/adapters/cursor-adapter.js`  
> **职责**: 为不同 AI 软件提供统一的对话接口  
> **最后更新**: 2026-05-23 (v1.5)

---

## 基类: BaseAdapter

所有 AI 适配器必须继承此类。

### 接口方法（子类必须实现）

| 方法 | 返回类型 | 描述 |
|------|----------|------|
| `start()` | `Promise<{success, message?}>` | 启动网关 |
| `stop()` | `Promise<{success, message?}>` | 停止网关 |
| `getStatus()` | `Promise<{status, pid?, uptime?}>` | 获取网关运行状态 |
| `listAgents()` | `Promise<Agent[]>` | 枚举可用 AI agent |
| `sendMessage(agentId, msg)` | `Promise<{success, messageId?}>` | 发送消息 |

### 接口方法（基类实现）

| 方法 | 描述 |
|------|------|
| `onMessage(callback)` | 注册消息接收回调 |
| `_emitMessage(msg)` | 触发回调（子类调用此方法推送） |

### 属性

| 属性 | 类型 | 描述 |
|------|------|------|
| `config` | object | 构造时传入：`{ exePath, port, token }` |
| `name` | string | 适配器名称 |
| `status` | string | `offline | starting | running | error` |

---

## OpenClawAdapter (extends BaseAdapter)

**状态**: ✅ v1.0 — API 路径已修正，消息通道已打通  
**QClaw Gateway 端口**: `28789`（从 `openclaw.json` 动态读取）  
**认证方式**: `Authorization: Bearer <token>`（从 `openclaw.json` 读取）

### 正确 API 端点（2026-05-18 实测）

| 方法 | URL | 方法 | 说明 |
|------|-----|------|------|
| `getStatus()` | `/health` | GET | ✅ 返回 `{"ok":true,"status":"live"}` |
| `listAgents()` | _（暂未实现，返回默认值）_ | - | Agent 列表应从 `openclaw.json` 读取 |
| `sendMessage()` | `/v1/chat/completions` | POST | ✅ OpenAI 兼容，非流式 |
| `sendMessageStream()` | `/v1/chat/completions` (SSE) | POST | ✅ 流式接收（SSE） |
| `_waitForReady()` | `/health` | GET | ✅ 等待网关就绪 |

### 依赖（✅ 已移除外部依赖）

~~`node-fetch`~~、~~`ws`~~ 已移除，改用 Node 内置 `http` 模块。

### 消息通道调用示例

```js
// 非流式（直接返回完整回复）
const result = await adapter.sendMessage('main', '你好');
// → { success: true, content: '...', messageId: 'chatcmpl_xxx' }

// 流式（逐 token 返回）
adapter.sendMessageStream('main', '你好', {
  onChunk: (delta, full) => console.log('收到:', delta),
  onDone: (full) => console.log('完成:', full),
  onError: (err) => console.error(err),
});
```

---

## 适配器注册表

| aiType | 适配器类 | 网关协议 | 状态 |
|--------|----------|----------|------|
| `openclaw` | OpenClawAdapter | HTTP/SSE (OpenAI 兼容） | ✅ v1.2 |
| `qclaw` | QClawAdapter | HTTP/SSE (OpenAI 兼容） | ✅ v1.0 |
| `hermes` | HermesAdapter | HTTP/SSE (OpenAI 兼容） + 会话持久化 + Echora Proxy | ✅ v3.5 |
| `cursor` | CursorAdapter | 本地检测 | ✅ v1.0 |
| `windsurf` | 待实现 | ? | 📅计划 |

---

## HermesAdapter (extends BaseAdapter)

**状态**: ✅ v3.4 — Echora Proxy 集成 + metrics 注入 + 端口 8085  
**API Server 端口**: `8083`（从 `.env` 的 `API_SERVER_PORT` 读取）  
**代理端口**: `8085`（Echora Proxy，自动转发到 8083）  
**认证方式**: `Authorization: Bearer <API_SERVER_KEY>`（从 `.env` 读取）  
**会话隔离**: 通过 `X-Hermes-Session-Id` 头传递 session ID

### 关键机制

| 机制 | 说明 |
|------|------|
| 状态检测 | 三级：① TCP 连接端口（100ms）→ ② gateway_state.json + PID → ③ HTTP `/health` |
| 会话隔离 | 每个 Echora 会话生成唯一 `userId = 'echora-conv_' + Date.now()`，通过 `X-Hermes-Session-Id` 传递 |
| 502 降级 | 非流式请求遇到 502 时自动降级为流式模式重试 |
| 消息发送 | 只发最新一条消息，Hermes 从 `state.db` 加载历史上下文 |
| 消息推送 | `sendMessageStream()` 只能通过 `onChunk/onDone/onError` 回调推送，**禁止**调 `_emitMessage()`（会导致重复消息） |

### 状态检测流程（v3.3 新增 TCP 端口检查）

```
getStatus()
  ├─ 0. TCP connect 127.0.0.1:port（100ms 超时）
  │     ├─ 成功 → return { status:'running', fastCheck:true }
  │     └─ 失败 → 继续
  ├─ 1. 读 gateway_state.json → 拿到 PID + gateway_state
  ├─ 2. process.kill(pid, 0) 检查 PID 是否存活
  │     ├─ 存活 → return running
  │     └─ 不存在 → 继续
  └─ 3. fallback: HTTP GET /health
        ├─ 200 → return running
        └─ 失败 → return offline
```

### 会话 ID 传递链路

```
renderer.js: createNewConv() → userId = 'echora-conv_' + Date.now()
  ↓
preload.js: ipcRenderer.invoke('message:send', { userId })
  ↓
main.js: adapter.sendMessage(agentId, messages, userId)
  ↓
hermes-adapter.js: headers['X-Hermes-Session-Id'] = userId
  ↓
Hermes API Server: session_id = provided_session_id → 从 state.db 加载历史
```

### 依赖

- `js-yaml`（npm）：读取 Hermes `config.yaml`
- Node 内置 `http`、`fs`、`path`、`os`、`child_process`

### 已知限制

- Hermes 的 `X-Hermes-Session-Id` 需要 `API_SERVER_KEY` 已配置才能生效（否则返回 403）
- 模型问题（如 `qwen/qwen3.5-122b-a10b` 返回空响应）需要在 Hermes 侧配置 fallback

### 模型切换

| 函数 | 触发方式 | 行为 |
|------|----------|------|
| `setModel(modelId)` | renderer 直接调 | 更新 `_currentModel` + 清空所有 session prompt state |
| `switchModel(modelId)` | `agent:setModel` IPC（Hermes 专有路径）| 修改 config.yaml → 重启 Gateway → 双清缓存 |

切换模型时清空两个缓存，确保 `getModelInfo` 返回 `contextUsed=0`，状态栏显示 `0/262K · 0%`。

### Prompt Token 持久化 (v0.6)

| 特性 | 说明 |
|------|------|
| 存储文件 | `echora_session_state.json`（hermesRoot 目录下）|
| 存储格式 | `{"sessionId": lastPromptTokens}` Map 序列化 |
| 加载时机 | constructor (`_loadPromptTokensState`) → 恢复 Map |
| 保存时机 | 每次 `onDone` + `sendMessage` 非流式 → `_savePromptTokensState` |
| 清除时机 | `switchModel` / `setModel` → `Map.clear()` + 立即持久化 |
| 重启回退 | `getModelInfo` step 2.5: Map 为空返回 `0`，非空取最近值 |

---

## 修改注意事项

- 新增适配器: 继承 `BaseAdapter`，实现所有抽象方法
- 不要修改 `BaseAdapter` 接口 — 所有适配器共享同一接口
- API URL 必须以 `this.baseUrl` 为前缀
- 所有 API 调用必须带 `Authorization: Bearer <token>` Header
- `start()` 在 QClaw 已运行时直接返回成功（无需重复启动）
- 修改接口 → 必须同步更新本文档
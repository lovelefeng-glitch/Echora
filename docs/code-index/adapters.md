# adapters — AI 适配器层

> **文件**: `src/adapters/base-adapter.js`, `src/adapters/openclaw-adapter.js`  
> **职责**: 为不同 AI 软件提供统一的对话接口  
> **最后更新**: 2026-05-18 (v1.0)

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
| `openclaw` | OpenClawAdapter | HTTP/SSE (OpenAI 兼容） | ✅ v1.0 |
| `qclaw` | OpenClawAdapter | HTTP/SSE (OpenAI 兼容） | ✅ v1.0 |
| `cursor` | 待实现 | ? | 📅计划 |
| `windsurf` | 待实现 | ? | 📅计划 |

---

## 修改注意事项

- 新增适配器: 继承 `BaseAdapter`，实现所有抽象方法
- 不要修改 `BaseAdapter` 接口 — 所有适配器共享同一接口
- API URL 必须以 `this.baseUrl` 为前缀
- 所有 API 调用必须带 `Authorization: Bearer <token>` Header
- `start()` 在 QClaw 已运行时直接返回成功（无需重复启动）
- 修改接口 → 必须同步更新本文档
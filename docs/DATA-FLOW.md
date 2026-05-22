# 全链路数据流

> **最后更新**: 2026-05-23  
> **版本**: v1.0  
> **目的**: 每个操作的完整数据路径，追踪问题时按图索骥

---

## 一、启动流程

```
app.whenReady()
    │
    ▼
┌─ ConfigManager.init() ─────────────────────────┐
│  读取 %APPDATA%/echora/echora-config.json      │
│  初始化 adapters Map, configManager 实例        │
└────────────────────────┬───────────────────────┘
                         │
    ▼────────────────────▼
┌─ runStartupChecks() ───────────────────────────┐
│                                                │
│  Step 1: EnvChecker.checkAll()                 │
│  → 检测 node/python/git/npm                    │
│  → 推送 startup:env-check 到 renderer          │
│                                                │
│  Step 2: AIDetector.scanAll(aiPaths)           │
│  → 文件扫描 + 进程扫描 + 端口扫描              │
│  → 推送 startup:ai-detected 到 renderer        │
│                                                │
│  Step 3: gatewayManager.attach()               │
│  → 接管已运行的网关                             │
│                                                │
│  Step 4: DraftManager.initAll()                │
│  → 原配置 → normalize → 草稿文件               │
│                                                │
│  Step 5: 推送 gateway:statusAll 到 renderer    │
└────────────────────────┬───────────────────────┘
                         │
    ▼────────────────────▼
┌─ startStatusPolling() ─────────────────────────┐
│  每 10 秒轮询:                                  │
│  gatewayManager.getAllStatus()                  │
│  → safeSend('gateway:statusAll', status)        │
└────────────────────────────────────────────────┘
```

---

## 二、消息发送流程（流式）

```
renderer.sendMessage()
    │
    ▼
window.echora.message.sendStream({aiType, agentId, text, userId, msgId})
    │
    ▼ (IPC on, fire-and-forget)
main.js 收到 → getOrCreateAdapter(aiType)
    │
    ▼
adapter.sendMessageStream(agentId, text, callbacks)
    │
    ├── callbacks.onChunk(delta)  → safeSend('gateway:messageChunk', {msgId, delta})
    ├── callbacks.onDone(full)    → safeSend('gateway:messageDone', {msgId, content, metrics})
    └── callbacks.onError(err)    → safeSend('gateway:messageDone', {msgId, error})
    │
    ▼ (SSE 流 / HTTP chunked)
AI 网关响应
    │
    ▼
renderer 收到推送事件 → updateMessageContent() → 实时打字效果
```

---

## 三、配置编辑流程（Draft 系统）

```
┌─ 启动 ─────────────────────────────────────────┐
│ 原配置文件                                      │
│   ↓ fs.readFileSync()                          │
│ rawData (嵌套结构)                               │
│   ↓ ConfigReader.normalize(aiType, rawData)    │
│ normalizedData (扁平结构)                        │
│   ↓ fs.writeFileSync()                         │
│ drafts/{aiType}.json                           │
└────────────────────────────────────────────────┘

┌─ 编辑 ─────────────────────────────────────────┐
│ renderer._renderAISettingsPanel(aiType)         │
│   ↓ window.echora.draft.read(aiType)           │
│ DraftManager.readDraft() → 读取草稿             │
│   ↓ 返回 normalizedData                        │
│ renderer 渲染 UI（扁平结构，字段名匹配）         │
│   ↓ 用户编辑 input/textarea                     │
│ window.echora.draft.write(aiType, data)        │
│ DraftManager.writeDraft() → 写入草稿            │
└────────────────────────────────────────────────┘

┌─ 保存 ─────────────────────────────────────────┐
│ renderer._saveConfig(aiType)                   │
│   ↓ window.echora.draft.save(aiType)           │
│ DraftManager.saveToOriginal()                   │
│   ↓ fs.readFileSync(draftPath)                 │
│ draftData (normalized)                          │
│   ↓ this.denormalize(aiType, draftData)        │
│ originalData (还原嵌套结构)                      │
│   ↓ fs.copyFileSync(original, backup)          │
│ 备份到 backups/{aiType}_{timestamp}.json       │
│   ↓ fs.writeFileSync(originalPath, ...)        │
│ 写入原配置文件                                   │
└────────────────────────────────────────────────┘

┌─ 重置 ─────────────────────────────────────────┐
│ renderer._resetConfig(aiType)                  │
│   ↓ window.echora.draft.reset(aiType)          │
│ DraftManager.resetDraft() = init(aiType)       │
│   ↓ fs.readFileSync(originalPath)              │
│ rawData (嵌套结构)                               │
│   ↓ ConfigReader.normalize(aiType, rawData)    │
│ normalizedData                                  │
│   ↓ fs.writeFileSync(draftPath, ...)           │
│ 覆盖草稿文件                                     │
└────────────────────────────────────────────────┘
```

---

## 四、SSE 代理流程

```
renderer.sendMessage() → adapter.sendMessageStream()
    │
    ▼
HTTP POST http://127.0.0.1:8085/v1/chat/completions
    │ (Echora Proxy)
    ▼
Proxy 转发到 http://127.0.0.1:8083/v1/chat/completions
    │ (Hermes Gateway)
    ▼
Hermes 返回 SSE 流
    │
    ▼
Proxy 解析每个 SSE event:
    │
    ├── data: {"choices":[{"delta":{"content":"..."}}]}
    │   → 转发给 renderer
    │
    ├── data: {"choices":[{"delta":{"tool_calls":[...]}}]}
    │   → 提取工具调用信息
    │   → 转发给 renderer
    │
    ├── data: [DONE]
    │   → 计算延迟
    │   → 注入 echora.metrics 事件
    │   → 转发 [DONE]
    │
    └── echora.metrics (注入)
        → { completion_tokens, prompt_tokens, latency_ms, tool_calls }
        → renderer 显示在消息底部
```

---

## 五、模型切换流程

```
renderer: 用户选择新模型
    │
    ▼
window.echora.agent.setModel(aiType, modelId)
    │
    ▼ (IPC handle)
main.js → adapter.setModel(modelId)
    │
    ├── Hermes: 写 config.yaml → model.default = 新模型
    │          → 重启 Gateway（hermes gateway run --replace）
    │          → 等待 5s → 刷新状态
    │
    ├── QClaw: adapter.config.model.primary = 新模型
    │          → 不需要重启
    │
    └── OpenClaw: adapter.config.model.primary = 新模型
                 → 不需要重启
    │
    ▼
renderer: 清空模型选择器 → 重新加载模型列表 → 恢复 UI
```

---

## 六、状态检测流程

```
每 10 秒 (startStatusPolling):
    │
    ▼
gatewayManager.getAllStatus()
    │
    ├── 对每个 aiType:
    │   ├── 检查 this.processes Map
    │   ├── 如果有进程记录 → checkAlive(pid)
    │   │   └── HTTP GET http://127.0.0.1:{port}/health
    │   │       → alive = (响应状态码 2xx)
    │   │
    │   └── 如果无进程记录 → 跳过
    │
    ▼
safeSend('gateway:statusAll', {
    qclaw: { status:'running', pid:1234, port:28789, alive:true },
    openclaw: { status:'running', pid:5678, port:18789, alive:true },
    hermes: { status:'running', pid:9012, port:8083, alive:true },
    ...
})
    │
    ▼
renderer.handleGatewayStatusAll()
    → 更新状态灯颜色（绿/黄/灰/红）
    → 更新 Agent 卡片状态
```

---

## 七、normalize / denormalize 对称映射

### QClaw / OpenClaw

| 原始路径 | normalize → | denormalize ← |
|----------|-------------|---------------|
| `gateway.auth.mode` | `gateway.authMode` | `gateway.auth.mode` |
| `gateway.http.endpoints.chatCompletions.enabled` | `gateway.httpEnabled` | 还原嵌套 |
| `gateway.controlUi.allowInsecureAuth` | `gateway.controlUiAllowInsecure` | 还原嵌套 |
| `gateway.tailscale.mode` | `gateway.tailscaleMode` | 还原嵌套 |
| `agents.list[].identity.name` | `agents[].name` | `identity.name` |
| `agents.list[].model.primary` | `agents[].modelPrimary` | `model.primary` |
| `agents.list[].model.fallbacks` | `agents[].modelFallbacks` | `model.fallbacks` |
| `models.providers.{key}` | `models[].provider = key` | 还原为对象 key |
| `session.resetMode` | `session.resetMode` | 直接映射 |
| `tools.timeout` | `tools.toolTimeout` | `tools.timeout` |

### Hermes

| 原始路径 | normalize → | denormalize ← |
|----------|-------------|---------------|
| `model.default` | `model.default` | 直接映射 |
| `model.max_tokens` | `model.maxTokens` | `model.max_tokens` |
| `model.top_p` | `model.topP` | `model.top_p` |
| `agent.max_turns` | `agent.maxTurns` | `agent.max_turns` |
| `agent.gateway_timeout` | `agent.gatewayTimeout` | `agent.gateway_timeout` |
| `agent.reasoning_effort` | `agent.reasoningEffort` | `agent.reasoning_effort` |
| `memory.memory_enabled` | `memory.enabled` | `memory.memory_enabled` |
| `memory.max_entries` | `memory.maxEntries` | `memory.max_entries` |
| `compression.window_size` | `compression.windowSize` | `compression.window_size` |
| `security.approval_mode` | `security.approvalMode` | `security.approval_mode` |
| `approvals.auto_approve` | `approvals.autoApprove` | `approvals.auto_approve` |
| `api_server.*` | `apiServer.*` | `api_server.*` |

---

*最后更新: 2026-05-23 | 作者: 小雪*

# renderer.js — 渲染进程 (UI)

> **文件**: `src/ui/renderer.js`  
> **职责**: 所有界面逻辑（向导、侧边栏、聊天、设置）  
> **最后更新**: 2026-05-22

---

## 全局状态: STATE

```ts
const STATE = {
  currentAgentKey: string | null,  // 当前选中 agent 的 key
  currentConvId: string | null,    // 当前会话 ID
  allAgents: AnyAgent[],           // 所有 AI × Agent 组合
  aiList: AIListItem[],            // 所有 AI 项
  conversations: { [agentKey]: { [convId]: Conversation } },
  modelInfo: { model, contextWindow, usedTokens, ratio } | null,
  settings: { timeout, timeoutPerAI, pollInterval, aiConfigPaths } | null,
  envResult: EnvResults | {},
}

type Conversation = {
  id: string, userId: string, name: string,
  messages: { role, content, time }[],
  createdAt: number, updatedAt: number
}
```

---

## 事件处理

### 启动事件

| 监听器 | Channel | 触发函数 |
|--------|---------|----------|
| `envCheck` | `startup:env-check` | `handleEnvCheck(data)` |
| `aiDetected` | `startup:ai-detected` | `handleAIDetected(data)` |
| `onStatusAll` | `gateway:statusAll` | `handleGatewayStatusAll(statuses)` |
| `onStatusChange` | `gateway:statusChange` | `handleGatewayChange(data)` |

### 流式事件 (v0.5)

| 监听器 | Channel | 触发函数 | 数据 |
|--------|---------|----------|------|
| `onStream.onChunk` | `gateway:messageChunk` | 增量更新消息 DOM | `{ msgId, delta, content }` |
| `onStream.onDone` | `gateway:messageDone` | 完成 + 保存会话 | `{ msgId, content, error? }` |

> `onChunk`/`onDone` 注册在 `echora.onStream.*`（preload.js 暴露），不走 `gateway.onMessage`。

---

## 视图系统

`switchView(viewName)` 切换：`chat` / `ai-mgmt` / `settings-app` / `env` / `conv-mgmt`

---

## 核心函数

### UI 渲染

| 函数 | 用途 |
|------|------|
| `renderEnvCheck(envResult)` | 渲染向导页环境检查列表 |
| `renderAIDetect(detected)` | 渲染向导页 AI 发现列表（含运行状态） |
| `renderAIList()` | 渲染侧边栏 AI 列表（运行中的排最前） |
| `renderEnvStatus()` | 渲染底部环境状态条 |
| `selectAI(ai)` | 切换当前 AI，更新聊天区 |
| `updateAIStatus(aiType, status)` | 更新单个 AI 状态 |
| `updateAIStatusUI()` | 刷新侧边栏状态指示器 |
| `setHintText(txt)` | 设置 hint 栏文本，保留 #model-selector 不被覆盖 |

### 网关操作

| 函数 | 用途 |
|------|------|
| `doScan()` | 触发 `gateway:refresh` 更新所有状态 |
| `startGateway(aiType)` | 启动指定 AI 的网关 |

### 聊天（流式 v0.5）

| 函数 | 用途 |
|------|------|
| `sendMessage()` | 创建 msgId 占位消息 → `sendStream()` → 注册 `onChunk`/`onDone` |
| `updateMessageContent(msgId, html)` | 增量更新消息 DOM（onChunk 调，含闪烁光标 `.stream-cursor`） |
| `addMessage(role, text, msgId?, save?)` | 普通添加消息（支持 Markdown，非流式路径用），**返回 msg 元素** |
| `renderMarkdown(text)` | 通过 `window.marked.parse()` 渲染（CDN 加载，非 Node require） |
| `setHintText(txt)` | 设置 hint 栏文本，自动保留 #model-selector |

### 消息 Metrics (v0.6)

| 功能 | 说明 |
|------|------|
| Token 显示 | 消息底部显示 completion_tokens（本次消耗），不显示 prompt_tokens（已在 hint 栏 % 展示） |
| 延迟显示 | 消息底部显示总延迟秒数 |
| 工具调用 | 消息底部显示 🔧 图标 + 数量，点击弹窗显示工具名（中文映射）+ label |
| 持久化 | 工具调用和 metrics 随会话保存到 localStorage，重启不丢失 |
| 恢复 | loadConvMessages() 从历史消息恢复工具按钮和 metrics 标签 |

**流式数据流：**
```
sendMessage() → sendStream(aiType, agentId, text, userId, msgId)
  ↓ fire-and-forget
main.js → adapter.sendMessageStream() → SSE chunks
  ↓ onChunk
webContents.send('gateway:messageChunk', { msgId, delta, content })
  ↓ preload.js onStream.onChunk
updateMessageContent(msgId, marked(content) + 光标)
  ↓ onDone (only once, from res.on('end'))
webContents.send('gateway:messageDone', { msgId, content, metrics })
  ↓ preload.js onStream.onDone
updateMessageContent(msgId, marked(content)) + 渲染 metrics + saveConversations()
```

> ⚠️ 流式走 DOM 直接 `document.getElementById(msgId)`，不走 `addMessage()`（后者会转义 HTML 光标标签）。
> ⚠️ onDone 只触发一次（res.on('end')），SSE [DONE] 不再触发 onDone，避免 metrics 丢失。

### Agent 管理

| 函数 | 用途 |
|------|------|
| `loadAllAgents()` | 跨 AI 枚举 agent → `STATE.allAgents` |
| `renderAgentList()` | 渲染侧边栏 agent 列表（running 排前） |
| `selectAgent(agent)` | 选中 → 加载会话 + 消息历史 + 模型信息 |
| `buildAvatarHTML(agent)` | emoji/avatar 渲染 |

### 会话管理

| 函数 | 用途 |
|------|------|
| `loadConversations()` / `saveConversations()` | IPC 持久化（config:get/set 'conversations'） |
| `getOrCreateConv(agentKey)` | 获取/创建活跃会话 |
| `loadConvMessages(conv)` | 加载历史消息到聊天区 |
| `refreshConvSelector(agentKey)` | 刷新会话下拉选择器 |
| `newConversation()` / `deleteConversation(convId)` | 新建/删除会话 |

### 模型信息

| 函数 | 用途 |
|------|------|
| `loadModelInfo(agent?)` | 调 `agent.modelInfo()` → 更新输入区提示（模型名 + 上下文窗口 + 用量） |

### AI 管理

| 函数 | 用途 |
|------|------|
| `renderAIMgmtView()` | 渲染 AI 管理页（启动/停止/移除） |
| `handleMgmtAction(action, aiType)` | start/stop/restart/remove |
| `doScanFull()` | 三层深度扫描（端口 + 状态文件 + HTTP） |
| `renderUnknownGateways(unknowns)` | 未知网关提示 + 添加按钮 |
| `showAddAIModal(presetType?)` / `saveAI()` | 添加 AI 弹窗流程

---

## DOM 元素引用（关键）

| ID | 用途 | 操作 |
|----|------|------|
| `#welcome-overlay` | 向导遮罩 | `.classList.add/remove('hidden')` |
| `#env-check-list` | 环境检查列表 | `innerHTML` |
| `#ai-detect-list` | AI 发现列表 | `innerHTML` |
| `#ai-list` | 侧边栏 AI 列表 | `innerHTML` |
| `#current-ai-name` | 当前 AI 名称 | `textContent` |
| `#chat-input` | 输入框 | `value`, `disabled`, `placeholder` |
| `#btn-send` | 发送按钮 | `disabled` |
| `#input-hint` | 状态提示 | `textContent` |
| `#chat-messages` | 消息列表 | `innerHTML`, `appendChild` |
| `#env-status` | 环境状态条 | `innerHTML` |
| `#add-ai-modal` | 添加 AI 弹窗 | `.classList` |
| `#env-modal` | 环境详情弹窗 | `.classList` |
| `#agent-search` | 搜索框 | `value`, 事件 |

### 新增 (v0.5)

| ID | 用途 | 操作 |
|----|------|------|
| `#agent-list` | Agent 侧边栏 | `innerHTML`, `querySelector` |
| `#conv-selector` | 会话选择器 | `innerHTML`, `classList`, `value` |
| `#btn-new-conv` | 新建会话按钮 | `classList`, click |
| `#btn-back-chat` | 返回聊天 | `classList` |
| `#model-selector` | 模型下拉 | `value`, `onchange` |
| `#model-info-name` | 模型名 | `textContent` |
| `#model-info-window` | 上下文窗口大小 | `textContent` |
| `#model-info-ratio` | 上下文占用比例 | `textContent` |
| `#btn-mgmt-detect` | 自动检测按钮 | `textContent`, `disabled` |
| `#mgmt-ai-list` | AI 管理列表容器 | `innerHTML`, `appendChild` |
| `#drawer-content` / `#drawer-arrow` | 环境抽屉 | `classList` |

---

## 修改注意事项

- 流式消息 DOM 直操，不走 `addMessage()`（HTML 光标标签会被`addMessage`转义）
- Markdown 用 CDN `window.marked.parse()`，**不要** `require('marked')`（preload 中静默失败）
- `objectToList(obj)` 是 AIDetector → AIListItem 转换
- 侧边栏排序: `status === 'running'` 排前面
- 视图用 `switchView(viewName)` 切换
- AI 图标: `{ qclaw:'🐉', openclaw:'🦞', hermes:'⚡', cursor:'☝️', ... }`
- 超时安全网: `settings.timeoutPerAI[aiType]` → `settings.timeout` → 120000 三级 fallback
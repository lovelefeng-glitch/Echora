# renderer.js — 渲染进程 (UI)

> **文件**: `src/ui/renderer.js`  
> **职责**: 所有界面逻辑（向导、侧边栏、聊天、设置）  
> **最后更新**: 2026-05-17 (v0.2)

---

## 全局状态: STATE

```ts
const STATE = {
  currentAI: string | null,       // 当前选中 AI 的 id
  aiList: AIListItem[],           // 所有 AI 项
  messages: Message[],            // 聊天消息
  envResult: EnvResults | {},    // 环境检查结果
}

type AIListItem = {
  id: string,                     // 'qclaw' | 'openclaw' | ...
  name: string,                   // 'QClaw' | 'OpenClaw' | ...
  category: string,               // 'agent' | 'ide'
  found: boolean,                 // 文件是否存在
  path: string | null,            // 可执行文件路径
  source: string | null,          // 'auto' | 'manual' | 'path' | 'running'
  verified: boolean,              // 是否验证过
  gatewayPort: number | null,     // 网关端口
  status: string,                 // 'running' | 'offline'
  gatewayOwned: boolean,          // 进程所有权
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

### 网关操作

| 函数 | 用途 |
|------|------|
| `doScan()` | 触发 `gateway:refresh` 更新所有状态 |
| `startGateway(aiType)` | 启动指定 AI 的网关 |

### 聊天

| 函数 | 用途 |
|------|------|
| `sendMessage()` | 发送消息到当前 AI |
| `addMessage(role, text)` | 添加消息到聊天区 |

### 配置与设置

| 函数 | 用途 |
|------|------|
| `showEnvModal()` | 打开环境详情弹窗 |
| `showAddAIModal(presetType?)` | 打开添加 AI 弹窗 |
| `saveAI()` | 保存新增 AI 路径 |

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

---

## 修改注意事项

- `objectToList(obj)` 是 AIDetector 返回值 → AIListItem 的转换函数
- 侧边栏排序规则: `status === 'running'` 的排前面
- `selectAI` 根据 `ai.status` 决定聊天区的可交互性
- 向导页的"完成设置"按钮 → `loadMainUI()`
- AI 图标映射: `AI_ICONS = { qclaw: '🐉', openclaw: '🦞', ... }`
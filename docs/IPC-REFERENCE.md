# Echora 2.0 IPC 参考文档

## 概述

Echora 2.0 使用 Electron 的 IPC (Inter-Process Communication) 机制在主进程和渲染进程之间通信。所有 IPC 通道都有完整的 TypeScript 类型定义，确保类型安全。

## IPC 通道类型

| 类型 | 方向 | 机制 | 用途 |
|------|------|------|------|
| Handle | Renderer → Main | `ipcRenderer.invoke()` | 请求-响应模式 |
| On | Renderer → Main | `ipcRenderer.send()` | 单向发送模式 |
| Push | Main → Renderer | `webContents.send()` | 主进程主动推送 |

## Handle 通道 (请求-响应)

### 窗口控制

#### `window:minimize`

最小化窗口。

```typescript
// 请求
void

// 响应
void

// 使用
await window.echora.window.minimize()
```

#### `window:maximize`

切换最大化状态。

```typescript
// 请求
void

// 响应
void

// 使用
await window.echora.window.maximize()
```

#### `window:close`

关闭窗口。

```typescript
// 请求
void

// 响应
void

// 使用
await window.echora.window.close()
```

#### `window:isMaximized`

检查窗口是否最大化。

```typescript
// 请求
void

// 响应
boolean

// 使用
const isMaximized = await window.echora.window.isMaximized()
```

#### `window:setTheme`

设置窗口主题。

```typescript
// 请求
isLight: boolean

// 响应
void

// 使用
await window.echora.window.setTheme(true) // 切换到亮色主题
```

---

### 网关管理

#### `gateway:refresh`

刷新所有网关状态。数据来源包括：`config.aiPaths`（手动配置的路径）、磁盘扫描（`scanFiles` 检测已安装的 AI 可执行文件）、`config.gatewayConfigs`（通过端口手动添加的网关配置）、以及运行中的网关进程。确保网关掉线后条目不丢失。

```typescript
// 请求
void

// 响应
{
  detected: AIDetected        // 检测到的 AI 软件（含离线条目）
  gateways: GatewayStatusMap  // 网关状态映射
}

// 使用
const { detected, gateways } = await window.echora.gateway.refresh()
```

#### `gateway:attach`

附加到已运行的网关。

```typescript
// 请求
aiType: string   // AI 类型 (如 'hermes', 'openclaw')
port: number     // 网关端口

// 响应
GatewayStatusMap

// 使用
const status = await window.echora.gateway.attach('hermes', 8083)
```

#### `gateway:start`

启动网关。

```typescript
// 请求
{
  aiType: string       // AI 类型
  exePath?: string     // 可执行文件路径
  config?: object      // 配置对象
  profileName?: string // 配置文件名称 (仅 Hermes)
}

// 响应
{
  success: boolean
  pid?: number
  message?: string
}

// 使用
const result = await window.echora.gateway.start('hermes', '/path/to/hermes')
```

#### `gateway:stop`

停止网关。

```typescript
// 请求
aiType: string        // AI 类型
profileName?: string  // 配置文件名称 (仅 Hermes)

// 响应
{ success: boolean }

// 使用
const result = await window.echora.gateway.stop('hermes')
```

#### `gateway:restart`

重启网关。

```typescript
// 请求
aiType: string

// 响应
{
  success: boolean
  message?: string
}

// 使用
const result = await window.echora.gateway.restart('openclaw')
```

#### `gateway:status`

获取所有网关状态。

```typescript
// 请求
void

// 响应
GatewayStatusMap

// 使用
const status = await window.echora.gateway.status()
// status = {
//   hermes: { status: 'running', pid: 1234, port: 8083, ... },
//   openclaw: { status: 'offline', ... }
// }
```

---

### Agent 管理

#### `agent:list`

获取 Agent 列表。

```typescript
// 请求
aiType: string

// 响应
AgentListItem[]

// 使用
const agents = await window.echora.agent.list('hermes')
// agents = [
//   { id: 'main', name: '主 Agent', emoji: '🤖', description: '...' },
//   { id: 'coder', name: '编程助手', emoji: '💻', description: '...' }
// ]
```

#### `agent:modelInfo`

获取 Agent 模型信息。

```typescript
// 请求
aiType: string
agentId?: string

// 响应
ModelInfo

// 使用
const info = await window.echora.agent.modelInfo('hermes', 'main')
// info = {
//   model: 'claude-3-opus',
//   contextWindow: 200000,
//   usedTokens: 50000,
//   usagePct: 25
// }
```

#### `agent:listModels`

获取可用模型列表。

```typescript
// 请求
aiType: string

// 响应
ModelListItem[]

// 使用
const models = await window.echora.agent.listModels('hermes')
// models = [
//   { id: 'claude-3-opus', name: 'Claude 3 Opus', provider: 'Anthropic' },
//   { id: 'gpt-4', name: 'GPT-4', provider: 'OpenAI' }
// ]
```

#### `agent:setModel`

切换模型。

```typescript
// 请求
aiType: string
modelId: string

// 响应
SetModelResult

// 使用
const result = await window.echora.agent.setModel('hermes', 'claude-3-opus')
// result = {
//   success: true,
//   needsRestart: false,
//   model: 'claude-3-opus',
//   message: '模型已切换'
// }
```

---

### 消息管理

#### `message:send`

发送消息 (非流式)。

```typescript
// 请求
{
  aiType: string
  agentId: string
  text: string
  history?: Array<{ role: string; content: string }>
  userId?: string
  conversationId?: string
}

// 响应
SendMessageResult

// 使用
const result = await window.echora.message.send('hermes', 'main', '你好')
// result = {
//   success: true,
//   content: '你好！有什么可以帮助你的吗？',
//   messageId: 'msg_123'
// }
```

#### `message:status`

获取消息处理状态。

```typescript
// 请求
aiType: string

// 响应
{ status: string }

// 使用
const status = await window.echora.message.status('hermes')
// status = { status: 'idle' | 'processing' | 'error' }
```

#### `message:usage`

获取消息使用统计。

```typescript
// 请求
{
  aiType: string
  sessionKey?: string
}

// 响应
UsageInfo | null

// 使用
const usage = await window.echora.message.usage('hermes')
// usage = {
//   input: 1000,
//   output: 500,
//   totalTokens: 1500,
//   cost: 0.05
// }
```

---

### 配置管理

#### `config:get`

获取配置项。

```typescript
// 请求
key: string

// 响应
unknown

// 使用
const theme = await window.echora.config.get('theme')
```

#### `config:set`

设置配置项。

```typescript
// 请求
key: string
value: unknown

// 响应
boolean

// 使用
const success = await window.echora.config.set('theme', 'dark')
```

#### `config:getAll`

获取所有配置。

```typescript
// 请求
void

// 响应
AppConfig

// 使用
const config = await window.echora.config.getAll()
// config = {
//   firstRun: false,
//   aiPaths: { hermes: '/path/to/hermes' },
//   theme: 'dark',
//   settings: { autoStartOnBoot: true, ... }
// }
```

---

### 会话管理

#### `conv:list`

获取会话列表。

```typescript
// 请求
agentKey?: string  // 格式: 'aiType:agentId'

// 响应
ConvListResult

// 使用
const conversations = await window.echora.conv.list('hermes:main')
// conversations = {
//   'hermes:main': {
//     'conv_123': { id: 'conv_123', title: '对话 1', messages: [...], ... },
//     'conv_456': { id: 'conv_456', title: '对话 2', messages: [...], ... }
//   }
// }
```

#### `conv:get`

获取单个会话。

```typescript
// 请求
agentKey: string
convId: string

// 响应
ConvData | null

// 使用
const conv = await window.echora.conv.get('hermes:main', 'conv_123')
```

#### `conv:save`

保存会话。

```typescript
// 请求
agentKey: string
convId: string
conv: ConvData

// 响应
boolean

// 使用
const success = await window.echora.conv.save('hermes:main', 'conv_123', {
  id: 'conv_123',
  title: '新对话',
  messages: [...],
  createdAt: Date.now(),
  updatedAt: Date.now()
})
```

#### `conv:delete`

删除会话。

```typescript
// 请求
agentKey: string
convId: string

// 响应
boolean

// 使用
const success = await window.echora.conv.delete('hermes:main', 'conv_123')
```

#### `conv:deleteAll`

删除某个 Agent 的所有会话。

```typescript
// 请求
agentKey: string

// 响应
boolean

// 使用
const success = await window.echora.conv.deleteAll('hermes:main')
```

---

### OpenClaw 会话

#### `oc-sessions:list`

获取 OpenClaw 会话列表。

```typescript
// 请求
aiType: string
opts?: Record<string, unknown>

// 响应
OcSession[]

// 使用
const sessions = await window.echora.ocSessions.list('openclaw')
// sessions = [
//   { sessionKey: 'session_1', title: '会话 1', messageCount: 10, ... },
//   { sessionKey: 'session_2', title: '会话 2', messageCount: 5, ... }
// ]
```

#### `oc-sessions:history`

获取会话历史。

```typescript
// 请求
sessionKey: string
limit?: number

// 响应
OcSessionHistoryMessage[]

// 使用
const history = await window.echora.ocSessions.history('session_1', 50)
// history = [
//   { role: 'user', content: '你好', timestamp: '...' },
//   { role: 'assistant', content: '你好！', timestamp: '...' }
// ]
```

#### `oc-sessions:create`

创建新会话。

```typescript
// 请求
params: Record<string, unknown>

// 响应
unknown

// 使用
const session = await window.echora.ocSessions.create({ title: '新会话' })
```

#### `oc-sessions:delete`

删除会话。

```typescript
// 请求
sessionKey: string

// 响应
boolean

// 使用
const success = await window.echora.ocSessions.delete('session_1')
```

#### `oc-sessions:reset`

重置会话。

```typescript
// 请求
sessionKey: string

// 响应
boolean

// 使用
const success = await window.echora.ocSessions.reset('session_1')
```

---

### 草稿管理

#### `draft:read`

读取配置草稿。

```typescript
// 请求
aiType: string

// 响应
{
  success: boolean
  data?: NormalizedConfig
  error?: string
}

// 使用
const draft = await window.echora.draft.read('hermes')
```

#### `draft:write`

写入配置草稿。

```typescript
// 请求
aiType: string
data: NormalizedConfig

// 响应
{ success: boolean }

// 使用
const result = await window.echora.draft.write('hermes', { model: { default: 'claude-3' } })
```

#### `draft:save`

保存草稿到原配置文件。

```typescript
// 请求
aiType: string

// 响应
{
  success: boolean
  error?: string
}

// 使用
const result = await window.echora.draft.save('hermes')
```

#### `draft:reset`

重置草稿。

```typescript
// 请求
aiType: string

// 响应
{
  success: boolean
  error?: string
}

// 使用
const result = await window.echora.draft.reset('hermes')
```

#### `draft:backups`

获取备份列表。

```typescript
// 请求
aiType: string

// 响应
string[]

// 使用
const backups = await window.echora.draft.backups('hermes')
// backups = ['config.yaml.bak.20240101', 'config.yaml.bak.20240102']
```

#### `draft:paths`

获取草稿路径。

```typescript
// 请求
void

// 响应
DraftPathsResult

// 使用
const paths = await window.echora.draft.paths()
// paths = {
//   qclaw: { original: '/path/to/qclaw.json', draft: '/path/to/qclaw.draft.json' },
//   openclaw: { original: '/path/to/openclaw.json', draft: '/path/to/openclaw.draft.json' },
//   hermes: { original: '/path/to/hermes.yaml', draft: '/path/to/hermes.draft.yaml' }
// }
```

---

### AI 配置

#### `ai-config:set-path`

设置 AI 配置文件路径。

```typescript
// 请求
aiType: string
filePath: string

// 响应
boolean

// 使用
const success = await window.echora.aiConfig.setPath('hermes', '/path/to/config.yaml')
```

#### `ai-config:read`

读取 AI 配置。

```typescript
// 请求
aiType: string

// 响应
{
  success: boolean
  data?: NormalizedConfig
  error?: string
}

// 使用
const config = await window.echora.aiConfig.read('hermes')
```

#### `ai-config:discover`

自动发现 AI 配置文件。

```typescript
// 请求
void

// 响应
AiConfigDiscoverResult

// 使用
const discovered = await window.echora.aiConfig.discover()
// discovered = {
//   qclaw: '/home/user/.qclaw/openclaw.json',
//   openclaw: '/home/user/.openclaw/openclaw.json',
//   hermes: '/home/user/.hermes/config.yaml'
// }
```

#### `ai-config:list`

列出所有 AI 配置。

```typescript
// 请求
void

// 响应
AiConfigListResult

// 使用
const list = await window.echora.aiConfig.list()
// list = {
//   hermes: {
//     path: '/path/to/config.yaml',
//     status: 'ok',
//     preview: { model: { default: 'claude-3' }, ... },
//     error: null
//   }
// }
```

---

### Hermes 专用

#### `hermes:profiles`

获取 Hermes 配置文件列表。

```typescript
// 请求
void

// 响应
HermesProfile[]

// 使用
const profiles = await window.echora.hermes.profiles()
// profiles = [
//   { name: 'default', configPath: '/path/to/config.yaml' },
//   { name: 'work', configPath: '/path/to/work.yaml' }
// ]
```

#### `hermes:config`

获取 Hermes 配置。

```typescript
// 请求
void

// 响应
{
  success: boolean
  data?: NormalizedHermesConfig
  error?: string
}

// 使用
const config = await window.echora.hermes.config()
```

---

### 环境检查

#### `env:check`

检查开发环境。

```typescript
// 请求
void

// 响应
StartupEnvCheckData

// 使用
const env = await window.echora.env.check()
// env = {
//   node: { installed: true, version: '20.10.0', path: '/usr/bin/node' },
//   python: { installed: true, version: '3.12.0', path: '/usr/bin/python3' },
//   git: { installed: true, version: '2.43.0', path: '/usr/bin/git' },
//   npm: { installed: true, version: '10.2.0', path: '/usr/bin/npm' }
// }
```

#### `env:install`

安装开发工具。

```typescript
// 请求
tool: string  // 'node' | 'python' | 'git' | 'npm'

// 响应
{
  success: boolean
  message: string
}

// 使用
const result = await window.echora.env.install('node')
```

---

### AI 扫描

#### `ai:setPath`

设置 AI 软件路径。

```typescript
// 请求
aiType: string
exePath: string

// 响应
boolean

// 使用
const success = await window.echora.ai.setPath('hermes', 'C:\\Program Files\\Hermes\\hermes.exe')
```

#### `ai:removePath`

移除 AI 软件路径。

```typescript
// 请求
aiType: string

// 响应
boolean

// 使用
const success = await window.echora.ai.removePath('hermes')
```

#### `ai:rescan`

重新扫描 AI 软件。

```typescript
// 请求
void

// 响应
AIDetected

// 使用
const detected = await window.echora.ai.rescan()
```

#### `ai:scan`

扫描 AI 软件。

```typescript
// 请求
void

// 响应
AIDetected

// 使用
const detected = await window.echora.ai.scan()
// detected = {
//   hermes: { name: 'Hermes', found: true, path: '...', source: 'auto', ... },
//   openclaw: { name: 'OpenClaw', found: false, ... }
// }
```

#### `ai:scanFull`

完整扫描 AI 软件 (包括端口扫描)。

```typescript
// 请求
void

// 响应
AiScanFullResult

// 使用
const result = await window.echora.ai.scanFull()
// result = {
//   discovered: [...],
//   configured: [...]
// }
```

#### `ai:probePort`

探测端口。

```typescript
// 请求
port: number

// 响应
AiProbePortResult

// 使用
const result = await window.echora.ai.probePort(8083)
// result = { alive: true, aiType: 'hermes', port: 8083, name: 'Hermes' }
```

#### `ai:addDiscovered`

添加发现的 AI。

```typescript
// 请求
{
  aiType: string
  name?: string
  port?: number
  exePath?: string
}

// 响应
{ success: boolean }

// 使用
const result = await window.echora.ai.addDiscovered({
  aiType: 'custom-ai',
  name: 'Custom AI',
  port: 9000,
  exePath: '/path/to/ai'
})
```

---

### 对话框

#### `dialog:openFile`

打开文件选择对话框。

```typescript
// 请求
options?: Electron.OpenDialogOptions

// 响应
Electron.OpenDialogReturnValue

// 使用
const result = await window.echora.dialog.openFile({
  title: '选择 AI 程序',
  filters: [{ name: '可执行文件', extensions: ['exe'] }]
})
// result = { canceled: false, filePaths: ['C:\\path\\to\\ai.exe'] }
```

#### `dialog:openDir`

打开目录选择对话框。

```typescript
// 请求
options?: Electron.OpenDialogOptions

// 响应
Electron.OpenDialogReturnValue

// 使用
const result = await window.echora.dialog.openDir({
  title: '选择 AI 安装目录'
})
```

---

### 技能管理

#### `skills:list`

获取技能列表。

```typescript
// 请求
aiType: string

// 响应
SkillsListResult

// 使用
const skills = await window.echora.skills.list('openclaw')
// skills = {
//   success: true,
//   skills: [
//     { name: 'web-search', category: '内置技能', description: '...', path: '...', enabled: true },
//     { name: 'code-exec', category: '已安装技能', description: '...', path: '...', enabled: true }
//   ],
//   categories: ['内置技能', '已安装技能']
// }
```

---

### 直连 API

#### `direct-api:send`

通过直连 API 发送消息。

```typescript
// 请求
{
  providerId?: string
  model: string
  message: string
  userId?: string
}

// 响应
SendMessageResult

// 使用
const result = await window.echora.message.send('direct', 'main', '你好')
```

#### `direct-api:listModels`

列出直连 API 可用模型。

```typescript
// 请求
void

// 响应
ModelListItem[]

// 使用
const models = await window.echora.agent.listModels('direct')
```

#### `direct-api:listProviders`

列出直连 API 提供商。

```typescript
// 请求
void

// 响应
DirectApiProvider[]

// 使用
const providers = await window.echora.agent.listModels('direct')
```

#### `direct-api:testConnection`

测试直连 API 连接。

```typescript
// 请求
providerId: string

// 响应
DirectApiConnectionResult

// 使用
const result = await window.echora.ai.probePort(8080)
```

---

## On 通道 (单向发送)

### `message:sendStream`

发送流式消息。

```typescript
// 参数
{
  aiType: string
  agentId: string
  text: string
  userId: string
  msgId: string
  conversationId?: string
}

// 使用
window.echora.message.sendStream('hermes', 'main', '你好', 'user_1', 'msg_123')
```

### `message:abortStream`

中断流式消息。

```typescript
// 参数
{ msgId: string }

// 使用
window.echora.message.abortStream('msg_123')
```

### `direct-api:sendStream`

通过直连 API 发送流式消息。

```typescript
// 参数
{
  providerId?: string
  model: string
  message: string
  userId: string
  msgId: string
}

// 使用
window.echora.message.sendStream('direct', 'main', '你好', 'user_1', 'msg_123')
```

---

## Push 通道 (主进程推送)

### `startup:env-check`

环境检查结果推送。

```typescript
// 数据
StartupEnvCheckData

// 监听
window.echora.onStartup.envCheck((data) => {
  console.log('环境检查:', data)
})
```

### `startup:ai-detected`

AI 检测结果推送。

```typescript
// 数据
AIDetected

// 监听
window.echora.onStartup.aiDetected((data) => {
  console.log('检测到的 AI:', data)
})
```

### `gateway:statusAll`

所有网关状态推送。

```typescript
// 数据
GatewayStatusMap

// 监听
const unsubscribe = window.echora.gateway.onStatusAll((status) => {
  console.log('网关状态:', status)
})

// 取消监听
unsubscribe()
```

### `gateway:statusChange`

网关状态变更推送。

```typescript
// 数据
{
  aiType: string
  status: string
  pid?: number
  port?: number
}

// 监听
const unsubscribe = window.echora.gateway.onStatusChange((data) => {
  console.log(`${data.aiType} 状态变更: ${data.status}`)
})
```

### `gateway:message`

网关消息推送。

```typescript
// 数据
{
  aiType: string
  agentId: string
  role: string
  content: string
}

// 监听
const unsubscribe = window.echora.gateway.onMessage((data) => {
  console.log('收到消息:', data.content)
})
```

### `gateway:messageChunk`

流式消息数据块推送。

```typescript
// 数据
{
  msgId: string
  delta: string
  content: string
}

// 监听
const unsubscribe = window.echora.onStream.onChunk((data) => {
  console.log('收到数据块:', data.delta)
})
```

### `gateway:messageDone`

流式消息完成推送。

```typescript
// 数据
{
  msgId: string
  content?: string
  error?: string
  metrics?: StreamMetrics | null
  sessionKey?: string | null
}

// 监听
const unsubscribe = window.echora.onStream.onDone((data) => {
  if (data.error) {
    console.error('消息错误:', data.error)
  } else {
    console.log('消息完成:', data.content)
    console.log('Token 使用:', data.metrics)
  }
})
```

### `gateway:messageToolCall`

工具调用推送。

```typescript
// 数据
{
  msgId: string
  tool: ToolCallInfo
}

// 监听
const unsubscribe = window.echora.onStream.onToolCall((data) => {
  console.log('调用工具:', data.tool.name)
})
```

### `gateway:messageUsage`

Token 使用推送。

```typescript
// 数据
{
  msgId: string
  input?: number
  output?: number
  totalTokens?: number
  cost?: number
  aiType?: string
  agentId?: string
}

// 监听
const unsubscribe = window.echora.onStream.onUsage((data) => {
  console.log('Token 使用:', data.totalTokens)
})
```

### `gateway:messageThinking`

思考过程推送。

```typescript
// 数据
{
  msgId: string
  phase?: string
  message?: string
}

// 监听
const unsubscribe = window.echora.onStream.onThinking((data) => {
  console.log('思考中:', data.message)
})
```

### `gateway:messageToolStep`

工具执行步骤推送。

```typescript
// 数据
{
  msgId: string
  name?: string
  status?: string
  detail?: string
}

// 监听
const unsubscribe = window.echora.onStream.onToolStep((data) => {
  console.log('工具步骤:', data.name, data.status)
})
```

### `window:maximized`

窗口最大化状态推送。

```typescript
// 数据
{ maximized: boolean }

// 监听
const unsubscribe = window.echora.window.onMaximized((maximized) => {
  console.log('窗口最大化:', maximized)
})
```

---

## 类型定义

### GatewayStatus

```typescript
interface GatewayStatus {
  status: 'running' | 'offline' | 'starting' | 'error' | 'stopped'
  pid?: number
  port?: number
  url?: string
  uptime?: number
  alive?: boolean
  owned?: boolean
}
```

### AgentListItem

```typescript
interface AgentListItem {
  id: string
  name: string
  emoji?: string
  description?: string
}
```

### ModelInfo

```typescript
interface ModelInfo {
  model: string | null
  contextWindow?: number | null
  usedTokens?: number | null
  usagePct?: number | null
}
```

### SendMessageResult

```typescript
interface SendMessageResult {
  success: boolean
  content?: string
  messageId?: string
  error?: string
}
```

### StreamMetrics

```typescript
interface StreamMetrics {
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
  duration?: number
}
```

### UsageInfo

```typescript
interface UsageInfo {
  input?: number
  output?: number
  totalTokens?: number
  cacheRead?: number
  cacheWrite?: number
  cost?: number
  aiType?: string
  agentId?: string
}
```

---

## 使用示例

### 完整的消息发送流程

```typescript
// 1. 监听流式事件
const unsubChunk = window.echora.onStream.onChunk((data) => {
  if (data.msgId === currentMsgId) {
    appendToMessage(data.delta)
  }
})

const unsubDone = window.echora.onStream.onDone((data) => {
  if (data.msgId === currentMsgId) {
    if (data.error) {
      showError(data.error)
    } else {
      finalizeMessage(data.content, data.metrics)
    }
  }
})

// 2. 发送流式消息
const msgId = generateId()
window.echora.message.sendStream('hermes', 'main', '你好', userId, msgId)

// 3. 可选：中断消息
function abort() {
  window.echora.message.abortStream(msgId)
}

// 4. 清理监听器
function cleanup() {
  unsubChunk()
  unsubDone()
}
```

### 网关状态监控

```typescript
// 监听状态变更
const unsubStatus = window.echora.gateway.onStatusAll((status) => {
  for (const [aiType, info] of Object.entries(status)) {
    updateUI(aiType, info)
  }
})

// 定期刷新状态
setInterval(async () => {
  const status = await window.echora.gateway.status()
  updateAllUI(status)
}, 10000)

// 启动网关
async function startGateway(aiType: string) {
  const result = await window.echora.gateway.start(aiType)
  if (result.success) {
    console.log(`网关 ${aiType} 已启动，PID: ${result.pid}`)
  }
}
```

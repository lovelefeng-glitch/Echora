# IPC 通道完整规格

> **最后更新**: 2026-05-23  
> **版本**: v1.0  
> **目的**: 每个 IPC 通道的完整输入/输出/错误规格，开发和调试必备

---

## 一、通道总览

- **handle 通道**: 38 个（renderer → main → renderer，请求-响应模式）
- **on 通道**: 2 个（renderer → main，fire-and-forget 模式）
- **推送事件**: 7 个（main → renderer，主动推送）

---

## 二、网关管理 (gateway:*)

### `gateway:refresh`
```
输入: 无
输出: { detected: AIDetected, gateways: GatewayStatusMap }
说明: 重新扫描所有 AI + 接管运行中的网关
```

### `gateway:attach`
```
输入: (aiType: string, port: number)
输出: { success: boolean, message?: string }
说明: 手动接管已运行的网关（不启动新进程）
```

### `gateway:start`
```
输入: { aiType: string, exePath?: string, config?: object }
输出: { success: boolean, pid?: number, message?: string }
说明: 启动网关进程。如已有进程运行，先杀旧再启新
错误: { success: false, message: "找不到可执行文件" | "端口被占用" | ... }
```

### `gateway:stop`
```
输入: aiType: string
输出: { success: boolean }
说明: 停止网关进程。owned=true 直接 kill，owned=false 尝试 CLI 停止
```

### `gateway:restart`
```
输入: aiType: string
输出: { success: boolean, message?: string }
说明: stop → 等待 2s → start
```

### `gateway:status`
```
输入: 无
输出: { [aiType]: { status, pid?, port?, uptime?, alive? } }
说明: 获取所有网关当前状态
```

---

## 三、Agent 管理 (agent:*)

### `agent:list`
```
输入: aiType: string
输出: [{ id: string, name: string, emoji?: string, description?: string }]
说明: 调用 adapter.listAgents() 获取 Agent 列表
```

### `agent:modelInfo`
```
输入: aiType: string
输出: { model: string, contextWindow?: number, usedTokens?: number, ... }
说明: 获取当前模型信息（用于 hint 栏展示）
```

### `agent:listModels`
```
输入: aiType: string
输出: [{ id: string, name: string, provider?: string, ... }]
说明: 列出可用模型（用于模型切换器）
```

### `agent:setModel`
```
输入: (aiType: string, modelId: string)
输出: { success: boolean, message?: string }
说明: 切换模型。Hermes 写 config.yaml + 重启 Gateway
```

---

## 四、消息通道 (message:*)

### `message:send` (handle)
```
输入: { aiType: string, agentId: string, text: string, conversationId?: string }
输出: { success: boolean, content?: string, messageId?: string, error?: string }
说明: 非流式发送。适用于 QClaw/OpenClaw 基础对话
```

### `message:sendStream` (on, fire-and-forget)
```
输入: { aiType: string, agentId: string, text: string, userId: string, msgId: string, conversationId?: string }
输出: 无（结果通过推送事件返回）
推送事件:
  - gateway:messageChunk → { msgId, delta, content }
  - gateway:messageDone  → { msgId, content, error?, metrics? }
说明: 流式发送。Hermes 用 SSE，OpenClaw/QClaw 用 HTTP chunked
```

### `message:abortStream` (on)
```
输入: { msgId: string }
说明: 中断流式消息。调用 adapter 的 abort controller
```

### `message:status`
```
输入: aiType: string
输出: { status: "idle" | "sending" | "streaming" }
说明: 查询消息状态
```

---

## 五、配置管理 (config:*)

### `config:get`
```
输入: key: string
输出: any
说明: 读取 Echora 自身配置（echora-config.json）
```

### `config:set`
```
输入: (key: string, value: any)
输出: true
说明: 写入 Echora 自身配置
```

### `config:getAll`
```
输入: 无
输出: { firstRun, aiPaths, gatewayConfigs, lastActive, settings, ... }
说明: 获取完整配置对象
```

---

## 六、草稿系统 (draft:*)

### `draft:read`
```
输入: aiType: string ("qclaw" | "openclaw" | "hermes")
输出: { success: boolean, data?: NormalizedConfig, error?: string }
说明: 读取草稿文件（已 normalize 的配置）
数据结构: 见 BLUEPRINT.md 4.3 节
```

### `draft:write`
```
输入: (aiType: string, data: NormalizedConfig)
输出: { success: boolean }
说明: 写入草稿文件（UI 编辑后调用）
```

### `draft:save`
```
输入: aiType: string
输出: { success: boolean, error?: string }
说明: 草稿 → denormalize → 备份原配置 → 写入原配置
流程: read draft → denormalize → copyFile(backup) → write original
```

### `draft:reset`
```
输入: aiType: string
输出: { success: boolean, error?: string }
说明: 原配置 → normalize → 覆盖草稿
```

### `draft:backups`
```
输入: aiType: string
输出: string[] (文件名列表)
说明: 列出备份文件
```

### `draft:paths`
```
输入: 无
输出: { qclaw: { original, draft }, openclaw: { ... }, hermes: { ... } }
说明: 获取所有路径信息
```

---

## 七、AI 配置文件 (ai-config:*)

### `ai-config:set-path`
```
输入: (aiType: string, filePath: string)
输出: true
说明: 注册 AI 配置文件路径
```

### `ai-config:read`
```
输入: aiType: string
输出: { success, data?: NormalizedConfig, error? }
说明: 读取 + normalize 指定 AI 的配置
```

### `ai-config:discover`
```
输入: 无
输出: { qclaw: string|null, openclaw: string|null, hermes: string|null }
说明: 自动发现已知配置文件路径
```

### `ai-config:list`
```
输入: 无
输出: { [aiType]: { path, status, preview: NormalizedConfig, error } }
说明: 列出所有已注册 AI 的配置信息
```

---

## 八、Hermes 专用 (hermes:*)

### `hermes:profiles`
```
输入: 无
输出: [{ name: string, configPath: string|null }]
说明: 发现 Hermes profiles 目录
```

### `hermes:config`
```
输入: 无
输出: { success, data?: NormalizedHermesConfig, error? }
说明: 读取 Hermes 主配置
```

---

## 九、环境检测 (env:*)

### `env:check`
```
输入: 无
输出: { node: EnvDetail, python: EnvDetail, git: EnvDetail, npm: EnvDetail }
EnvDetail: { installed: boolean, version?: string, path?: string }
说明: 检测开发环境依赖
```

### `env:install`
```
输入: tool: string ("node" | "python" | "git" | "npm")
输出: { success: boolean, message: string }
说明: 尝试安装缺失的工具
```

---

## 十、AI 管理 (ai:*)

### `ai:setPath`
```
输入: (aiType: string, exePath: string)
输出: true
说明: 设置 AI 可执行文件路径
```

### `ai:removePath`
```
输入: aiType: string
输出: true
说明: 移除 AI 路径 + 清理适配器缓存
```

### `ai:rescan`
```
输入: 无
输出: AIDetected
说明: 重新扫描所有 AI（使用缓存路径）
```

### `ai:scan`
```
输入: 无
输出: AIDetected
说明: 用户触发的全量扫描
```

### `ai:scanFull`
```
输入: 无
输出: { discovered: [...], configured: [...] }
说明: 深度扫描（端口+进程+文件系统）
```

### `ai:probePort`
```
输入: port: number
输出: { alive: boolean, aiType?: string, ... }
说明: 探测指定端口是否有 AI 网关
```

### `ai:addDiscovered`
```
输入: { aiType, path, name, ... }
输出: true
说明: 将新发现的 AI 添加到配置
```

---

## 十一、对话框 (dialog:*)

### `dialog:openFile`
```
输入: options: Electron.OpenDialogOptions
输出: { canceled: boolean, filePaths: string[] }
```

### `dialog:openDir`
```
输入: options: Electron.OpenDialogOptions
输出: { canceled: boolean, filePaths: string[] }
```

---

## 十二、推送事件 (main → renderer)

| 通道 | 触发时机 | 数据格式 |
|------|----------|----------|
| `startup:env-check` | 首次启动环境检测完成 | `{ node, python, git, npm }` |
| `startup:ai-detected` | 首次启动 AI 扫描完成 | `AIDetected` |
| `gateway:statusAll` | 启动检查完成 / 每 10 秒轮询 | `{ [aiType]: GatewayStatus }` |
| `gateway:message` | 非流式消息收到回复 | `{ aiType, agentId, role, content }` |
| `gateway:messageChunk` | 流式消息增量 | `{ msgId, delta, content }` |
| `gateway:messageDone` | 流式消息完成 | `{ msgId, content, error?, metrics? }` |
| `gateway:statusChange` | 单个网关状态变化 | `{ aiType, status, pid?, port? }` |

---

## 十三、Preload API 命名空间

```js
window.echora = {
  gateway:    { start, stop, restart, status, refresh, attach },
  config:     { get, set, getAll },
  draft:      { read, write, save, reset, backups, paths },
  aiConfig:   { setPath, read, discover, list },
  hermes:     { profiles, config },
  ai:         { setPath, removePath, rescan, scan, scanFull, probePort, addDiscovered },
  env:        { check, install },
  dialog:     { openFile, openDir },
  agent:      { list, modelInfo, listModels, setModel },
  message:    { send, status },
  onStream:   (callback) => ipcRenderer.on('gateway:messageChunk', callback),
  onStartup:  (channel, callback) => ipcRenderer.on(channel, callback),
}
```

---

*最后更新: 2026-05-23 | 作者: 小雪*

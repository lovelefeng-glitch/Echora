# ConfigReader 模块文档

> **文件**: `src/manager/config-reader.js`  
> **最后更新**: 2026-05-23  
> **版本**: v2.0  
> **状态**: ✅ 完成

---

## 一、模块职责

ConfigReader 负责**读取、发现、规范化** AI 网关的配置文件：

- **读取** — 自动识别 JSON / YAML 格式，解析配置
- **发现** — 自动搜索已知 AI 软件的配置文件路径
- **规范化** — 将嵌套的原始配置转为 UI 友好的扁平结构（normalize）
- **反向规范化** — 将 UI 编辑后的数据还原为原始格式（由 DraftManager 调用）

## 二、核心设计思路

### 为什么需要 normalize？

三种 AI 软件的配置格式差异巨大：

| AI 软件 | 格式 | 路径 | 特点 |
|---------|------|------|------|
| QClaw | JSON | `~/.qclaw/openclaw.json` | `agents.list[]`, `models.providers.{}` |
| OpenClaw | JSON | `~/.openclaw/openclaw.json` | 同 QClaw 结构 |
| Hermes | YAML | `~/AppData/Local/hermes/config.yaml` | 62 个顶层 key, snake_case |

UI 渲染器需要**统一的扁平结构**，normalize 负责这个转换。

## 三、文件结构

```
src/manager/config-reader.js
├── parseByExtension()     ← JSON/YAML 自动识别
├── filterSensitive()      ← 敏感字段过滤
├── ConfigReader.read()    ← 读取+解析
├── ConfigReader.discover()← 自动发现路径
├── ConfigReader.normalize()        ← 原始→扁平（QClaw/OpenClaw）
├── ConfigReader.normalizeHermes()  ← 原始→扁平（Hermes）
└── ConfigReader.discoverHermesProfiles() ← Hermes profiles 发现
```

## 四、API 清单

### 4.1 读取

| 方法 | 参数 | 返回值 | 说明 |
|------|------|--------|------|
| `read(filePath)` | `filePath: string` | `{ success, data?, error? }` | 读取并解析配置文件 |

### 4.2 发现

| 方法 | 参数 | 返回值 | 说明 |
|------|------|--------|------|
| `discover()` | — | `{ qclaw: string\|null, openclaw: string\|null, hermes: string\|null }` | 自动发现已知配置路径 |
| `discoverHermesProfiles()` | — | `[{ name, configPath }]` | 发现 Hermes profiles 目录 |

### 4.3 规范化

| 方法 | 参数 | 返回值 | 说明 |
|------|------|--------|------|
| `normalize(aiType, rawData)` | `aiType, rawData: object` | `NormalizedConfig` | QClaw/OpenClaw 规范化 |
| `normalizeHermes(rawData)` | `rawData: object` | `NormalizedHermesConfig` | Hermes 规范化 |

## 五、normalize 输出结构

### 5.1 QClaw / OpenClaw

```js
{
  gateway: {
    port: number,
    mode: string,
    bind: string,
    authMode: string,           // ← 原始: gateway.auth.mode
    httpEnabled: boolean,       // ← 原始: gateway.http.endpoints.chatCompletions.enabled
    controlUiAllowInsecure: boolean, // ← 原始: gateway.controlUi.allowInsecureAuth
    tailscaleMode: string,      // ← 原始: gateway.tailscale.mode
  },
  agents: [                     // ← 原始: agents.list (对象→数组)
    {
      id: string,
      name: string,             // ← 原始: agents.list[].identity.name
      emoji: string,
      workspace: string,
      modelPrimary: string,     // ← 原始: agents.list[].model.primary
      modelFallbacks: string[], // ← 原始: agents.list[].model.fallbacks
      reasoningDefault: string,
      skills: array,
      timeoutSeconds: number,
      maxConcurrent: number,
    }
  ],
  models: [                     // ← 原始: models.providers (对象→数组)
    {
      provider: string,         // 对象的 key
      baseUrl: string,
      api: string,
      models: [
        {
          id: string,
          name: string,
          contextWindow: number,
          maxTokens: number,
          input: string[],
          reasoning: boolean,
          cost: object,
          fullPath: string,     // "{provider}/{modelId}"
        }
      ]
    }
  ],
  session: {
    resetMode: string,
    dmScope: string,
    maxHistory: number,
  },
  tools: {
    allowBash: boolean,
    allowNetwork: boolean,
    toolTimeout: number,
  },
  browser: {
    enabled: boolean,
    engine: string,
  },
  port: number,                 // 快捷引用 gateway.port
}
```

### 5.2 Hermes

```js
{
  model: {
    default: string,            // ← 原始: model.default
    main: string,               // ← 原始: model.main
    maxTokens: number,          // ← 原始: model.max_tokens
    temperature: number,
    topP: number,               // ← 原始: model.top_p
  },
  agent: {
    maxTurns: number,           // ← 原始: agent.max_turns
    gatewayTimeout: number,     // ← 原始: agent.gateway_timeout
    reasoningEffort: string,    // ← 原始: agent.reasoning_effort
  },
  memory: {
    enabled: boolean,           // ← 原始: memory.memory_enabled
    backend: string,
    maxEntries: number,         // ← 原始: memory.max_entries
  },
  compression: {
    enabled: boolean,
    windowSize: number,         // ← 原始: compression.window_size
    truncateMode: string,       // ← 原始: compression.truncate_mode
  },
  browser: { engine, path },
  security: { sandbox, approvalMode },  // ← 原始: security.approval_mode
  display: { language, theme },
  approvals: { mode, autoApprove },     // ← 原始: approvals.auto_approve
  sessions: { maxActive, idleTimeout },
  cron: { enabled, jobs },
  toolsets: { enabled, tools },
  apiServer: { enabled, port, host },
  profiles: [{ name, configPath }],
  delegation: { enabled, agents },
  port: number,
}
```

## 六、敏感字段过滤

以下字段在 normalize 时被替换为 `***FILTERED***`：

```
api_key, apikey, api-key, token, secret, password, passwd,
auth_token, auth-token, access_key, access-token, api_server_key
```

> ⚠️ **注意**: 草稿文件中的敏感字段是过滤后的值。保存时 denormalize 从原配置（未过滤）读取真实值，不会覆盖敏感字段。

## 七、依赖关系

```
config-reader.js
├── fs (Node.js)
├── path (Node.js)
├── os (Node.js)
└── yaml (js-yaml)
```

## 八、被引用情况

| 调用方 | 引用方法 | 用途 |
|--------|----------|------|
| `draft-manager.js` | `normalize()`, `normalizeHermes()` | 草稿初始化时转换格式 |
| `main.js` (ai-config:read) | `read()`, `normalize()` | IPC 读取配置 |
| `main.js` (ai-config:list) | `read()`, `normalize()` | 配置列表 |
| `main.js` (hermes:config) | `read()`, `normalize()` | Hermes 专用读取 |

---

*最后更新: 2026-05-23 | 作者: 小雪*

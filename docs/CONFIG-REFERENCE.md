# 配置文件完整参考

> **最后更新**: 2026-05-23  
> **版本**: v1.0  
> **目的**: 所有配置文件的结构、关键参数、默认值，改配置前必查

---

## 一、Echora 自身配置

**路径**: `%APPDATA%/echora/echora-config.json`  
**管理**: ConfigManager (config-manager.js)  
**格式**: JSON

```jsonc
{
  "firstRun": false,              // boolean - 首次运行标志
  "aiPaths": {                    // object - AI 类型 → 可执行文件路径
    "qclaw": "C:\\...\\QClaw.exe",
    "openclaw": "C:\\...\\openclaw\\dist\\index.js"
  },
  "gatewayConfigs": {             // object - AI 类型 → 网关启动配置
    "qclaw": { "port": 28789 },
    "openclaw": { "port": 18789 }
  },
  "aiConfigPaths": {              // object - AI 类型 → 配置文件路径
    "qclaw": "C:\\Users\\ohfen\\.qclaw\\openclaw.json",
    "openclaw": "C:\\Users\\ohfen\\.openclaw\\openclaw.json",
    "hermes": "C:\\Users\\ohfen\\AppData\\Local\\hermes\\config.yaml"
  },
  "lastActive": null,             // string|null - 上次活动的 AI 类型
  "settings": {
    "autoStartOnBoot": false,     // 开机自启（已禁用）
    "minimizeToTray": true,       // 最小化到托盘
    "checkUpdates": true          // 检查更新
  }
}
```

### 关键参数说明

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `aiPaths` | object | `{}` | AI 可执行文件路径，手动或自动发现后写入 |
| `gatewayConfigs` | object | `{}` | 网关端口配置，启动时自动填充 |
| `aiConfigPaths` | object | `{}` | AI 配置文件路径，用于 Settings 面板读取 |
| `settings.timeout` | number | `120000` | 消息超时（毫秒），5 分钟 |

---

## 二、QClaw 配置

**路径**: `~/.qclaw/openclaw.json`  
**格式**: JSON  
**读取**: ConfigReader → normalize → 扁平结构

### 原始结构（嵌套）

```jsonc
{
  "gateway": {
    "port": 28789,                // 网关端口
    "mode": "local",              // local | remote
    "bind": "loopback",           // loopback | all
    "auth": {
      "mode": "token",            // token | none
      "token": "b0b0da..."        // 认证 token（敏感）
    },
    "controlUi": {
      "allowedOrigins": ["null", "file://"]
    },
    "tailscale": { "mode": "off" }
  },
  "agents": {
    "defaults": { ... },          // 默认配置
    "list": [                     // Agent 列表
      {
        "id": "main",
        "identity": { "name": "主助手", "emoji": "🤖" },
        "workspace": "C:\\...\\.qclaw\\workspace",
        "model": {
          "primary": "custom-.../LongCat-Flash-Lite",
          "fallbacks": []
        },
        "reasoningDefault": "off",
        "skills": [...],
        "timeoutSeconds": 72000,
        "maxConcurrent": 3
      }
    ]
  },
  "models": {
    "providers": {
      "qclaw": {
        "baseUrl": "https://...",
        "apiKey": "...",
        "api": "openai",
        "models": [
          { "id": "model-id", "name": "显示名", "contextWindow": 131072, "maxTokens": 8192, "reasoning": false }
        ]
      }
    }
  },
  "session": { "resetMode": "daily", "dmScope": "per-peer" },
  "tools": { "allowBash": true, "allowNetwork": true, "timeout": 120000 },
  "browser": { "enabled": true, "engine": "chromium" }
}
```

### Normalize 后（UI 使用）

```jsonc
{
  "gateway": { "port", "mode", "bind", "authMode", "httpEnabled", "controlUiAllowInsecure", "tailscaleMode" },
  "agents": [{ "id", "name", "emoji", "workspace", "modelPrimary", "modelFallbacks", "reasoningDefault", "skills" }],
  "models": [{ "provider", "baseUrl", "api", "models": [{ "id", "name", "contextWindow", "maxTokens", "reasoning", "fullPath" }] }],
  "session": { "resetMode", "dmScope", "maxHistory" },
  "tools": { "allowBash", "allowNetwork", "toolTimeout" },
  "browser": { "enabled", "engine" }
}
```

---

## 三、OpenClaw 配置

**路径**: `~/.openclaw/openclaw.json`  
**格式**: JSON  
**结构**: 与 QClaw 基本一致（共享 ConfigReader.normalize）

### 关键差异

| 字段 | QClaw | OpenClaw |
|------|-------|----------|
| 端口 | 28789 | 18789 |
| 适配器 | QClawAdapter | OpenClawAdapter |
| Token 来源 | config.gateway.auth.token | config.gateway.auth.token |
| 配置路径 | `~/.qclaw/openclaw.json` | `~/.openclaw/openclaw.json` |

---

## 四、Hermes 配置

**路径**: `~/AppData/Local/hermes/config.yaml`  
**格式**: YAML  
**读取**: js-yaml 解析 → normalizeHermes → 扁平结构

### 原始结构（62 个顶层 key）

```yaml
model:
  default: LongCat-Flash-Lite      # 当前模型
  main: LongCat-Flash-Lite         # 主模型
  max_tokens: 32768                # 最大输出 token
  temperature: 0.7
  top_p: 0.9
  provider: nvidia
  base_url: https://integrate.api.nvidia.com/v1
  api_key_env: NVC_API_KEY

agent:
  max_turns: 90                    # 最大轮次
  gateway_timeout: 300             # 网关超时（秒）
  reasoning_effort: medium         # 推理强度

memory:
  memory_enabled: true
  user_profile_enabled: true
  memory_char_limit: 1000000
  provider: builtin

compression:
  enabled: true
  window_size: 100000
  truncate_mode: smart

# ... 还有 50+ 个 key（browser, security, display, approvals, sessions, cron, ...）
```

### Normalize 后（UI 使用）

```jsonc
{
  "model": { "default", "main", "maxTokens", "temperature", "topP" },
  "agent": { "maxTurns", "gatewayTimeout", "reasoningEffort" },
  "memory": { "enabled", "backend", "maxEntries" },
  "compression": { "enabled", "windowSize", "truncateMode" },
  "browser": { "engine", "path" },
  "security": { "sandbox", "approvalMode" },
  "display": { "language", "theme" },
  "approvals": { "mode", "autoApprove" },
  "sessions": { "maxActive", "idleTimeout" },
  "cron": { "enabled", "jobs" },
  "toolsets": { "enabled", "tools" },
  "apiServer": { "enabled", "port", "host" },
  "profiles": [{ "name", "configPath" }]
}
```

### 关键参数说明

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `model.default` | LongCat-Flash-Lite | 当前使用的模型 |
| `model.max_tokens` | 32768 | 单次最大输出 token |
| `agent.max_turns` | 90 | 单次对话最大轮次 |
| `agent.gateway_timeout` | 300 | 网关响应超时（秒） |
| `memory.memory_enabled` | true | 是否启用记忆 |
| `api_server.enabled` | true | 是否启用 API Server |
| `api_server.port` | 8083 | API Server 端口 |

---

## 五、草稿文件

**路径**: `Echora/drafts/{aiType}.json`  
**格式**: JSON（已 normalize）  
**管理**: DraftManager (draft-manager.js)

```
drafts/
├── qclaw.json       ← QClaw 配置草稿
├── openclaw.json    ← OpenClaw 配置草稿
└── hermes.json      ← Hermes 配置草稿
```

**数据结构**: 见上方「Normalize 后」的结构

**生命周期**:
1. 启动 → `init()` → 原配置 → normalize → 草稿
2. 编辑 → `writeDraft()` → 写入草稿
3. 保存 → `saveToOriginal()` → denormalize → 备份 → 写入原配置
4. 重置 → `resetDraft()` → 原配置 → normalize → 覆盖草稿

---

## 六、备份文件

**路径**: `Echora/backups/{aiType}_{timestamp}.json`  
**触发**: 每次 `draft:save` 时自动备份  
**格式**: 原配置文件的完整副本（未 normalize）

---

## 七、Echora Proxy 配置

**端口**: 8085（硬编码在 echora-proxy.js）  
**目标**: 127.0.0.1:8083（Hermes API Server）  
**超时**: 120000ms（5 分钟）

---

## 八、环境变量

| 变量 | 用途 | 默认值 |
|------|------|--------|
| `API_SERVER_ENABLED` | 启用 Hermes API Server | `true` |
| `API_SERVER_KEY` | API Server 认证 key | — |
| `API_SERVER_PORT` | API Server 端口 | `8083` |
| `GATEWAY_ALLOW_ALL_USERS` | 允许所有用户访问 | `true` |
| `PROXY_PORT` | Echora Proxy 端口 | `8085` |

---

*最后更新: 2026-05-23 | 作者: 小雪*

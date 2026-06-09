# Echora 1.0 → 2.0 迁移指南

## 概述

Echora 2.0 是一次重大重构，从底层架构到用户界面都进行了全面升级。本文档将帮助您从 Echora 1.0 迁移到 2.0 版本。

## 架构变化

### 1.0 架构

```
┌─────────────────────────────────────┐
│         Electron (单进程)            │
│  ┌─────────────┐  ┌──────────────┐  │
│  │  主进程逻辑  │  │  渲染进程 UI  │  │
│  └─────────────┘  └──────────────┘  │
└─────────────────────────────────────┘
```

### 2.0 架构

```
┌──────────────────────────────────────────────────────────┐
│                   Electron (三进程)                       │
├────────────────┬─────────────────┬───────────────────────┤
│   Main Process │  Preload Script │    Renderer Process   │
│   (Node.js)    │  (安全桥接)      │    (React + Zustand)  │
├────────────────┼─────────────────┼───────────────────────┤
│  IPC Router    │  Context Bridge │  Components           │
│  Adapters      │  Type Safety    │  Hooks                │
│  Managers      │                 │  Stores               │
│  Detectors     │                 │                       │
└────────────────┴─────────────────┴───────────────────────┘
```

## 主要变更

### 技术栈升级

| 项目 | 1.0 | 2.0 |
|------|-----|-----|
| Electron | 28 | 42 |
| React | 18 | 19 |
| TypeScript | 5.3 | 5.7 |
| 构建工具 | electron-forge | electron-vite |
| 状态管理 | useState/useContext | Zustand 5 |
| 样式方案 | CSS-in-JS / Styled | CSS Modules + Variables |
| 测试框架 | Jest | Vitest + Playwright |
| 代码规范 | ESLint 8 | ESLint 9 + Prettier |

### 文件结构变化

**1.0 结构:**
```
src/
├── main/
│   ├── index.js
│   ├── gateway.js
│   └── config.js
├── renderer/
│   ├── App.jsx
│   ├── components/
│   └── styles/
└── preload.js
```

**2.0 结构:**
```
src/
├── main/
│   ├── index.ts
│   ├── ipc-router.ts
│   ├── adapters/
│   ├── detectors/
│   └── managers/
├── preload/
│   └── index.ts
├── renderer/
│   ├── App.tsx
│   ├── components/
│   ├── hooks/
│   ├── stores/
│   └── styles/
└── shared/
    ├── ipc-channels.ts
    ├── ipc-types.ts
    └── types.ts
```

### 命名约定变化

| 项目 | 1.0 | 2.0 |
|------|-----|-----|
| 文件名 | camelCase.js | kebab-case.ts |
| 组件名 | PascalCase.jsx | PascalCase.tsx |
| 样式 | styled-components | *.module.css |
| 类型 | PropTypes / JSDoc | TypeScript interfaces |

## 数据迁移

### 自动迁移

Echora 2.0 包含自动迁移功能：

1. **首次启动检测**: 2.0 会检测是否存在 1.0 的配置文件
2. **配置迁移**: 自动从 `%APPDATA%/Echora/echora-config.json` 迁移
3. **会话迁移**: 自动迁移会话历史数据

### 手动迁移

如果自动迁移失败，请按以下步骤操作：

**步骤 1: 备份 1.0 数据**

```bash
# Windows
copy "%APPDATA%\Echora\echora-config.json" "%APPDATA%\Echora\echora-config.json.bak"

# macOS/Linux
cp ~/Library/Application\ Support/Echora/echora-config.json ~/echora-config.json.bak
```

**步骤 2: 定位 2.0 配置目录**

```
# 开发模式: 项目根目录
E:\AI\Echora 2.0\echora-config.json

# 生产模式: 应用目录
C:\Users\<用户名>\AppData\Local\Echora\echora-config.json
```

**步骤 3: 复制配置**

将 1.0 的 `echora-config.json` 复制到 2.0 的配置目录。

**步骤 4: 重置首次运行标记**

编辑 `echora-config.json`，将 `firstRun` 设为 `false`：

```json
{
  "firstRun": false
}
```

### 配置文件结构变化

**1.0 配置:**
```json
{
  "firstRun": false,
  "aiPaths": {
    "hermes": "C:\\path\\to\\hermes.exe"
  },
  "conversations": {
    "hermes:main": {
      "conv_123": { ... }
    }
  }
}
```

**2.0 配置:**
```json
{
  "firstRun": false,
  "aiPaths": {
    "hermes": "C:\\path\\to\\hermes.exe"
  },
  "gatewayConfigs": {
    "hermes": { "port": 8083 }
  },
  "settings": {
    "autoStartOnBoot": false,
    "minimizeToTray": true,
    "timeout": 30000
  }
}
```

**注意**: 2.0 将会话数据分离到独立目录 `conversations/`。

## 环境变量迁移

### 1.0 环境变量

```bash
ELECTRON_IS_DEV=1
ECHORA_CONFIG_DIR=...
```

### 2.0 环境变量

```bash
# 自动检测开发模式
# 配置目录自动确定

# 可选: API 服务器密钥
API_SERVER_KEY=your-secret-key

# 可选: 自定义端口
ECHORA_API_PORT=9300
```

## API 变化

### 1.0 API

```javascript
// 直接使用 ipcRenderer
const { ipcRenderer } = require('electron')
ipcRenderer.send('gateway:start', { aiType: 'hermes' })
ipcRenderer.on('gateway:status', (event, data) => { ... })
```

### 2.0 API

```typescript
// 使用类型安全的 API
await window.echora.gateway.start('hermes')
const unsubscribe = window.echora.gateway.onStatusChange((data) => { ... })
```

### 主要 API 变更

| 功能 | 1.0 | 2.0 |
|------|-----|-----|
| 发送消息 | `ipcRenderer.send('send-message', ...)` | `window.echora.message.send(...)` |
| 流式消息 | `ipcRenderer.on('message-chunk', ...)` | `window.echora.onStream.onChunk(...)` |
| 获取状态 | `ipcRenderer.invoke('get-status')` | `window.echora.gateway.status()` |
| 配置管理 | `ipcRenderer.invoke('get-config', key)` | `window.echora.config.get(key)` |

## 功能对比

| 功能 | 1.0 | 2.0 | 说明 |
|------|-----|-----|------|
| **核心功能** | | | |
| 网关管理 | ✅ | ✅ | 增强: 支持多网关并行 |
| Agent 切换 | ✅ | ✅ | 增强: 支持自定义 Agent |
| 流式对话 | ✅ | ✅ | 增强: 支持中断/恢复 |
| 会话历史 | ✅ | ✅ | 增强: 支持搜索/导出 |
| **新增功能** | | | |
| 直连 API | ❌ | ✅ | 支持 OpenAI 兼容 API |
| 技能管理 | ❌ | ✅ | 管理 AI 技能/插件 |
| 配置草稿 | ❌ | ✅ | 安全编辑配置 |
| 多配置文件 | ❌ | ✅ | Hermes 多 Profile |
| 端口扫描 | ❌ | ✅ | 自动发现 AI 服务 |
| 环境检查 | ❌ | ✅ | 检查开发环境 |
| HTTP API | ❌ | ✅ | 本地 REST API |
| **UI 改进** | | | |
| 深色主题 | ✅ | ✅ | 优化: 更好的配色 |
| 浅色主题 | ❌ | ✅ | 新增 |
| 自定义标题栏 | ❌ | ✅ | 新增 |
| 侧边栏折叠 | ❌ | ✅ | 新增 |
| 响应式布局 | 部分 | ✅ | 完全重写 |
| **开发者功能** | | | |
| TypeScript | 部分 | ✅ | 完全类型化 |
| 单元测试 | ❌ | ✅ | Vitest |
| E2E 测试 | ❌ | ✅ | Playwright |
| 热重载 | ✅ | ✅ | 优化: 更快 |
| 代码规范 | ❌ | ✅ | ESLint + Prettier |

## 破坏性变更

### 1. 配置文件路径变化

- **1.0**: `%APPDATA%/Echora/echora-config.json`
- **2.0**: 
  - 开发模式: `项目根目录/echora-config.json`
  - 生产模式: `应用安装目录/echora-config.json`

### 2. 会话数据存储变化

- **1.0**: 会话数据存储在 `echora-config.json` 的 `conversations` 字段
- **2.0**: 会话数据存储在独立目录 `conversations/`，按 `aiType/agentId/` 组织

### 3. IPC 通道名称变化

| 1.0 | 2.0 |
|-----|-----|
| `send-message` | `message:send` |
| `start-gateway` | `gateway:start` |
| `get-config` | `config:get` |
| `set-config` | `config:set` |

### 4. API 响应格式变化

**1.0:**
```json
{
  "success": true,
  "data": { ... }
}
```

**2.0:**
```json
{
  "success": true,
  "content": "...",
  "messageId": "..."
}
```

### 5. 移除的功能

- 移除了 `electron-store` 依赖，改用自定义 `ConfigManager`
- 移除了旧版的样式系统，改用 CSS Modules

## 迁移检查清单

- [ ] 备份 1.0 配置文件
- [ ] 备份 1.0 会话数据
- [ ] 安装 Node.js 18+ 
- [ ] 安装 2.0 版本
- [ ] 启动 2.0 并检查自动迁移
- [ ] 验证 AI 路径配置
- [ ] 验证网关连接
- [ ] 测试消息发送功能
- [ ] 检查会话历史是否完整
- [ ] 配置新功能 (直连 API 等)

## 常见问题

### Q: 1.0 的会话历史还在吗？

A: 2.0 会自动迁移 1.0 的会话历史。如果迁移失败，可以手动将 1.0 配置中的 `conversations` 字段复制到 2.0 的 `conversations/` 目录。

### Q: 1.0 的 AI 配置会丢失吗？

A: 不会。`aiPaths` 配置会自动迁移。其他配置可能需要手动调整。

### Q: 为什么某些功能找不到了？

A: 2.0 重构了 UI 布局。某些功能的位置可能发生了变化：
- AI 管理: 侧边栏 → AI 管理页面
- 设置: 右上角 → 设置页面
- 状态栏: 底部 → 侧边栏底部

### Q: 2.0 的性能如何？

A: 2.0 使用了多项性能优化：
- Zustand 替代 Context API，减少不必要的重渲染
- CSS Modules 替代 CSS-in-JS，减少运行时开销
- Vite 构建，开发和生产构建更快

### Q: 如何回退到 1.0？

A: 
1. 卸载 2.0
2. 恢复 1.0 的备份配置
3. 重新安装 1.0

## 获取帮助

如果在迁移过程中遇到问题：

1. 查看 [ARCHITECTURE.md](./ARCHITECTURE.md) 了解新架构
2. 查看 [DEVELOPMENT.md](./DEVELOPMENT.md) 了解开发环境配置
3. 查看 [IPC-REFERENCE.md](./IPC-REFERENCE.md) 了解 API 变化
4. 提交 Issue 到项目仓库

## 总结

Echora 2.0 是一次全面升级，虽然有一些破坏性变更，但带来了：

- ✅ 更好的类型安全
- ✅ 更清晰的架构
- ✅ 更丰富的功能
- ✅ 更好的性能
- ✅ 更完善的测试
- ✅ 更现代化的开发体验

迁移过程相对简单，大多数配置和数据会自动迁移。如有问题，请参考本文档或提交 Issue。

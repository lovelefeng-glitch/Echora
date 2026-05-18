# 🌊 Echora

> **Echo + Ora**（回声 + 祈祷）  
> 打通电脑主机上所有 AI 软件的壁垒，实现信息互通与统一管理。

---

## 🎯 愿景

你电脑里装了多个 AI 工具——OpenClaw、QClaw、Cursor、Windsurf……  
它们各自独立运行，无法交流。**Echora 的目标是让 AI 之间彼此听见。**

### 阶段一：统一网关管理（当前）
- 自动检测电脑已安装的 AI 软件
- 统一面板启动/停止每个 AI 的网关
- 便捷切换不同 AI 进行对话

### 阶段二：Agent 发现与群聊（规划中）
- 读取各 AI 已配置的 Agent
- 将多个 Agent 拉入同一个群聊
- AI 之间实时协作讨论

---

## 🚀 快速开始

### 方式 1：双击启动（推荐）

```
双击项目根目录的 start.cmd
```

首次使用时，运行 `setup-desktop.cmd` 会自动在桌面创建快捷方式。
之后双击桌面"Echora"图标即可。

### 方式 2：命令行

```bash
# 安装依赖
npm install

# 启动
npm start        # 窗口模式
npm run dev      # 开发者模式（打开 DevTools）

# 桌面快捷方式
npm run desktop  # 在桌面创建 Echora 快捷方式

# 闭合验证
npm run verify   # 运行 B-5.5 自动验证
```

# 安装依赖
npm install

# 启动应用
npm start
```

### 环境要求
- Node.js ≥ 18.0
- Python ≥ 3.8（可选，部分 AI 工具需要）
- Git ≥ 2.30（可选）

> 首次启动时，Echora 会自动检测环境并提示缺失的依赖。

---

## 📂 项目结构

```
Echora/
├── main.js                     # Electron 主进程
├── preload.js                  # 安全的 IPC 桥梁
├── package.json
├── README.md
├── assets/                     # 图标等静态资源
└── src/
    ├── index.html              # 主界面
    ├── adapters/
    │   ├── base-adapter.js     # 适配器基类
    │   └── openclaw-adapter.js # OpenClaw 适配器
    ├── detectors/
    │   ├── ai-detector.js      # AI 软件自动检测
    │   └── env-checker.js      # 环境检查与自动安装
    ├── manager/
    │   ├── config-manager.js   # 配置持久化
    │   └── gateway-manager.js  # 网关进程管理
    └── ui/
        ├── renderer.js         # 渲染进程逻辑
        └── styles.css          # 界面样式
```

---

## 🔌 适配器系统

每个 AI 软件通过适配器接入，需实现 `BaseAdapter` 接口：

- `start()` / `stop()` — 网关进程控制
- `listAgents()` — 枚举可用 Agent
- `sendMessage(agent, text)` — 发送消息
- `onMessage(callback)` — 接收回复
- `getStatus()` — 获取运行状态

支持的 AI 软件（持续扩展中）：
| 软件 | 适配状态 | 备注 |
|------|---------|------|
| OpenClaw | ✅ 已实现 | 原生 Gateway API |
| QClaw | ✅ 已实现 | 与 OpenClaw 架构相同 |
| Cursor | 🔧 规划中 | 需逆向分析内部 API |
| Windsurf | 🔧 规划中 | 同上 |
| VS Code Copilot | 🔧 规划中 | LSP 扩展方式 |
| Augment | 🔧 规划中 | |
| Trae | 🔧 规划中 | |

---

## 🛠️ 技术栈

- **桌面框架**: Electron 33+
- **进程管理**: Node.js child_process
- **通信协议**: HTTP REST + WebSocket
- **构建打包**: electron-builder (NSIS)

---

## 📄 开源协议

MIT License — 自由使用、修改和分发。

---

*让 AI 之间彼此听见。* 🌊
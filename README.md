<div align="center">

# 🎵 Echora 2.0

**全能 AI 工作台** — 打通电脑上所有 AI 软件的壁垒，统一管理、对话与协作。

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Electron](https://img.shields.io/badge/Electron-42+-47848F.svg?logo=electron)](https://www.electronjs.org/)
[![React](https://img.shields.io/badge/React-19+-61DAFB.svg?logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7+-3178C6.svg?logo=typescript)](https://www.typescriptlang.org/)

</div>

---

## ✨ 什么是 Echora

Echora 是一个桌面应用，让你在一个界面里管理和使用所有 AI 工具。无论你用的是 OpenClaw、Hermes、QClaw 还是其他 AI 服务，Echora 都能把它们整合到一起——统一的对话界面、统一的 Agent 管理、统一的文件预览。

![Echora 2.0 界面预览](screenshots/echora-2.0-main.png)

## 🔥 核心功能

### 🤖 多 Agent 管理
- 同时连接多个 AI 服务（OpenClaw / QClaw / Hermes / Cursor / 直连 API）
- 每个服务下的 Agent 自动发现，带在线状态指示
- 一键切换不同 Agent，对话互不干扰

### 💬 智能对话
- 流式输出 + Markdown 实时渲染 + 代码高亮（Shiki）
- 工具调用可视化：展示 Agent 调用了哪些工具、参数和结果
- 上下文 Token 实时统计，防止超出模型窗口
- 上下文自动压缩：窗口占用超阈值时自动压缩历史

### 🛠️ 内置工具系统（ReAct Agent）
- `terminal` — 执行终端命令
- `file_read` / `file_write` / `file_edit` / `file_list` — 文件操作
- `code_execute` — 代码执行
- `powershell_execute` — PowerShell 命令
- `web_search` / `web_fetch` — 网络搜索与内容抓取
- `kb_search` — 知识库向量检索
- `system_info` — 系统信息查询
- `calc` — 数学计算
- 工具调用前需用户确认，安全可控

### 📁 文件预览面板
- 文件浏览器：浏览本地项目文件
- 代码预览：语法高亮查看代码
- 网页预览：内置浏览器查看页面
- 终端预览：查看命令执行结果

### 🎨 界面设计
- 三栏布局：Agent 导航栏 + 对话区 + 文件预览
- 深色/浅色主题切换
- 可调节面板大小
- 现代扁平化设计，圆角卡片风格

### ⚙️ 灵活配置
- 全局设置 + 每个 AI 服务独立配置
- 草稿系统：配置编辑安全隔离，自动备份，一键重置
- 网关状态实时监控
- 从 AI 软件配置文件自动读取参数

### 🧠 知识库与记忆
- SQLite 持久化存储会话与记忆
- 向量检索知识库
- 记忆上下文自动注入 Agent 系统提示

### 🤝 群聊协作
- 多 Agent 群聊模式
- Webhook 适配器支持

## 🤖 支持的 AI 软件

| 软件 | 状态 | 连接方式 |
|------|------|----------|
| **OpenClaw** | ✅ 完整支持 | WebSocket + HTTP API |
| **QClaw** | ✅ 完整支持 | WebSocket + HTTP API |
| **Hermes** | ✅ 完整支持 | Gateway API Server + 多 Profile |
| **Cursor** | ✅ 基础支持 | 进程检测 + 网关管理 |
| **直连 API** | ✅ 支持 | OpenAI 兼容协议 |
| **Windsurf** | 📋 计划中 | |
| **Trae** | 📋 计划中 | |

## 🚀 快速开始

### 环境要求

- Node.js ≥ 18.0
- Windows 10/11（macOS / Linux 支持构建）

### 安装与运行

```bash
# 克隆仓库
git clone https://github.com/lovelefeng-glitch/Echora.git
cd Echora

# 安装依赖
npm install

# 开发模式（带 DevTools）
npm run dev

# 构建 Windows 版本
npm run build:win

# 构建便携版
npm run build:portable
```

## 🏗️ 技术架构

```
┌─────────────────────────────────────────────────┐
│              Echora 2.0 (Electron)              │
├─────────────────────────────────────────────────┤
│  渲染进程 (React 19 + TypeScript)               │
│  ├── Agent 导航栏 — 多服务 Agent 列表           │
│  ├── 对话区 — 流式渲染 + 工具调用 + Token 统计  │
│  ├── 文件预览 — 代码/网页/终端多标签             │
│  └── 设置面板 — 全局 + 服务级独立配置            │
├─────────────────────────────────────────────────┤
│  主进程 (TypeScript)                             │
│  ├── IPC 路由层 (IpcRouter)                      │
│  ├── 适配器工厂 — 按需加载 AI 服务适配器         │
│  ├── Agent 系统 — ReAct 框架 + 工具调用循环      │
│  ├── LLM Provider — OpenAI 兼容协议抽象层        │
│  ├── 知识库 — 向量检索 + 文档分块               │
│  ├── 存储层 — SQLite 会话/记忆/配置              │
│  └── 安全模块 — 输入验证 + 工具确认              │
├─────────────────────────────────────────────────┤
│  适配器层                                        │
│  ├── OpenClaw Adapter (WebSocket + HTTP)         │
│  ├── QClaw Adapter (WebSocket + HTTP)            │
│  ├── Hermes Adapter (Gateway API + 多 Profile)   │
│  ├── Cursor Adapter (进程检测)                   │
│  └── Direct API Adapter (OpenAI 兼容)            │
├─────────────────────────────────────────────────┤
│  内置工具 (12 个)                                │
│  terminal · file_read/write/edit/list            │
│  code_execute · powershell_execute               │
│  web_search · web_fetch · kb_search              │
│  system_info · calc                              │
└─────────────────────────────────────────────────┘
         ↕ HTTP / WebSocket / IPC
┌─────────────────────────────────────────────────┐
│           AI 软件网关 (外部进程)                 │
│   OpenClaw · QClaw · Hermes · Cursor ...        │
└─────────────────────────────────────────────────┘
```

## 📁 项目结构

```
Echora/
├── src/
│   ├── main/                        # Electron 主进程
│   │   ├── index.ts                 # 应用入口
│   │   ├── ipc-router.ts            # IPC 路由管理
│   │   ├── adapters/                # AI 网关适配器
│   │   │   ├── base-adapter.ts      # 适配器抽象基类
│   │   │   ├── openclaw-adapter.ts  # OpenClaw 适配器
│   │   │   ├── qclaw-adapter.ts     # QClaw 适配器
│   │   │   ├── hermes-adapter.ts    # Hermes 适配器
│   │   │   ├── cursor-adapter.ts    # Cursor 适配器
│   │   │   └── direct-api/          # 直连 API 适配器
│   │   ├── agent/                   # Agent 系统 (ReAct)
│   │   │   ├── agent-loop.ts        # Agent 主循环
│   │   │   ├── agent-manager.ts     # Agent 生命周期管理
│   │   │   ├── planner.ts           # 规划器
│   │   │   ├── token-counter.ts     # Token 计数 (tiktoken)
│   │   │   └── tool-call-parser.ts  # 工具调用解析
│   │   ├── llm/                     # LLM Provider 抽象层
│   │   ├── tools/builtin/           # 12 个内置工具
│   │   ├── store/                   # SQLite 存储层
│   │   ├── kb/                      # 知识库 (向量检索)
│   │   ├── memory/                  # 记忆管理
│   │   ├── groupchat/               # 群聊系统
│   │   ├── security/                # 安全模块
│   │   └── managers/                # 配置/网关/草稿管理
│   ├── renderer/                    # React 渲染进程
│   │   ├── App.tsx                  # 根组件
│   │   ├── components/              # UI 组件
│   │   │   ├── Sidebar.tsx          # Agent 导航栏
│   │   │   ├── ChatArea.tsx         # 对话区
│   │   │   ├── preview/             # 文件预览面板
│   │   │   ├── settings/            # 设置面板
│   │   │   └── agent/               # Agent 相关组件
│   │   ├── hooks/                   # 自定义 Hooks
│   │   ├── stores/                  # Zustand 状态管理
│   │   └── views/                   # 页面视图
│   ├── preload/                     # 预加载脚本
│   └── shared/                      # 共享类型定义
├── tests/                           # 测试 (Vitest + Playwright)
├── scripts/                         # 工具脚本
├── docs/                            # 开发文档
└── screenshots/                     # 界面截图
```

## 🛠️ 开发

```bash
# 开发模式
npm run dev

# 单元测试
npm run test

# E2E 测试
npm run test:e2e

# 代码检查
npm run lint

# 格式化
npm run format

# 构建
npm run build            # 构建应用
npm run build:win        # 构建 Windows 版本
npm run build:portable   # 构建便携版
```

## 📸 界面预览

![Echora 2.0 界面](screenshots/echora-2.0-main.png)

## 📝 更新日志

### v2.0.0 (2026-06-10)

> **全新架构，完全重写。** 从 JavaScript 升级到 TypeScript + React，从单文件 UI 升级到组件化架构。

#### 🏗️ 架构重构
- ✨ **TypeScript 全量重写** — 主进程 + 渲染进程 + 共享类型，完整类型安全
- ✨ **React 19 + Zustand** — 组件化 UI，轻量级状态管理
- ✨ **electron-vite 构建** — 开发热更新 + 生产优化构建
- ✨ **Tailwind CSS 4** — 工具类样式框架，深色/浅色主题
- ✨ **SQLite 存储层** — 会话、记忆、配置持久化

#### 🤖 Agent 系统
- ✨ **ReAct Agent 框架** — Reasoning + Acting 循环，支持多步推理
- ✨ **12 个内置工具** — 终端、文件操作、代码执行、PowerShell、Web 搜索、知识库检索等
- ✨ **工具确认对话框** — 敏感操作需用户确认，安全可控
- ✨ **Token 计数器** — 基于 tiktoken，实时统计上下文占用
- ✨ **上下文压缩** — 窗口占用超阈值时自动压缩历史消息

#### 🎨 界面革新
- ✨ **三栏布局** — Agent 导航栏 + 对话区 + 文件预览面板
- ✨ **Agent 导航栏** — 多服务 Agent 列表，在线状态指示，搜索过滤
- ✨ **文件预览面板** — 文件浏览 / 代码预览 / 网页预览 / 终端预览四合一
- ✨ **对话增强** — 流式渲染 + 工具调用卡片 + Token 统计 + 上下文进度条
- ✨ **深色/浅色主题** — 一键切换，全局生效
- ✨ **可调节面板** — 拖拽调整侧栏和预览面板宽度

#### 🔌 适配器升级
- ✨ **直连 API 适配器** — OpenAI 兼容协议，无需网关即可使用
- ✨ **WebSocket 原生支持** — OpenClaw / QClaw WebSocket 实时通信
- ✨ **Hermes 多 Profile** — 自动发现 Hermes 的多 Agent Profile
- ✨ **适配器工厂** — 按需加载，统一生命周期管理

#### 🧠 知识库与记忆
- ✨ **向量检索知识库** — 文档分块 + 向量存储 + 语义搜索
- ✨ **记忆管理器** — 跨会话记忆持久化与检索
- ✨ **SQLite 会话存储** — 对话历史结构化存储

#### ⚙️ 配置与安全
- ✨ **草稿系统** — 配置编辑安全隔离，自动备份，一键重置
- ✨ **安全模块** — 输入验证 + 工具权限控制
- ✨ **网关状态轮询** — 实时监控 AI 服务在线状态

#### 🤝 群聊协作
- ✨ **多 Agent 群聊** — 多个 Agent 同时参与对话
- ✨ **Webhook 适配器** — 外部服务接入群聊

## 📄 License

[MIT](LICENSE) © [lovelefeng-glitch](https://github.com/lovelefeng-glitch)

---

<div align="center">

**让 AI 之间彼此听见。** 🎵

</div>

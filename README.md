<div align="center">

# 🎵 Echora

**Echo + Ora**（回声 + 祈祷）

打通电脑上所有 AI 软件的壁垒，实现信息互通与统一管理。

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Electron](https://img.shields.io/badge/Electron-33+-47848F.svg?logo=electron)](https://www.electronjs.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-339933.svg?logo=node.js)](https://nodejs.org/)

</div>

---

## ✨ 功能特性

| 功能 | 描述 |
|------|------|
| 🔍 **自动发现** | 三层扫描：进程匹配 → 端口指纹 → 状态文件，自动识别所有 AI 软件 |
| 🎛️ **统一管理** | 一个面板启动/停止所有 AI 网关，实时状态灯 |
| 💬 **流式对话** | SSE 流式渲染 + Markdown 实时呈现 + 代码高亮 |
| 🤖 **多 Agent 切换** | Agent 列表 + 会话管理 + 多会话创建/删除 |
| ⚙️ **模型信息** | 实时显示当前模型名、上下文窗口大小、Token 用量 |
| 🧩 **适配器架构** | 插件式设计，轻松接入新 AI 软件 |
| 📊 **状态监控** | 10s 轮询 + PID 存活检测 + TCP 端口快速探测 |
| 🔌 **Echora Proxy** | SSE 中间层拦截 → Token 用量 + 工具调用 + 延迟统计 |
| 📋 **消息复制** | 每条回复一键复制 + 工具调用详情弹窗 |
| 🛑 **停止生成** | 流式过程中一键中断 |

## 🤖 支持的 AI 软件

| 软件 | 状态 | 说明 |
|------|------|------|
| **OpenClaw** | ✅ 完整支持 | Gateway API + 会话管理 |
| **QClaw** | ✅ 完整支持 | 与 OpenClaw 架构相同 |
| **Hermes** | ✅ 完整支持 | Gateway API Server + profiles 多 Agent + 工具/记忆/技能 |
| **Cursor** | ✅ 基础支持 | 进程检测 + 网关管理 |
| **Windsurf** | 📋 计划中 | |
| **Trae** | 📋 计划中 | |

## 🚀 快速开始

### 方式一：双击启动（推荐）

```bash
# 首次使用，创建桌面快捷方式
setup-desktop.cmd

# 之后双击桌面 "Echora" 图标即可
```

### 方式二：命令行

```bash
# 安装依赖
npm install

# 启动应用
npm start          # 窗口模式
npm run dev        # 开发者模式（DevTools）
```

### 环境要求

- Node.js ≥ 18.0
- Windows 10/11

> 首次启动时，Echora 会自动检测环境并提示缺失的依赖。

## 🏗️ 架构概览

```
┌─────────────────────────────────────────────┐
│              Echora UI (Electron)           │
├─────────────────────────────────────────────┤
│  渲染进程 (renderer.js)                     │
│  ├── 流式对话 + Markdown 渲染               │
│  ├── 模型信息面板 + 切换                    │
│  ├── Agent 列表 + 会话管理                  │
│  ├── AI 管理面板 (三层扫描发现)             │
│  └── 系统设置 (二级菜单)                    │
├─────────────────────────────────────────────┤
│  主进程 (main.js)                           │
│  ├── IPC 路由                               │
│  ├── 适配器管理                             │
│  └── 网关生命周期                           │
├─────────────────────────────────────────────┤
│  适配器层                                   │
│  ├── OpenClaw Adapter                       │
│  ├── QClaw Adapter                          │
│  ├── Hermes Adapter v3.4 (Gateway API Server + Proxy + metrics) │
│  └── Cursor Adapter                         │
├─────────────────────────────────────────────┤
│  检测器层                                   │
│  ├── AI Detector (三层发现)                 │
│  ├── Port Scanner (端口扫描)                │
│  ├── State Reader (状态文件)                │
│  └── Env Checker (环境检查)                 │
└─────────────────────────────────────────────┘
         ↕ HTTP / IPC
┌─────────────────────────────────────────────┐
│         AI 软件网关 (外部进程)              │
│  OpenClaw · QClaw · Hermes · Cursor ...    │
└─────────────────────────────────────────────┘
```

## 📁 项目结构

```
Echora/
├── main.js                      # Electron 主进程
├── preload.js                   # 安全 IPC 桥梁
├── package.json
├── src/
│   ├── index.html               # 主界面
│   ├── adapters/
│   │   ├── base-adapter.js      # 适配器基类
│   │   ├── openclaw-adapter.js  # OpenClaw/QClaw 适配器
│   │   ├── hermes-adapter.js    # Hermes 适配器 (v3.4)
│   │   └── cursor-adapter.js    # Cursor 适配器
│   ├── proxy/
│   │   └── echora-proxy.js      # SSE 中间层代理 (v1.0)
│   ├── detectors/
│   │   ├── ai-detector.js       # AI 软件检测 (三层发现)
│   │   ├── port-scanner.js      # 端口扫描 + 指纹匹配
│   │   ├── state-reader.js      # 网关状态文件读取
│   │   └── env-checker.js       # 环境依赖检查
│   ├── manager/
│   │   ├── config-manager.js    # 配置持久化
│   │   ├── config-reader.js     # AI 配置文件读取
│   │   └── gateway-manager.js   # 网关进程管理
│   └── ui/
│       ├── renderer.js          # 渲染进程逻辑
│       └── styles.css           # 界面样式
├── docs/                        # 开发文档
│   ├── BLUEPRINT.md             # 架构蓝图
│   └── taskboard/KANBAN.md      # 任务看板
└── scripts/                     # 工具脚本
```

## 🛠️ 开发

```bash
# 开发模式（带 DevTools）
npm run dev

# 语法检查
node -c src/**/*.js

# 闭合验证
npm run verify
```

## 📝 更新日志

### v0.6.0 (2026-05-22)
- ✨ **Echora Proxy 中间层**: SSE 拦截 → Token 用量 + 工具调用 + 延迟统计，注入 echora.metrics 事件
- ✨ **消息底部 Metrics**: 显示 completion_tokens（本次消耗）+ 总延迟秒数
- ✨ **工具调用持久化**: 重启后历史消息的工具按钮和 metrics 仍然保留
- ✨ **工具弹窗增强**: 工具名中文映射（terminal→终端命令）+ label 截断显示
- ✨ **模型信息合并**: 模型名·上下文·已用% 合并到 hint 栏，模型选择器同行显示
- ✨ **停止生成按钮**: 流式过程中一键中断 HTTP 请求
- ✨ **消息复制按钮**: 每条回复底部一键复制
- ✨ **流式状态可视化**: 思考中/输出中/已完成/出错 四态 + 左侧光条动画
- ✨ **差异化模型切换**: Hermes 通过 config.yaml + Gateway 重启切换
- 🐛 修复 onDone 双重调用导致 metrics 丢失
- 🐛 修复 taskkill 不加 /F 无法杀 node.exe 进程
- 🐛 修复代理端口正则匹配失败（\\s → \s）
- 🐛 修复 getOrCreateAdapter 永久覆盖代理端口
- 🔧 代理端口从 8084 改为 8085（避免端口冲突）
- 🔧 Hermes Adapter v3.4: onDone 传递 metrics + 工具调用跟踪 + 首 chunk 计时

### v0.5.0 (2026-05-21)
- ✨ 流式渲染：SSE 逐字推送，打字效果 + Markdown 实时渲染
- ✨ 模型信息面板：当前模型名 + 上下文窗口 + Token 用量
- ✨ Markdown 渲染：代码块 / 引用 / 列表 / 标题 / 表格样式
- ✨ Hermes profile Agent 自动识别（如 minmin 编程专家）
- ✨ 思考中… 动画：流式等待阶段显示脉冲动画
- 🐛 修复 Hermes 启动检测延迟（TCP 端口快速探测，100ms 超时）
- 🐛 修复流式消息重复推送 3 条
- 🐛 修复抽屉菜单底部图标被遮挡
- 🔧 Hermes Adapter v3.3: gateway_state.json + PID 存活 + TCP 三级检测

### v0.4.0 (2026-05-20)
- ✨ AI 网关自动发现：端口扫描 + 指纹匹配
- ✨ Hermes 完整集成：Gateway API Server + 会话管理
- 🐛 修复 502 截断自动降级流式模式
- 🔧 配置参数从 AI 软件配置文件读取

### v0.3.4 (2026-05-19)
- ✨ 系统设置面板：超时配置 + AI 配置文件读取
- ✨ Hermes Agent 检测 + 适配器

### v0.1.0 (2026-05-17)
- 🎉 初始版本：OpenClaw/QClaw 基础集成

## 📄 License

[MIT](LICENSE) © [lovelefeng-glitch](https://github.com/lovelefeng-glitch)

---

<div align="center">

**让 AI 之间彼此听见。** 🎵

</div>

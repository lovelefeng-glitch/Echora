# Echora 1.0 开发参考索引

> 最后更新：2026-06-03
> 用途：2.0 开发时遇到特定问题，按本文档索引去 1.0 查阅原始文档/源码
> 1.0 源码根目录：`E:\AI\Echora`

---

## 使用方式

1. 开发中遇到某个问题 → 在下方对应功能域找到索引行
2. 按路径去 1.0 目录读取对应文件
3. 只看你需要的部分，不要全量扫描

---

## 一、架构与数据结构

### 场景：需要理解整体架构或模块关系

| 文件 | 路径 | 核心内容 |
|------|------|----------|
| 系统架构 | `E:\AI\Echora\docs\ARCHITECTURE.md` | 三层架构图、6大设计模式、BaseAdapter 10方法接口契约、文件风险等级表 |
| 项目蓝图 | `E:\AI\Echora\docs\BLUEPRINT.md` | **唯一真实来源**，6个关键数据结构JSON定义、22个模块完成状态、数据契约规则 |
| 数据流 | `E:\AI\Echora\docs\DATA-FLOW.md` | 8个完整流程追踪（启动/消息发送/配置编辑/SSE代理/模型切换/状态检测/normalize映射/Token显示） |

### 场景：需要定义 IPC 通道

| 文件 | 路径 | 核心内容 |
|------|------|----------|
| IPC 通道规格 | `E:\AI\Echora\docs\IPC-REFERENCE.md` | 40+通道完整规格（38 handle + 9 推送事件），每个通道有输入/输出/说明/错误规格 |

### 场景：需要理解参数映射

| 文件 | 路径 | 核心内容 |
|------|------|----------|
| 参数映射表 | `E:\AI\Echora\docs\PARAMETER-MAPPING.md` | 模型参数映射、配置字段映射、IPC方法映射、listModels/switchModel规格、敏感字段过滤 |

---

## 二、配置系统

### 场景：需要读取或编辑 AI 配置文件

| 文件 | 路径 | 核心内容 |
|------|------|----------|
| 配置文件参考 | `E:\AI\Echora\docs\CONFIG-REFERENCE.md` | 5种配置文件结构（echora-config/QClaw/OpenClaw/Hermes/草稿），normalize前/后对照表 |

### 场景：需要理解 normalize/denormalize 机制

| 源码 | 路径 | 说明 |
|------|------|------|
| config-reader.js | `E:\AI\Echora\src\manager\config-reader.js` | normalize/denormalize 双向转换实现，支持 JSON/YAML，自动发现路径 |
| draft-manager.js | `E:\AI\Echora\src\manager\draft-manager.js` | 草稿编辑机制：原配置→草稿→编辑→备份→写回 |

### 场景：需要实现配置 Schema 校验

| 配置 | 路径 | 说明 |
|------|------|------|
| echora-config.json | `E:\AI\Echora\echora-config.json` | 1.0 实际使用的配置文件，可作为 Schema 参考 |

---

## 三、适配器（AI 对接）

### 场景：需要新增 AI 类型适配器

| 文件 | 路径 | 说明 |
|------|------|------|
| BaseAdapter | `E:\AI\Echora\src\adapters\base-adapter.js` | 118行，接口定义：start/stop/getStatus/listAgents/sendMessage/sendMessageStream/getModelInfo/listModels/setModel/onMessage |
| QClaw 适配器 | `E:\AI\Echora\src\adapters\qclaw-adapter.js` | 489行，WebSocket优先+SSE降级，最精简的适配器实现，可作为新适配器模板 |
| OpenClaw 适配器 | `E:\AI\Echora\src\adapters\openclaw-adapter.js` | 950行，HTTP SSE + WebSocket 双模式，会话管理 RPC |
| Hermes 适配器 | `E:\AI\Echora\src\adapters\hermes-adapter.js` | 1180行，SSE流式 + profile多实例 + 模型切换（修改config.yaml+重启） |

### 场景：需要实现 WebSocket 通信

| 文件 | 路径 | 说明 |
|------|------|------|
| QClaw WS | `E:\AI\Echora\src\adapters\qclaw-ws.js` | v3协议 + Ed25519设备签名认证，指数退避重连 |
| OpenClaw WS | `E:\AI\Echora\src\adapters\openclaw-ws.js` | v4协议，connect.challenge认证，事件分发 |

---

## 四、检测器

### 场景：需要检测/发现本地 AI 进程

| 文件 | 路径 | 说明 |
|------|------|------|
| AI 检测器 | `E:\AI\Echora\src\detectors\ai-detector.js` | 三层发现：进程名扫描 + 端口反推 + 状态文件读取，7种AI指纹库 |
| 环境检查 | `E:\AI\Echora\src\detectors\env-checker.js` | Node.js/Python/Git/npm 检测，支持版本比对和自动安装 |
| 状态读取 | `E:\AI\Echora\src\detectors\state-reader.js` | gateway_state.json/gateway.lock/gateway.pid 读取和进程存活验证 |

---

## 五、UI 与前端

### 场景：需要设计 UI 布局

| 文件 | 路径 | 核心内容 |
|------|------|----------|
| UI 风格指南 | `E:\AI\Echora\docs\conventions\UI-STYLE-GUIDE.md` | 完整颜色/组件/布局/间距/圆角/字体/动画规范 + 禁止事项 |
| 多面板架构 | `E:\AI\Echora\.trae\skills\project-dev\references\multi-panel-architecture.md` | 隐藏/显示面板切换、流式回调不门控、per-agent滚动位置保存 |
| UI 模版架构 | `E:\AI\Echora\.trae\skills\project-dev\references\echora-ui-template-architecture.md` | Echora 特有布局（左侧透明栏 + 右侧浮动卡片 + 错落感）、设计还原流程 |
| 模版布局模式 | `E:\AI\Echora\.trae\skills\project-dev\references\echora-template-layout-patterns.md` | 各页面布局结构、导航栏、标签栏实现 |
| 马卡龙标签 | `E:\AI\Echora\.trae\skills\project-dev\references\ui-template-macaron-tabs.md` | .conv-title 统一样式、slowPulse动画参数、颜色分配表 |
| UI 模版站工作流 | `E:\AI\Echora\.trae\skills\project-dev\references\ui-template-workflow.md` | 设计图分析→HTML骨架→CSS→截图验证的完整流程 |

### 场景：需要实现自定义窗口控制

| 文件 | 路径 | 核心内容 |
|------|------|----------|
| 自定义窗口按钮 | `E:\AI\Echora\.trae\skills\project-dev\references\electron-custom-window-controls.md` | 纯CSS画最小化/最大化/关闭按钮 + 错落布局计算公式 |
| Electron 窗口样式 | `E:\AI\Echora\.trae\skills\project-dev\references\electron-window-styling.md` | titleBarStyle:'hidden' + titleBarOverlay 的正确用法 |
| Electron 自定义窗口 | `E:\AI\Echora\.trae\skills\project-dev\references\electron-custom-window.md` | frame:false vs titleBarStyle 的区别 |

### 场景：需要渲染 Markdown

| 文件 | 路径 | 说明 |
|------|------|------|
| Markdown 渲染模式 | `E:\AI\Echora\docs\patterns\markdown-render-pattern.md` | marked.js 用 UMD+script 标签加载，不能在 preload.js 里 require |

---

## 六、Hermes 相关

### 场景：需要管理 Hermes Profile

| 文件 | 路径 | 核心内容 |
|------|------|----------|
| Profile 管理 | `E:\AI\Echora\.trae\skills\project-dev\references\hermes-profile-management.md` | `-p`参数用法、端口分配(8086-8090)、.env必需字段、config.yaml模型配置、7个踩坑 |

### 场景：需要读取 Hermes Skills

| 文件 | 路径 | 说明 |
|------|------|------|
| Skills 目录 | `E:\AI\Echora\.trae\skills\project-dev\references\hermes-skills-directory.md` | Hermes 技能目录结构和读取方式 |

### 场景：需要理解 Echora Proxy

| 源码 | 路径 | 说明 |
|------|------|------|
| echora-proxy.js | `E:\AI\Echora\src\proxy\echora-proxy.js` | 300行，Hermes 轻量代理：透传+SSE拦截+metrics注入+端口清理 |

---

## 七、OpenClaw 相关

### 场景：需要读取 OpenClaw 技能

| 文件 | 路径 | 核心内容 |
|------|------|----------|
| Skill 架构 | `E:\AI\Echora\.trae\skills\project-dev\references\openclaw-skill-architecture.md` | 6个技能来源优先级、本机路径、启用状态配置、Echora集成方式 |

---

## 八、踩坑与避坑

### 场景：开发中遇到 bug 或异常行为

| 文件 | 路径 | 核心内容 |
|------|------|----------|
| 踩坑日志 | `E:\AI\Echora\.trae\skills\project-dev\references\pitfalls-2026-05.md` | **20+条踩坑**：CLI flag误判、os模块未导入、目录扫描深度、titleBarOverlay、UI布局、CSS类名同步、下拉菜单stopPropagation、标签颜色持久化 |
| 状态重构教训 | `E:\AI\Echora\.trae\skills\project-dev\references\evolution-2026-05-28-state-refactoring.md` | 全局→per-instance重构的5项检查清单：容器初始化、闭包变量声明、资源注册时序 |
| 资源复用教训 | `E:\AI\Echora\.trae\skills\project-dev\references\evolution-2026-05-29-resource-reuse.md` | "已有就用，没有才建"原则 |
| 代码修改规范 | `E:\AI\Echora\docs\conventions\MODIFICATION-SAFETY.md` | 一次只改一处、必须备份、禁止git checkout修错、node脚本brace counting不可靠 |
| 故障恢复 | `E:\AI\Echora\docs\RECOVERY.md` | 14种故障场景排查：配置损坏/端口占用/消息问题/UI白屏/开发环境恢复 |

---

## 九、Agent Prompt 模板

### 场景：需要为 2.0 配置 AI Agent 角色

| 文件 | 路径 | 说明 |
|------|------|------|
| 架构师 | `E:\AI\Echora\docs\agent-prompts\1-架构师.md` | 系统设计、模块拆分、技术选型、重构规划 |
| 审查员 | `E:\AI\Echora\docs\agent-prompts\2-审查员.md` | 代码审查、质量评估 |
| 猎手 | `E:\AI\Echora\docs\agent-prompts\3-猎手.md` | Bug 定位、根因分析 |
| 测试员 | `E:\AI\Echora\docs\agent-prompts\4-测试员.md` | 测试用例编写、验证 |
| 设计师 | `E:\AI\Echora\docs\agent-prompts\5-设计师.md` | UI/UX 设计 |
| 文档员 | `E:\AI\Echora\docs\agent-prompts\6-文档员.md` | 文档编写与维护 |

---

## 十、任务与历史决策

### 场景：需要了解某个功能的开发历史

| 文件 | 路径 | 说明 |
|------|------|------|
| 任务看板 | `E:\AI\Echora\docs\taskboard\KANBAN.md` | 所有任务状态总览 |
| 交接文档 | `E:\AI\Echora\docs\taskboard\handoff_2026-05-26_1530.md` | 最新的项目交接记录 |
| 归档任务 | `E:\AI\Echora\docs\taskboard\archive\` | 25+个已完成任务的详细记录 |
| 演进日志 | `E:\AI\Echora\.trae\skills\project-dev\EVOLUTION.md` | 架构决策演进记录 |

---

## 快速查找表

| 你想做什么 | 去 1.0 看什么 |
|-----------|-------------|
| 新增一个 AI 适配器 | base-adapter.js + qclaw-adapter.js（最简模板） |
| 理解 IPC 通道规格 | IPC-REFERENCE.md |
| 定义数据结构 | BLUEPRINT.md 第四节 |
| 实现配置编辑 | config-reader.js + draft-manager.js |
| 设计 UI 布局 | UI-STYLE-GUIDE.md + echora-ui-template-architecture.md |
| 实现自定义标题栏 | electron-custom-window-controls.md |
| 管理 Hermes Profile | hermes-profile-management.md |
| 读取 OpenClaw 技能 | openclaw-skill-architecture.md |
| 渲染 Markdown | markdown-render-pattern.md |
| 排查 bug | pitfalls-2026-05.md + RECOVERY.md |
| 理解消息流式渲染 | multi-panel-architecture.md + DATA-FLOW.md |
| 理解 Token 计算 | DATA-FLOW.md 第八节 + PARAMETER-MAPPING.md |
| 故障恢复 | RECOVERY.md |
| 配置 Agent 角色 | agent-prompts/ 目录下对应角色文件 |

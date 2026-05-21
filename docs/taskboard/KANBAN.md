# 任务看板

> **最后更新**: 2026-05-21 07:40  
> **活跃开发者**: QClaw (qclaw) | 小雪 (xue)
> **当前版本**: v0.4.0-dev

---

## 任务状态标记

| 标记 | 含义 |
|------|------|
| 📅 | 计划中 (Todo) |
| 🔧 | 开发中 (WIP) |
| ✅ | 已完成 |
| ⚠️ | 阻塞/等待 |
| 🐛 | Bug |
| ❌ | 已取消 |

---

## 📅 待开发 (Backlog)

### 优先级 P0 — 阻塞性 Bug

| # | 任务 | 模块 | 标记 |
|---|------|------|------|
| P0-1 | 修复 `openclaw-adapter.js` exePath 字段读取问题 | adapters | ✅ 2026-05-18 |
| P0-2 | 修正 API 路径（/health、/v1/chat/completions）| adapters | ✅ 2026-05-18 |
| P0-3 | WebSocket → 改用 SSE 流式接收（已实现 sendMessageStream）| adapters | ✅ 2026-05-18 |
| P0-4 | 🐛 抽屉菜单图标被遮挡（底部菜单项图标不完整 / 被截断） | ui | ✅ 已验证：max-height 320px + 2列grid 载7项无溢出 |
| P0-5 | 流式闪烁光标改思考中动画 | ui | ✅ 已完成 |

| P0-6 | 🐛 流式输出无法辨别状态：运行中 / 已完成 / 报错停止 | ui + adapters | 📅 |
### 优先级 P1 — 核心功能

| # | 任务 | 模块 | 标记 |
|---|------|------|------|
| P1-1 | 实现 QClaw 消息发送（sendMessage → /v1/chat/completions）| adapters + main | ✅ 2026-05-18 |
| P1-2 | 实现消息接收（IPC 通道 + renderer 渲染）| adapters + renderer | ✅ 2026-05-18 |
| P1-3 | Agent 列表枚举和切换 | adapters + renderer | ✅ 2026-05-18 |
| P1-4 | 跨 AI 消息路由 | main + manager | 📅 |
| P1-5 | 用户友好启动器（双击 start.cmd + 桌面快捷方式） | project | ✅ 2026-05-18 |
| P1-6 | B-5.5 闭合验证脚本（verify-closure.js） | project-dev skill | ✅ 2026-05-18 |
| P1-7 | EVOLUTION.md 经验累积 → 自动升格提醒 | project-dev skill | ✅ 2026-05-18 |
| P1-8 | `[F-1]` 系统设置面板：超时配置 + AI 配置文件读取 + 参数调节 | settings + config-reader | ✅ |
| P1-9 | `[F-1]` 新增 `config-reader.js` 模块（AI JSON 配置读取/解析）| manager | ✅ |
| P1-10 | `[F-1]` Settings 视图 UI 重构（超时滑块、配置路径、模型预览）| ui | ✅ |
| P1-11 | `[F-1]` renderer.js 超时从硬编码改为读 settings.timeout | ui | ✅ |
| P1-12 | `[F-2]` 新增 Hermes Agent 检测（AIDetector + 进程发现 + 路径定位） | detectors | ✅ |
| P1-13 | `[F-2]` config-reader 扩展 YAML 解析 + profiles/*/config.yaml 映射 | manager | ✅ |
| P1-14 | `[F-2]` 新建 hermes-adapter.js（/v1/chat/completions + X-Hermes-Session-Id） | adapters | ✅ |
| P1-15 | `[F-2]` Settings 视图展示 Hermes 主配置 + profiles 列表 | ui | ✅ |
| P1-16 | `[F-3]` 新增 port-scanner.js（端口扫描 + HTTP 探测 + 指纹匹配）| detectors | ✅ |
| P1-17 | `[F-3]` 新增 state-reader.js（网关状态文件读取）| detectors | ✅ |
| P1-18 | `[F-3]` 扩展 AIDetector 集成层级 2+3 发现机制 | detectors | ✅ |
| P1-19 | `[F-3]` 新增 IPC ai:scanFull/probePort/addDiscovered + renderer 弹窗 UI | main + ui | ✅ |
| P1-20 | `[F-3]` config-manager 动态添加新 AI 类型 + registerType | manager + detectors | ✅ |

### 优先级 P1 — 核心功能（续）

| # | 任务 | 模块 | 标记 |
|---|------|------|------|
| P1-21 | `[F-6]` 消息流式渲染 IPC 通道（message:sendStream chunk-by-chunk） | main + preload | ✅ 2026-05-20 |
| P1-22 | `[F-6]` renderer.js sendMessage() 改造为流式实时打字效果 | ui | ✅ 2026-05-20 |
| P1-23 | `[F-6]` hermes-adapter sendMessageStream 完整端到端集成 | adapters | ✅ 2026-05-20 |
| P1-24 | `[F-6]` Agent 信息面板：识别当前使用的模型名称 | adapters + ui | ✅ 2026-05-20 |
| P1-25 | `[F-6]` Agent 信息面板：展示输入窗口最大长度 + 上下文占用比例 | adapters + ui | ✅ 2026-05-20 |
| P1-26 | `[F-7]` 模型切换支持开发（Hermes 可用模型列表 + 切换器 UI） | adapters + ui | ✅ 2026-05-21 |

### 优先级 P2 — 体验优化

| # | 任务 | 模块 | 标记 |
|---|------|------|------|
| P2-1 | 系统托盘图标 + 最小化到托盘 | main | ✅ 2026-05-18 |
| P2-2 | ❌ 开机自启动（已取消）| main + config | ❌ |
| P2-2a | 启动端口冲突检测 + 提示关闭旧进程（避免多开）| main + gateway-manager | ✅ |
| P2-3 | 适配器状态实时刷新（轮询/事件驱动） | gateway-manager | ✅ 2026-05-18 |
| P2-4 | ~~内存/CPU 使用率显示~~ → 已合并至 P3-3 | ui | 🔀
| P2-5 | 聊天消息持久化（历史记录） | ui + config | ✅ 2026-05-20 |
| P2-6 | 引入 Markdown 渲染（marked 代码高亮） | ui | ✅ 2026-05-20 |
| P2-7 | [F-9] 设置页面重构：二级菜单（左侧 AI 软件按钮 / 右侧对应配置数据） | ui | 📅 |

| P2-8 | 📋 消息复制按钮：每条 AI 回复底部 + 顶部提供一键复制 | ui | 📅 |
> **P2-7 设计要点：**
> - 当前：所有 AI 配置堆在一个长页面 → 后期 AI 多了会无限拉长
> - 改为**二级菜单布局**：左侧是大块配置数据区，右侧是竖排 AI 软件图标按钮（窄栏）
> - 右侧按钮：点击切换左侧面板内容 → 对应 AI 的配置文件数据（路径、端口、模型列表、超时）
> - 消除最右侧的空白区域，右侧图标按钮栏可紧凑竖排

### 优先级 P3 — 扩展

| # | 任务 | 模块 | 标记 |
|---|------|------|------|
| P3-1 | 新增 Cursor 适配器 | adapters | ✅ 2026-05-18 |
| P3-2 | 新增 Windsurf 适配器 | adapters | 📅 |
| P3-3 | AI 进程性能监控面板（CPU/内存/网络 + 历史趋势图）| ui + detectors | 📅 |
| P3-4 | 跨 AI 上下文传递 | adapters + manager | 📅 |
| P3-5 | ~~macOS/Linux 全面适配测试~~ → 已取消：仅 Windows，不跨平台 | all | ❌ |
| P3-6 | Hermes gateway 从 Echora 启动/停止（hermes gateway run --replace） | adapters | ✅ |
| P3-7 | [F-8] Hermes profile Agent 完整集成（详情见下） | adapters + detectors + ui | 🔧 |

### 优先级 P1 — 核心功能（续）

| # | 任务 | 模块 | 标记 |
|---|------|------|------|
| P1-27 | [F-8] Hermes profile Agent 端到端：检测→状态→启动→对话 | adapters + detectors + ui | 📅 |

| P1-28 | 🛑 停止生成按钮：前端发送中断信号（Hermes Ctrl+C 等价操作） | ui + main + adapters | 📅 |
| P1-29 | 🔀 不同 AI 软件差异化会话窗口：Hermes 模型切换绑新建会话 / QClaw 不暴露模型列表 | ui + adapters | 🔧 |
> **P1-27 子任务拆解：**
> 1. AIDetector 识别 profiles 目录下的 agent → 渲染为独立 Agent 卡片（带 profile 名称）
> 2. Profile Agent 未运行时：灰色灯 + 点击聊天区显示「▶️ 启动 minmin」（而非当前「Agent 未启动」通用提示）
> 3. `gateway:start` 支持传 profile 参数 → `hermes -p minmin gateway run --replace`
> 4. 启动后状态灯由灰变绿，自动切到聊天界面
> 5. 端口隔离：不同 profile 用不同 API_SERVER_PORT，避免冲突
| P3-8 | [F-4] Hermes Gateway API Server 集成（端口 8083 + 会话管理 + 502降级） | adapters | ✅ |
| P3-9 | [F-5] Hermes 状态检测修复：gateway_state.json + PID 存活检测 + 定期轮询 | adapters + main | ✅ 2026-05-20 |
| P3-10 | [F-5] 定期轮询加入 Hermes adapter.getStatus() 实时状态同步 | main | ✅ 2026-05-20 |
| P3-11 | [F-5] gateway:start 传递 exePath 给 Hermes adapter | main | ✅ 2026-05-20 |

---

## ✅ 已完成 (Done)

| # | 任务 | 完成日期 | 标记 |
|---|------|----------|------|
| | 项目文档体系 (蓝图+索引+看板) | 2026-05-17 | ✅ |
| P0-1 | 修复 openclaw-adapter.js exePath 字段读取 | 2026-05-18 | ✅ |
| P0-2 | 修正 API 路径（/health、/v1/chat/completions、Bearer Token）| 2026-05-18 | ✅ |
| P0-3 | 流式接收机制（SSE / sendMessageStream）| 2026-05-18 | ✅ |
| P1-1 | 消息发送通道（renderer → main → adapter → QClaw）| 2026-05-18 | ✅ |
| P1-2 | 消息接收渲染（IPC → renderer addMessage）| 2026-05-18 | ✅ |
| P1-3 | Agent 列表枚举和切换 | 2026-05-18 | ✅ |
| P2-1 | 系统托盘图标 + 最小化到托盘 | 2026-05-18 | ✅ |
| P2-3 | 适配器状态实时刷新（10秒轮询）| 2026-05-18 | ✅ |
| P3-1 | Cursor 适配器 + Windsurf/Trae 进程检测 | 2026-05-18 | ✅ |
| | Skill 体系拆分（project-dev v2.0 合一架构）| 2026-05-18 | ✅ |
| P1-8~11 | Sprint 3 [F-1] 系统设置面板完整交付（ConfigManager+config-reader+IPC+UI+CSS+超时接入+验证）| 2026-05-19 | ✅ |
| P1-12~15 | [F-2] Hermes Agent 后端+UI 集成（AIDetector+config-reader YAML+hermes-adapter.js+Settings Hermes专区）| 2026-05-19 | ✅ |

---

## ⚠️ 阻塞项 (Blocked)

| # | 阻塞项 | 阻塞原因 | 依赖 |
|---|--------|----------|------|
| B-1 | ~~OpenClaw/QClaw Gateway API 路径~~ | ~~`/api/status` 返回 404~~ | ✅ 已解决：端点确认为 `/health` + `/v1/chat/completions` |
| B-2 | ~~Hermes HTTP API~~ | ~~proxy 不支持自定义 provider~~ | ✅ 已解决：改用 Gateway API Server (端口 8083) |

---

## 当前 Sprint (Sprint 3: 2026-05-19 ~ 05-21)

**目标**: 系统设置面板上线（超时可调、配置文件只读、参数暴露）

**计划**:
```
S-1 ConfigManager扩展 → S-2 config-reader → S-3 IPC通道 → S-4 UI重构 → S-5 CSS → S-6 超时接入 → S-7 验证
```

**任务**: P1-8, P1-9, P1-10, P1-11  
**详细方案**: `docs/v0.4-settings-plan.md`

**已完成 Sprint 3** ([F-1] 系统设置面板): ✅ 全部 7 子任务交付
```
S-1 ConfigManager扩展 → S-2 config-reader → S-3 IPC通道 → S-4 UI重构 → S-5 CSS → S-6 超时接入 → S-7 验证
```

**已完成 [F-2] Hermes Agent 识别** (后端+UI): ✅ 4 核心任务交付
```
P1-12 AIDetector Hermes检测 → P1-13 config-reader YAML+profiles → P1-14 hermes-adapter.js → P1-15 Settings Hermes专区
```

**已完成 Sprint 2** (2026-05-17 ~ 05-18):
```
P1-3 (Agent选择) → P2-1 (系统托盘) → P2-3 (状态轮询) → P3-1 (Cursor适配)
```

---

## 当前 Sprint (Sprint 4: 2026-05-19 ~ 05-21)

**目标**: AI 网关自动发现 + 新软件提示添加

**计划**:
```
S-1 port-scanner → S-2 state-reader → S-3 AIDetector集成 → S-4 IPC+弹窗 → S-5 config动态添加 → S-6 文档+验证
```

**任务**: P1-16, P1-17, P1-18, P1-19, P1-20

**已完成 Sprint 4** ([F-3] AI 网关自动发现): ✅ 全部 5 子任务交付
```
P1-16 port-scanner → P1-17 state-reader → P1-18 AIDetector三层集成 → P1-19 IPC+弹窗UI → P1-20 动态注册
```

---

## 当前 Sprint (Sprint 5: 2026-05-20 ~ 05-23)

**目标**: 对话体验核心升级 — 流式渲染 + Markdown + 模型信息面板

**技术调研结果**:
- Hermes `/v1/capabilities`: `chat_completions_streaming: true` ✅
- Hermes `/health/detailed`: 端口 8083, PID 15576, API Server connected ✅
- Hermes 底层模型: `deepseek-ai/deepseek-v4-pro` (1M token 上下文窗口)
- OpenClaw adapter 已有 `sendMessageStream` 实现
- renderer 当前仅支持 `message:send`（非流式），需改造

**计划**:
```
S-1 message:sendStream IPC → S-2 renderer 流式渲染 → S-3 hermes adapter 端到端 → S-4 Markdown 渲染 → S-5 模型信息面板 → S-6 模型切换方案
```

**任务**: P1-21, P1-22, P1-23, P2-6, P1-24, P1-25, P1-26

---

## 变更记录

| 日期 | 变更 | 作者 |
|------|------|------|
| 2026-05-17 | 创建看板，整理全部历史任务 | AI |
| 2026-05-18 | P0-1~P0-3 + P1-1~P1-2 完成，消息通道打通 | AI |
| 2026-05-18 | Sprint 2 完成: P1-3 + P2-1 + P2-3 + P3-1 全部交付 | AI |
| 2026-05-18 | P1-5~P1-7 完成：启动器 + 闭合验证 + EVOLUTION 升格提醒 | AI |
| 2026-05-19 | v0.3.4: 会话上下文(user字段)、会话管理视图、超时120s | AI |
| 2026-05-19 | KANBAN 合并: P2-4+P3-3 → 统一性能监控面板；P1-8~11 标 `[F-1]` | AI |
| 2026-05-19 | Sprint 3 [F-1] 全部完成: P1-8~P1-11 (config-reader/IPC/CSS/renderer超时接入/5文件验证0错误) | AI |
| 2026-05-19 | [F-2] Hermes Agent 后端+UI 完成: P1-12~P1-15 (hermes-adapter/js-yaml/Settings专区/全部语法通过) | AI |
| 2026-05-19 | 接力交接: 小雪接手开发，commit `4d1077d`，交接记录 `task-artifact_2026-05-19_handoff-to-xue.md` | 小雪 |
| 2026-05-19 | Sprint 4 [F-3] AI 网关自动发现: port-scanner/state-reader/AIDetector三层集成/IPC+弹窗UI/动态注册，6文件新建+修改，全部语法通过 | 小雪 |
| 2026-05-19~20 | [F-4] Hermes Gateway API Server 集成完整交付（adapter v1→v2→v3 三次重写） | 小雪 |
| 2026-05-20 | 修复: 502截断降级流式/API Key/--replace/timeout从config读取 | 小雪 |
| 2026-05-20 | .env: API_SERVER_ENABLED + API_SERVER_KEY + GATEWAY_ALLOW_ALL_USERS | 小雪 |
| 2026-05-19 | Sprint 4 [F-3] AI 网关自动发现: port-scanner/state-reader/AIDetector三层集成/IPC+弹窗UI/动态注册，6文件新建+修改，全部语法通过 | 小雪 |
| 2026-05-20 | [F-5] v0.3.5: Hermes 状态检测修复（gateway_state.json+PID检测）、定期轮询实时同步、gateway:start传exePath、会话隔离验证通过 | 小雪 |
| 2026-05-20 | Sprint 5 立项: 流式渲染(P1-21~23) + Markdown(P2-6) + 模型信息面板(P1-24~25) + 模型切换(P1-26) | QClaw |
| 2026-05-20 | Hermes API 验证: /v1/capabilities 确认 streaming/run/model 全部可用 | QClaw |
| 2026-05-20 | 导入 Hermes 知识库: API Server 规格、会话端口隔离、网关知识、集成发现 | QClaw |
| 2026-05-21 | 🐛 Bug 修复: preload.js `require('marked')` 导致 contextBridge 崩溃 → CDN 方案 | QClaw |
| 2026-05-21 | 流式 Bug: hermes-adapter sendMessageStream `_emitMessage()` 重复推送 3 条消息 | QClaw |
| 2026-05-21 | 流式 Bug: Hermes 启动 10s 延迟 → `getOrCreateAdapter('hermes')` 懒创建修复 | QClaw |
| 2026-05-21 | Skill v2.3: 合并 development-conventions.md 入 DEVELOPMENT.md + Anti-Patterns+3 + B-4+2 + B-5.5+2 | QClaw |
| 2026-05-21 | Skill v2.4: 闭环写入机制 — 读即责任 + B-5 映射表 + B-5.5 日期强制检查 + Anti-Pattern 文档腐烂 | QClaw |
| 2026-05-21 | B-5 映射表修复: 去硬编码项目路径 → 通用化引用 MASTER.md | QClaw |
| 2026-05-21 | docs/code-index/renderer.md + preload.md 闭环更新至 05/21（流式API/Markdown/Agent管理/会话管理） | QClaw |
| 2026-05-21 | P0-4 已验证、hermes-adapter model.default 修复、P1-26 模型切换器交付 | QClaw |

| 2026-05-21 | 新增 4 任务: P0-6(流式状态检测) P1-28(停止生成) P1-29(差异化会话窗口) P2-8(复制按钮) | QClaw |
| 2026-05-21 | P1-29 差异化模型切换: base-adapter switchModel() + hermes-adapter config.yaml改写+Gateway重启 + renderer加载动画+输入禁用 | 小雪 |

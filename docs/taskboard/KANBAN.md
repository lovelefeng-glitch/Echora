# 任务看板

> **最后更新**: 2026-05-19  
> **活跃开发者**: ohfen

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

### 优先级 P2 — 体验优化

| # | 任务 | 模块 | 标记 |
|---|------|------|------|
| P2-1 | 系统托盘图标 + 最小化到托盘 | main | ✅ 2026-05-18 |
| P2-2 | ❌ 开机自启动（已取消）| main + config | ❌ |
| P2-2a | 启动端口冲突检测 + 提示关闭旧进程（避免多开）| main + gateway-manager | ✅ |
| P2-3 | 适配器状态实时刷新（轮询/事件驱动） | gateway-manager | ✅ 2026-05-18 |
| P2-4 | ~~内存/CPU 使用率显示~~ → 已合并至 P3-3 | ui | 🔀
| P2-5 | 聊天消息持久化（历史记录） | ui + config | 📅 |

### 优先级 P3 — 扩展

| # | 任务 | 模块 | 标记 |
|---|------|------|------|
| P3-1 | 新增 Cursor 适配器 | adapters | ✅ 2026-05-18 |
| P3-2 | 新增 Windsurf 适配器 | adapters | 📅 |
| P3-3 | AI 进程性能监控面板（CPU/内存/网络 + 历史趋势图）| ui + detectors | 📅 |
| P3-4 | 跨 AI 上下文传递 | adapters + manager | 📅 |
| P3-5 | macOS/Linux 全面适配测试 | all | 📅 |
| P3-6 | Hermes gateway 从 Echora 启动/停止（`hermes gateway run --platform api_server`） | gateway-manager | 📅 |
| P3-7 | Hermes profile 切换（`hermes -p minmin gateway run`） | adapters | 📅 |

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
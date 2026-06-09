# Echora 2.0 任务看板

> **最后更新**: 2026-06-09
> **当前 Sprint**: Sprint 11 — Echora Agent 核心能力提升（🔧 测试中）

| 标记 | 含义 |
|------|------|
| 📅 | 计划中 |
| 🔧 | 开发中 |
| ✅ | 已完成 |
| ⚠️ | 阻塞 |
| 🐛 | Bug 修复 |

---

## 📅 新增任务：Claude-Hermes-OpenClaw 独立通讯系统

> **优先级**: P1（核心基础设施）
> **开始时间**: 2026-06-09 10:00
> **目标**: 即使 Echora 关闭，Claude 也能和 Hermes/OpenClaw 通讯

### Phase 1：基础通讯层 📅 计划中

| # | 任务 | 状态 | 说明 |
|---|------|------|------|
| 45 | MCP 服务器骨架 | 📅 计划中 | 创建 claude-collab 项目结构 |
| 46 | HTTP 客户端 | 📅 计划中 | 封装 Hermes/OpenClaw API 调用 |
| 47 | ask_hermes 工具 | 📅 计划中 | Claude 向 Hermes 发送消息 |
| 48 | ask_openclaw 工具 | 📅 计划中 | Claude 向 OpenClaw 发送消息 |
| 49 | check_status 工具 | 📅 计划中 | 检查 AI 运行状态 |

### 依赖关系

```
Phase 1 (通讯层) ← Phase 2 (异步任务) ← Phase 3 (工作流)
       ↓                    ↓                    ↓
    基础通讯              任务管理             自动化开发
```

---

## 🔧 测试中：Sprint 11 — Echora Agent 核心能力提升
> **开始时间**: 2026-06-08
> **测试开始时间**: 2026-06-08 23:30
> **目标**: 补齐 P0 工具 + 迁移存储到 SQLite

### Phase 1：存储层迁移（SQLite）🔧 测试中

| # | 任务 | 状态 | 说明 |
|---|------|------|------|
| 38 | 会话持久化迁移 SQLite | 🔧 测试中 (2026-06-08 23:30) | JSONL → SQLite，支持 FTS5 全文搜索 |
| 39 | 记忆系统迁移 SQLite | 🔧 测试中 (2026-06-08 23:30) | JSON → SQLite，支持 FTS5 全文搜索 |

### Phase 2：核心工具补充 🔧 测试中

| # | 工具 | 状态 | 说明 |
|---|------|------|------|
| 40 | file_list 工具 | 🔧 测试中 (2026-06-08 23:30) | 目录浏览 + glob/正则文件搜索 |
| 41 | file_edit 工具 | 🔧 测试中 (2026-06-08 23:30) | 文件局部编辑（find & replace） |
| 42 | terminal 工具 | 🔧 测试中 (2026-06-08 23:30) | 通用终端执行（bash/cmd，非仅 PowerShell） |

### Phase 3：完善 Agent Loop 🔧 测试中

| # | 任务 | 状态 | 说明 |
|---|------|------|------|
| 43 | 上下文压缩实现 | 🔧 测试中 (2026-06-08 23:30) | 摘要+截断，TokenCounter 精确计算 |
| 44 | 错误恢复机制 | 🔧 测试中 (2026-06-08 23:30) | jittered_backoff 重试 + 错误分类器 |

### 依赖关系

```
Phase 1 (SQLite) ← Phase 2 (工具) ← Phase 3 (Agent Loop)
     ↓                   ↓                   ↓
  存储基础            功能增强            稳定性提升
```

### Bug 修复

| # | 任务 | 状态 | 说明 |
|---|------|------|------|
| 45 | Token 显示修复（mimo 数据被覆盖） | 🔧 测试中 (2026-06-09 18:59) | 修复 formatUsage 函数 falsy 判断 + MessageBubble 0 值显示 |
| 46 | Echora Agent 架构分离标注 | 🔧 测试中 (2026-06-09) | 代码归属注释 + MASTER.md 两条路径对比表 |

---

## ✅ 已完成（Sprint 10）

> 从 .trae/specs/ 整理，大部分任务已完成

| # | 任务 | 状态 | 来源 |
|---|------|------|------|
| 1 | ChatInput 工具栏功能实现（附件、模型、技能按钮） | ✅ | specs/chat-input-toolbar |
| 2 | 多 Agent 会话隔离修复 | ✅ | specs/fix-multi-agent-session-isolation |
| 3 | Hermes 模型切换 UI 适配 | ✅ | specs/hermes-model-switch-ui |
| 4 | Hermes Profile Agent ID 统一 + 禁止创建目录 | ✅ | specs/hermes-profile-id-fix |
| 5 | TokenLabel 完善 + 状态行动画 + 模型切换准备 | ✅ | specs/hermes-tokenlabel-and-status |
| 6 | OpenClaw 斜杠命令支持 + 模型按钮错误修复 | ✅ | specs/openclaw-slash-commands |
| 7 | UI 交互优化：网关状态反馈 + 列表布局 + 通知特效 | ✅ | specs/ui-gateway-feedback-and-layout |
| 8 | Electron 升级 v33→v42.3.3（性能+安全+ESM） | ✅ | task-artifact_electron-upgrade-v42 |

---

## ✅ 已完成（2026-06-07 补充）
> **最后更新**: 2026-06-07 25:40

| # | 任务 | 状态 | 来源 |
|---|------|------|------|
| 8 | Echora Agent 状态显示 Bug 修复 | ✅ | WorkBuddy 修复 |
| 9 | Echora Agent 适配器配置修复 | ✅ | WorkBuddy 修复 |
| 10 | 深度源代码架构分析 | ✅ | WorkBuddy 分析 |
| 11 | project-dev 技能优化 | ✅ | WorkBuddy 优化 |

## ✅ 已完成（2026-06-08）
> **完成时间**: 2026-06-08

| # | 任务 | 状态 | 说明 |
|---|------|------|------|
| 12 | 并排预览功能（PreviewPane） | ✅ | Phase 1-5 已开发并测试通过 |
| 14 | 文件浏览器 | ✅ | FileExplorer 组件，真实文件系统，状态持久化 |
| 15 | 工具面板深度优化 | ✅ | 终端/文件/图片预览深度优化 |
| 15a | 图片预览（拍立得弹窗） | ✅ | 图片文件点击显示拍立得风格弹窗，base64 加载，主题适配 |
| 15b | 控制台日志查看 | ✅ | 实时显示 console 输出，支持过滤/搜索/清空 |

---

## 📅 计划中（文件预览扩展）
> **添加时间**: 2026-06-08

| # | 任务 | 状态 | 说明 |
|---|------|------|------|
| 16 | PDF 文件预览 | 📅 | 内置 PDF 查看器 |
| 17 | 视频文件预览 | 📅 | mp4/webm/mov 内置播放器 |
| 18 | 音频文件预览 | 📅 | mp3/wav/ogg 内置播放器 |
| 19 | Office 文件处理 | 📅 | docx/xlsx/pptx 调用系统默认程序 |

## ⏸️ 暂停
| # | 任务 | 暂停原因 |
|---|------|----------|
| 13 | 思考过程显示 | 测试困难，暂时暂停 |

---

## 📅 Backlog（待规划）
> **最后更新**: 2026-06-08 19:00
> **来源**: Echora vs Hermes 桌面版功能对比分析

### P0 — 核心体验提升

| # | 任务 | 优先级 | 说明 | 参考 |
|---|------|--------|------|------|
| 20 | Command Palette（快捷命令面板） | P0 | Ctrl+K 搜索所有功能，比翻菜单快 | Hermes command-center |
| 21 | 内置终端 | P0 | 右侧栏集成终端，不用切窗口执行命令 | Hermes right-sidebar/terminal |

### P1 — 效率提升

| # | 任务 | 优先级 | 说明 | 参考 |
|---|------|--------|------|------|
| 22 | Artifacts 页面 | P1 | 集中展示对话中产生的图片/文件/链接 | Hermes artifacts |
| 23 | 内置更新 | P1 | 自动检查新版本 + 一键升级 | Hermes updates-overlay |
| 24 | Profile 管理 | P1 | 多配置文件切换（不同模型/API Key 组合） | Hermes profiles |

### P2 — 体验完善

| # | 任务 | 优先级 | 说明 | 参考 |
|---|------|--------|------|------|
| 25 | Cron 任务管理 | P2 | 可视化查看/管理定时任务 | Hermes cron |
| 26 | 语音输入/输出 | P2 | 说话给 AI，AI 语音回复 | Hermes voice |
| 27 | 多语言 i18n | P2 | 中英文切换 | Hermes i18n |
| 28 | 通知系统 | P2 | 优雅的 toast 通知（成功/警告/错误） | Hermes notifications |
| 29 | Model Picker 覆盖层 | P2 | 更丰富的模型选择 UI | Hermes model-picker |
| 30 | Gateway 连接状态覆盖层 | P2 | 连接中/断开的全屏提示 | Hermes gateway-connecting-overlay |

### P3 — 已有但可优化

| # | 任务 | 优先级 | 说明 | 参考 |
|---|------|--------|------|------|
| 31 | 文件浏览器增强 | P3 | 当前已有基础版，可增强：右键菜单、拖拽、批量操作 | Hermes files/tree |
| 32 | 预览面板增强 | P3 | 当前已有 webview/代码/控制台，可增加：Markdown 渲染、JSON 格式化 | Hermes right-rail |
| 33 | 对话历史搜索增强 | P3 | 当前已有基础搜索，可增加：按时间范围、按 AI 类型筛选 | Hermes session search |

### 文件预览扩展（已规划）

| # | 任务 | 状态 | 说明 |
|---|------|------|------|
| 16 | PDF 文件预览 | 📅 | 内置 PDF 查看器 |
| 17 | 视频文件预览 | 📅 | mp4/webm/mov 内置播放器 |
| 18 | 音频文件预览 | 📅 | mp3/wav/ogg 内置播放器 |
| 19 | Office 文件处理 | 📅 | docx/xlsx/pptx 调用系统默认程序 |

### 文档与质量

| # | 任务 | 优先级 | 说明 |
|---|------|--------|------|
| 34 | 文档同步：更新 BLUEPRINT.md 和 MASTER.md | P1 | 根据架构分析报告更新现有文档 |
| 35 | 文档同步：.trae/ 资产整合到 docs/ | P2 | 将 .trae/documents/ 和 .trae/rules/ 有价值内容整合 |
| 36 | 测试覆盖率提升 | P2 | 补充单元测试和 E2E 测试 |
| 37 | 首次引导完善 | P2 | 新用户引导流程 |

---

## ⏸️ 暂停
| # | 任务 | 暂停原因 |
|---|------|----------|
| 13 | 思考过程显示 | 测试困难，暂时暂停 |
| 手动移除 OpenClaw 后自动检测未识别有效路径 | ⚠️ 待观察 | .trae/memory/PENDING.md |
| 流式回调不能被 currentAgentKey 门控 | ✅ 已知规则 | .trae/skills/references/ |
| Flex 高度链必须每层 flex:1 + min-height:0 | ✅ 已知规则 | .trae/skills/references/ |

---

## 📝 变更记录

| 日期 | 变更 |
|------|------|
| 2026-06-07 25:30 | 工具面板深度优化完成：文件浏览器（真实文件系统）、终端（过滤/搜索）、思考过程（多步展示） |
| 2026-06-07 24:40 | 创建设计规则文档 `docs/conventions/DESIGN-RULES.md`，统一按钮/间距/颜色/字体规范 |
| 2026-06-07 24:25 | UI 调整：按钮顺序改为 主题→工具面板，工具面板内部刷新/关闭在上，功能切换在下 |
| 2026-06-07 24:10 | Phase 5 触发逻辑完成：Ctrl+P 快捷键切换预览面板 |
| 2026-06-07 24:05 | Phase 4 控制台预览完成：ConsolePreview 组件（实时日志、自动滚动） |
| 2026-06-07 24:02 | Phase 3 代码预览完成：CodePreview 组件（Shiki 语法高亮）、语言自动检测 |
| 2026-06-07 23:58 | Phase 2 网页预览完成：WebPreview 组件、webview 启用、CSS 样式 |
| 2026-06-07 23:55 | Phase 1 并排预览基础框架完成：Store 扩展、PreviewPane 组件、CSS 样式、App.tsx 集成 |
| 2026-06-07 | 补充 2026-06-07 修复和分析任务，更新 Backlog |
| 2026-06-06 | 初始化 KANBAN，从 .trae/specs/ 整理已完成任务 |

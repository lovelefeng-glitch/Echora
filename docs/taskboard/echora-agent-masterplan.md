# Echora Agent 完善计划

> 创建时间：2026-06-08
> 最后更新：2026-06-08 23:30
> 状态：Sprint 11 已完成 ✅
> 目标：将 Echora 内置 Agent 从"婴儿期"提升到"成熟期"

---

## 一、当前状态（Sprint 11 完成后）

### 已有工具（12 个）

| 工具 | 功能 | 状态 | 新增时间 |
|------|------|------|---------|
| web_search | 网页搜索 | ✅ | 原有 |
| web_fetch | 网页抓取 | ✅ | 原有 |
| file_read | 文件读取 | ✅ | 原有 |
| file_write | 文件写入 | ✅ | 原有 |
| calc | 计算器 | ✅ | 原有 |
| code_execute | 代码执行 | ✅ | 原有 |
| powershell_execute | PowerShell | ✅ | 原有 |
| kb_search | 知识库搜索 | ⚠️ 占位 | 原有 |
| system_info | 系统信息 | ✅ | 原有 |
| **file_list** | 目录浏览 + 文件搜索 | ✅ | Sprint 11 Phase 2 |
| **file_edit** | 文件局部编辑 | ✅ | Sprint 11 Phase 2 |
| **terminal** | 通用终端执行 | ✅ | Sprint 11 Phase 2 |

### 已有基础设施

- AgentLoop（ReAct 框架：Observe → Think → Act）
- AgentManager（生命周期管理）
- **SQLite 存储层**（可插拔架构，Sprint 11 Phase 1）
  - SessionStore 接口 + SqliteSessionStore 实现
  - MemoryStore 接口 + SqliteMemoryStore 实现
  - ContextCompressor 接口 + SummaryCompressor 实现
  - FTS5 全文搜索支持
- **TokenCounter**（精确 token 计数，Sprint 11 Phase 3）
- **retryWithBackoff**（jittered_backoff 重试，Sprint 11 Phase 3）
- **ErrorClassifier**（错误分类器，Sprint 11 Phase 3）
- ToolRegistry（工具注册中心）
- Planner（规划器）
- ToolCallParser（工具调用解析）
- ToolConfirm（工具执行前确认）
- ToolRegistry（工具注册中心）
- Planner（规划器）
- ToolCallParser（工具调用解析）
- ToolConfirm（工具执行前确认）

---

## 二、缺失工具清单（来自 Hermes 对比）

### P0 — 核心工具（立即补充）

| # | 工具名 | 功能 | 工作量 | 说明 |
|---|--------|------|--------|------|
| 1 | file_list | 目录浏览 + 文件搜索 | 小 | 支持 glob/正则，当前 file_read 只能读单个文件 |
| 2 | file_edit | 文件局部编辑 | 小 | find & replace，不用重写整个文件 |
| 3 | terminal | 通用终端执行 | 中 | 不限于 PowerShell，支持 bash/cmd |

### P1 — 效率工具（尽快补充）

| # | 工具名 | 功能 | 工作量 | 说明 |
|---|--------|------|--------|------|
| 4 | todo | 任务规划和跟踪 | 中 | 类似 Hermes 的 todo_tool |
| 5 | memory_tool化 | 记忆管理暴露为工具 | 小 | 当前 MemoryManager 是内部的，需要暴露 |
| 6 | session_search | 跨会话搜索历史 | 中 | 检索过去的对话记录 |

### P2 — 增强工具（后续完善）

| # | 工具名 | 功能 | 说明 |
|---|--------|------|------|
| 7 | image_generation | 图片生成 | 调用 DALL-E/Midjourney/Stable Diffusion |
| 8 | tts | 语音合成 | 文字转语音 |
| 9 | vision | 图片理解 | 分析图片内容 |
| 10 | browser | 浏览器自动化 | 自动操作网页（Hermes 有 browser_tool） |
| 11 | delegate | 子代理委派 | 复杂任务拆分给子代理 |
| 12 | web_edit | 网页内容编辑 | 修改本地 HTML/CSS/JS |
| 13 | git | Git 操作 | 提交、分支、查看历史 |
| 14 | database | 数据库操作 | 查询和修改数据 |
| 15 | api_call | API 调用 | 通用 HTTP 请求 |
| 16 | email | 邮件收发 | IMAP/SMTP |
| 17 | calendar | 日历管理 | 创建/查看事件 |
| 18 | notification | 系统通知 | 桌面通知推送 |

---

## 三、基础设施完善清单

| # | 能力 | 当前状态 | 目标 | 优先级 |
|---|------|---------|------|--------|
| 1 | 上下文压缩 | 有配置项 | 完整实现（摘要+截断） | P0 |
| 2 | 错误恢复 | 基础 | 重试+降级+用户提示 | P0 |
| 3 | 流式输出 | ✅ | 保持 | - |
| 4 | 工具确认 | ✅ | 保持 | - |
| 5 | 会话历史 | 20轮限制 | 可配置+智能截断 | P1 |
| 6 | 多轮规划 | 有 Planner | 完善规划策略 | P1 |
| 7 | 并行工具调用 | 不支持 | 支持同时调用多个工具 | P2 |
| 8 | 工具结果缓存 | 不支持 | 相同请求缓存结果 | P2 |
| 9 | Token 预算管理 | 基础 | 精细化控制 | P2 |

---

## 四、UI 功能完善清单（来自 Hermes 对比）

### P0 — 核心体验

| # | 功能 | 说明 | 参考 |
|---|------|------|------|
| 1 | Command Palette | Ctrl+K 快捷命令面板 | Hermes command-center |
| 2 | 内置终端 | 右侧栏集成终端 | Hermes right-sidebar/terminal |

### P1 — 效率提升

| # | 功能 | 说明 | 参考 |
|---|------|------|------|
| 3 | Artifacts 页面 | 集中管理对话产出 | Hermes artifacts |
| 4 | 内置更新 | 自动检查+一键升级 | Hermes updates-overlay |
| 5 | Profile 管理 | 多配置文件切换 | Hermes profiles |

### P2 — 体验完善

| # | 功能 | 说明 | 参考 |
|---|------|------|------|
| 6 | Cron 任务管理 | 可视化定时任务 | Hermes cron |
| 7 | 语音输入/输出 | 说话给 AI | Hermes voice |
| 8 | 多语言 i18n | 中英文切换 | Hermes i18n |
| 9 | 通知系统 | Toast 通知 | Hermes notifications |
| 10 | Model Picker | 模型选择覆盖层 | Hermes model-picker |
| 11 | Gateway 连接状态 | 连接中/断开提示 | Hermes gateway-connecting-overlay |

### P3 — 已有优化

| # | 功能 | 说明 |
|---|------|------|
| 12 | 文件浏览器增强 | 右键菜单、拖拽、批量操作 |
| 13 | 预览面板增强 | Markdown 渲染、JSON 格式化 |
| 14 | 对话搜索增强 | 按时间范围、按 AI 类型筛选 |

---

## 五、开发路线图

### 阶段 1：补工具（1-2 周）
```
file_list + file_edit + terminal
→ Echora Agent 能力提升 50%
```

### 阶段 2：完善 Agent Loop（1 周）
```
上下文压缩 + 错误恢复 + 会话历史优化
→ Echora Agent 稳定性提升
```

### 阶段 3：借鉴 Hermes UI（2-3 周）
```
Command Palette + 内置终端 + Artifacts
→ Echora 整体体验提升
```

### 阶段 4：优化其他 Agent（持续）
```
用 Echora Agent 的经验优化 Hermes/OpenClaw 接入
→ 统一体验
```

---

## 六、关键参考资源

### Hermes 源码（本地）
- 路径：C:\Users\ohfen\AppData\Local\hermes\hermes-agent\
- 工具实现：tools/*.py
- Agent 核心：run_agent.py
- 桌面版 UI：apps/desktop/src/

### 开源 Agent 参考
- Claude Code：tool_use 模式
- Cursor：代码编辑工具
- Windsurf：浏览器自动化
- Aider：Git 集成
- Open Interpreter：代码执行

### 设计文档
- Echora 架构：docs/ARCHITECTURE.md
- Echora 蓝图：docs/BLUEPRINT.md
- 开发公约：docs/conventions/DEVELOPMENT.md
- 设计规则：docs/conventions/DESIGN-RULES.md

---

## 七、有趣的功能点子 💡

> 研究 Agent 真的太有意思了！以下是一些值得探索的方向：

1. **Agent 自我进化** — Agent 能学习用户习惯，自动优化工具选择
2. **多 Agent 协作** — Echora Agent 可以调用 Hermes Agent 协作完成任务
3. **Agent 记忆网络** — 不同会话的记忆可以关联和推理
4. **Agent 技能商店** — 用户可以分享和下载 Agent 技能
5. **Agent 可视化** — 实时显示 Agent 的思考过程和决策树
6. **Agent 安全沙箱** — 工具执行在隔离环境中，防止误操作
7. **Agent 性能分析** — 统计每个工具的使用频率和成功率
8. **Agent 个性化** — 不同用户有不同的 Agent 性格和风格

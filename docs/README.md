# Echora 开发文档体系

> **入口**: 任何开发任务，从本文档开始查找所需信息。

---

## 快速导航

### 新人接手 / AI 开发

| 问题 | 去读 |
|------|------|
| 项目是什么？架构长啥样？ | [📘 BLUEPRINT.md](BLUEPRINT.md) |
| 有哪些模块？各做什么？ | [📚 code-index/MASTER.md](code-index/MASTER.md) |
| 数据结构长什么样？（⚠️最重要） | BLUEPRINT.md → 第四节 |
| 开发时不能做什么？字段名怎么写？ | [🚨 conventions/DEVELOPMENT.md](conventions/DEVELOPMENT.md) |
| 现在有哪些任务？下一步做什么？ | [📋 taskboard/KANBAN.md](taskboard/KANBAN.md) |

### 改特定模块

| 模块 | 文档 |
|------|------|
| 主进程 / IPC / 启动流程 | BLUEPRINT.md + [code-index/MASTER.md](code-index/MASTER.md) |
| AI 检测器 | [code-index/ai-detector.md](code-index/ai-detector.md) |
| 网关管理器 | [code-index/gateway-manager.md](code-index/gateway-manager.md) |
| 配置管理 | [code-index/config-manager.md](code-index/config-manager.md) |
| 环境检查 | [code-index/env-checker.md](code-index/env-checker.md) |
| AI 适配器（Base + OpenClaw） | [code-index/adapters.md](code-index/adapters.md) |
| 渲染进程 / UI | [code-index/renderer.md](code-index/renderer.md) |
| preload / IPC 桥梁 | [code-index/preload.md](code-index/preload.md) |

---

## 工作流（AI 开发 SOP）

```
1. 读 BLUEPRINT.md → 了解整体
2. 读对应模块文档 → 确认接口/数据结构
3. 读 DEVELOPMENT.md → 确认约束
4. 查 KANBAN.md → 确认当前 sprint 任务
5. 开发 → 改代码 + 改文档 + 记变更
6. node -c 语法检查
7. 提交: 代码 + 文档 + 变更记录 三合一
```

---

**⚠️ 核心原则**: 代码是文档的具象化。代码不正确 = 文档不正确。文档不正确 = 一切开发基于幻觉。
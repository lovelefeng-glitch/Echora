# Echora 2.0 开发文档体系

> **入口**: 任何开发任务，从本文档开始。
> **最后更新**: 2026-06-06

## 快速导航

| 问题 | 去读 |
|------|------|
| 项目是什么？整体架构？ | [BLUEPRINT.md](BLUEPRINT.md) |
| 有哪些模块？源码在哪？ | [code-index/MASTER.md](code-index/MASTER.md) |
| 数据结构定义？字段名？ | [BLUEPRINT.md](BLUEPRINT.md) → 第四节 |
| 开发规范？编码约定？ | [conventions/DEVELOPMENT.md](conventions/DEVELOPMENT.md) |
| 当前任务？Sprint 进度？ | [taskboard/KANBAN.md](taskboard/KANBAN.md) |
| IPC 通道怎么用？ | [IPC-REFERENCE.md](IPC-REFERENCE.md) |
| HTTP API 接口？ | [API.md](API.md) |
| 从 1.0 迁移？ | [MIGRATION.md](MIGRATION.md) |
| 1.0 参考资料？ | [V1-REFERENCE.md](V1-REFERENCE.md) |

## 文档结构

```
docs/
├── README.md                    ← 你在这里（AI 入口）
├── BLUEPRINT.md                 ← 项目蓝图 + 数据结构（⚠️ 字段名唯一来源）
├── ARCHITECTURE.md              ← 详细架构文档（三进程、模块、适配器）
├── API.md                       ← HTTP API 参考
├── IPC-REFERENCE.md             ← IPC 通道参考
├── MIGRATION.md                 ← 1.0→2.0 迁移指南
├── V1-REFERENCE.md              ← 1.0 源码索引
├── DEVELOPMENT.md               ← 开发环境与命令参考
├── conventions/
│   └── DEVELOPMENT.md           ← 开发公约（编码规范、禁止事项）
├── code-index/
│   └── MASTER.md                ← 模块地图（源码→文档映射）
└── taskboard/
    └── KANBAN.md                ← 任务看板
```

## 核心工作流

```
1. 读 BLUEPRINT.md          → 了解整体架构和数据结构
2. 读 code-index/MASTER.md  → 找到涉及的模块
3. 读对应模块文档            → 确认接口和踩坑记录
4. 读 conventions/DEVELOPMENT.md → 确认编码规范
5. 查 taskboard/KANBAN.md   → 确认当前任务
6. 开发 → 改代码 + 同步更新文档
7. 语法检查 (node -c / tsc --noEmit)
8. 闭合验证 → 交付
```

## 技术栈速览

| 层级 | 技术 |
|------|------|
| 框架 | Electron 42 + electron-vite 2 |
| 前端 | React 19 + TypeScript 5.7 |
| 状态管理 | Zustand 5 |
| 样式 | CSS Modules + CSS Variables |
| 测试 | Vitest (单元) + Playwright (E2E) |

## 项目路径

- **源码**: `E:\AI\Echora 2.0\src\`
- **主进程**: `src/main/`
- **渲染进程**: `src/renderer/`
- **共享类型**: `src/shared/`
- **测试**: `tests/`
- **构建产物**: `out/`

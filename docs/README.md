# Echora 开发文档体系

> **入口**: 任何开发任务，从本文档开始查找所需信息。  
> **最后更新**: 2026-05-23

---

## 快速导航

### 全景理解（从零开始了解 Echora）

| 问题 | 去读 |
|------|------|
| 项目是什么？架构长啥样？ | [📘 ARCHITECTURE.md](ARCHITECTURE.md) ← **推荐首选** |
| 蓝图 + 数据结构 | [📐 BLUEPRINT.md](BLUEPRINT.md) |
| 全链路数据流 | [🔄 DATA-FLOW.md](DATA-FLOW.md) |
| 全部 IPC 通道规格 | [🔌 IPC-REFERENCE.md](IPC-REFERENCE.md) |
| 全部配置文件结构 | [⚙️ CONFIG-REFERENCE.md](CONFIG-REFERENCE.md) |
| 灾难恢复 + 故障排查 | [🩺 RECOVERY.md](RECOVERY.md) |

### 新人接手 / AI 开发

| 问题 | 去读 |
|------|------|
| 有哪些模块？各做什么？ | [📚 code-index/MASTER.md](code-index/MASTER.md) |
| 开发时不能做什么？字段名怎么写？ | [🚨 conventions/DEVELOPMENT.md](conventions/DEVELOPMENT.md) |
| 现在有哪些任务？下一步做什么？ | [📋 taskboard/KANBAN.md](taskboard/KANBAN.md) |

### 改特定模块

| 模块 | 文档 |
|------|------|
| 主进程 / IPC / 启动流程 | [code-index/MASTER.md](code-index/MASTER.md) |
| 配置草稿系统 | [code-index/draft-manager.md](code-index/draft-manager.md) |
| 配置解析 + normalize | [code-index/config-reader.md](code-index/config-reader.md) |
| AI 检测器 | [code-index/ai-detector.md](code-index/ai-detector.md) |
| 网关管理器 | [code-index/gateway-manager.md](code-index/gateway-manager.md) |
| 配置管理 | [code-index/config-manager.md](code-index/config-manager.md) |
| AI 适配器 | [code-index/adapters.md](code-index/adapters.md) |
| Echora Proxy | [code-index/echora-proxy.md](code-index/echora-proxy.md) |
| API Server | [code-index/api-server.md](code-index/api-server.md) |
| 渲染进程 / UI | [code-index/renderer.md](code-index/renderer.md) |
| preload / IPC 桥梁 | [code-index/preload.md](code-index/preload.md) |

---

## 文档清单

### 核心文档（设计 + 架构）

| 文件 | 内容 | 行数 |
|------|------|------|
| `ARCHITECTURE.md` | 系统架构全景 + 模块依赖 + 设计模式 + 设计决策 | ~250 |
| `BLUEPRINT.md` | 项目蓝图 + 数据结构 + 模块索引 | ~250 |
| `DATA-FLOW.md` | 全链路数据流 + normalize 映射表 | ~300 |
| `IPC-REFERENCE.md` | 40 个 IPC 通道完整规格 | ~300 |
| `CONFIG-REFERENCE.md` | 5 种配置文件结构 + 关键参数 | ~250 |
| `RECOVERY.md` | 14 种故障场景 + 恢复步骤 | ~200 |

### 模块文档（code-index/）

| 文件 | 模块 | 最后更新 |
|------|------|---------|
| `MASTER.md` | 总览 + 模块地图 + IPC 表 | 2026-05-23 |
| `draft-manager.js` | 草稿管理器 | 2026-05-23 |
| `config-reader.js` | 配置读取器 | 2026-05-23 |
| `adapters.md` | 适配器层 | 2026-05-23 |
| `api-server.md` | API Server | 2026-05-23 |
| `echora-proxy.md` | Echora Proxy | 2026-05-23 |
| `renderer.md` | 渲染进程 | 2026-05-23 |
| `preload.md` | 预加载 | 2026-05-22 |
| `gateway-manager.md` | 网关管理器 | 2026-05-20 |
| `ai-detector.md` | AI 检测器 | 2026-05-19 |
| `config-manager.md` | 配置管理器 | 2026-05-18 |
| `env-checker.md` | 环境检查器 | 2026-05-18 |

---

## 工作流（AI 开发 SOP）

```
1. 读 ARCHITECTURE.md → 了解整体架构
2. 读 BLUEPRINT.md → 确认数据结构
3. 读对应模块文档 → 确认接口/函数签名
4. 读 DEVELOPMENT.md → 确认约束（字段名/IPC 通道名）
5. 读 IPC-REFERENCE.md → 确认通道输入输出
6. 开发 → 改代码 + 改文档 + 记变更
7. node -c 语法检查
8. 提交: 代码 + 文档 + 变更记录 三合一
```

---

**⚠️ 核心原则**: 代码是文档的具象化。代码不正确 = 文档不正确。文档不正确 = 一切开发基于幻觉。

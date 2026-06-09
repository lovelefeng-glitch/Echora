# E2E 测试问题修复计划

> **状态**: 🔧 开发中
> **创建时间**: 2026-06-09 02:50
> **问题来源**: E2E 测试报告

---

## 问题 1：SQLite 存储层未集成

### 根因分析

SQLite 存储层代码已创建，但：
1. 没有在应用启动时初始化数据库
2. AgentManager 仍使用旧的 JSON/JSONL 存储
3. 没有代码将新的 SQLite 实现接入应用

### 修复方案

#### Step 1：创建数据库管理器

新建 `src/main/store/db-manager.ts`：
- 封装数据库初始化逻辑
- 提供全局数据库实例
- 处理数据库路径和配置

#### Step 2：在应用启动时初始化

修改 `src/main/index.ts`：
- 在 `app.whenReady()` 中初始化 SQLite
- 在 ConfigManager.init() 之后调用
- 传递数据库实例给 AgentManager

#### Step 3：修改 AgentManager

修改 `src/main/agent/agent-manager.ts`：
- 添加可选的数据库参数
- 使用 SQLite 适配器替代旧存储
- 保持向后兼容（如果没有数据库，使用旧存储）

---

## 问题 2：Token 显示区域未找到

### 根因分析

Token 显示可能：
1. 在其他组件中（如状态栏）
2. CSS 类名与测试选择器不匹配
3. 功能未在 UI 中实现

### 修复方案

#### Step 1：检查现有 Token 显示

搜索 UI 中 Token 相关的组件和代码

#### Step 2：如果未实现，添加 Token 显示

在聊天区域或状态栏添加 Token 使用量显示

---

## 文件变更清单

### 新增文件

| 文件 | 说明 |
|------|------|
| `src/main/store/db-manager.ts` | 数据库管理器 |

### 修改文件

| 文件 | 变更 |
|------|------|
| `src/main/index.ts` | 添加 SQLite 初始化 |
| `src/main/agent/agent-manager.ts` | 使用 SQLite 适配器 |

---

## 验证标准

- [ ] 应用启动后创建 `~/.echora/echora.db` 文件
- [ ] 数据库包含 sessions、messages、memories 表
- [ ] 发送消息后数据存储到 SQLite
- [ ] 重启应用后会话持久化
- [ ] E2E 测试全部通过

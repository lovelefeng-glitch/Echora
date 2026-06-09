# Echora 2.0 开发公约

> **优先级高于**: project-dev SKILL.md 通用规则
> **最后更新**: 2026-06-06

---

## 一、核心原则

1. **先找文档，再看代码** — 不扫描源码，先读 `docs/` 目录
2. **闭环** — 读文档 → 改代码 → 写回文档，不可中断
3. **模糊需求先对齐** — 不猜、不假设，先问用户
4. **交付前闭合验证** — 需求对照、字段名审计、功能验证
5. **Bug 修复 → 已有任务 → 新提案** — 按顺序推进

---

## 二、编辑约束

| 规则 | 说明 |
|------|------|
| 只用 edit 工具做局部修改 | 禁止 write 全写文件 |
| 每次只改一处 | 改完验证通过再改下一处 |
| 语法报错只修报错行 | 不用 git checkout 整个文件 |
| 模块拆分/函数新增时添加注释 | 标注「来源 / 输出 / 依赖」 |
| 改代码前必须备份 | 复制到 `backup_yyyyMMdd_HHmmss/` 目录 |

---

## 三、字段名契约

> **铁律**: 字段名必须与 `docs/BLUEPRINT.md` 第四节完全一致。禁止凭记忆写字段名。

修改数据结构 → 必须同步更新：
1. `docs/BLUEPRINT.md` 第四节
2. `src/shared/types.ts` 类型定义
3. 对应模块文档

---

## 四、文档同步规则

| 改了什么 | 同步更新什么 |
|---------|------------|
| 模块源码 | `docs/code-index/` 对应模块文档 |
| 入口/IPC 通道 | `docs/BLUEPRINT.md` IPC 表 + `docs/IPC-REFERENCE.md` |
| 数据结构/架构 | `docs/BLUEPRINT.md` |
| 完成的任务 | `docs/taskboard/KANBAN.md` |
| 踩坑/API 发现 | 对应模块「踩坑记录」 |

**时间戳原则**: 所有记录必须带 `YYYY-MM-DD HH:MM` 时间戳。

---

## 五、命名约定

| 类型 | 约定 | 示例 |
|------|------|------|
| 文件名 | kebab-case | `config-manager.ts` |
| 组件名 | PascalCase | `ChatArea.tsx` |
| CSS Module | PascalCase.module.css | `Chat.module.css` |
| 接口 | PascalCase | `GatewayStatus` |
| 类型别名 | PascalCase | `IpcChannel` |
| 常量 | UPPER_SNAKE_CASE | `IPC_CHANNELS` |
| 函数 | camelCase | `getOrCreateAdapter` |
| 变量 | camelCase | `mainWindow` |

---

## 六、交付验证

不能只做 `npm run build`，必须用实际手段验证功能生效：

- **API/CLI 直接测试**: PowerShell/curl 调用底层命令
- **日志追踪**: 关键路径加 `log.info()`
- **状态对比**: 操作前后对比状态变化
- **禁止仅凭"代码看起来对"交付**

---

## 七、禁止事项

| ❌ 禁止 | 原因 |
|---------|------|
| 全量扫描源代码 | 浪费 Token |
| 凭记忆写字段名 | 拼写 Bug |
| 全文件重写 | 长上下文崩溃 |
| `git checkout -- file` 修语法错误 | 丢弃未提交改动 |
| 后台调用 LLM API | 消耗用户 Token |
| 改代码不更新文档 | 文档腐烂 |
| 跳过闭合验证直接交付 | 下次 AI 重复踩坑 |

---

## 八、技术栈约束

- **框架**: Electron 42 + electron-vite 2
- **前端**: React 19 + TypeScript 5.7
- **状态管理**: Zustand 5（唯一状态管理方案）
- **样式**: CSS Modules + CSS Variables（禁止内联样式）
- **构建**: Vite (electron-vite)
- **测试**: Vitest (单元) + Playwright (E2E)
- **代码规范**: ESLint 9 + Prettier 3

---

## 九、已知踩坑规则

> 从 .trae/skills/references/ 整理

1. **Flex 高度链铁律**: 每层必须 `flex:1 + min-height:0`，否则滚动失效
2. **消息气泡用 flex 横向**: `align-items: flex-end` 底部对齐，不要用 column
3. **流式回调不能被 currentAgentKey 门控**: 否则后台 Agent 状态丢失
4. **marked.js 在 Electron 中用 UMD+script 标签加载**: 不能在 preload.js 里 require
5. **全局→per-instance 重构必须检查容器初始化**: `STATE._streamState = {}` 必须在 STATE 定义处

---

## 十、项目文档映射

| 文档 | 用途 |
|------|------|
| `docs/README.md` | AI 开发入口（导航） |
| `docs/BLUEPRINT.md` | 数据结构 + 架构蓝图 |
| `docs/ARCHITECTURE.md` | 详细架构文档 |
| `docs/API.md` | HTTP API 参考 |
| `docs/IPC-REFERENCE.md` | IPC 通道参考 |
| `docs/DEVELOPMENT.md` | 开发环境与命令参考 |
| `docs/MIGRATION.md` | 1.0→2.0 迁移指南 |
| `docs/V1-REFERENCE.md` | 1.0 源码索引 |
| `docs/conventions/DESIGN-RULES.md` | **设计规则（按钮/间距/颜色/字体）** |
| `docs/code-index/MASTER.md` | 模块地图 |
| `docs/taskboard/KANBAN.md` | 任务看板 |

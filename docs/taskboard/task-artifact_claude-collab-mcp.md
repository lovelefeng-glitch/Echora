# Task Artifact: Claude-Hermes-OpenClaw 独立通讯系统

> **创建时间**: 2026-06-09 10:00
> **状态**: 📅 计划中
> **优先级**: P1（核心基础设施）
> **预计完成**: Phase 1 约 2-3 小时

---

## 需求理解

**核心问题**：即使 Echora 关闭，Claude 也需要和 Hermes/OpenClaw 通讯，实现多 AI 协作开发。

**目标**：创建独立的 MCP 服务器，提供 Claude 与 Hermes/OpenClaw 的通讯接口，支持：
1. 发送测试指令并接收结果
2. 异步任务管理
3. 跨会话持久化
4. 无需 Echora 运行即可通讯

---

## 技术调研（B-3.6）

### 通讯协议分析

基于 Echora 代码的分析（`src/main/adapters/`）：

**Hermes API**：
- 端点：`http://127.0.0.1:8083/v1/chat/completions`
- 认证：`Authorization: Bearer echora-shared-secret`
- 格式：OpenAI Chat Completions 兼容

**OpenClaw API**：
- 端点：`http://127.0.0.1:18789/v1/chat/completions`
- 认证：从 `~/.openclaw/openclaw.json` 读取 token
- 格式：OpenAI Chat Completions 兼容 + WebSocket

### 关键设计决策

1. **为什么选 MCP 服务器**：MCP 是 Claude 的标准通讯协议，通过 MCP 我可以直接调用工具，无需额外的 shell 脚本
2. **为什么独立于 Echora**：Echora 可能关闭或崩溃，但通讯系统应该持续运行
3. **为什么用 HTTP 而不是 WebSocket**：HTTP 更简单可靠，支持异步调用，适合任务型协作

---

## 分阶段实现

### Phase 1：基础通讯层（优先级 P0）

**目标**：Claude 能够通过 MCP 工具调用 Hermes/OpenClaw

**创建的文件**：
```
mcp-servers/claude-collab/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts              # MCP 服务器入口
│   ├── tools/
│   │   ├── ask-hermes.ts     # 向 Hermes 发送消息
│   │   ├── ask-openclaw.ts   # 向 OpenClaw 发送消息
│   │   └── check-status.ts   # 检查 Hermes/OpenClaw 运行状态
│   └── utils/
│       ├── http-client.ts    # HTTP 请求封装
│       └── config.ts         # 配置管理
└── SKILL.md                  # 使用说明
```

**MCP 工具定义**：
1. `ask_hermes` - 向 Hermes 发送消息并获取结果
2. `ask_openclaw` - 向 OpenClaw 发送消息并获取结果
3. `check_ai_status` - 检查 Hermes/OpenClaw 是否运行
4. `get_ai_config` - 读取 AI 配置信息

**实现细节**：
- 使用 `@modelcontextprotocol/sdk` 构建 MCP 服务器
- HTTP 客户端使用 Node.js 内置的 `fetch`（或 `axios`）
- 配置从环境变量或配置文件读取
- 支持超时和错误处理

---

### Phase 2：异步任务管理（优先级 P1）

**目标**：支持长时间运行的任务，不会阻塞 Claude

**新增文件**：
```
mcp-servers/claude-collab/src/
├── tools/
│   ├── submit-task.ts       # 提交异步任务
│   ├── check-task.ts        # 检查任务状态
│   └── cancel-task.ts       # 取消任务
└── task-manager.ts          # 任务队列管理
```

**MCP 工具定义**：
1. `submit_task` - 提交异步任务，返回任务 ID
2. `check_task` - 检查任务状态和结果
3. `cancel_task` - 取消运行中的任务
4. `list_tasks` - 列出所有任务及其状态

**实现细节**：
- 使用内存 + 文件持久化的任务队列
- 任务状态：pending → running → completed/failed
- 支持任务结果轮询
- 任务历史记录保存

---

### Phase 3：开发协作工作流（优先级 P2）

**目标**：实现 Claude 修改代码 → 调用 Hermes 测试 → 接收结果的完整工作流

**新增文件**：
```
mcp-servers/claude-collab/src/
├── tools/
│   ├── run-test.ts          # 运行测试脚本
│   ├── verify-build.ts      # 验证构建
│   └── debug-session.ts     # 调试会话管理
└── workflow/
    ├── test-runner.ts       # 测试执行器
    └── build-verifier.ts    # 构建验证器
```

**MCP 工具定义**：
1. `run_test` - 调用 Hermes 执行测试脚本
2. `verify_build` - 调用 Hermes 验证构建结果
3. `start_debug_session` - 启动调试会话
4. `get_debug_logs` - 获取调试日志

---

## 文件变更清单

### Phase 1 新增文件

| 文件路径 | 类型 | 说明 |
|---------|------|------|
| `mcp-servers/claude-collab/package.json` | 新增 | 项目配置 |
| `mcp-servers/claude-collab/tsconfig.json` | 新增 | TypeScript 配置 |
| `mcp-servers/claude-collab/src/index.ts` | 新增 | MCP 服务器入口 |
| `mcp-servers/claude-collab/src/tools/ask-hermes.ts` | 新增 | Hermes 通讯工具 |
| `mcp-servers/claude-collab/src/tools/ask-openclaw.ts` | 新增 | OpenClaw 通讯工具 |
| `mcp-servers/claude-collab/src/tools/check-status.ts` | 新增 | 状态检查工具 |
| `mcp-servers/claude-collab/src/utils/http-client.ts` | 新增 | HTTP 客户端 |
| `mcp-servers/claude-collab/src/utils/config.ts` | 新增 | 配置管理 |

### Phase 1 修改文件

| 文件路径 | 类型 | 说明 |
|---------|------|------|
| `docs/taskboard/KANBAN.md` | 修改 | 添加新任务 |
| `docs/code-index/MASTER.md` | 修改 | 添加 claude-collab 模块 |

---

## 依赖关系

**外部依赖**：
- `@modelcontextprotocol/sdk` - MCP 协议实现
- `axios` 或 `node-fetch` - HTTP 请求
- `js-yaml` - 配置文件解析

**内部依赖**：
- 无（独立运行，不依赖 Echora 其他模块）

---

## 风险评估

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| Hermes/OpenClaw 未运行 | 通讯失败 | 状态检查 + 友好错误信息 |
| API 格式变化 | 请求失败 | 版本检查 + 兼容性适配 |
| 超时 | 任务挂起 | 超时配置 + 取消机制 |
| 配置文件损坏 | 启动失败 | 配置验证 + 默认值 |

---

## 验收标准

### Phase 1 完成标准

- [ ] Claude 可以调用 `ask_hermes` 工具发送消息
- [ ] Claude 可以调用 `ask_openclaw` 工具发送消息
- [ ] Claude 可以调用 `check_ai_status` 检查状态
- [ ] 错误信息友好，超时可配置
- [ ] 文档更新完成（SKILL.md + KANBAN.md）
- [ ] 代码语法检查通过
- [ ] 实际测试：Claude 通过 MCP 向 Hermes 发送消息并获取响应

### Phase 2 完成标准

- [ ] 异步任务可以提交和查询
- [ ] 任务状态正确流转
- [ ] 任务可以取消
- [ ] 任务历史保存

### Phase 3 完成标准

- [ ] 测试脚本可以调用并返回结果
- [ ] 构建验证可以自动执行
- [ ] 完整的工作流可以端到端运行

---

## 实现步骤（按顺序）

1. **创建项目骨架**
   - 创建 `mcp-servers/claude-collab/` 目录
   - 初始化 `package.json` 和 `tsconfig.json`

2. **实现 HTTP 客户端**
   - 封装 Hermes/OpenClaw 的 API 调用
   - 处理认证、超时、错误

3. **实现 MCP 工具**
   - ask_hermes
   - ask_openclaw
   - check_ai_status

4. **创建 MCP 服务器入口**
   - 注册工具
   - 启动服务器

5. **测试验证**
   - 启动 Hermes/OpenClaw
   - 通过 Claude 调用工具
   - 验证通讯正常

6. **文档同步**
   - 更新 KANBAN.md
   - 更新 MASTER.md
   - 创建 SKILL.md

---

## 备注

- Phase 1 是基础，必须先完成
- Phase 2 和 3 可以根据需要迭代
- 遵循 project-dev 流程的闭合验证标准
- 优先实现核心功能，保留扩展空间

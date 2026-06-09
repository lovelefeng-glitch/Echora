# E2E 测试问题修复进度

> **状态**: 🔧 调试中
> **创建时间**: 2026-06-09 02:50
> **最后更新**: 2026-06-09 04:40
> **问题来源**: E2E 测试报告

---

## 一、已修复的问题

### 1. SQLite 存储层集成 ✅

| 项目 | 状态 | 说明 |
|------|------|------|
| 数据库创建 | ✅ | 应用启动时创建 `echora.db` |
| 数据库路径 | ✅ | `C:\Users\ohfen\AppData\Roaming\echora-2\echora.db` |
| 数据持久化 | ✅ | 消息存储到 SQLite |
| E2E 测试 | ✅ | 5/5 测试通过 |

### 2. 会话上下文测试 ✅

| 项目 | 状态 | 说明 |
|------|------|------|
| 上下文保持 | ✅ | AI 记住之前的对话 |
| 新建会话 | ✅ | 会话标题正确更新 |
| 消息发送 | ✅ | 消息正常显示 |

---

## 二、正在调试的问题

### Token 显示问题 🔧

#### 问题描述

Token 显示的 3 个数字（输入、输出、总计）总是相同，不符合预期。

#### 已确认的事实

| 项目 | 状态 | 说明 |
|------|------|------|
| API 返回 usage | ✅ | `"usage":{"completion_tokens":90,"prompt_tokens":833,"total_tokens":923}` |
| OpenAI Provider 处理 | ✅ | 代码检查 `chunk.usage` 并发送 `usage` 事件 |
| Agent Loop 接收 | ⚠️ | 代码存在但未验证是否执行 |
| UI 显示 | ❌ | 显示 `输出: 43 | 总计: 43`（数字相同） |

#### 数据流分析

```
API 返回 usage 数据
  ↓ OpenAI Provider 检测到 chunk.usage
  ↓ 发送 usage 事件
  ↓ Agent Loop 更新 _totalUsage
  ↓ complete 事件携带 _totalUsage
  ↓ 前端接收并显示
  ❓ 某个环节丢失了数据
```

#### 可能的原因

1. **时序问题**：`usage` 事件在 `complete` 事件之后到达
2. **事件未发送**：OpenAI Provider 没有正确发送 `usage` 事件
3. **数据未更新**：`_totalUsage` 没有被正确更新
4. **前端未更新**：usage 数据到达但 UI 没有刷新
5. **估算覆盖**：`echora-agent-handlers.ts` 中的估算逻辑覆盖了真实数据

#### 相关代码位置

| 文件 | 行号 | 说明 |
|------|------|------|
| `src/main/llm/openai-provider.ts` | ~200 | 检测 `chunk.usage` 并发送事件 |
| `src/main/agent/agent-loop.ts` | 361-363 | 接收 `usage` 事件并更新 `_totalUsage` |
| `src/main/ipc-handlers/echora-agent-handlers.ts` | 141 | 估算逻辑（可能覆盖真实数据） |
| `src/renderer/hooks/use-streaming.ts` | ~200 | 前端接收 `onUsage` 事件 |

#### 估算逻辑问题

```typescript
// echora-agent-handlers.ts
case 'complete':
  let usageData = event.result?.totalUsage
  if (!usageData || (usageData.promptTokens === 0 && usageData.completionTokens === 0)) {
    // 估算逻辑
    const estimatedOutput = Math.ceil((accumulatedContent || '').length / 4)
    usageData = { promptTokens: 0, completionTokens: estimatedOutput, totalTokens: estimatedOutput }
    log.info('[agent:runStream] usage 估算: output≈%d tokens', estimatedOutput)
  }
```

如果 `event.result?.totalUsage` 为 0，就会触发估算，覆盖真实数据。

#### 下一步调试

1. **验证 usage 事件是否被发送**：在 OpenAI Provider 中添加更详细的日志
2. **验证 Agent Loop 是否接收**：在 `case 'usage'` 中添加日志
3. **验证 _totalUsage 是否更新**：在 `complete` 事件中打印 `_totalUsage`
4. **验证前端是否接收**：在 `onUsage` 回调中添加日志
5. **检查时序问题**：确保 `usage` 事件在 `complete` 事件之前到达

---

## 三、e2e-tester 技能优化

### 新增内容

| 章节 | 说明 |
|------|------|
| **关键教训** | 区分"旧功能"和"新功能" |
| **三层次验证** | 功能存在 → 使用新代码 → 集成完整 |
| **新功能集成验证流程** | 代码检查 → 调用链追踪 → 新旧对比 → E2E 验证 |
| **常见陷阱** | 代码未集成、新旧并存、配置未启用 |

### 核心教训

```
E2E 测试通过 ≠ 新功能集成

必须验证：
1. 功能在 UI 中存在
2. 功能使用新代码（不是旧代码）
3. 新代码在正常执行路径上
```

---

## 四、文件变更清单

### 新增文件

| 文件 | 说明 |
|------|------|
| `src/main/store/db-manager.ts` | 数据库管理器 |
| `src/main/agent/tiktoken-tokenizer.ts` | tiktoken 封装 |
| `tests/e2e/sprint11-integration.spec.ts` | SQLite 集成测试 |
| `tests/e2e/sprint11-precise.spec.ts` | 精准测试（Token/会话/新建） |
| `tests/e2e/sprint11-context.spec.ts` | 上下文测试 |

### 修改文件

| 文件 | 变更 |
|------|------|
| `src/main/index.ts` | 添加 SQLite 初始化 |
| `src/main/store/index.ts` | 导出 DatabaseManager |
| `src/main/adapters/direct-api-adapter.ts` | 添加 `stream_options`、usage 解析 |
| `src/main/llm/openai-provider.ts` | 添加调试日志 |
| `src/main/agent/agent-loop.ts` | 添加调试日志 |
| `package.json` | 添加 tiktoken 依赖 |

---

## 五、待办事项

### 高优先级

- [ ] 继续调试 Token 显示问题
- [ ] 验证 usage 事件的完整数据流
- [ ] 检查估算逻辑是否覆盖真实数据

### 中优先级

- [ ] 更新 KANBAN 状态
- [ ] 优化 e2e-tester 技能
- [ ] 记录更多调试日志

---

*文档更新时间: 2026-06-09 04:40*

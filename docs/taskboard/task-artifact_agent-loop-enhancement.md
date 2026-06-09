# Sprint 11 Phase 3：完善 Agent Loop

> **状态**: 📅 待确认
> **创建时间**: 2026-06-08 23:00
> **目标**: 完善上下文压缩和错误恢复机制

---

## 一、B-3.64 调研结果

### Agent Loop 设计对比（多项目）

| 项目 | 最大迭代 | 早停条件 | 错误处理 | 预算控制 |
|------|---------|---------|---------|---------|
| **Hermes** | 90 | AgentFinish | jittered_backoff | token 限制 |
| **LangChain** | 可配置 | AgentFinish | handle_parsing_errors | 无 |
| **AutoGPT** | 可配置 | 用户中断 | 循环检测 | token 限制 |
| **BabyAGI** | 可配置 | 任务完成 | 结果反馈 | 无 |

### 上下文压缩方案对比（多项目）

| 方案 | 代表项目 | 压缩比 | 优点 | 缺点 |
|------|---------|--------|------|------|
| **摘要压缩** | Hermes | 2-3x | 简单、保留核心 | 丢失细节 |
| **困惑度删除** | LLMLingua | 5-10x | 保留重要信息 | 需要模型支持 |
| **分层记忆** | MemGPT | 动态 | 自我反思、按需加载 | 复杂度高 |
| **滑动窗口** | 长对话场景 | 固定 | 简单、可预测 | 丢失历史 |

### 错误恢复最佳实践（多项目）

| 项目 | 重试策略 | 错误分类 | 降级策略 |
|------|---------|---------|---------|
| **Hermes** | jittered_backoff | 可重试/不可重试 | 降级模型 |
| **OpenAI** | 指数退避 | 速率限制/超时 | 无 |
| **LangChain** | 自动重试 | 解析错误 | 修正提示 |

---

## 二、实现计划

### Phase 3.1：上下文压缩器增强

**当前状态**：已有 SummaryCompressor（基础版）

**增强内容**：

| 功能 | 说明 | 优先级 |
|------|------|--------|
| Token 计数 | 精确计算消息 token 数 | P0 |
| 自动触发 | 当 token 超过阈值时自动压缩 | P0 |
| 摘要质量 | 提取关键信息，不只是统计 | P1 |
| 压缩历史 | 记录压缩历史，支持回溯 | P2 |

### Phase 3.2：错误恢复机制

**当前状态**：基础错误处理

**增强内容**：

| 功能 | 说明 | 优先级 |
|------|------|--------|
| 指数退避重试 | jittered_backoff（Hermes 方案） | P0 |
| 错误分类 | 可重试/不可重试错误 | P0 |
| 最大重试次数 | 防止无限重试 | P0 |
| 降级策略 | 主模型失败时切换备用模型 | P1 |

### Phase 3.3：Agent Loop 增强

**当前状态**：基础 ReAct 框架

**增强内容**：

| 功能 | 说明 | 优先级 |
|------|------|--------|
| 循环检测 | 避免死循环（相同工具+相同参数） | P0 |
| 预算控制 | token 使用量限制 | P1 |
| 用户确认 | 危险操作前确认 | P1 |
| 早停条件 | 检测任务完成 | P2 |

---

## 三、文件变更清单

### 新增文件

| 文件 | 说明 |
|------|------|
| `src/main/agent/retry-utils.ts` | 重试工具（jittered_backoff） |
| `src/main/agent/error-classifier.ts` | 错误分类器 |
| `src/main/agent/token-counter.ts` | Token 计数器 |

### 修改文件

| 文件 | 变更 |
|------|------|
| `src/main/store/compressors/summary.ts` | 增强压缩逻辑 |
| `src/main/agent/agent-loop.ts` | 集成错误恢复和循环检测 |
| `src/main/agent/agent-manager.ts` | 集成新功能 |

---

## 四、实现步骤

### Step 1：Token 计数器
```
新建 src/main/agent/token-counter.ts
- 精确计算消息 token 数
- 支持不同模型的 tokenizer
- 缓存计算结果
```

### Step 2：重试工具
```
新建 src/main/agent/retry-utils.ts
- jittered_backoff（指数退避 + 随机抖动）
- 最大重试次数配置
- 重试回调
```

### Step 3：错误分类器
```
新建 src/main/agent/error-classifier.ts
- 可重试错误（网络超时、速率限制）
- 不可重试错误（认证失败、参数错误）
- 错误严重程度
```

### Step 4：增强压缩器
```
修改 src/main/store/compressors/summary.ts
- 集成 Token 计数器
- 改进摘要质量
- 压缩历史记录
```

### Step 5：增强 Agent Loop
```
修改 src/main/agent/agent-loop.ts
- 集成错误恢复（重试 + 降级）
- 循环检测
- 预算控制
```

### Step 6：集成到 AgentManager
```
修改 src/main/agent/agent-manager.ts
- 配置压缩器
- 配置错误恢复策略
- 暴露新功能 API
```

---

## 五、验收标准

- [ ] Token 计数器准确计算 token 数
- [ ] 重试机制在临时错误时自动重试
- [ ] 错误分类器正确区分可重试/不可重试错误
- [ ] 压缩器在 token 超限时自动触发
- [ ] Agent Loop 检测到死循环时自动终止
- [ ] 构建通过，无 TypeScript 错误
- [ ] 运行时测试通过

---

## 六、参考资源

### Hermes 的实现
- `agent/context_compressor.py` - 上下文压缩器
- `agent/retry_utils.py` - 重试工具（jittered_backoff）
- `run_agent.py` - Agent Loop 主循环

### 其他高星项目
- LangChain: AgentExecutor 错误处理
- AutoGPT: 循环检测 + 预算控制
- MemGPT: 分层记忆 + 自我反思

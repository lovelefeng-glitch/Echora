---
> **状态**: 🔧 测试中
> **关键结论**: Token 显示为 0 的根本原因是 formatUsage 函数使用 falsy 判断，0 值被跳过
> **已替代/指向**: 无
> **回收优先级**: 高
---

# Token 显示修复计划

> **任务**: #45 Token 显示修复（mimo 数据被覆盖）
> **创建时间**: 2026-06-09 18:55
> **目标**: 修复 Echora Agent 对话时 Token 信息显示为 0 的问题

---

## 一、需求理解

Echora Agent 对话时，Token 信息经常显示为 0，导致气泡底部不显示 Token 信息。

**关键区分**: Echora Agent 是内置 Agent，使用 OpenAI Provider 直连 API，不经过 Hermes/OpenClaw 等外部网关。

---

## 二、问题分析

### 数据流路径

```
API (mimo) → OpenAIProvider._handleStreamChunk → AgentLoop._runStreamInternal (累加 _totalUsage)
  → AgentEvent 'complete' → echora-agent-handlers.ts → IPC 'gateway:messageUsage'
    → use-streaming.ts → appStore.updateMessage → ChatMessageItem.tsx → formatUsage()
```

### 根因定位

**文件 1**: `src/renderer/utils/chat-helpers.ts:48-51`

```typescript
// ❌ Bug: 0 是 falsy，会被跳过
if (usage.input) parts.push(`输入: ${usage.input}`)
if (usage.output) parts.push(`输出: ${usage.output}`)
if (usage.totalTokens) parts.push(`总计: ${usage.totalTokens}`)
```

**文件 2**: `src/renderer/components/MessageBubble.tsx:26-29`

```typescript
// ❌ Bug: 0 会被跳过
if (input > 0) parts.push(`↑${input}`)
if (output > 0) parts.push(`↓${output}`)
if (total > 0) parts.push(`Σ${total}`)
```

### 为什么显示为 0？

1. API 返回 usage 数据（可能某些字段为 0）
2. 前端 formatUsage 函数判断 `if (usage.input)` 时，`0` 是 falsy
3. 条件为 false，该字段不添加到 parts 数组
4. 如果所有字段都是 0，parts 为空数组，formatUsage 返回空字符串
5. 前端判断 `msg.usage && formatUsage(msg.usage)` 时，虽然 msg.usage 存在，但 formatUsage 返回空字符串
6. 最终不显示任何 Token 信息

---

## 三、修复方案

### 修改 1: `src/renderer/utils/chat-helpers.ts`

```typescript
// 修改前
if (usage.input) parts.push(...)
if (usage.output) parts.push(...)
if (usage.totalTokens) parts.push(...)
if (usage.cacheRead) parts.push(...)

// 修改后
if (usage.input != null) parts.push(...)
if (usage.output != null) parts.push(...)
if (usage.totalTokens != null) parts.push(...)
if (usage.cacheRead != null) parts.push(...)
```

**说明**: `!= null` 只排除 `null` 和 `undefined`，`0` 会被正常处理。

### 修改 2: `src/renderer/components/MessageBubble.tsx`

```typescript
// 修改前
const input = usage.input || 0
const output = usage.output || 0
const total = usage.totalTokens || 0
if (input > 0) parts.push(...)
if (output > 0) parts.push(...)
if (total > 0) parts.push(...)

// 修改后
const input = usage.input ?? 0
const output = usage.output ?? 0
const total = usage.totalTokens ?? 0
if (input > -1) parts.push(...)
if (output > -1) parts.push(...)
if (total > -1) parts.push(...)
```

**说明**: `??` 只在 `null`/`undefined` 时使用默认值，`0` 会被保留。`> -1` 确保 0 也能显示。

---

## 四、文件变更清单

| 文件 | 修改类型 | 说明 |
|------|---------|------|
| `src/renderer/utils/chat-helpers.ts` | 修改 | formatUsage 函数 falsy 判断修复 |
| `src/renderer/components/MessageBubble.tsx` | 修改 | formatUsage + buildUsageTitle 函数修复 |

---

## 五、验收标准

1. [ ] API 返回 usage 为 0 时，前端显示 `输入: 0 | 输出: 0 | 总计: 0`
2. [ ] API 返回正常 usage 时，前端正确显示数字
3. [ ] API 未返回 usage 时，前端不显示（而不是显示 0）
4. [ ] 单元测试通过
5. [ ] E2E 测试验证

---

## 六、风险评估

- **风险**: 低。只修改前端显示逻辑，不影响数据流
- **回滚**: 恢复原始代码即可

---

## 七、测试计划

1. 单元测试: 测试 formatUsage 函数对 0 值的处理
2. E2E 测试: 启动应用，发送消息，验证 Token 显示

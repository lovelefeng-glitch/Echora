# Token 数据流追踪

## 数据流路径

```
API (mimo) → OpenAIProvider._handleStreamChunk → AgentLoop._runStreamInternal (累加 _totalUsage)
  → AgentEvent 'complete' → echora-agent-handlers.ts → IPC 'gateway:messageUsage'
    → use-streaming.ts → appStore.updateMessage → ChatMessageItem.tsx → formatUsage()
```

## 各环节检查

### 1. API 返回 usage 数据 ✅
- API 返回: `{ prompt_tokens: 248, completion_tokens: 142, total_tokens: 390 }`
- 测试通过

### 2. OpenAI Provider 解析 usage 数据 ✅
- 代码: `src/main/llm/openai-provider.ts:353-364`
- 正确解析 `prompt_tokens`, `completion_tokens`, `total_tokens`

### 3. AgentLoop 累加 usage 数据 ✅
- 代码: `src/main/agent/agent-loop.ts:367-374`
- 正确累加 `promptTokens`, `completionTokens`, `totalTokens`

### 4. echora-agent-handlers.ts 发送 usage 数据 ✅
- 代码: `src/main/ipc-handlers/echora-agent-handlers.ts:148-156`
- 正确发送 `input`, `output`, `totalTokens`, `contextUsed`

### 5. use-streaming.ts 存储 usage 数据 ✅
- 代码: `src/renderer/hooks/use-streaming.ts:283`
- 正确存储 `usage: data`

### 6. formatUsage 函数显示 usage 数据 ✅
- 代码: `src/renderer/utils/chat-helpers.ts:45-54`
- 使用 `!= null` 判断，正确处理 0 值

## 问题分析

所有环节都检查通过，但用户仍然看到 0。

可能的原因：
1. 缓存问题 - 浏览器缓存了旧的 JavaScript 文件
2. 构建问题 - 新的代码没有被正确构建
3. 其他代码覆盖了 usage 数据

## 下一步

1. 清除浏览器缓存
2. 重新构建应用
3. 检查是否有其他代码覆盖 usage 数据

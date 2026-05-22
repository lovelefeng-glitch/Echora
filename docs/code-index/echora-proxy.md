# Echora Proxy 模块文档

> **文件**: `src/proxy/echora-proxy.js`  
> **最后更新**: 2026-05-23  
> **版本**: v1.0  
> **状态**: ✅ 完成

---

## 一、模块职责

Echora Proxy 是一个 **SSE 中间层**，位于 Echora 和 Hermes Gateway 之间：

```
Echora UI → Echora Proxy (8085) → Hermes Gateway (8083)
```

**核心功能**：
1. **SSE 拦截** — 透明转发所有请求，同时解析 SSE 流
2. **Metrics 提取** — 从 SSE 流中提取 usage（tokens）、延迟、工具调用信息
3. **事件注入** — 在 SSE 流中注入 `echora.metrics` 事件，UI 可直接读取
4. **透明代理** — 对客户端和服务器而言，Proxy 是透明的

## 二、数据流

```
┌──────────┐     ┌──────────────┐     ┌─────────────────┐
│ Renderer │ ──→ │ Echora Proxy │ ──→ │ Hermes Gateway  │
│          │ ←── │ (port 8085)  │ ←── │ (port 8083)     │
└──────────┘     └──────────────┘     └─────────────────┘
                       │
                       ├── 解析 SSE 流
                       ├── 提取 usage/tokens
                       ├── 注入 echora.metrics 事件
                       └── 计算延迟
```

## 三、关键配置

| 配置 | 值 | 说明 |
|------|-----|------|
| 代理端口 | `8085` | 监听端口 |
| 目标端口 | `8083` | Hermes Gateway API Server |
| 超时 | `120000ms` | 5 分钟（Hermes 长任务） |

## 四、SSE 事件类型

| 事件 | 说明 |
|------|------|
| `message` | 标准 Chat Completions 消息 |
| `echora.metrics` | **注入的** metrics 数据（tokens、延迟、工具调用） |
| `done` | 流结束 |

### echora.metrics 数据结构

```json
{
  "type": "echora.metrics",
  "data": {
    "completion_tokens": 1234,
    "prompt_tokens": 5678,
    "total_tokens": 6912,
    "latency_ms": 2345,
    "tool_calls": [{ "name": "web_search", "status": "completed" }]
  }
}
```

## 五、已知踩坑

| 踩坑 | 说明 |
|------|------|
| `onDone` 被调两次 | SSE `[DONE]` + `res.on('end')` 都会触发，需用 `done` 标志防重 |
| `taskkill` 不加 `/F` 杀不掉 | node.exe 进程需 `taskkill /F /PID` |
| 代理正则 `\\s` 应为 `\s` | JavaScript 正则中 `\s` 不需要双转义 |
| `getOrCreateAdapter` 永久覆盖端口 | 代理启动时会修改 adapter 的端口配置 |

## 六、依赖关系

```
echora-proxy.js
├── http (Node.js)
└── url (Node.js)
```

## 七、被引用情况

| 调用方 | 用途 |
|--------|------|
| `main.js` | 启动时创建 Proxy 实例 |
| `hermes-adapter.js` | 通过 Proxy 转发请求（端口 8085） |

---

*最后更新: 2026-05-23 | 作者: 小雪*

# API Server 模块文档

> **文件**: `src/api-server.js`  
> **最后更新**: 2026-05-23  
> **版本**: v1.0  
> **状态**: ✅ 完成

---

## 一、模块职责

提供 HTTP API 接口，允许外部工具（如 Echora Proxy、脚本、其他应用）与 Echora 交互。

## 二、API 端点

| 方法 | 路径 | 说明 | 输入 | 输出 |
|------|------|------|------|------|
| GET | `/health` | 健康检查 | — | `{ status: "ok", version }` |
| GET | `/adapters` | 列出所有适配器 | — | `[{ aiType, status, port }]` |
| GET | `/adapter/:aiType` | 获取单个适配器状态 | `aiType` | `{ aiType, status, port, pid }` |
| POST | `/message/:aiType` | 发送消息 | `{ agentId, text }` | `{ success, messageId }` |
| GET | `/metrics/:aiType` | 获取 metrics | `aiType` | `{ tokens, latency, ... }` |

## 三、启动逻辑

```js
// main.js 中创建
apiServer = createAPIServer(adapters, gatewayManager);
// 监听端口（默认 8086，可配置）
```

## 四、依赖关系

```
api-server.js
├── http (Node.js)
├── adapters (Map) ← main.js 传入
└── gatewayManager ← main.js 传入
```

## 五、被引用情况

| 调用方 | 用途 |
|--------|------|
| `main.js` | 启动时创建 API Server 实例 |

---

*最后更新: 2026-05-23 | 作者: 小雪*

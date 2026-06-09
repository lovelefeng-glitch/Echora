# Echora 2.0 HTTP API 文档

## 概述

Echora 2.0 内置了一个 HTTP API 服务器，允许外部工具和脚本与 Echora 进行交互。API 服务器默认监听 `127.0.0.1:9300`。

## 基础信息

| 项目 | 值 |
|------|-----|
| 基础 URL | `http://127.0.0.1:9300` |
| 协议 | HTTP/1.1 |
| 内容类型 | `application/json` |
| 认证 | 无 (仅本地访问) |
| CORS | 允许所有来源 |

## 通用响应格式

### 成功响应

```json
{
  "ok": true,
  "data": { ... }
}
```

### 错误响应

```json
{
  "error": "错误信息",
  "path": "/api/xxx"
}
```

## API 端点

### 健康检查

#### `GET /api/ping`

检查 API 服务器是否运行。

**请求**

```bash
curl http://127.0.0.1:9300/api/ping
```

**响应**

```json
{
  "ok": true,
  "time": 1704067200000
}
```

---

### 状态查询

#### `GET /api/status`

获取系统状态概览。

**请求**

```bash
curl http://127.0.0.1:9300/api/status
```

**响应**

```json
{
  "aiList": [
    {
      "id": "hermes",
      "name": "Hermes",
      "path": "C:\\Program Files\\Hermes\\hermes.exe",
      "found": true,
      "status": "running",
      "port": 8083
    },
    {
      "id": "openclaw",
      "name": "OpenClaw",
      "path": null,
      "found": false,
      "status": "offline",
      "port": null
    }
  ],
  "gateways": {
    "hermes": {
      "status": "running",
      "pid": 1234,
      "port": 8083,
      "url": "http://127.0.0.1:8083",
      "owned": true,
      "uptime": 3600000
    }
  },
  "config": {
    "aiPaths": {
      "hermes": "C:\\Program Files\\Hermes\\hermes.exe"
    },
    "firstRun": false
  }
}
```

---

### 扫描 AI

#### `POST /api/scan`

扫描系统中的 AI 软件。

**请求**

```bash
curl -X POST http://127.0.0.1:9300/api/scan
```

**响应**

```json
{
  "ok": true,
  "detected": [
    {
      "id": "hermes",
      "name": "Hermes",
      "found": true,
      "gateway": {
        "port": 8083,
        "pid": 1234
      }
    },
    {
      "id": "openclaw",
      "name": "OpenClaw",
      "found": false,
      "gateway": null
    }
  ]
}
```

---

### 获取配置

#### `GET /api/config`

获取 Echora 配置。

**请求**

```bash
curl http://127.0.0.1:9300/api/config
```

**响应**

```json
{
  "firstRun": false,
  "aiPaths": {
    "hermes": "C:\\Program Files\\Hermes\\hermes.exe"
  },
  "gatewayConfigs": {
    "hermes": { "port": 8083 }
  },
  "settings": {
    "autoStartOnBoot": false,
    "minimizeToTray": true,
    "timeout": 30000
  }
}
```

---

### 系统概览

#### `GET /api/overview`

获取系统概览信息。

**请求**

```bash
curl http://127.0.0.1:9300/api/overview
```

**响应**

```json
{
  "app": "Echora",
  "version": "2.0.0",
  "configuredAIs": ["hermes", "openclaw"],
  "runningGateways": ["hermes:8083"],
  "firstRun": false
}
```

---

### Agent 列表

#### `GET /api/agents`

获取所有可用的 Agent 列表。

**请求**

```bash
curl http://127.0.0.1:9300/api/agents
```

**响应**

```json
[
  {
    "id": "main",
    "name": "主 Agent",
    "emoji": "🤖",
    "description": "默认的对话助手",
    "aiType": "hermes"
  },
  {
    "id": "coder",
    "name": "编程助手",
    "emoji": "💻",
    "description": "专注于代码编写",
    "aiType": "hermes"
  }
]
```

---

### 发送消息

#### `POST /api/send`

发送消息并获取回复 (非流式)。

**请求**

```bash
curl -X POST http://127.0.0.1:9300/api/send \
  -H "Content-Type: application/json" \
  -d '{
    "agentKey": "hermes:main",
    "message": "你好，请介绍一下自己"
  }'
```

**请求参数**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `agentKey` | string | 是 | Agent 标识，格式: `aiType:agentId` |
| `message` | string | 是 | 消息内容 |

**响应**

```json
{
  "success": true,
  "reply": "你好！我是一个 AI 助手，可以帮助你完成各种任务..."
}
```

**错误响应**

```json
{
  "error": "需要 agentKey 和 message"
}
```

```json
{
  "error": "适配器 hermes 不存在"
}
```

---

### 流式发送消息

#### `POST /api/send-stream`

发送消息并以 SSE (Server-Sent Events) 格式流式获取回复。

**请求**

```bash
curl -X POST http://127.0.0.1:9300/api/send-stream \
  -H "Content-Type: application/json" \
  -d '{
    "agentKey": "hermes:main",
    "message": "写一个 Hello World 程序"
  }'
```

**响应格式 (SSE)**

```
data: {"type":"chunk","delta":"你好","content":"你好"}

data: {"type":"chunk","delta":"！","content":"你好！"}

data: {"type":"tool","name":"code_exec","emoji":"💻","status":"running"}

data: {"type":"done","content":"你好！这是一个 Hello World 程序...","metrics":{"inputTokens":100,"outputTokens":200}}
```

**事件类型**

| 类型 | 说明 | 数据 |
|------|------|------|
| `chunk` | 文本数据块 | `{ delta, content }` |
| `tool` | 工具调用 | `{ name, emoji?, status? }` |
| `done` | 完成 | `{ content, metrics? }` |
| `error` | 错误 | `{ message }` |

**错误响应**

```json
{
  "error": "需要 agentKey 和 message"
}
```

---

## 使用示例

### JavaScript/Node.js

```javascript
const axios = require('axios')

const API_BASE = 'http://127.0.0.1:9300'

// 检查服务器状态
async function ping() {
  const response = await axios.get(`${API_BASE}/api/ping`)
  console.log('服务器状态:', response.data)
}

// 发送消息
async function sendMessage(message) {
  const response = await axios.post(`${API_BASE}/api/send`, {
    agentKey: 'hermes:main',
    message
  })
  return response.data.reply
}

// 流式发送消息
async function sendMessageStream(message) {
  const response = await axios.post(`${API_BASE}/api/send-stream`, {
    agentKey: 'hermes:main',
    message
  }, {
    responseType: 'stream'
  })

  response.data.on('data', (chunk) => {
    const lines = chunk.toString().split('\n')
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = JSON.parse(line.slice(6))
        if (data.type === 'chunk') {
          process.stdout.write(data.delta)
        } else if (data.type === 'done') {
          console.log('\n完成!')
        }
      }
    }
  })
}

// 使用示例
async function main() {
  await ping()
  const reply = await sendMessage('你好')
  console.log('回复:', reply)
  await sendMessageStream('写一首诗')
}

main().catch(console.error)
```

### Python

```python
import requests
import json

API_BASE = 'http://127.0.0.1:9300'

def ping():
    response = requests.get(f'{API_BASE}/api/ping')
    return response.json()

def send_message(message, agent_key='hermes:main'):
    response = requests.post(f'{API_BASE}/api/send', json={
        'agentKey': agent_key,
        'message': message
    })
    return response.json()['reply']

def send_message_stream(message, agent_key='hermes:main'):
    response = requests.post(f'{API_BASE}/api/send-stream', json={
        'agentKey': agent_key,
        'message': message
    }, stream=True)
    
    for line in response.iter_lines():
        if line:
            line = line.decode('utf-8')
            if line.startswith('data: '):
                data = json.loads(line[6:])
                if data['type'] == 'chunk':
                    print(data['delta'], end='', flush=True)
                elif data['type'] == 'done':
                    print('\n完成!')

# 使用示例
if __name__ == '__main__':
    print(ping())
    reply = send_message('你好')
    print(f'回复: {reply}')
    send_message_stream('写一首诗')
```

### cURL

```bash
# 健康检查
curl http://127.0.0.1:9300/api/ping

# 获取状态
curl http://127.0.0.1:9300/api/status

# 发送消息
curl -X POST http://127.0.0.1:9300/api/send \
  -H "Content-Type: application/json" \
  -d '{"agentKey": "hermes:main", "message": "你好"}'

# 流式发送消息
curl -X POST http://127.0.0.1:9300/api/send-stream \
  -H "Content-Type: application/json" \
  -d '{"agentKey": "hermes:main", "message": "你好"}'

# 扫描 AI
curl -X POST http://127.0.0.1:9300/api/scan
```

---

## 错误处理

### HTTP 状态码

| 状态码 | 说明 |
|--------|------|
| 200 | 成功 |
| 204 | 成功 (无内容，OPTIONS 请求) |
| 404 | 端点不存在 |
| 500 | 服务器内部错误 |

### 错误响应格式

```json
{
  "error": "错误描述信息",
  "path": "/api/xxx"
}
```

### 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| `需要 agentKey 和 message` | 请求参数缺失 | 检查请求体 |
| `适配器 xxx 不存在` | AI 类型不存在 | 检查 agentKey |
| `not found` | 端点不存在 | 检查 URL |
| `ECONNREFUSED` | 服务器未运行 | 启动 Echora |

---

## 安全注意事项

1. **仅本地访问**: API 服务器默认绑定到 `127.0.0.1`，只能从本机访问
2. **无认证**: 当前版本没有实现认证机制
3. **CORS**: 允许所有来源，仅用于开发方便
4. **生产环境**: 不建议在生产环境中暴露此 API

---

## 配置

### 端口配置

默认端口: `9300`

如需更改端口，修改 `src/main/index.ts` 中的 `createAPIServer` 调用：

```typescript
apiServer = createAPIServer(context, 9300)  // 修改为其他端口
```

### 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `ECHORA_API_PORT` | API 服务器端口 | `9300` |
| `API_SERVER_KEY` | API 服务器密钥 (未来版本) | 无 |

---

## 与 IPC API 的对比

| 特性 | HTTP API | IPC API |
|------|----------|---------|
| 访问方式 | HTTP 请求 | Electron IPC |
| 使用场景 | 外部工具/脚本 | 渲染进程 |
| 类型安全 | 无 | TypeScript 类型定义 |
| 流式支持 | SSE | 事件监听 |
| 认证 | 无 | 内置安全 |
| 性能 | 网络开销 | 进程间通信 |

**建议**: 
- Electron 应用内部使用 IPC API
- 外部工具/脚本使用 HTTP API

---

## 更新日志

### v2.0.0

- 初始版本
- 支持基本的 CRUD 操作
- 支持 SSE 流式响应
- 本地访问限制

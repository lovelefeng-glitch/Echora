# Claude-Collab MCP 服务器

> **用途**: 让 Claude 和 Hermes/OpenClaw 直接通讯，实现多 AI 协作开发
> **最后更新**: 2026-06-09

---

## 快速开始

### 1. 安装依赖

```bash
cd mcp-servers/claude-collab
npm install
```

### 2. 编译

```bash
npm run build
```

### 3. 配置 Claude

在 Claude 的 MCP 配置中添加这个服务器：

```json
{
  "mcpServers": {
    "claude-collab": {
      "command": "node",
      "args": ["E:\\AI\\Echora 2.0\\mcp-servers\\claude-collab\\dist\\index.js"]
    }
  }
}
```

### 4. 验证

重启 Claude，然后尝试调用 `check_ai_status` 工具。

---

## 工具列表

### ask_hermes

向 Hermes AI 发送消息并获取响应。

**参数**:
- `message` (必填): 发送给 Hermes 的消息或指令
- `model` (可选): 指定使用的模型
- `temperature` (可选): 温度参数，0-2，默认 0.7
- `maxTokens` (可选): 最大输出 token 数
- `timeoutMs` (可选): 超时时间（毫秒），默认 300000（5分钟）

**示例**:
```json
{
  "message": "测试 Echora 的构建，运行 npm run build 并返回结果",
  "timeoutMs": 600000
}
```

### ask_openclaw

向 OpenClaw AI 发送消息并获取响应。

**参数**:
- `message` (必填): 发送给 OpenClaw 的消息或指令
- `model` (可选): 指定使用的模型
- `agentId` (可选): 指定 Agent ID
- `temperature` (可选): 温度参数，0-2，默认 0.7
- `maxTokens` (可选): 最大输出 token 数
- `timeoutMs` (可选): 超时时间（毫秒），默认 300000（5分钟）

**示例**:
```json
{
  "message": "运行测试脚本 tests/test-echora.js 并返回结果",
  "timeoutMs": 600000
}
```

### check_ai_status

检查 Hermes 和 OpenClaw 的运行状态。

**参数**:
- `hermesPort` (可选): Hermes 端口，默认从配置读取
- `openclawPort` (可选): OpenClaw 端口，默认从配置读取

**示例**:
```json
{}
```

---

## 协作工作流

### 场景 1: Claude 修改代码 → Hermes 测试

```
1. Claude 修改源代码
2. Claude 调用 ask_hermes:
   message: "在 Echora 2.0 目录下运行 npm run build，返回构建结果"
3. Hermes 执行构建，返回结果
4. Claude 根据结果判断是否成功
5. 如果失败，Claude 根据错误信息修复代码
6. 重复步骤 2-5 直到构建成功
```

### 场景 2: Claude 验证功能

```
1. Claude 实现新功能
2. Claude 调用 ask_hermes:
   message: "启动 Echora 应用，检查 [功能名] 是否正常工作"
3. Hermes 启动应用并测试
4. 返回测试结果
5. Claude 根据结果修复问题
```

### 场景 3: 跨 AI 协作

```
1. Claude 调用 ask_hermes:
   message: "运行测试脚本并保存结果到 test-results.json"
2. Claude 调用 ask_openclaw:
   message: "读取 test-results.json，分析测试覆盖率"
3. OpenClaw 分析并返回报告
4. Claude 根据报告补充测试用例
```

---

## 配置

### 自动配置

服务器会自动从以下位置读取配置：

1. **Echora 配置**: `%LOCALAPPDATA%\Echora\echora-config.json`
2. **OpenClaw 配置**: `~/.openclaw/openclaw.json`

### 手动配置（环境变量）

```bash
# Hermes 配置
set HERMES_PORT=8083
set HERMES_API_KEY=echora-shared-secret

# OpenClaw 配置
set OPENCLAW_PORT=18789
set OPENCLAW_TOKEN=your-token-here
```

---

## 故障排除

### 问题: 连接失败

**可能原因**:
- Hermes/OpenClaw 未运行
- 端口配置错误
- 防火墙阻止

**解决方案**:
1. 检查 Hermes/OpenClaw 是否运行
2. 验证端口配置
3. 调用 `check_ai_status` 确认状态

### 问题: 超时

**可能原因**:
- 任务执行时间过长
- 网络延迟

**解决方案**:
1. 增加 `timeoutMs` 参数
2. 检查 Hermes/OpenClaw 的负载情况

### 问题: 认证失败

**可能原因**:
- API Key/Token 错误
- 配置文件损坏

**解决方案**:
1. 检查配置文件
2. 重新设置环境变量

---

## 技术细节

### 通讯协议

- 使用 OpenAI 兼容的 Chat Completions API
- HTTP/HTTPS 请求
- JSON 格式

### 错误处理

- 网络错误：返回详细错误信息
- 超时：可配置超时时间
- 认证失败：提示检查配置

### 性能优化

- 连接池复用
- 超时控制
- 异步执行

---

## 下一步

Phase 1 完成后，可以扩展：

- **Phase 2**: 异步任务管理（任务队列、状态查询）
- **Phase 3**: 开发工作流（自动测试、构建验证、调试会话）

详见: `docs/taskboard/task-artifact_claude-collab-mcp.md`

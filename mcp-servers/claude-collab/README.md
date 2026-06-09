# Claude-Collab MCP 服务器

让 Claude 和 Hermes/OpenClaw 直接通讯，实现多 AI 协作开发。

## 功能

✅ **独立运行**：不依赖 Echora，即使 Echora 关闭也能通讯
✅ **标准化**：使用 MCP 协议，Claude 原生支持
✅ **简单易用**：3 个工具即可开始协作

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

### 3. 测试连接

```bash
node test-quick.js
```

### 4. 配置 Claude

在 Claude 的 MCP 配置中添加：

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

### 5. 重启 Claude

重启 Claude 应用，即可使用以下工具：

- `ask_hermes` - 向 Hermes 发送消息
- `ask_openclaw` - 向 OpenClaw 发送消息
- `check_ai_status` - 检查运行状态

## 使用示例

### 场景 1: 让 Hermes 测试构建

```
Claude: 调用 ask_hermes
message: "在 Echora 2.0 目录下运行 npm run build，返回构建结果"
```

### 场景 2: 让 OpenClaw 分析代码

```
Claude: 调用 ask_openclaw
message: "分析 src/renderer/App.tsx 的代码质量，给出改进建议"
```

### 场景 3: 检查状态

```
Claude: 调用 check_ai_status
（无参数）
```

## 文档

- **详细使用说明**: [SKILL.md](SKILL.md)
- **实现计划**: `docs/taskboard/task-artifact_claude-collab-mcp.md`

## 架构

```
Claude (你)
  ↓ MCP 工具调用
Claude-Collab MCP 服务器
  ↓ HTTP API
Hermes (8083) / OpenClaw (18789)
```

## 优势

1. **独立于 Echora**：即使 Echora 关闭或崩溃，通讯仍然有效
2. **异步执行**：长时间运行的任务不会阻塞 Claude
3. **错误处理**：完善的错误信息和超时控制
4. **配置灵活**：支持自动配置和手动配置

## 下一步

Phase 1 完成后，可以扩展：

- **Phase 2**: 异步任务管理（任务队列、状态查询）
- **Phase 3**: 开发工作流（自动测试、构建验证、调试会话）

详见实现计划文档。

## 故障排除

### 问题: 连接失败

```bash
# 检查 Hermes 是否运行
netstat -ano | findstr :8083

# 检查 OpenClaw 是否运行
netstat -ano | findstr :18789
```

### 问题: npm install 失败

```bash
# 清除缓存
npm cache clean --force

# 重新安装
npm install
```

### 问题: 编译失败

```bash
# 检查 TypeScript 版本
npx tsc --version

# 重新编译
npm run build
```

## 贡献

欢迎提交 Issue 和 Pull Request！

## 许可证

MIT

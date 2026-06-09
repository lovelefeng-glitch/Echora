# Echora Dev MCP Server

让 Claude 能够直接操作你的 Windows 机器：构建项目、运行测试、执行命令等。

## 安装

```powershell
cd "E:\AI\Echora 2.0\mcp-servers\echora-dev"
npm install
```

## 配置 Claude Desktop

1. 打开 Claude Desktop → Settings → Developer → Edit Config
2. 编辑 `claude_desktop_config.json`，在 `mcpServers` 中添加：

```json
{
  "mcpServers": {
    "echora-dev": {
      "command": "node",
      "args": ["E:\\AI\\Echora 2.0\\mcp-servers\\echora-dev\\server.js"],
      "env": {
        "ECHORA_ROOT": "E:\\AI\\Echora 2.0"
      }
    }
  }
}
```

3. 重启 Claude Desktop

## 提供的工具

| 工具 | 功能 | 示例 |
|------|------|------|
| `run_command` | 执行任意 Windows 命令 | `npm run build`、`git status` |
| `build_project` | 构建 Echora 项目 | 自动执行 `npm run build` |
| `run_tests` | 运行 Playwright 测试 | 运行指定测试文件或全部测试 |
| `start_dev` | 启动开发服务器 | 启动 `dev.cmd` 并监控 |
| `file_read` | 读取 Windows 文件 | 读取配置文件、日志等 |
| `file_write` | 写入 Windows 文件 | 创建/修改文件 |
| `list_processes` | 列出相关进程 | 查看 Electron/Node 进程 |
| `kill_process` | 终止进程 | 杀掉卡死的 Electron |
| `git_status` | 查看 Git 状态 | status + diff + log |
| `take_screenshot` | 屏幕截图 | 截图保存到文件 |

## 使用示例

安装配置后，你可以直接对 Claude 说：

- "帮我构建 Echora" → Claude 调用 `build_project`
- "运行 token 显示测试" → Claude 调用 `run_tests`
- "看看 Git 状态" → Claude 调用 `git_status`
- "启动开发服务器" → Claude 调用 `start_dev`
- "截个图看看当前界面" → Claude 调用 `take_screenshot`

## 注意事项

- MCP 服务器运行在 Windows 上，拥有完整的系统权限
- `run_command` 可以执行任何命令，请谨慎使用
- 长时间运行的命令（如 dev server）会在 10 秒后自动返回已有输出

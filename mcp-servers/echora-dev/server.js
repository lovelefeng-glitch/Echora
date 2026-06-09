#!/usr/bin/env node
/**
 * Echora Dev MCP Server
 *
 * 让 Claude 能够操作 Windows 机器：执行命令、构建项目、运行测试等。
 *
 * 安装：
 *   cd E:\AI\Echora 2.0\mcp-servers\echora-dev
 *   npm install
 *
 * 配置 Claude Desktop：
 *   编辑 %APPDATA%\Claude\claude_desktop_config.json，添加：
 *   {
 *     "mcpServers": {
 *       "echora-dev": {
 *         "command": "node",
 *         "args": ["E:\\AI\\Echora 2.0\\mcp-servers\\echora-dev\\server.js"]
 *       }
 *     }
 *   }
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { execSync, spawn } from 'child_process'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = process.env.ECHORA_ROOT || 'E:\\AI\\Echora 2.0'

// ─── 工具执行辅助 ───────────────────────────────

/**
 * 执行 Windows 命令，带超时和输出限制
 */
function runCommand(command, options = {}) {
  const { cwd = PROJECT_ROOT, timeout = 60000, maxOutput = 10000 } = options

  try {
    const output = execSync(command, {
      cwd,
      timeout,
      maxBuffer: maxOutput * 2,
      encoding: 'utf-8',
      shell: 'cmd.exe',
      env: { ...process.env, FORCE_COLOR: '0' }  // 禁用颜色码
    })
    return {
      success: true,
      output: output.substring(0, maxOutput).trim(),
      exitCode: 0
    }
  } catch (error) {
    const stdout = error.stdout ? String(error.stdout).substring(0, maxOutput) : ''
    const stderr = error.stderr ? String(error.stderr).substring(0, maxOutput) : ''
    return {
      success: error.status === 0,
      output: (stdout + '\n' + stderr).trim(),
      exitCode: error.status || 1
    }
  }
}

/**
 * 异步执行长时间命令（用于 dev server 等），通过 Promise 管理
 */
function runLongCommand(command, cwd = PROJECT_ROOT) {
  return new Promise((resolve) => {
    const proc = spawn(command, [], {
      cwd,
      shell: true,
      env: { ...process.env, FORCE_COLOR: '0' }
    })

    let stdout = ''
    let stderr = ''

    proc.stdout.on('data', (data) => { stdout += data.toString() })
    proc.stderr.on('data', (data) => { stderr += data.toString() })

    // 10 秒后自动停止并返回已有输出
    const timer = setTimeout(() => {
      proc.kill()
      resolve({
        success: true,
        output: `[已启动并运行 10 秒]\n${stdout.substring(0, 5000)}\n${stderr.substring(0, 2000)}`.trim(),
        exitCode: 0
      })
    }, 10000)

    proc.on('close', (code) => {
      clearTimeout(timer)
      resolve({
        success: code === 0,
        output: (stdout + '\n' + stderr).substring(0, 8000).trim(),
        exitCode: code || 0
      })
    })
  })
}

// ─── 创建 MCP 服务器 ─────────────────────────────

const server = new McpServer({
  name: 'echora-dev',
  version: '1.0.0'
})

// ═══════════════════════════════════════════════════
// 工具 1: run_command — 执行任意 Windows 命令
// ═══════════════════════════════════════════════════
server.tool(
  'run_command',
  '在 Windows 上执行任意命令（构建、安装依赖、运行脚本等）',
  {
    command: z.string().describe('要执行的命令，如 "npm run build"、"dir"、"git status"'),
    cwd: z.string().optional().describe('工作目录，默认为 Echora 项目根目录'),
    timeout: z.number().optional().describe('超时毫秒数，默认 60000')
  },
  async ({ command, cwd, timeout }) => {
    const result = runCommand(command, { cwd, timeout })
    return {
      content: [{
        type: 'text',
        text: `命令: ${command}\n退出码: ${result.exitCode}\n\n${result.output}`
      }]
    }
  }
)

// ═══════════════════════════════════════════════════
// 工具 2: build_project — 构建 Echora
// ═══════════════════════════════════════════════════
server.tool(
  'build_project',
  '构建 Echora 项目（执行 npm run build）',
  {
    clean: z.boolean().optional().describe('是否先清理旧构建产物（默认 false）')
  },
  async ({ clean }) => {
    let commands = []
    if (clean) {
      commands.push('if exist out rmdir /s /q out')
      commands.push('if exist release rmdir /s /q release')
    }
    commands.push('npm run build')

    const result = runCommand(commands.join(' && '), { timeout: 120000 })
    return {
      content: [{
        type: 'text',
        text: `构建${clean ? '(含清理)' : ''}\n退出码: ${result.exitCode}\n\n${result.output}`
      }]
    }
  }
)

// ═══════════════════════════════════════════════════
// 工具 3: run_tests — 运行 Playwright E2E 测试
// ═══════════════════════════════════════════════════
server.tool(
  'run_tests',
  '运行 E2E 或单元测试',
  {
    test_file: z.string().optional().describe('测试文件路径（相对于 tests/），如 "e2e/token-display-test.spec.ts"。为空则运行所有测试'),
    reporter: z.string().optional().describe('报告格式，默认 "list"')
  },
  async ({ test_file, reporter }) => {
    let cmd = 'npx playwright test'
    if (test_file) {
      cmd += ` tests/${test_file}`
    }
    cmd += ` --reporter=${reporter || 'list'}`

    const result = runCommand(cmd, { timeout: 180000 })
    return {
      content: [{
        type: 'text',
        text: `测试命令: ${cmd}\n退出码: ${result.exitCode}\n\n${result.output}`
      }]
    }
  }
)

// ═══════════════════════════════════════════════════
// 工具 4: start_dev — 启动开发服务器
// ═══════════════════════════════════════════════════
server.tool(
  'start_dev',
  '启动 Echora 开发服务器（dev.cmd）并监控 10 秒',
  {},
  async () => {
    const result = await runLongCommand('npm run dev')
    return {
      content: [{
        type: 'text',
        text: `开发服务器启动\n${result.output}`
      }]
    }
  }
)

// ═══════════════════════════════════════════════════
// 工具 5: file_read — 读取 Windows 文件
// ═══════════════════════════════════════════════════
server.tool(
  'file_read',
  '读取 Windows 上的文件内容',
  {
    path: z.string().describe('文件绝对路径'),
    max_lines: z.number().optional().describe('最多读取行数（默认全部）')
  },
  async ({ path, max_lines }) => {
    try {
      let content = readFileSync(path, 'utf-8')
      if (max_lines) {
        content = content.split('\n').slice(0, max_lines).join('\n')
      }
      return {
        content: [{ type: 'text', text: content.substring(0, 30000) }]
      }
    } catch (e) {
      return {
        content: [{ type: 'text', text: `读取失败: ${e.message}` }],
        isError: true
      }
    }
  }
)

// ═══════════════════════════════════════════════════
// 工具 6: file_write — 写入 Windows 文件
// ═══════════════════════════════════════════════════
server.tool(
  'file_write',
  '写入内容到 Windows 文件',
  {
    path: z.string().describe('文件绝对路径'),
    content: z.string().describe('要写入的内容')
  },
  async ({ path, content }) => {
    try {
      // 自动创建目录
      const dir = dirname(path)
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true })
      }
      writeFileSync(path, content, 'utf-8')
      return {
        content: [{ type: 'text', text: `✅ 已写入: ${path} (${content.length} 字符)` }]
      }
    } catch (e) {
      return {
        content: [{ type: 'text', text: `写入失败: ${e.message}` }],
        isError: true
      }
    }
  }
)

// ═══════════════════════════════════════════════════
// 工具 7: list_processes — 列出相关进程
// ═══════════════════════════════════════════════════
server.tool(
  'list_processes',
  '列出正在运行的 Electron/Node/Playwright 进程',
  {},
  async () => {
    const result = runCommand('tasklist /FI "IMAGENAME eq electron.exe" /FI "IMAGENAME eq node.exe" /FO CSV && tasklist /FI "IMAGENAME eq playwright.exe" /FO CSV', { timeout: 5000 })
    return {
      content: [{ type: 'text', text: result.output || '无相关进程' }]
    }
  }
)

// ═══════════════════════════════════════════════════
// 工具 8: kill_process — 杀掉进程
// ═══════════════════════════════════════════════════
server.tool(
  'kill_process',
  '终止指定进程',
  {
    name: z.string().describe('进程名，如 "electron.exe"')
  },
  async ({ name }) => {
    const result = runCommand(`taskkill /F /IM ${name}`, { timeout: 5000 })
    return {
      content: [{ type: 'text', text: `终止 ${name}\n${result.output}` }]
    }
  }
)

// ═══════════════════════════════════════════════════
// 工具 9: git_status — Git 状态
// ═══════════════════════════════════════════════════
server.tool(
  'git_status',
  '查看 Git 状态（status + diff 摘要）',
  {},
  async () => {
    const status = runCommand('git status --short')
    const diff = runCommand('git diff --stat')
    const log = runCommand('git log --oneline -5')
    return {
      content: [{
        type: 'text',
        text: `=== Git Status ===\n${status.output}\n\n=== Diff Stats ===\n${diff.output}\n\n=== 最近 5 条提交 ===\n${log.output}`
      }]
    }
  }
)

// ═══════════════════════════════════════════════════
// 工具 10: screenshot — 截图对比
// ═══════════════════════════════════════════════════
server.tool(
  'take_screenshot',
  '对当前屏幕截图并保存',
  {
    output_path: z.string().optional().describe('保存路径，默认 test-results/screenshot.png')
  },
  async ({ output_path }) => {
    const savePath = output_path || join(PROJECT_ROOT, 'test-results', 'screenshot.png')
    // 确保目录存在
    const dir = dirname(savePath)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })

    // 使用 PowerShell 截图
    const psScript = `
      Add-Type -AssemblyName System.Windows.Forms
      Add-Type -AssemblyName System.Drawing
      $screen = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
      $bitmap = New-Object System.Drawing.Bitmap $screen.Width, $screen.Height
      $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
      $graphics.CopyFromScreen($screen.Location, [System.Drawing.Point]::Empty, $screen.Size)
      $bitmap.Save("${savePath.replace(/\\/g, '\\\\')}")
      $graphics.Dispose()
      $bitmap.Dispose()
      Write-Output "截图已保存: ${savePath.replace(/\\/g, '\\\\')}"
    `
    const result = runCommand(`powershell -Command "${psScript.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`, { timeout: 10000 })
    return {
      content: [{ type: 'text', text: result.output || '截图完成' }]
    }
  }
)

// ─── 启动服务器 ────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error('Echora Dev MCP Server 已启动')
}

main().catch(error => {
  console.error('启动失败:', error)
  process.exit(1)
})

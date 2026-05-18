# ai-detector.js — AI 软件检测器

> **文件**: `src/detectors/ai-detector.js`  
> **职责**: 扫描文件系统 + 检测运行中网关进程 + 端口验证  
> **最后更新**: 2026-05-17 (v0.2)

---

## 导出对象: AIDetector

```js
const AIDetector = require('./src/detectors/ai-detector');
```

---

## API

### `AIDetector.scanAll(existingPaths?) → Promise<AIDetected>`

完整扫描。`existingPaths` 是 `ConfigManager.get('aiPaths')` 的返回值。

```ts
AIDetected = {
  [aiType: string]: AIDetectedItem
}
```

### `AIDetector.scanFiles(existingPaths?) → FileResults`

仅文件系统扫描（同步）。

```ts
FileResults = {
  [aiType: string]: FileResultItem
}

FileResultItem = {
  found: boolean,
  path: string | null,
  source: 'auto' | 'manual' | 'path' | null,
  verified: boolean
}
```

### `AIDetector.scanGateways() → Promise<GatewayResults>`

仅扫描运行中网关（异步，含 HTTP 验证）。

```ts
GatewayResults = {
  [aiType: string]: GatewayInfo | null  // null = 未检测到
}
```

### `AIDetector.getKnownList() → KnownAI[]`

返回已知 AI 列表。

```ts
KnownAI = {
  id: string,
  name: string,
  category: 'agent' | 'ide'
}
```

---

## 内置函数

### `parseNetstat() → Map<pid, port[]>`

解析 `netstat -ano`，返回 PID→端口列表映射。

**数据格式**:
```
输入行: TCP    127.0.0.1:28789  0.0.0.0:0  LISTENING  13140
正则:   /TCP\s+\S+:(\d+)\s+\S+\s+LISTENING\s+(\d+)/i
捕获:   $1 = 端口, $2 = PID
```

### `getProcesses() → Process[]`

通过 PowerShell 获取所有进程。

```ts
Process = {
  ProcessId: number,
  Name: string,
  CommandLine: string
}
```

---

## 已知 AI 注册表

### QClaw
- **文件检测**: `C:\Program Files\QClaw\QClaw.exe`
- **网关进程**: `QClaw.exe` + 命令行含 `openclaw-gateway`

### OpenClaw
- **文件检测**: 多个路径 + PATH 查找
- **网关进程**: `node.exe` + 命令行含 `openclaw`

### Cursor / Windsurf / Trae / VS Code
- **文件检测**: 标准安装路径
- **无网关检测**

---

## 修改注意事项

- 新增 AI：在 `KNOWN_AI_SOFTWARE` 中注册
- 新增网关模式：添加 `gatewayPatterns: [{ processName, cmdlineIncludes }]`
- HTTP 验证超时固定 3000ms — 不要随意改大（会拖慢扫描）
- `scanGateways()` 是 async — 调用方必须 await

---

## Bug 与隐患

| 问题 | 严重度 | 说明 |
|------|--------|------|
| PowerShell 编码问题 | 中 | 命令行含中文时可能 JSON 解析失败 |
| netstat 端口重复 | 低 | 同一端口可能 IPv4+IPv6 各出现一次 |
| 大量进程时性能 | 低 | `Get-CimInstance Win32_Process` 无过滤条件 |
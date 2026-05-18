# gateway-manager.js — 网关生命周期管理器

> **文件**: `src/manager/gateway-manager.js`  
> **职责**: 启动/停止/重启 AI 网关，接管外部进程  
> **最后更新**: 2026-05-17 (v0.2)

---

## 类: GatewayManager

```js
const GatewayManager = require('./src/manager/gateway-manager');
const gw = new GatewayManager();
```

---

## 核心数据结构

### `this.processes`: Map<aiType, ProcessInfo>

```ts
type ProcessInfo = {
  process: ChildProcess | null,  // null = 外部进程（attach来的）
  pid: number,
  status: 'starting' | 'running' | 'stopped' | 'error',
  aiType: string,
  // 仅 running 时有值:
  port: number | null,
  url: string | null,
  // 进程所有权:
  owned: boolean,       // true=Echora启动的(可kill), false=外部进程(只移除管理)
  startTime: number,    // Date.now()
  // 仅 owned=true:
  exePath?: string,
  config?: object,
}
```

---

## API

### `gatewayManager.setMainWindow(win)`

设置 Electron BrowserWindow 引用，用于推送状态变化。

### `gatewayManager.attach(aiType, info)`

**接管外部进程**（不启动新进程）。info 格式:

```ts
AttachInfo = {
  pid: number,          // 进程 PID（0 表示未知）
  port: number,         // 网关监听端口
  url: string,          // http://127.0.0.1:<port>
}
```

**行为**:
- 如果该 aiType 已被管理 → 不操作
- `owned` 设为 `false`
- 不创建 ChildProcess 引用
- 不做 `taskkill`

### `gatewayManager.start(aiType, exePath, config?) → Promise<StartResult>`

```ts
StartConfig = {
  port?: number,
  env?: object,
  args?: string[]
}

StartResult = {
  success: boolean,
  message?: string,
  pid?: number,
  status?: string
}
```

**行为**:
- 如果该 AI 已在 attach 状态（external running）→ 直接返回 success
- 检查 `exePath` 是否存在
- QClaw/OpenClaw 启动命令: `<exePath> gateway start --port <port>`
- 等待 1500ms 后标记为 running

### `gatewayManager.stop(aiType) → Promise<StopResult>`

**行为**:
- 外部进程 (`owned=false`): 只从管理列表移除，不 kill
- Echora 进程 (`owned=true`): `taskkill /pid <pid> /T /F` (Windows) 或 `SIGTERM`

### `gatewayManager.restart(aiType) → Promise<StartResult>`

先 stop 等 500ms 再 start。**注意**: 如果原进程是外部启动的 (`owned=false`)，restart 会尝试用 `exePath` 重新启动。如果 `exePath` 不存在，会报错。

### `gatewayManager.getAllStatus() → GatewayStatusMap`

```ts
GatewayStatusMap = {
  [aiType: string]: {
    status: string,
    pid: number,
    port: number | null,
    url: string | null,
    owned: boolean,
    uptime: number,      // 毫秒
  }
}
```

### `gatewayManager.checkAlive(aiType) → Promise<boolean>`

通过 HTTP 请求检查网关是否响应。

### `gatewayManager.shutdownAll()`

关闭所有 Echora 启动的网关（跳过外部进程）。

---

## 事件推送

通过 `gateway:statusChange` 通道推送到渲染进程:

```ts
StatusChangeEvent = {
  aiType: string,
  status: string,
  extra?: any,
  timestamp: number
}
```

---

## 修改注意事项

- `attach()` 不会 kill 用户进程 — 这是安全红线
- `stop()` 对所有 `owned=false` 的进程只做清理不做 kill
- `buildStartCommand()` 仅支持 `openclaw` 和 `qclaw` — 其他 AI 直接用 `config.args`
- `start()` 等待 1500ms 可能不够 — QClaw 冷启动可能需要更久
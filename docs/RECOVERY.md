# 灾难恢复与故障排查

> **最后更新**: 2026-05-23  
> **版本**: v1.0  
> **目的**: 出问题时快速定位、修复、恢复

---

## 一、配置文件损坏恢复

### 场景 1: 原配置被写坏

**症状**: AI 软件启动失败、配置读取报错  
**恢复步骤**:

```bash
# 1. 检查备份目录
dir E:\AI\Echora\backups\

# 2. 找到最近的备份文件（按时间排序）
# 格式: {aiType}_{timestamp}.json

# 3. 复制备份到原位
copy backups\qclaw_2026-05-23T04-30-00.json %USERPROFILE%\.qclaw\openclaw.json
copy backups\openclaw_2026-05-23T04-30-00.json %USERPROFILE%\.openclaw\openclaw.json
copy backups\hermes_2026-05-23T04-30-00.json %USERPROFILE%\AppData\Local\hermes\config.yaml
```

### 场景 2: 草稿文件损坏

**症状**: Settings 面板参数异常、显示空白  
**恢复步骤**:

```bash
# 重置草稿 = 从原配置重新生成
# 方法 1: 在 Echora UI 点击「🔄 重置」按钮
# 方法 2: 手动删除草稿文件，重启 Echora 自动重建
del E:\AI\Echora\drafts\*.json
# 重启 Echora
```

### 场景 3: echora-config.json 损坏

**症状**: Echora 启动后状态全空、AI 路径丢失  
**恢复步骤**:

```bash
# 删除配置文件，Echora 会以默认配置重启
del %APPDATA%\echora\echora-config.json
# 重启 Echora → 走首次运行流程 → 重新配置 AI 路径
```

---

## 二、网关问题排查

### 场景 4: 端口被占用

**症状**: `gateway:start` 返回端口冲突  
**排查**:

```powershell
# 检查端口占用
netstat -ano | findstr :28789    # QClaw
netstat -ano | findstr :18789    # OpenClaw
netstat -ano | findstr :8083     # Hermes

# 查看占用进程
tasklist /FI "PID eq <PID>"
```

**解决**: 关闭旧进程或修改端口配置

### 场景 5: 网关进程启动但不响应

**症状**: 状态灯一直是黄色（starting）  
**排查**:

```powershell
# 1. 检查进程是否存在
tasklist | findstr /I "QClaw openclaw hermes"

# 2. 检查端口是否监听
netstat -ano | findstr LISTENING | findstr :28789

# 3. 检查日志
# Electron console.log 输出在终端窗口
```

### 场景 6: Hermes 状态检测失败

**症状**: Hermes 状态灯一直灰色  
**排查**:

```powershell
# 1. 检查 gateway_state.json
type %USERPROFILE%\AppData\Local\hermes\gateway_state.json

# 2. 检查 PID 是否存活
tasklist /FI "PID eq <PID from gateway_state.json>"

# 3. 检查 API Server
curl.exe http://127.0.0.1:8083/health
```

---

## 三、消息问题排查

### 场景 7: 消息发送无响应

**症状**: 点击发送后一直转圈  
**排查**:

```powershell
# 1. 检查网关状态
curl.exe http://127.0.0.1:28789/health    # QClaw
curl.exe http://127.0.0.1:18789/health    # OpenClaw
curl.exe http://127.0.0.1:8083/health     # Hermes

# 2. 检查 token 是否正确
# 在 Echora 设置页查看对应 AI 的配置
```

### 场景 8: 流式消息中断

**症状**: 消息开始输出但中途停止  
**排查**:

```powershell
# 1. 检查超时设置（默认 120000ms = 2分钟）
# 在 Settings → 全局设置 中调整

# 2. 检查 Hermes agent.gateway_timeout（默认 300秒）
# 在 Settings → hermes 面板中查看

# 3. 检查 Proxy 是否正常
curl.exe http://127.0.0.1:8085/health
```

### 场景 9: 消息显示在错误的 AI 窗口

**症状**: 切换 Agent 后，之前的回复出现在新 Agent 的窗口  
**原因**: 跨 Agent 消息路由问题（已修复 P1-39）  
**确认**: 检查 `STATE.activeStreams` 是否正确追踪

---

## 四、UI 问题排查

### 场景 10: Settings 面板参数丢失

**症状**: 之前显示的参数现在不显示  
**原因**: 草稿文件未经过 normalize（已修复 P2-17）  
**恢复**:

```bash
# 重置草稿
del E:\AI\Echora\drafts\*.json
# 重启 Echora → 自动从原配置重新 normalize
```

### 场景 11: 渲染器白屏

**症状**: Echora 启动后主窗口空白  
**排查**:

```powershell
# 1. 检查 preload.js 是否有语法错误
node -c E:\AI\Echora\preload.js

# 2. 检查 renderer.js 是否有语法错误
node -c E:\AI\Echora\src\ui\renderer.js

# 3. 检查 Chromium DevTools（Ctrl+Shift+I）
# 查看 Console 标签的错误信息
```

---

## 五、开发环境恢复

### 场景 12: node_modules 损坏

```bash
cd E:\AI\Echora
rd /s /q node_modules
npm install
```

### 场景 13: Playwright 浏览器丢失

```bash
cd E:\AI\Echora
npx playwright install chromium
```

### 场景 14: 全量语法检查

```bash
cd E:\AI\Echora
node -c main.js
node -c preload.js
node -c src\manager\config-manager.js
node -c src\manager\config-reader.js
node -c src\manager\draft-manager.js
node -c src\manager\gateway-manager.js
node -c src\api-server.js
node -c src\proxy\echora-proxy.js
node -c src\adapters\base-adapter.js
node -c src\adapters\openclaw-adapter.js
node -c src\adapters\qclaw-adapter.js
node -c src\adapters\hermes-adapter.js
node -c src\adapters\cursor-adapter.js
node -c src\detectors\ai-detector.js
node -c src\detectors\env-checker.js
node -c src\detectors\port-scanner.js
node -c src\detectors\state-reader.js
```

---

## 六、关键路径速查

| 资源 | 路径 |
|------|------|
| Echora 配置 | `%APPDATA%/echora/echora-config.json` |
| QClaw 配置 | `~/.qclaw/openclaw.json` |
| OpenClaw 配置 | `~/.openclaw/openclaw.json` |
| Hermes 配置 | `~/AppData/Local/hermes/config.yaml` |
| Hermes gateway_state | `~/AppData/Local/hermes/gateway_state.json` |
| 草稿文件 | `E:\AI\Echora\drafts\` |
| 备份文件 | `E:\AI\Echora\backups\` |
| Echora 源码 | `E:\AI\Echora\src\` |
| 测试文件 | `E:\AI\Echora\tests\` |
| 文档 | `E:\AI\Echora\docs\` |

---

## 七、紧急联系

| 场景 | 操作 |
|------|------|
| 配置丢失 | 查 `backups/` 目录 → 复制最近备份 |
| 草稿损坏 | 删除 `drafts/*.json` → 重启 Echora |
| Echora 崩溃 | 删除 `%APPDATA%/echora/echora-config.json` → 重启 |
| 网关失控 | `taskkill /F /PID <pid>` → 重启 Echora |
| 代码损坏 | git 恢复 → `node -c` 验证语法 → 重启 Echora |

---

*最后更新: 2026-05-23 | 作者: 小雪*

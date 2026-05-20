# Markdown 渲染成功模式

> 记录时间：2026-05-20
> 用于：renderer.js 中渲染 AI 回复时调用

## 背景

Electron 渲染进程中渲染 Markdown 内容。最初尝试在 `preload.js` 中用 `require('marked')` 加载，导致整个 `contextBridge.exposeInMainWorld` 静默失败，`window.echora` 为 `undefined`，所有功能崩溃。

## 正确方案：UMD + `<script>` 标签

### 1. 在 `index.html` 中加载 marked.umd.js

```html
<!-- 必须在 renderer.js 之前加载 -->
<script src="../node_modules/marked/lib/marked.umd.js"></script>
<script src="ui/renderer.js"></script>
</body>
</html>
```

> **注意**：不能用 CDN（CSP `script-src 'self'` 阻止），必须用本地文件。

### 2. 在 `renderer.js` 中使用

```js
function addMessage(role, text, msgId, save = true) {
  // ...
  const rendered = (role === 'assistant' && typeof marked !== 'undefined')
    ? marked.parse(text)
    : text;
  msg.innerHTML = `<div class="msg-avatar">${avatarIcon}</div><div class="msg-body">${rendered}</div>`;
  // ...
}
```

### 3. CSS 样式（已有，在 styles.css）

```css
/* L725+ */
.msg-body pre { background: #1a1f2a; ... }
.msg-body code { ... }
.msg-body blockquote { ... }
.msg-body table { ... }
```

## 关键教训

| ❌ 错误做法 | ✅ 正确做法 |
|---|---|
| 在 `preload.js` 里 `require('marked')` | 在 `index.html` 用 `<script>` 加载 UMD 包 |
| 假设 npm 包在渲染进程可用 | 渲染进程只能用全局变量（`window.marked`）|
| 一次改多个函数 | 每次只改 1 个函数，改完验证 |

## CSP 注意事项

`index.html` 的 CSP 头：
```html
<meta http-equiv="Content-Security-Policy"
      content="default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'">
```

- `script-src 'self'` → 只允许本地 JS，不能用 CDN
- 解决：把 `node_modules/marked/lib/marked.umd.js` 放在项目目录内引用

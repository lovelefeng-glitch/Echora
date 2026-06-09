# 并排预览功能设计方案

> **创建日期**: 2026-06-07
> **目标**: 在 Echora 2.0 中实现类似 Hermes 桌面版的并排预览功能

---

## 一、功能概述

### 1.1 什么是并排预览

**左边聊天，右边实时显示内容**

用户在与 AI 对话的同时，可以在右侧面板看到：
- AI 生成的网页/HTML 实时渲染
- AI 编辑的代码文件（带语法高亮）
- 工具调用的实时输出
- 控制台日志

### 1.2 使用场景

| 场景 | 左侧 | 右侧 |
|------|------|------|
| 让 AI 写网页 | 对话 | 网页实时预览 |
| 让 AI 改代码 | 对话 | 文件内容 + 高亮 |
| AI 运行命令 | 对话 | 控制台日志 |
| 无预览需求 | 对话 | 隐藏/折叠 |

---

## 二、当前布局分析

### 2.1 现有结构

```
┌─────────────────────────────────────────────────────┐
│                    TitleBar                          │
├──────────┬──────────────────────────────────────────┤
│          │                                          │
│ Sidebar  │              MainContent                 │
│ (260px)  │              (flex: 1)                   │
│          │                                          │
│          │                                          │
└──────────┴──────────────────────────────────────────┘
```

### 2.2 CSS 布局

```css
.app-body {
  display: flex;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  padding: 36px 12px 12px 0;
}
```

---

## 三、新布局设计

### 3.1 目标布局

```
┌──────────────────────────────────────────────────────────────────┐
│                         TitleBar                                  │
├──────────┬─────────────────────────────┬─────────────────────────┤
│          │                             │                         │
│ Sidebar  │        MainContent          │      PreviewPane        │
│ (260px)  │        (flex: 1)            │      (40%, 可拖拽)      │
│          │                             │                         │
│          │    ┌─────────────────┐      │   ┌─────────────────┐  │
│          │    │   Chat Area     │      │   │  Web Preview    │  │
│          │    │                 │      │   │  / Code View    │  │
│          │    │                 │      │   │  / Console      │  │
│          │    └─────────────────┘      │   └─────────────────┘  │
│          │                             │                         │
└──────────┴─────────────────────────────┴─────────────────────────┘
```

### 3.2 新增 CSS 变量

```css
:root {
  --preview-width: 40%;           /* 预览面板默认宽度 */
  --preview-min-width: 300px;     /* 最小宽度 */
  --preview-max-width: 60%;       /* 最大宽度 */
  --preview-header-height: 40px;  /* 预览面板头部高度 */
}
```

### 3.3 新增 CSS 布局

```css
/* 预览面板容器 */
.preview-pane {
  width: var(--preview-width);
  min-width: var(--preview-min-width);
  max-width: var(--preview-max-width);
  display: flex;
  flex-direction: column;
  background: var(--bg-card);
  border-left: 1px solid var(--border);
  position: relative;
}

/* 预览面板头部 */
.preview-header {
  height: var(--preview-header-height);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-secondary);
}

/* 预览内容区 */
.preview-content {
  flex: 1;
  overflow: auto;
  min-height: 0;
}

/* 拖拽手柄 */
.preview-resize-handle {
  position: absolute;
  left: -4px;
  top: 0;
  bottom: 0;
  width: 8px;
  cursor: col-resize;
  z-index: 10;
}

.preview-resize-handle:hover {
  background: var(--accent-subtle);
}
```

---

## 四、组件设计

### 4.1 新增组件

```
src/renderer/components/preview/
├── PreviewPane.tsx          # 预览面板主组件
├── PreviewHeader.tsx        # 预览面板头部（标签栏 + 操作按钮）
├── WebPreview.tsx           # 网页预览（webview）
├── CodePreview.tsx          # 代码预览（Shiki 高亮）
├── ConsolePreview.tsx       # 控制台日志预览
├── ResizeHandle.tsx         # 拖拽调整大小手柄
└── index.ts                 # 导出
```

### 4.2 PreviewPane 组件

```typescript
interface PreviewPaneProps {
  visible: boolean;           // 是否显示
  target: PreviewTarget | null;  // 预览目标
  onClose: () => void;       // 关闭回调
  onResize?: (width: number) => void;  // 调整大小回调
}

type PreviewTarget = 
  | { type: 'url'; url: string; title?: string }
  | { type: 'file'; path: string; content: string; language?: string }
  | { type: 'console'; logs: LogEntry[] }
  | { type: 'html'; html: string; title?: string };
```

### 4.3 Store 扩展

```typescript
// app-store.ts 新增
interface PreviewState {
  previewVisible: boolean;
  previewTarget: PreviewTarget | null;
  previewWidth: number;
  
  showPreview: (target: PreviewTarget) => void;
  hidePreview: () => void;
  setPreviewWidth: (width: number) => void;
  updatePreviewTarget: (target: PreviewTarget) => void;
}
```

---

## 五、触发方式

### 5.1 自动触发

| 事件 | 触发预览 |
|------|----------|
| AI 生成 HTML/网页 | 自动显示 WebPreview |
| AI 调用 file_write 工具 | 自动显示 CodePreview |
| AI 调用 terminal 工具 | 自动显示 ConsolePreview |

### 5.2 手动触发

- 工具调用结果旁的「👁️ 预览」按钮
- 右键菜单「在预览面板打开」
- 快捷键 `Ctrl+P` 切换预览面板

---

## 六、IPC 通道扩展

### 6.1 新增通道

```typescript
// 预览相关 IPC
'preview:show'      // 显示预览
'preview:hide'      // 隐藏预览
'preview:update'    // 更新预览内容
'preview:resize'    // 调整预览面板大小
```

### 6.2 Preload API 扩展

```typescript
window.echora.preview = {
  show: (target: PreviewTarget) => void,
  hide: () => void,
  update: (target: PreviewTarget) => void,
  onResize: (callback: (width: number) => void) => () => void,
}
```

---

## 七、实现步骤

### Phase 1: 基础框架（1-2天）
1. 创建 `preview/` 组件目录
2. 实现 `PreviewPane` 主容器
3. 实现 `ResizeHandle` 拖拽功能
4. 添加 CSS 布局样式
5. 修改 `App.tsx` 集成预览面板

### Phase 2: 网页预览（1-2天）
1. 实现 `WebPreview` 组件（使用 `<webview>`）
2. 处理加载状态和错误
3. 添加刷新/打开外部浏览器按钮

### Phase 3: 代码预览（1天）
1. 集成 Shiki 代码高亮
2. 实现 `CodePreview` 组件
3. 支持常见语言语法高亮

### Phase 4: 控制台预览（1天）
1. 实现 `ConsolePreview` 组件
2. 接入工具调用日志
3. 实时滚动显示

### Phase 5: 触发逻辑（1天）
1. 自动触发：监听工具调用事件
2. 手动触发：添加预览按钮
3. Store 状态管理

---

## 八、注意事项

### 8.1 性能
- 使用 `<webview>` 隔离网页，避免主进程污染
- 大文件预览时使用虚拟滚动
- 防抖处理频繁的内容更新

### 8.2 用户体验
- 预览面板可拖拽调整宽度
- 支持折叠/展开
- 记住用户上次的宽度设置

### 8.3 与现有功能兼容
- 非聊天页面不显示预览面板
- 预览面板不影响现有对话功能

---

## 九、参考

- Hermes 桌面版 `apps/desktop/src/app/chat/right-rail/`
- Electron `<webview>` 文档
- Shiki 代码高亮库

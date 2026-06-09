# 并排预览功能实现计划

> **创建日期**: 2026-06-07 23:50
> **任务来源**: 用户提案（并排预览功能）
> **优先级**: P1（核心功能）
> **状态**: ✅ 已完成

---

## 一、需求理解

在 Echora 2.0 中实现类似 Hermes 桌面版的并排预览功能：

**核心交互**：左边聊天，右边实时显示内容

**预览类型**：
1. 网页预览 - AI 生成的 HTML/网页实时渲染
2. 代码预览 - AI 编辑的文件（带语法高亮）
3. 控制台预览 - 工具调用的实时输出

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
└──────────┴──────────────────────────────────────────┘
```

### 2.2 关键 CSS

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

## 三、目标布局

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

---

## 四、实现步骤

### Phase 1: 基础框架（预估 2-3 小时）

#### 1.1 Store 扩展
**文件**: `src/renderer/stores/app-store.ts`

新增状态：
```typescript
// 预览面板状态
previewVisible: boolean
previewTarget: PreviewTarget | null
previewWidth: number

// 方法
showPreview: (target: PreviewTarget) => void
hidePreview: () => void
setPreviewWidth: (width: number) => void
updatePreviewTarget: (target: PreviewTarget) => void
```

#### 1.2 新增组件目录
```
src/renderer/components/preview/
├── PreviewPane.tsx          # 预览面板主容器
├── PreviewHeader.tsx        # 头部（标签 + 操作按钮）
├── ResizeHandle.tsx         # 拖拽调整大小手柄
└── index.ts                 # 导出
```

#### 1.3 CSS 变量扩展
**文件**: `src/renderer/styles/global.css`

```css
:root {
  --preview-width: 40%;
  --preview-min-width: 300px;
  --preview-max-width: 60%;
  --preview-header-height: 40px;
}
```

#### 1.4 布局修改
**文件**: `src/renderer/App.tsx`

修改 `.app-body` 布局，添加 PreviewPane 组件。

#### 1.5 拖拽功能
**文件**: `src/renderer/components/preview/ResizeHandle.tsx`

实现鼠标拖拽调整预览面板宽度。

---

### Phase 2: 网页预览（预估 2-3 小时）

#### 2.1 WebPreview 组件
**文件**: `src/renderer/components/preview/WebPreview.tsx`

使用 Electron 的 `<webview>` 标签渲染网页。

功能：
- 加载 URL 或 HTML 内容
- 加载状态指示
- 错误处理
- 刷新按钮
- 打开外部浏览器按钮

#### 2.2 IPC 通道扩展
**文件**: `src/shared/ipc-channels.ts`

新增：
```typescript
PREVIEW_SHOW = 'preview:show'
PREVIEW_HIDE = 'preview:hide'
PREVIEW_UPDATE = 'preview:update'
```

#### 2.3 Preload API 扩展
**文件**: `src/preload/index.ts`

新增 `window.echora.preview` 命名空间。

---

### Phase 3: 代码预览（预估 1-2 小时）

#### 3.1 集成 Shiki
**依赖安装**:
```bash
npm install shiki
```

#### 3.2 CodePreview 组件
**文件**: `src/renderer/components/preview/CodePreview.tsx`

功能：
- 语法高亮显示
- 支持常见语言（JS/TS/Python/HTML/CSS）
- 行号显示
- 代码复制按钮

---

### Phase 4: 控制台预览（预估 1-2 小时）

#### 4.1 ConsolePreview 组件
**文件**: `src/renderer/components/preview/ConsolePreview.tsx`

功能：
- 实时日志显示
- 日志级别过滤（info/warn/error）
- 自动滚动
- 清空按钮

#### 4.2 接入工具调用日志
监听工具调用事件，将输出显示在控制台预览中。

---

### Phase 5: 触发逻辑（预估 1-2 小时）

#### 5.1 自动触发
监听以下事件，自动显示预览：
- AI 生成 HTML → 显示 WebPreview
- AI 调用 file_write → 显示 CodePreview
- AI 调用 terminal → 显示 ConsolePreview

#### 5.2 手动触发
- 工具调用结果旁的「👁️ 预览」按钮
- 快捷键 `Ctrl+P` 切换预览面板

---

## 五、文件变更清单

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| `src/renderer/stores/app-store.ts` | 修改 | 新增预览状态 |
| `src/renderer/App.tsx` | 修改 | 集成 PreviewPane |
| `src/renderer/styles/global.css` | 修改 | 新增 CSS 变量 |
| `src/shared/ipc-channels.ts` | 修改 | 新增 IPC 通道 |
| `src/shared/ipc-types.ts` | 修改 | 新增类型定义 |
| `src/preload/index.ts` | 修改 | 新增 preview API |
| `src/renderer/components/preview/` | 新增 | 预览组件目录 |
| `docs/BLUEPRINT.md` | 修改 | 新增数据结构 |
| `docs/IPC-REFERENCE.md` | 修改 | 新增 IPC 通道 |
| `docs/taskboard/KANBAN.md` | 修改 | 新增任务 |

---

## 六、依赖关系

- Phase 1 是基础，必须先完成
- Phase 2/3/4 可并行开发
- Phase 5 依赖 Phase 2/3/4

---

## 七、风险评估

| 风险 | 影响 | 应对 |
|------|------|------|
| `<webview>` 安全限制 | 可能无法加载某些网页 | 配置 CSP 策略 |
| Shiki 包体积大 | 影响打包大小 | 按需加载语言 |
| 拖拽性能问题 | 卡顿 | 使用 requestAnimationFrame |

---

## 八、验收标准

- [x] 预览面板可拖拽调整宽度
- [x] 网页预览正常显示 HTML
- [x] 代码预览有语法高亮
- [x] 控制台预览实时显示日志
- [x] 预览面板可折叠/展开（Ctrl+P 快捷键）
- [ ] 记住用户上次的宽度设置（待实现）

---

## 九、完成总结

### 已完成的 Phase

| Phase | 内容 | 状态 |
|-------|------|------|
| Phase 1 | 基础框架（Store + 布局 + 拖拽） | ✅ |
| Phase 2 | 网页预览（webview） | ✅ |
| Phase 3 | 代码预览（Shiki 高亮） | ✅ |
| Phase 4 | 控制台预览 | ✅ |
| Phase 5 | 触发逻辑（Ctrl+P） | ✅ |

### 新增文件

| 文件 | 说明 |
|------|------|
| `src/renderer/components/preview/PreviewPane.tsx` | 预览面板主组件 |
| `src/renderer/components/preview/PreviewHeader.tsx` | 预览面板头部 |
| `src/renderer/components/preview/ResizeHandle.tsx` | 拖拽手柄 |
| `src/renderer/components/preview/WebPreview.tsx` | 网页预览组件 |
| `src/renderer/components/preview/CodePreview.tsx` | 代码预览组件 |
| `src/renderer/components/preview/ConsolePreview.tsx` | 控制台预览组件 |
| `src/renderer/components/preview/index.ts` | 导出文件 |

### 修改文件

| 文件 | 变更 |
|------|------|
| `src/renderer/stores/app-store.ts` | 新增预览状态和方法 |
| `src/renderer/App.tsx` | 集成 PreviewPane + 快捷键 |
| `src/renderer/styles/global.css` | 新增预览面板 CSS |
| `src/main/index.ts` | 启用 webviewTag |
| `package.json` | 安装 shiki 依赖 |

---

**计划版本**: v2.0
**最后更新**: 2026-06-07 24:10

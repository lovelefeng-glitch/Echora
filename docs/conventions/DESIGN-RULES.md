# Echora 2.0 设计规则文档

> **优先级高于**: 通用 Tailwind 默认值
> **最后更新**: 2026-06-07 24:40
> **用途**: 开发时参考，确保 UI 一致性

---

## 一、技术栈约束

| 项目 | 约束 |
|------|------|
| 样式方案 | **Tailwind CSS 4.3**（优先） |
| CSS 类 | 只在 `global.css` 中定义全局变量和基础样式 |
| 禁止 | 内联样式、CSS Modules、styled-components |

---

## 二、颜色系统

### 2.1 CSS 变量（必须使用）

```css
/* 浅色模式 */
--bg-primary: #F0F2F5      /* 页面背景 */
--bg-secondary: #FFFFFF     /* 卡片/面板背景 */
--bg-tertiary: #F1F3F5      /* 按钮/输入框背景 */
--bg-hover: #F0F4FF         /* 悬停背景 */
--bg-card: #FFFFFF          /* 卡片背景 */

--text-primary: #1F2937     /* 主文字 */
--text-secondary: #6B7280   /* 次要文字 */
--text-hint: #9CA3AF        /* 提示文字 */

--accent: #3B82F6           /* 强调色/主色 */
--border: #E5E7EB           /* 边框色 */
```

### 2.2 使用方式

```tsx
{/* ✅ 正确 */}
<button className="bg-[var(--bg-tertiary)] text-[var(--text-secondary)]">

{/* ❌ 错误 */}
<button className="bg-gray-100 text-gray-500">
<button style={{ background: '#F1F3F5' }}>
```

---

## 三、按钮规范

### 3.1 圆形图标按钮（用于工具栏）

```tsx
// 统一模板
<button className="
  w-7 h-7                          /* 28x28px */
  rounded-full                     /* 圆形 */
  border-none                      /* 无边框 */
  bg-[var(--bg-tertiary)]          /* 背景色 */
  text-[var(--text-secondary)]     /* 文字色 */
  cursor-pointer                   /* 鼠标样式 */
  transition-all duration-150      /* 过渡动画 */
  flex items-center justify-center /* 居中 */
  flex-shrink-0                    /* 不压缩 */
  hover:bg-[var(--bg-hover)]       /* 悬停背景 */
  hover:text-[var(--text-primary)] /* 悬停文字 */
">
  🌙
</button>
```

### 3.2 按钮间距

```tsx
{/* 按钮组间距 - 统一用 gap-2 */}
<div className="flex items-center gap-2">  {/* 8px */}
  <button>按钮1</button>
  <button>按钮2</button>
</div>
```

> ⚠️ **铁律**: 所有按钮组统一使用 `gap-2`（8px），不要用 `gap-1` 或 `gap-1.5`

### 3.3 按钮尺寸对照表

| 类型 | 尺寸 | Tailwind 类 |
|------|------|-------------|
| 图标按钮（工具栏） | 28x28px | `w-7 h-7` |
| 图标按钮（大） | 32x32px | `w-8 h-8` |
| 文字按钮 | 自适应 | `px-3 py-1.5` |
| 主要按钮 | 自适应 | `px-4 py-2` |

---

## 四、间距规范

### 4.1 页面内边距

```tsx
{/* 页面内容区 */}
<div className="p-4">        {/* 16px */}

{/* 卡片内边距 */}
<div className="p-3">        {/* 12px */}

{/* 紧凑内边距 */}
<div className="p-2">        {/* 8px */}
```

### 4.2 元素间距

| 场景 | 间距 | Tailwind 类 |
|------|------|-------------|
| 按钮组内 | 4px | `gap-1` |
| 列表项之间 | 8px | `gap-2` |
| 卡片之间 | 12px | `gap-3` |
| 区块之间 | 16px | `gap-4` |

---

## 五、圆角规范

| 元素 | 圆角 | Tailwind 类 |
|------|------|-------------|
| 按钮 | 50% | `rounded-full` |
| 输入框 | 8px | `rounded-lg` 或 `rounded-[var(--radius)]` |
| 卡片 | 12px | `rounded-xl` 或 `rounded-[var(--radius-lg)]` |
| 标签 | 20px | `rounded-[var(--radius-xl)]` |

---

## 六、字体规范

| 场景 | 大小 | Tailwind 类 |
|------|------|-------------|
| 正文 | 13px | `text-[13px]` |
| 小字/标签 | 12px | `text-xs` 或 `text-[12px]` |
| 标题 | 14px | `text-sm font-medium` |
| 图标 | 16px | `text-base` 或 `text-[16px]` |

---

## 七、组件规范

### 7.1 侧边栏

```tsx
{/* 侧边栏宽度 */}
<div className="w-[260px]">  {/* 固定宽度 */}

{/* 侧边栏项 */}
<div className="flex items-center gap-3 px-3 py-2 hover:bg-[var(--bg-hover)]">
```

### 7.2 卡片

```tsx
<div className="
  bg-[var(--bg-card)]
  rounded-[var(--radius-lg)]  /* 12px */
  p-4                         /* 16px 内边距 */
">
```

### 7.3 标签

```tsx
<span className="
  inline-flex items-center
  py-[5px] px-3.5
  rounded-[var(--radius-xl)]  /* 20px */
  text-[13px] font-medium
  bg-[var(--bg-tag)]
  text-[var(--bg-tag-text)]
">
```

---

## 八、动画规范

| 场景 | 动画 | 时长 |
|------|------|------|
| 按钮悬停 | 颜色过渡 | 150ms |
| 面板展开 | 高度过渡 | 200ms |
| 弹窗出现 | 淡入 | 150ms |

```tsx
{/* 过渡动画 */}
transition-all duration-150
```

---

## 九、禁止事项

| ❌ 禁止 | 原因 |
|---------|------|
| 使用 `bg-gray-100` 等 Tailwind 内置色 | 不适配主题切换 |
| 使用内联样式 | 无法统一管理 |
| 使用硬编码颜色值 `#F1F3F5` | 应使用 CSS 变量 |
| 按钮大小不统一 | 影响视觉一致性 |
| 间距不统一 | 影响布局整齐度 |

---

## 十、快速参考卡片

```
按钮: w-7 h-7 rounded-full bg-[var(--bg-tertiary)] hover:bg-[var(--bg-hover)]
间距: gap-1 (4px) | gap-2 (8px) | gap-3 (12px) | gap-4 (16px)
圆角: rounded-full (50%) | rounded-lg (8px) | rounded-xl (12px)
字体: text-[13px] (正文) | text-xs (小字) | text-sm (标题)
```

---

**文档版本**: v1.0
**维护者**: Echora 开发团队

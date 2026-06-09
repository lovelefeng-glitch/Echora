import type { PreviewTarget, PreviewType } from '../../stores/app-store'
import { useAppStore } from '../../stores/app-store'

/**
 * PreviewHeader - 预览面板头部
 * 来源: Phase 1 + 功能按钮扩展
 * 输出: 标题栏 + 操作按钮（上） + 功能切换按钮（下）
 * 依赖: app-store
 */
interface PreviewHeaderProps {
  target: PreviewTarget | null
  onClose: () => void
}

// 工具栏按钮配置
const TOOL_BUTTONS: Array<{ type: PreviewType; icon: string; label: string }> = [
  { type: 'explorer', icon: '📁', label: '文件' },
  { type: 'url', icon: '🌐', label: '网页' },
  { type: 'file', icon: '📄', label: '代码' },
  { type: 'console', icon: '💻', label: '终端' },
]

export function PreviewHeader({ target, onClose }: PreviewHeaderProps) {
  const showPreview = useAppStore((s) => s.showPreview)

  const getTitle = () => {
    if (!target) return '工具面板'
    switch (target.type) {
      case 'url':
        return target.title || '网页预览'
      case 'html':
        return target.title || 'HTML 预览'
      case 'file':
        return target.path?.split('/').pop() || target.title || '代码预览'
      case 'console':
        return '控制台'
      default:
        return '预览'
    }
  }

  const getIcon = () => {
    if (!target) return '🛠️'
    switch (target.type) {
      case 'url':
      case 'html':
        return '🌐'
      case 'file':
        return '📄'
      case 'console':
        return '💻'
      default:
        return '👁️'
    }
  }

  const getToolTitle = (type: PreviewType) => {
    switch (type) {
      case 'explorer': return '文件浏览器'
      case 'url': return '网页预览'
      case 'file': return '代码预览'
      case 'console': return '控制台'
      case 'html': return 'HTML 预览'
      default: return '预览'
    }
  }

  const isActive = (type: PreviewType) => {
    if (!target) return type === 'url'
    // html 类型应该高亮 url 按钮
    if (type === 'url' && target.type === 'html') return true
    return target.type === type
  }

  const handleToolClick = (type: PreviewType) => {
    // 如果当前已经是该类型，不刷新
    if (isActive(type)) return
    showPreview({ type, title: getToolTitle(type) })
  }

  return (
    <div className="flex flex-col border-b border-[var(--border)] bg-[var(--bg-secondary)]">
      {/* 第一行：标题 + 刷新/关闭按钮 */}
      <div className="flex items-center justify-between px-3 py-2">
        <div className="flex items-center gap-2 text-sm font-medium text-[var(--text-primary)]">
          <span>{getIcon()}</span>
          <span className="max-w-[120px] truncate">{getTitle()}</span>
        </div>
        <div className="flex items-center gap-1">
          <button 
            className="w-7 h-7 flex items-center justify-center rounded-md text-sm transition-colors text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
            title="刷新" 
            onClick={() => {}}
          >
            🔄
          </button>
          <button 
            className="w-7 h-7 flex items-center justify-center rounded-md text-sm transition-colors text-[var(--text-secondary)] hover:bg-[var(--error-subtle)] hover:text-[var(--error)]"
            title="关闭" 
            onClick={onClose}
          >
            ✕
          </button>
        </div>
      </div>
      
      {/* 第二行：功能切换按钮 */}
      <div className="flex items-center gap-1 px-2 pb-2">
        {TOOL_BUTTONS.map((btn) => (
          <button
            key={btn.type}
            onClick={() => handleToolClick(btn.type)}
            className={`
              flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors
              ${isActive(btn.type) 
                ? 'bg-[var(--accent)] text-white' 
                : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
              }
            `}
            title={btn.label}
          >
            <span>{btn.icon}</span>
            <span>{btn.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

import { useRef, useState, useCallback, useEffect } from 'react'
import { useAppStore } from '../../stores/app-store'
import { PreviewHeader } from './PreviewHeader'
import { ResizeHandle } from './ResizeHandle'
import { FileExplorer } from './FileExplorer'
import { WebPreview } from './WebPreview'
import { CodePreview } from './CodePreview'
import { ConsolePreview } from './ConsolePreview'
import { ImagePreview } from './ImagePreview'

/**
 * PreviewPane - 并排预览面板
 * 来源: Phase 1 - 基础框架 + Phase 2 - 文件浏览器 + Phase 3 - 终端深度优化
 * 输出: 右侧预览区域，支持多种预览类型
 * 依赖: app-store, PreviewHeader, FileExplorer, WebPreview, CodePreview, ConsolePreview
 */

export function PreviewPane() {
  const previewVisible = useAppStore((s) => s.previewVisible)
  const previewTarget = useAppStore((s) => s.previewTarget)
  const hidePreview = useAppStore((s) => s.hidePreview)
  const setPreviewWidth = useAppStore((s) => s.setPreviewWidth)
  
  const containerRef = useRef<HTMLDivElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [previewWidth, setLocalPreviewWidth] = useState(() => {
    // 从 localStorage 恢复宽度
    const saved = localStorage.getItem('echora-preview-width')
    return saved ? parseInt(saved, 10) : 40
  })

  // 同步宽度到 store
  useEffect(() => {
    setPreviewWidth(previewWidth)
    localStorage.setItem('echora-preview-width', String(previewWidth))
  }, [previewWidth, setPreviewWidth])

  // 拖拽调整宽度
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsDragging(true)
    
    const startX = e.clientX
    const startWidth = previewWidth
    const containerWidth = containerRef.current?.parentElement?.clientWidth || window.innerWidth
    
    const handleMouseMove = (e: MouseEvent) => {
      const delta = startX - e.clientX
      const newWidth = Math.min(60, Math.max(20, startWidth + (delta / containerWidth) * 100))
      setLocalPreviewWidth(newWidth)
    }
    
    const handleMouseUp = () => {
      setIsDragging(false)
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [previewWidth])

  // 如果不可见，不渲染
  if (!previewVisible) return null

  // 根据 target 类型渲染不同内容
  const renderContent = () => {
    if (!previewTarget) {
      return (
        <div className="flex items-center justify-center h-full text-[var(--text-secondary)]">
          <div className="text-center">
            <div className="text-4xl mb-3 opacity-50">👁️</div>
            <div className="text-sm">无预览内容</div>
          </div>
        </div>
      )
    }

    switch (previewTarget.type) {
      case 'explorer':
        return (
          <FileExplorer 
            onFileSelect={(path, content) => {
              // FileExplorer 已经处理了预览逻辑
            }}
          />
        )
      case 'url':
        return <WebPreview url={previewTarget.url} />
      case 'html':
        return <WebPreview html={previewTarget.html} />
      case 'file':
        return (
          <CodePreview 
            content={previewTarget.content || '无内容'} 
            language={previewTarget.language}
            path={previewTarget.path}
          />
        )
      case 'console':
        return <ConsolePreview />
      case 'image':
        return (
          <ImagePreview 
            path={previewTarget.path || ''} 
            content={previewTarget.content}
          />
        )
      default:
        return (
          <div className="flex items-center justify-center h-full text-[var(--text-secondary)]">
            <div className="text-sm">未知预览类型</div>
          </div>
        )
    }
  }

  return (
    <div
      ref={containerRef}
      className="flex flex-col min-w-[300px] max-w-[60%] bg-[var(--bg-card)] border-l border-[var(--border)] relative shrink-0"
      style={{ width: `${previewWidth}%` }}
    >
      {/* 拖拽手柄 */}
      <ResizeHandle onResizeStart={handleMouseDown} isResizing={isDragging} />
      
      {/* 头部 */}
      <PreviewHeader target={previewTarget} onClose={hidePreview} />
      
      {/* 内容区域 */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {renderContent()}
      </div>
    </div>
  )
}

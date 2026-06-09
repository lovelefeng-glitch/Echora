/**
 * ResizeHandle - 拖拽调整大小手柄
 * 来源: Phase 1 基础框架
 * 输出: 可拖拽的分隔条
 * 依赖: 无
 */
interface ResizeHandleProps {
  onResizeStart: (e: React.MouseEvent) => void
  isResizing: boolean
}

export function ResizeHandle({ onResizeStart, isResizing }: ResizeHandleProps) {
  return (
    <div
      className={`preview-resize-handle ${isResizing ? 'active' : ''}`}
      onMouseDown={onResizeStart}
    >
      <div className="preview-resize-handle-bar" />
    </div>
  )
}

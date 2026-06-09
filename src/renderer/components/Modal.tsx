import { useEffect, useCallback, type ReactNode } from "react"

const sizeClasses = {
  small: "w-[400px] max-w-[90vw]",
  medium: "w-[560px] max-w-[90vw]",
  large: "w-[720px] max-w-[90vw]",
}

interface ModalProps {
  open: boolean
  onClose: () => void
  title?: string
  size?: "small" | "medium" | "large"
  children: ReactNode
  footer?: ReactNode
}

export function Modal({ open, onClose, title, size = "medium", children, footer }: ModalProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    },
    [onClose]
  )

  useEffect(() => {
    if (open) {
      document.addEventListener("keydown", handleKeyDown)
      return () => document.removeEventListener("keydown", handleKeyDown)
    }
  }, [open, handleKeyDown])

  if (!open) return null

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1000] animate-[fadeIn_0.15s_ease]" onClick={handleOverlayClick}>
      <div className={`bg-[var(--bg-secondary)] border border-[var(--border)] rounded-[var(--radius-lg)] shadow-lg flex flex-col max-h-[85vh] animate-[fadeInUp_0.2s_ease] ${sizeClasses[size]}`}>
        {title && (
          <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)] shrink-0">
            <span className="text-[15px] font-semibold text-[var(--text-primary)]">{title}</span>
            <button className="w-7 h-7 flex items-center justify-center rounded-[var(--radius)] text-sm text-[var(--text-muted)] transition-all hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]" onClick={onClose}>
              ✕
            </button>
          </div>
        )}
        <div className="px-5 py-4 overflow-y-auto flex-1">{children}</div>
        {footer && <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-[var(--border)] shrink-0">{footer}</div>}
      </div>
    </div>
  )
}

interface ConfirmDialogProps {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = "确认",
  cancelLabel = "取消",
  danger = false
}: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="small"
      footer={
        <>
          <button
            style={{
              padding: "6px 16px",
              borderRadius: "6px",
              border: "1px solid var(--border)",
              background: "var(--bg-tertiary)",
              color: "var(--text-secondary)",
              fontSize: "13px",
              cursor: "pointer"
            }}
            onClick={onClose}
          >
            {cancelLabel}
          </button>
          <button
            style={{
              padding: "6px 16px",
              borderRadius: "6px",
              border: "none",
              background: danger ? "var(--error)" : "var(--accent)",
              color: "#fff",
              fontSize: "13px",
              cursor: "pointer"
            }}
            onClick={() => {
              onConfirm()
              onClose()
            }}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <p style={{ fontSize: "14px", color: "var(--text-secondary)", lineHeight: "1.6" }}>
        {message}
      </p>
    </Modal>
  )
}
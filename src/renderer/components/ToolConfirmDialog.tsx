/**
 * 工具操作确认对话框
 * 用于 file_write 和 powershell_execute 等危险操作的用户确认
 */

import { useEffect, useState, useCallback } from 'react'
import { Modal } from './Modal'

export interface ToolConfirmRequest {
  toolName: string
  dangerLevel: string
  args: Record<string, unknown>
  details: string
}

interface ToolConfirmDialogProps {
  open: boolean
  request: ToolConfirmRequest | null
  onConfirm: () => void
  onCancel: () => void
}

/** 确认超时时间（秒） */
const CONFIRM_TIMEOUT_SEC = 60

/** 工具显示名称映射 */
const TOOL_LABELS: Record<string, string> = {
  file_write: '文件写入',
  powershell_execute: 'PowerShell 命令执行',
  code_execute: '代码执行',
}

/** 危险等级标签 */
const DANGER_LABELS: Record<string, string> = {
  confirm: '⚠️ 需要确认',
  dangerous: '🔴 危险操作',
}

export function ToolConfirmDialog({ open, request, onConfirm, onCancel }: ToolConfirmDialogProps) {
  const [countdown, setCountdown] = useState(CONFIRM_TIMEOUT_SEC)

  // 倒计时
  useEffect(() => {
    if (!open) return

    setCountdown(CONFIRM_TIMEOUT_SEC)
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer)
          onCancel()
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [open, onCancel])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel()
      }
    },
    [onCancel]
  )

  useEffect(() => {
    if (open) {
      document.addEventListener('keydown', handleKeyDown)
      return () => document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open, handleKeyDown])

  if (!request) return null

  const toolLabel = TOOL_LABELS[request.toolName] || request.toolName
  const dangerLabel = DANGER_LABELS[request.dangerLevel] || request.dangerLevel
  const isDangerous = request.dangerLevel === 'dangerous'

  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={`${dangerLabel} - ${toolLabel}`}
      size="medium"
      footer={
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%' }}>
          <span style={{
            fontSize: '12px',
            color: countdown <= 10 ? 'var(--error)' : 'var(--text-muted)',
            transition: 'color 0.3s',
            minWidth: 80,
          }}>
            {countdown}s 后自动取消
          </span>
          <div style={{ flex: 1 }} />
          <button
            style={{
              padding: '6px 16px',
              borderRadius: '6px',
              border: '1px solid var(--border)',
              background: 'var(--bg-tertiary)',
              color: 'var(--text-secondary)',
              fontSize: '13px',
              cursor: 'pointer',
            }}
            onClick={onCancel}
          >
            取消
          </button>
          <button
            style={{
              padding: '6px 16px',
              borderRadius: '6px',
              border: 'none',
              background: isDangerous ? 'var(--error)' : 'var(--accent)',
              color: '#fff',
              fontSize: '13px',
              cursor: 'pointer',
              fontWeight: 500,
            }}
            onClick={onConfirm}
          >
            确认执行
          </button>
        </div>
      }
    >
      <div style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
        <p style={{ marginBottom: 12, fontWeight: 500, color: 'var(--text-primary)' }}>
          AI 请求执行以下操作，请确认是否允许：
        </p>
        <div style={{
          background: 'var(--bg-primary)',
          border: '1px solid var(--border)',
          borderRadius: '8px',
          padding: '12px 16px',
          fontFamily: 'monospace',
          fontSize: '13px',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
          maxHeight: '300px',
          overflowY: 'auto',
          lineHeight: 1.5,
        }}>
          {request.details}
        </div>
        {isDangerous && (
          <p style={{
            marginTop: 12,
            padding: '8px 12px',
            background: 'color-mix(in srgb, var(--error) 10%, transparent)',
            border: '1px solid color-mix(in srgb, var(--error) 30%, transparent)',
            borderRadius: '6px',
            fontSize: '12px',
            color: 'var(--error)',
          }}>
            此操作可能具有风险，请仔细确认后再执行。
          </p>
        )}
      </div>
    </Modal>
  )
}

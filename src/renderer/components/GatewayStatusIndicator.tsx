import { useState, useCallback } from 'react'
import { useAppStore } from '../stores/app-store'
import type { GatewayStatus } from '../../shared/ipc-types'

const STATUS_LABELS: Record<string, string> = {
  running: '已连接',
  starting: '连接中',
  error: '连接错误',
  offline: '未连接',
  stopped: '已停止'
}

const STATUS_DOT_CLASS: Record<string, string> = {
  running: 'bg-[var(--success)] shadow-[0_0_4px_var(--success)]',
  starting: 'bg-[var(--warning)] animate-[pulse_1.2s_infinite]',
  error: 'bg-[var(--error)]',
  offline: 'bg-[var(--inactive)]',
  stopped: 'bg-[var(--inactive)]'
}

function getOverallStatus(statusMap: Record<string, GatewayStatus>): {
  status: string
  label: string
  detail: string
} {
  const entries = Object.entries(statusMap)
  if (entries.length === 0) {
    return { status: 'offline', label: '无网关', detail: '未检测到 AI 网关' }
  }

  const running = entries.filter(([, v]) => v.status === 'running')
  const starting = entries.filter(([, v]) => v.status === 'starting')
  const errored = entries.filter(([, v]) => v.status === 'error')

  if (running.length > 0) {
    const ports = running.map(([k, v]) => `${k}:${v.port ?? '?'}`).join(', ')
    return {
      status: 'running',
      label: `${running.length} 个网关运行中`,
      detail: ports
    }
  }
  if (starting.length > 0) {
    return {
      status: 'starting',
      label: '网关启动中...',
      detail: starting.map(([k]) => k).join(', ')
    }
  }
  if (errored.length > 0) {
    return {
      status: 'error',
      label: '网关错误',
      detail: errored.map(([k]) => k).join(', ')
    }
  }
  return {
    status: 'offline',
    label: '全部离线',
    detail: `${entries.length} 个网关未运行`
  }
}

export function GatewayStatusIndicator() {
  const gatewayStatus = useAppStore((s) => s.gatewayStatus)
  const [showTooltip, setShowTooltip] = useState(false)

  const { status, label, detail } = getOverallStatus(gatewayStatus)

  const handleMouseEnter = useCallback(() => setShowTooltip(true), [])
  const handleMouseLeave = useCallback(() => setShowTooltip(false), [])

  const dotClass = STATUS_DOT_CLASS[status] ?? STATUS_DOT_CLASS.offline

  return (
    <div
      style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <span
        className={`w-2 h-2 rounded-full shrink-0 ${dotClass}`}
        title=""
      />
      {showTooltip && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-[var(--bg-secondary)] text-[var(--text-primary)] text-xs rounded-lg shadow-lg whitespace-nowrap z-50 border border-[var(--border)]">
          <div style={{ fontWeight: 600 }}>{STATUS_LABELS[status] ?? status}</div>
          <div>{label}</div>
          {detail && <div style={{ opacity: 0.7, marginTop: 2 }}>{detail}</div>}
        </div>
      )}
    </div>
  )
}

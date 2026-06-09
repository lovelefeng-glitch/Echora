import { useState, useCallback } from 'react'
import { useAppStore } from '../stores/app-store'
import { useEchora } from '../hooks/use-echora'
import type { DirectApiConnectionResult } from '../../shared/ipc-types'

const STATUS_LABELS: Record<string, string> = {
  online: '已连接',
  offline: '未连接',
  error: '连接错误',
  checking: '检测中...'
}

function getOverallApiStatus(providers: Array<{ status: string; id: string }>): {
  status: string
  label: string
  detail: string
} {
  if (providers.length === 0) {
    return { status: 'offline', label: '无 API', detail: '未配置云 API 提供商' }
  }

  const online = providers.filter((p) => p.status === 'online')
  const checking = providers.filter((p) => p.status === 'checking')
  const errored = providers.filter((p) => p.status === 'error')

  if (online.length === providers.length) {
    return {
      status: 'online',
      label: `${online.length} 个 API 在线`,
      detail: providers.map((p) => p.id).join(', ')
    }
  }
  if (online.length > 0) {
    return {
      status: 'online',
      label: `${online.length}/${providers.length} 个 API 在线`,
      detail: providers.map((p) => `${p.id}: ${STATUS_LABELS[p.status] ?? p.status}`).join(', ')
    }
  }
  if (checking.length > 0) {
    return {
      status: 'checking',
      label: 'API 检测中...',
      detail: checking.map((p) => p.id).join(', ')
    }
  }
  if (errored.length > 0) {
    return {
      status: 'error',
      label: 'API 连接错误',
      detail: errored.map((p) => p.id).join(', ')
    }
  }
  return {
    status: 'offline',
    label: '全部离线',
    detail: `${providers.length} 个 API 未连接`
  }
}

export function DirectApiIndicator() {
  const providers = useAppStore((s) => s.directApiProviders)
  const updateProviderStatus = useAppStore((s) => s.updateDirectApiProviderStatus)
  const api = useEchora()
  const [showTooltip, setShowTooltip] = useState(false)
  const [testing, setTesting] = useState(false)

  const { status, label, detail } = getOverallApiStatus(providers)

  const dotColor =
    status === 'online' ? 'var(--success)' :
    status === 'checking' ? 'var(--warning)' :
    status === 'error' ? 'var(--error)' :
    'var(--text-muted)'

  const dotShadow =
    status === 'online' ? '0 0 4px var(--success)' :
    status === 'error' ? '0 0 4px var(--error)' :
    'none'

  const handleTestAll = useCallback(async () => {
    if (testing || providers.length === 0) return
    setTesting(true)
    try {
      for (const provider of providers) {
        updateProviderStatus(provider.id, 'checking')
        try {
          const result = await api.directApi.testConnection(provider.id) as DirectApiConnectionResult
          updateProviderStatus(provider.id, result.success ? 'online' : 'error', result.error)
        } catch {
          updateProviderStatus(provider.id, 'error', '连接失败')
        }
      }
    } finally {
      setTesting(false)
    }
  }, [testing, providers, api, updateProviderStatus])

  if (providers.length === 0) return null

  return (
    <div
      className="relative inline-flex items-center"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <span
        className="w-2 h-2 rounded-full shrink-0"
        style={{
          background: dotColor,
          boxShadow: dotShadow,
          animation: status === 'checking' ? 'pulse 1.2s ease-in-out infinite' : undefined
        }}
      />
      {showTooltip && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-[var(--bg-secondary)] text-[var(--text-primary)] text-xs rounded-lg shadow-lg whitespace-nowrap z-50 border border-[var(--border)]">
          <div style={{ fontWeight: 600 }}>{label}</div>
          {detail && <div style={{ opacity: 0.7, marginTop: 2 }}>{detail}</div>}
          <button
            className="mt-2 px-2 py-1 bg-[var(--accent)] text-white text-[11px] rounded cursor-pointer disabled:opacity-50 hover:bg-[var(--accent-hover)] w-full"
            onClick={(e) => { e.stopPropagation(); handleTestAll() }}
            disabled={testing}
          >
            {testing ? '⏳ 测试中...' : '🔍 测试连接'}
          </button>
        </div>
      )}
    </div>
  )
}

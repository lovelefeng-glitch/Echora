import { useState, useCallback, useEffect } from 'react'
import { useAppStore } from '../stores/app-store'
import { useEchora } from '../hooks/use-echora'
import { Modal, ConfirmDialog } from './Modal'
import type { AIDetectedItem, AiAddDiscoveredParams, GatewayStatusMap } from '../../shared/ipc-types'

const AI_ICONS: Record<string, string> = {
  qclaw: '🐉',
  openclaw: '🦞',
  hermes: '🔮',
  cursor: '⚡',
  windsurf: '🌊',
  trae: '🚀'
}

export function AIManagementPanel() {
  const api = useEchora()
  const detectedAI = useAppStore((s) => s.detectedAI)
  const gatewayStatus = useAppStore((s) => s.gatewayStatus)
  const setDetectedAI = useAppStore((s) => s.setDetectedAI)
  const setGatewayStatus = useAppStore((s) => s.setGatewayStatus)
  const markAIRemoved = useAppStore((s) => s.markAIRemoved)
  const bumpAgentListVersion = useAppStore((s) => s.bumpAgentListVersion)
  const [scanning, setScanning] = useState(false)
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null)
  const [startingAIs, setStartingAIs] = useState<Set<string>>(new Set())
  const [stoppingAIs, setStoppingAIs] = useState<Set<string>>(new Set())
  const [hermesProfiles, setHermesProfiles] = useState<Array<{ name: string }>>([])

  // 统一的启动/停止处理（支持 profileName）
  const handleStartStop = useCallback(async (key: string, item: AIDetectedItem, profileName?: string) => {
    const statusKey = profileName ? `hermes:${profileName}` : key
    const isRunning = gatewayStatus[statusKey]?.status === 'running'
    try {
      if (isRunning) {
        if (stoppingAIs.has(statusKey)) return
        setStoppingAIs(prev => new Set(prev).add(statusKey))
        try {
          const result = await api.gateway.stop(profileName ? 'hermes' : key, profileName) as { success?: boolean; message?: string }
          if (!result?.success) {
            console.error('Stop failed:', result?.message)
          }
        } finally {
          setStoppingAIs(prev => {
            const next = new Set(prev)
            next.delete(statusKey)
            return next
          })
        }
      } else {
        if (startingAIs.has(statusKey)) return
        setStartingAIs(prev => new Set(prev).add(statusKey))
        try {
          const result = await api.gateway.start(
            profileName ? 'hermes' : key,
            item.path || undefined,
            undefined,
            profileName
          ) as { success?: boolean; message?: string }

          const maxPolls = 9
          const pollInterval = 2000
          for (let i = 0; i < maxPolls; i++) {
            await new Promise(r => setTimeout(r, pollInterval))
            const currentStatus = useAppStore.getState().gatewayStatus[statusKey]?.status
            if (currentStatus === 'running') break
            try {
              const status = await api.gateway.status() as GatewayStatusMap
              setGatewayStatus(status)
              if (status[statusKey]?.status === 'running') break
            } catch {}
          }

          if (!result?.success) {
            console.error('Start failed:', result?.message)
          }
        } finally {
          setStartingAIs(prev => {
            const next = new Set(prev)
            next.delete(statusKey)
            return next
          })
        }
      }
    } catch (err) {
      setStartingAIs(prev => {
        const next = new Set(prev)
        next.delete(statusKey)
        return next
      })
      console.error('Gateway start/stop failed:', err)
    }
  }, [api, gatewayStatus, startingAIs, stoppingAIs, setGatewayStatus])

  // 获取 Hermes profiles 列表
  useEffect(() => {
    api.hermes.profiles().then((profiles) => {
      setHermesProfiles(profiles as Array<{ name: string }>)
    }).catch(() => {})
  }, [api])

  const handleScan = useCallback(async () => {
    setScanning(true)
    try {
      const result = (await api.ai.scan()) as Record<string, AIDetectedItem>
      setDetectedAI(result)
    } catch (err) {
      console.error('AI scan failed:', err)
    } finally {
      setScanning(false)
    }
  }, [api, setDetectedAI])

  const handleBrowsePath = useCallback(async (aiType: string) => {
    const result = (await api.dialog.openFile({
      filters: [{ name: '可执行文件', extensions: ['exe', 'cmd', 'bat', 'sh', ''] }]
    })) as { canceled: boolean; filePaths: string[] }
    if (!result.canceled && result.filePaths[0]) {
      await api.ai.setPath(aiType, result.filePaths[0])
      // 仅更新该 AI 的 source 为 manual，不触发全量扫描
      const updated = { ...detectedAI }
      if (updated[aiType]) {
        updated[aiType] = { ...updated[aiType], source: 'manual', path: result.filePaths[0] }
      }
      setDetectedAI(updated)
      bumpAgentListVersion()
    }
  }, [api, detectedAI, setDetectedAI, bumpAgentListVersion])

  const handleRemove = useCallback(async (aiType: string) => {
    await api.ai.removePath(aiType)
    markAIRemoved(aiType)
    // handleRefresh 会通过 api.gateway.refresh() 完整更新 detectedAI + Agent列表
    bumpAgentListVersion()
    setConfirmRemove(null)
  }, [api, markAIRemoved, bumpAgentListVersion])

  const entries = Object.entries(detectedAI)
  // 已配置的 AI（仅用户手动添加的，source=manual）
  const configuredEntries = entries.filter(([, item]) => item.found && item.source === 'manual')
  // 仅检测到但未添加（系统扫描发现，非用户手动添加）
  const detectedEntries = entries.filter(([, item]) => item.found && item.source !== 'manual')

  // 添加检测到的 AI（将其路径写入配置）然后刷新
  // 仅当路径是可执行文件时才添加
  const handleAddDetected = useCallback(async (aiType: string, item: AIDetectedItem) => {
    if (item.path && /\.(exe|cmd|bat|sh|js)$/i.test(item.path)) {
      await api.ai.setPath(aiType, item.path)
      // 清除 removedAIs 标记
      const store = useAppStore.getState()
      if (store.removedAIs.has(aiType)) {
        const next = new Set(store.removedAIs)
        next.delete(aiType)
        useAppStore.setState({ removedAIs: next })
      }
      bumpAgentListVersion()
    }
  }, [api, bumpAgentListVersion])

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-1">
        <div style={{ padding: '12px 0', color: 'var(--text-secondary)', fontSize: 13, fontWeight: 600 }}>
          📋 已配置的 AI
        </div>

        {entries.length === 0 && !scanning && (
          <div className="flex flex-col items-center justify-center px-5 py-[60px] text-center">
            <div className="text-2xl opacity-50 mb-2">📦</div>
            <div className="text-sm text-[var(--text-secondary)]">尚未添加任何 AI 软件</div>
            <div className="text-xs text-[var(--text-muted)] mt-1">点击下方按钮添加或检测</div>
          </div>
        )}

        {/* 已配置的 AI：启动/停止/路径/移除 */}
        {configuredEntries.map(([key, item]) => {
          // Hermes 特殊处理：主网关 + 每个 Profile 独立卡片
          if (key === 'hermes') {
            return (
              <HermesGroup
                key={key}
                mainItem={item}
                mainGateway={gatewayStatus[key]}
                isMainStarting={startingAIs.has(key)}
                isMainStopping={stoppingAIs.has(key)}
                profiles={hermesProfiles}
                gatewayStatus={gatewayStatus}
                startingAIs={startingAIs}
                stoppingAIs={stoppingAIs}
                onBrowseMain={() => handleBrowsePath(key)}
                onRemoveMain={() => setConfirmRemove(key)}
                onStartStopMain={async () => {
                  await handleStartStop(key, item)
                }}
                onStartStopProfile={async (profileName: string) => {
                  await handleStartStop(`hermes:${profileName}`, item, profileName)
                }}
              />
            )
          }
          return (
            <AICard
              key={key}
              aiKey={key}
              item={item}
              isConfigured
              gateway={gatewayStatus[key]}
              isStarting={startingAIs.has(key)}
              isStopping={stoppingAIs.has(key)}
              onBrowse={() => handleBrowsePath(key)}
              onRemove={() => setConfirmRemove(key)}
              onStartStop={async () => {
                await handleStartStop(key, item)
              }}
            />
          )
        })}

        {/* 仅检测到但未添加：添加按钮 */}
        {detectedEntries.length > 0 && (
          <>
            {configuredEntries.length > 0 && (
              <div style={{ padding: '8px 0', fontSize: 12, color: 'var(--text-muted)' }}>
                检测到但未添加
              </div>
            )}
            {detectedEntries.map(([key, item]) => (
              <AICard
                key={key}
                aiKey={key}
                item={item}
                isConfigured={false}
                onAdd={() => handleAddDetected(key, item)}
              />
            ))}
          </>
        )}

        <div className="flex gap-2 mt-auto pt-3 border-t border-[var(--border)] shrink-0">
          <button className="px-3.5 py-1.5 rounded-md text-[13px] cursor-pointer transition-all flex items-center gap-1.5 bg-[var(--accent)] text-white border-none hover:bg-[var(--accent-hover)]" onClick={() => setShowAddDialog(true)}>
            ➕ 手动添加
          </button>
          <button className="px-3.5 py-1.5 rounded-md text-[13px] cursor-pointer transition-all flex items-center gap-1.5 bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border border-[var(--border)] hover:bg-[var(--border)] hover:text-[var(--text-primary)]" onClick={handleScan} disabled={scanning}>
            {scanning ? '🔄 检测中...' : '🔍 自动检测'}
          </button>
        </div>
      </div>

      <AddAIDialog open={showAddDialog} onClose={() => setShowAddDialog(false)} onAdded={bumpAgentListVersion} />

      <ConfirmDialog
        open={confirmRemove !== null}
        onClose={() => setConfirmRemove(null)}
        onConfirm={() => confirmRemove && handleRemove(confirmRemove)}
        title="移除 AI 配置"
        message={`确定要移除 ${confirmRemove || ''} 的配置吗？此操作不会卸载 AI 软件。`}
        confirmLabel="移除"
        danger
      />
    </div>
  )
}

interface AICardProps {
  aiKey: string
  item: AIDetectedItem
  isConfigured?: boolean
  gateway?: { status: string; pid?: number; port?: number }
  isStarting?: boolean
  isStopping?: boolean
  onBrowse?: () => void
  onRemove?: () => void
  onStartStop?: () => void
  onAdd?: () => void
}

function AICard({ item, isConfigured, gateway, isStarting, isStopping, onBrowse, onRemove, onStartStop, onAdd }: AICardProps) {
  const icon = AI_ICONS[item.category] || '🤖'
  const status = gateway?.status ?? 'offline'
  const port = gateway?.port

  // 检测路径是否为可执行文件
  const isExe = item.path && /\.(exe|cmd|bat|sh|js)$/i.test(item.path)

  // 本地启动中状态优先级高于后端状态
  const effectiveStarting = isStarting || status === 'starting'
  const effectiveStopping = isStopping
  const isRunning = status === 'running' && !isStarting

  const statusText: Record<string, string> = {
    running: effectiveStarting ? '⏳ 启动中...' : `● 运行中${port ? ' :' + port : ''}`,
    starting: '⏳ 启动中...',
    offline: '○ 未启动',
    stopped: '○ 未启动',
    error: '✕ 错误'
  }

  const statusClassMap: Record<string, string> = {
    running: effectiveStarting ? 'text-[var(--warning)]' : 'text-[var(--success)]',
    starting: 'text-[var(--warning)]',
    offline: 'text-[var(--inactive)]',
    stopped: 'text-[var(--inactive)]',
    error: 'text-[var(--error)]'
  }

  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-[var(--bg-tertiary)] border border-[var(--border)] rounded-[var(--radius)] transition-colors hover:border-[var(--accent)]">
      <span className="text-2xl leading-none shrink-0">{icon}</span>
      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
        <div className="text-[13px] font-semibold text-[var(--text-primary)] whitespace-nowrap overflow-hidden text-ellipsis">{item.name}</div>
        {item.path && <div className="text-[11px] text-[var(--text-muted)] font-[var(--font-mono)] whitespace-nowrap overflow-hidden text-ellipsis">{item.path}</div>}
      </div>
      {isConfigured && (
        <span className={`text-xs shrink-0 whitespace-nowrap ${statusClassMap[status] || 'text-[var(--inactive)]'}`}>
          {statusText[status] ?? status}
        </span>
      )}
      <div className="flex gap-1 shrink-0">
        {!isConfigured ? (
          <button className="px-2.5 py-1 text-[11px] rounded-[var(--radius-sm)] border-none bg-[var(--accent)] text-white cursor-pointer font-inherit transition-all hover:bg-[var(--accent-hover)]" onClick={onAdd}>➕ 添加</button>
        ) : effectiveStarting ? (
          <button className="px-2.5 py-1 text-[11px] rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg-secondary)] text-[var(--text-secondary)] cursor-pointer font-inherit transition-all" disabled style={{ opacity: 0.5, cursor: 'not-allowed' }}>⏳ 启动中...</button>
        ) : isRunning ? (
          <>
            <button className="px-2.5 py-1 text-[11px] rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg-secondary)] text-[var(--text-secondary)] cursor-pointer font-inherit transition-all hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]" onClick={onStartStop} disabled={effectiveStopping} style={effectiveStopping ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}>{effectiveStopping ? '⏳ 停止中...' : '⏹ 停止'}</button>
            <button className="px-2.5 py-1 text-[11px] rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg-secondary)] text-[var(--text-secondary)] cursor-pointer font-inherit transition-all hover:bg-[var(--error)] hover:text-white hover:border-[var(--error)]" onClick={onRemove}>移除</button>
          </>
        ) : (
          <>
            {onStartStop && isExe && <button className="px-2.5 py-1 text-[11px] rounded-[var(--radius-sm)] border-none bg-[var(--accent)] text-white cursor-pointer font-inherit transition-all hover:bg-[var(--accent-hover)]" onClick={onStartStop}>▶ 启动</button>}
            {!isExe && item.path && <span className="px-2.5 py-1 text-[11px] rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg-secondary)] text-[var(--text-secondary)]" style={{ opacity: 0.5, cursor: 'default' }}>⚠️ 需配置路径</span>}
            {onBrowse && <button className="px-2.5 py-1 text-[11px] rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg-secondary)] text-[var(--text-secondary)] cursor-pointer font-inherit transition-all hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]" onClick={onBrowse}>📂 路径</button>}
            <button className="px-2.5 py-1 text-[11px] rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg-secondary)] text-[var(--text-secondary)] cursor-pointer font-inherit transition-all hover:bg-[var(--error)] hover:text-white hover:border-[var(--error)]" onClick={onRemove}>移除</button>
          </>
        )}
      </div>
    </div>
  )
}

// Hermes 主网关 + 各 Profile 独立卡片组
interface HermesGroupProps {
  mainItem: AIDetectedItem
  mainGateway?: { status: string; pid?: number; port?: number }
  isMainStarting: boolean
  isMainStopping: boolean
  profiles: Array<{ name: string }>
  gatewayStatus: Record<string, { status: string; pid?: number; port?: number }>
  startingAIs: Set<string>
  stoppingAIs: Set<string>
  onBrowseMain: () => void
  onRemoveMain: () => void
  onStartStopMain: () => void
  onStartStopProfile: (profileName: string) => void
}

function HermesGroup({
  mainItem, mainGateway, isMainStarting, isMainStopping, profiles, gatewayStatus, startingAIs, stoppingAIs,
  onBrowseMain, onRemoveMain, onStartStopMain, onStartStopProfile
}: HermesGroupProps) {
  return (
    <>
      {/* 主 Hermes 网关 */}
      <AICard
        aiKey="hermes"
        item={mainItem}
        isConfigured
        gateway={mainGateway}
        isStarting={isMainStarting}
        isStopping={isMainStopping}
        onBrowse={onBrowseMain}
        onRemove={onRemoveMain}
        onStartStop={onStartStopMain}
      />
      {/* 每个 Profile 独立卡片 */}
      {profiles.map((profile) => {
        const profileKey = `hermes:${profile.name}`
        const profileGateway = gatewayStatus[profileKey] || { status: 'offline' }
        const profileItem: AIDetectedItem = {
          ...mainItem,
          name: `Hermes (${profile.name})`
        }
        return (
          <AICard
            key={profileKey}
            aiKey={profileKey}
            item={profileItem}
            isConfigured
            gateway={profileGateway}
            isStarting={startingAIs.has(profileKey)}
            isStopping={stoppingAIs.has(profileKey)}
            onStartStop={() => onStartStopProfile(profile.name)}
          />
        )
      })}
    </>
  )
}

interface AddAIDialogProps {
  open: boolean
  onClose: () => void
  onAdded: () => void
}

function AddAIDialog({ open, onClose, onAdded }: AddAIDialogProps) {
  const api = useEchora()
  const [aiType, setAiType] = useState('hermes')
  const [exePath, setExePath] = useState('')
  const [port, setPort] = useState('')
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)

  const handleBrowse = useCallback(async () => {
    const result = (await api.dialog.openFile({
      filters: [{ name: '可执行文件', extensions: ['exe', 'cmd', 'bat', 'sh', ''] }]
    })) as { canceled: boolean; filePaths: string[] }
    if (!result.canceled && result.filePaths[0]) {
      setExePath(result.filePaths[0])
    }
  }, [api])

  const handleAdd = useCallback(async () => {
    setLoading(true)
    try {
      const params: AiAddDiscoveredParams = {
        aiType,
        name: name || undefined,
        port: port ? Number(port) : undefined,
        exePath: exePath || undefined
      }
      await api.ai.addDiscovered(params)

      // 清除前端 removedAIs 标记（后端 addDiscovered 已清除）
      const store = useAppStore.getState()
      if (store.removedAIs.has(aiType)) {
        const next = new Set(store.removedAIs)
        next.delete(aiType)
        useAppStore.setState({ removedAIs: next })
      }

      onAdded()
      onClose()
      setAiType('hermes')
      setExePath('')
      setPort('')
      setName('')
    } catch (err) {
      console.error('Failed to add AI:', err)
    } finally {
      setLoading(false)
    }
  }, [api, aiType, exePath, port, name, onAdded, onClose])

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="➕ 添加 AI 软件"
      size="small"
      footer={
        <>
          <button
            style={{
              padding: '6px 16px',
              borderRadius: '6px',
              border: '1px solid var(--border)',
              background: 'var(--bg-tertiary)',
              color: 'var(--text-secondary)',
              fontSize: '13px',
              cursor: 'pointer'
            }}
            onClick={onClose}
          >
            取消
          </button>
          <button
            style={{
              padding: '6px 16px',
              borderRadius: '6px',
              border: 'none',
              background: 'var(--accent)',
              color: '#fff',
              fontSize: '13px',
              cursor: loading ? 'wait' : 'pointer',
              opacity: loading ? 0.6 : 1
            }}
            onClick={handleAdd}
            disabled={loading}
          >
            {loading ? '添加中...' : '确认添加'}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-1.5 mb-4">
        <label className="text-[13px] text-[var(--text-secondary)]">AI 类型</label>
        <select
          className="px-3 py-2 border border-[var(--border)] rounded-md text-[13px] bg-[var(--bg-primary)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
          value={aiType}
          onChange={(e) => setAiType(e.target.value)}
        >
          <option value="hermes">Hermes</option>
          <option value="qclaw">QClaw</option>
          <option value="openclaw">OpenClaw</option>
          <option value="cursor">Cursor</option>
          <option value="windsurf">Windsurf</option>
          <option value="trae">Trae</option>
        </select>
      </div>
      <div className="flex flex-col gap-1.5 mb-4">
        <label className="text-[13px] text-[var(--text-secondary)]">名称（可选）</label>
        <input
          className="px-3 py-2 border border-[var(--border)] rounded-md text-[13px] bg-[var(--bg-primary)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="自定义显示名称"
        />
      </div>
      <div className="flex flex-col gap-1.5 mb-4">
        <label className="text-[13px] text-[var(--text-secondary)]">可执行文件路径</label>
        <div className="flex gap-2">
          <input
            className="flex-1 px-3 py-2 border border-[var(--border)] rounded-md text-[13px] bg-[var(--bg-primary)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
            value={exePath}
            onChange={(e) => setExePath(e.target.value)}
            placeholder="选择或输入可执行文件路径"
          />
          <button
            className="px-3 py-2 rounded-md border border-[var(--border)] bg-[var(--bg-tertiary)] text-[var(--text-secondary)] text-[13px] cursor-pointer shrink-0"
            onClick={handleBrowse}
          >
            📂
          </button>
        </div>
      </div>
      <div className="flex flex-col gap-1.5 mb-4">
        <label className="text-[13px] text-[var(--text-secondary)]">端口（可选）</label>
        <input
          className="px-3 py-2 border border-[var(--border)] rounded-md text-[13px] bg-[var(--bg-primary)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
          type="number"
          value={port}
          onChange={(e) => setPort(e.target.value)}
          placeholder="默认端口"
        />
      </div>
    </Modal>
  )
}

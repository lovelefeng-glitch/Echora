import { useState, useEffect } from 'react'
import { useAppStore, type AgentInfo } from '../../stores/app-store'

interface EmptyStateProps {
  agent: AgentInfo | null
  mode?: 'no-agent' | 'no-messages' | 'gateway-stopped'
  onStartGateway?: () => void
  gatewayStarting?: boolean
}

export function EmptyState({ agent, mode = 'no-messages', onStartGateway, gatewayStarting }: EmptyStateProps) {
  const setView = useAppStore((s) => s.setView)
  const [clicked, setClicked] = useState(false)

  // 当后端状态变为 starting 或 running 时，清除本地 clicked 状态
  useEffect(() => {
    if (gatewayStarting) setClicked(false)
  }, [gatewayStarting])

  if (mode === 'no-agent') {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center">
        <div className="text-6xl mb-4 saturate-[0.7]">🌊</div>
        <h2 className="text-[22px] mb-2 text-[var(--text-primary)]">欢迎使用 Echora</h2>
        <p className="text-sm text-[var(--text-secondary)] mb-6">尚未添加任何 AI 网关，请先添加</p>
        <div className="flex gap-3 mt-2">
          <button
            className="px-6 py-2.5 rounded-lg border-none bg-[var(--accent)] text-white text-sm font-medium cursor-pointer transition-opacity duration-200 hover:opacity-[0.85] disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={() => setView('ai-mgmt')}
          >
            🖥️ 前往 AI 管理
          </button>
        </div>
      </div>
    )
  }

  if (mode === 'gateway-stopped') {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center">
        <img src="/icon/outlin_101.png" alt="未启动" className="w-20 h-20 mb-4 object-contain opacity-70" />
        <h2 className="text-[22px] mb-2 text-[var(--text-primary)]">{agent?.name || 'Agent'} 未启动</h2>
        <p className="text-sm text-[var(--text-secondary)] mb-6">该 AI 网关当前未运行，请启动后开始对话</p>
        <div className="flex gap-3 mt-2">
          {onStartGateway && (
            <button
              className="px-6 py-2.5 rounded-lg border-none bg-[var(--accent)] text-white text-sm font-medium cursor-pointer transition-opacity duration-200 hover:opacity-[0.85] disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={() => { setClicked(true); onStartGateway() }}
              disabled={gatewayStarting || clicked}
            >
              {(gatewayStarting || clicked) ? '⏳ 启动中...' : '▶ 启动'}
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center h-[60vh] text-center">
      <div className="text-6xl mb-4 saturate-[0.7]">🌊</div>
      <h2 className="text-[22px] mb-2 text-[var(--text-primary)]">开始新对话</h2>
      <p className="text-sm text-[var(--text-secondary)] mb-6">在下方输入消息，与 {agent?.name || 'Agent'} 交流</p>
    </div>
  )
}

const AI_ICONS: Record<string, string> = {
  qclaw: '🐉',
  openclaw: '🦞',
  hermes: '🔮',
  cursor: '⚡',
  windsurf: '🌊',
  trae: '🚀'
}

export interface TabBarProps {
  activeTab: string
  onTabChange: (tab: string) => void
  aiTypes: string[]
  gatewayStatus: Record<string, { status: string }>
}

export function SettingsTabBar({ activeTab, onTabChange, aiTypes, gatewayStatus }: TabBarProps) {
  return (
    <div className="flex items-center gap-1 px-3.5 py-1.5 border-b border-[var(--border)] shrink-0 overflow-x-auto bg-[var(--bg-secondary)]">
      <button
        className={`settings-tab-btn flex items-center gap-1 px-2.5 py-[5px] border rounded-md cursor-pointer text-xs whitespace-nowrap transition-all duration-150 relative ${activeTab === 'global' ? 'bg-[var(--accent)] border-[var(--accent)] text-white' : 'border-[var(--border)] bg-[var(--bg-secondary)] text-[var(--text-secondary)]'}`}
        onClick={() => onTabChange('global')}
      >
        ⚙️ <span className="text-[13px]">全局设置</span>
      </button>
      {aiTypes.map((aiType) => {
        const icon = AI_ICONS[aiType] || '🤖'
        const isRunning = gatewayStatus[aiType]?.status === 'running'
        return (
          <button
            key={aiType}
            className={`settings-tab-btn flex items-center gap-1 px-2.5 py-[5px] border rounded-md cursor-pointer text-xs whitespace-nowrap transition-all duration-150 relative ${activeTab === aiType ? 'bg-[var(--accent)] border-[var(--accent)] text-white' : 'border-[var(--border)] bg-[var(--bg-secondary)] text-[var(--text-secondary)]'}`}
            onClick={() => onTabChange(aiType)}
          >
            {icon} <span className="text-[13px]">{aiType}</span>
            {isRunning && <span className="w-1.5 h-1.5 rounded-full bg-[var(--success)] shadow-[0_0_4px_var(--success)] shrink-0" />}
          </button>
        )
      })}
    </div>
  )
}

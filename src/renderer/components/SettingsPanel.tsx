import { useState } from 'react'
import { useAppStore } from '../stores/app-store'
import { SettingsTabBar } from './settings/SettingsTabBar'
import { GlobalSettings } from './settings/GlobalSettings'
import { AISettingsPanel } from './settings/AISettingsPanel'

export function SettingsPanel() {
  const agents = useAppStore((s) => s.agents)
  const gatewayStatus = useAppStore((s) => s.gatewayStatus)
  const aiTypes = Array.from(new Set(Array.from(agents.values()).map((a) => a.aiType).filter(Boolean)))
  const [activeTab, setActiveTab] = useState<string>('global')

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      <SettingsTabBar activeTab={activeTab} onTabChange={setActiveTab} aiTypes={aiTypes} gatewayStatus={gatewayStatus} />
      <div className="flex-1 overflow-y-auto pt-4 px-1 pl-4">
        {activeTab === 'global' ? (
          <GlobalSettings />
        ) : (
          <AISettingsPanel aiType={activeTab} />
        )}
      </div>
      <style>{`
        .settings-main::-webkit-scrollbar { width: 6px; }
        .settings-main::-webkit-scrollbar-track { background: transparent; }
        .settings-main::-webkit-scrollbar-thumb { background: rgba(128, 128, 128, 0.3); border-radius: 3px; }
        .settings-main::-webkit-scrollbar-thumb:hover { background: rgba(128, 128, 128, 0.5); }
        @supports (scrollbar-width: thin) {
          .settings-main { scrollbar-width: thin; scrollbar-color: rgba(128, 128, 128, 0.3) transparent; }
        }
        .settings-slider::-webkit-slider-thumb {
          -webkit-appearance: none; appearance: none;
          width: 16px; height: 16px; border-radius: 50%;
          background: var(--accent); cursor: pointer; border: none;
          box-shadow: var(--shadow-sm);
        }
        .settings-slider::-moz-range-thumb {
          width: 16px; height: 16px; border-radius: 50%;
          background: var(--accent); cursor: pointer; border: none;
          box-shadow: var(--shadow-sm);
        }
        .settings-toggle input:checked + .settings-toggle-track { background: var(--accent); }
        .settings-toggle input:checked ~ .settings-toggle-thumb { transform: translateX(16px); }
        .settings-param-select:focus { outline: none; border-color: var(--accent); }
        .settings-param-input:focus { outline: none; border-color: var(--accent); }
        .settings-param-item:last-child { border-bottom: none; }
        .settings-param-item-row:last-child { border-bottom: none; }
        .settings-param-item-row .settings-param-item { flex: 1; min-width: 160px; border-bottom: none; padding: 0; gap: 6px; }
        .settings-param-item-row .settings-param-item .settings-param-key { width: auto; flex-shrink: 0; }
        .settings-param-item-row .settings-param-item .settings-param-desc { width: auto; flex-shrink: 0; }
        .settings-param-item-row .settings-param-item-compact .settings-param-key { width: auto; flex-shrink: 0; }
        .settings-param-item-row .settings-param-item-compact .settings-param-desc { width: auto; flex-shrink: 0; }
        .settings-param-item-row .settings-param-item-compact .settings-param-value { font-size: 12px; }
        .settings-provider-edit-btn:hover { text-decoration: underline; }
        .settings-model-id-edit-btn:hover { text-decoration: underline; }
        .settings-param-tag-remove:hover { color: var(--error); }
        .settings-param-tag-add:hover { border-color: var(--accent); background: var(--accent-subtle); }
        .settings-model-picker-item input[type="checkbox"] { accent-color: var(--accent); }
        .settings-model-picker-close:hover { color: var(--text-primary); }
        .settings-param-group-header:hover { background: var(--bg-hover); }
        .settings-param-group.collapsed .settings-param-group-arrow { transform: rotate(-90deg); }
        .settings-param-group.collapsed .settings-param-group-body { display: none; }
        .settings-btn-primary:hover:not(:disabled) { background: var(--accent-hover); }
        .settings-btn-primary:disabled { opacity: 0.4; cursor: not-allowed; }
        .settings-btn-secondary:hover:not(:disabled) { background: var(--border); color: var(--text-primary); }
        .settings-btn-secondary:disabled { opacity: 0.4; cursor: not-allowed; }
        .settings-tab-btn:hover:not(.settings-tab-active) { background: var(--bg-tertiary); border-color: var(--accent); }
        .settings-port-value:hover { background: var(--accent-subtle); }
      `}</style>
    </div>
  )
}

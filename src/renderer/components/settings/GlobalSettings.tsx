import { useState, useEffect, useCallback } from 'react'
import ReactDOM from 'react-dom'
import { useAppStore } from '../../stores/app-store'
import { useEchora } from '../../hooks/use-echora'
import type { AppSettings } from '../../../shared/ipc-types'

/* ================================================================
   GlobalSettings
   ================================================================ */

export function GlobalSettings() {
  const api = useEchora()
  const settings = useAppStore((s) => s.settings)
  const updateSettings = useAppStore((s) => s.updateSettings)
  const theme = useAppStore((s) => s.theme)
  const setTheme = useAppStore((s) => s.setTheme)
  const [localSettings, setLocalSettings] = useState<AppSettings>(settings)
  const [dirty, setDirty] = useState(false)
  const [toast, setToast] = useState<{ text: string; type: 'success' | 'error' } | null>(null)
  const toastTimerRef = useState(() => ({ current: null as ReturnType<typeof setTimeout> | null }))[0]

  useEffect(() => {
    setLocalSettings(settings)
    setDirty(false)
  }, [settings])

  const showToast = useCallback((text: string, type: 'success' | 'error' = 'success') => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    setToast({ text, type })
    toastTimerRef.current = setTimeout(() => setToast(null), 3000)
  }, [toastTimerRef])

  const handleChange = useCallback(
    <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
      setLocalSettings((prev) => ({ ...prev, [key]: value }))
      setDirty(true)
    },
    []
  )

  const handleSave = useCallback(async () => {
    try {
      updateSettings(localSettings)
      await api.config.set('settings', localSettings)
      setDirty(false)
      showToast('✓ 保存成功')
    } catch {
      showToast('✗ 保存失败', 'error')
    }
  }, [localSettings, updateSettings, showToast])

  const handleReset = useCallback(() => {
    setLocalSettings(settings)
    setDirty(false)
    showToast('✓ 重置成功')
  }, [settings, showToast])

  return (
    <>
      <div className="border border-[var(--border)] rounded-[var(--radius-md)] px-5 py-[18px] mx-6 mb-4">
        <div className="text-[15px] font-semibold text-[var(--text-primary)] m-0 mb-3">🎨 外观</div>
        <div className="flex flex-row items-center justify-between py-2 gap-3">
          <div>
            <div className="text-xs text-[var(--text-secondary)] font-medium">主题</div>
            <div className="text-[11px] text-[var(--text-muted)]">切换深色/浅色主题</div>
          </div>
          <div className="shrink-0">
            <select
              value={theme}
              onChange={(e) => {
                const newTheme = e.target.value as 'dark' | 'light'
                setTheme(newTheme)
                api.window.setTheme(newTheme === 'light')
                api.config.set('theme', newTheme)
              }}
              style={{
                padding: '4px 8px',
                border: '1px solid var(--border)',
                borderRadius: '4px',
                fontSize: '12px',
                background: 'var(--bg-primary)',
                color: 'var(--text-primary)'
              }}
            >
              <option value="dark">深色</option>
              <option value="light">浅色</option>
            </select>
          </div>
        </div>
      </div>

      <div className="border border-[var(--border)] rounded-[var(--radius-md)] px-5 py-[18px] mx-6 mb-4">
        <div className="text-[15px] font-semibold text-[var(--text-primary)] m-0 mb-3">🤖 网关</div>
        <ToggleField
          label="开机自启动"
          desc="系统启动时自动运行 Echora"
          checked={localSettings.autoStartOnBoot ?? false}
          onChange={(v) => handleChange('autoStartOnBoot', v)}
        />
        <ToggleField
          label="最小化到托盘"
          desc="关闭窗口时最小化到系统托盘"
          checked={localSettings.minimizeToTray ?? true}
          onChange={(v) => handleChange('minimizeToTray', v)}
        />
        <ToggleField
          label="检查更新"
          desc="自动检查 Echora 新版本"
          checked={localSettings.checkUpdates ?? true}
          onChange={(v) => handleChange('checkUpdates', v)}
        />
      </div>

      <div className="border border-[var(--border)] rounded-[var(--radius-md)] px-5 py-[18px] mx-6 mb-4">
        <div className="text-[15px] font-semibold text-[var(--text-primary)] m-0 mb-3">💬 聊天</div>
        <SliderField
          label="请求超时"
          desc="AI 响应的最大等待时间"
          value={Math.round((localSettings.timeout ?? 30000) / 1000)}
          min={10}
          max={600}
          step={5}
          unit="秒"
          onChange={(v) => handleChange('timeout', v * 1000)}
        />
        <SliderField
          label="轮询间隔"
          desc="网关状态检查频率"
          value={Math.round((localSettings.pollInterval ?? 5000) / 1000)}
          min={1}
          max={60}
          step={1}
          unit="秒"
          onChange={(v) => handleChange('pollInterval', v * 1000)}
        />
        <SliderField
          label="网关扫描间隔"
          desc="自动检测外部启动的 AI 网关（0 = 禁用）"
          value={localSettings.gatewayScanInterval ?? 30}
          min={0}
          max={120}
          step={10}
          unit="秒"
          onChange={(v) => handleChange('gatewayScanInterval', v)}
        />
        <SliderField
          label="最大消息数"
          desc="每个会话保留的最大消息数量"
          value={localSettings.maxMessages ?? 100}
          min={10}
          max={500}
          step={10}
          unit="条"
          onChange={(v) => handleChange('maxMessages', v)}
        />
      </div>

      <div className="px-3.5 py-2 border-t border-[var(--border)] flex items-center justify-end gap-2 shrink-0 bg-[var(--bg-secondary)] sticky bottom-0 z-[1]">
        {toast ? (
          <span className={`flex-1 text-xs text-[var(--text-muted)] ${toast.type === 'error' ? 'text-red-500' : 'text-green-500'}`}>
            {toast.text}
          </span>
        ) : (
          <span className="flex-1 text-xs text-[var(--text-muted)]">
            {dirty ? '● 有未保存的更改' : ''}
          </span>
        )}
        <button className="settings-btn-secondary px-3 py-[5px] rounded-[var(--radius)] text-xs bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border border-[var(--border)] cursor-pointer transition-all inline-flex items-center gap-1" onClick={handleReset}>
          重置
        </button>
        <button className="settings-btn-primary px-3 py-[5px] rounded-[var(--radius)] text-xs bg-[var(--accent)] text-white border-none cursor-pointer transition-all inline-flex items-center gap-1" onClick={handleSave} disabled={!dirty}>
          💾 保存设置
        </button>
      </div>
    </>
  )
}

/* ================================================================
   Helper Components
   ================================================================ */

export interface SliderFieldProps {
  label: string
  desc: string
  value: number
  min: number
  max: number
  step: number
  unit: string
  onChange: (value: number) => void
}

export function SliderField({ label, desc, value, min, max, step, unit, onChange }: SliderFieldProps) {
  return (
    <div className="flex flex-row items-center justify-between py-2 gap-3">
      <div>
        <div className="text-xs text-[var(--text-secondary)] font-medium">{label}</div>
        <div className="text-[11px] text-[var(--text-muted)]">{desc}</div>
      </div>
      <div className="shrink-0">
        <div className="flex items-center justify-between gap-2.5">
          <input
            type="range"
            className="settings-slider flex-1 h-1.5 appearance-none bg-[var(--border)] rounded-sm outline-none cursor-pointer"
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={(e) => onChange(Number(e.target.value))}
          />
          <span className="text-[13px] font-semibold text-[var(--accent)] min-w-[60px] text-right">
            {value} {unit}
          </span>
        </div>
      </div>
    </div>
  )
}

export interface ToggleFieldProps {
  label: string
  desc: string
  checked: boolean
  onChange: (value: boolean) => void
}

export function ToggleField({ label, desc, checked, onChange }: ToggleFieldProps) {
  return (
    <div className="flex flex-row items-center justify-between py-2 gap-3">
      <div>
        <div className="text-xs text-[var(--text-secondary)] font-medium">{label}</div>
        <div className="text-[11px] text-[var(--text-muted)]">{desc}</div>
      </div>
      <div className="shrink-0">
        <label className="settings-toggle relative inline-block w-[36px] h-5 cursor-pointer">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => onChange(e.target.checked)}
            className="opacity-0 w-0 h-0 absolute"
          />
          <span className="settings-toggle-track absolute inset-0 bg-[var(--border)] rounded-[10px] transition-[background_var(--transition)]" />
          <span className="settings-toggle-thumb absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-[transform_var(--transition)] pointer-events-none" />
        </label>
      </div>
    </div>
  )
}

export interface CollapsibleGroupProps {
  title: string
  defaultOpen?: boolean
  children: React.ReactNode
}

export function CollapsibleGroup({ title, defaultOpen = true, children }: CollapsibleGroupProps) {
  const [collapsed, setCollapsed] = useState(!defaultOpen)

  return (
    <div className={`settings-param-group bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg mb-2.5 overflow-hidden ${collapsed ? 'collapsed' : ''}`}>
      <div className="settings-param-group-header flex items-center justify-between px-3.5 py-[9px] text-[13px] font-semibold text-[var(--text-primary)] bg-[var(--bg-tertiary)] border-b border-[var(--border)] cursor-pointer select-none transition-[background_var(--transition)]" onClick={() => setCollapsed(!collapsed)}>
        <span className="text-xs font-semibold text-[var(--text-primary)]">{title}</span>
        <span className="settings-param-group-arrow text-[10px] text-[var(--text-muted)] transition-[transform_var(--transition)]">▼</span>
      </div>
      <div className="settings-param-group-body p-0">{children}</div>
    </div>
  )
}

export function ParamItem({ label, desc, value, className }: { label: string; desc?: string; value: unknown; className?: string }) {
  const display =
    value === null || value === undefined
      ? '-'
      : typeof value === 'boolean'
        ? value
          ? '✅ 是'
          : '❌ 否'
        : String(value)

  return (
    <div className={`settings-param-item flex items-center px-3.5 py-[7px] border-b border-[var(--border)] text-xs min-h-[18px]${className ? ` ${className}` : ''}`}>
      <span className="settings-param-key w-[120px] text-[var(--text-secondary)] font-[family-name:var(--font-mono)] text-[11px] shrink-0">{label}</span>
      {desc && <span className="settings-param-desc w-[72px] text-[var(--text-muted)] text-[11px] shrink-0">{desc}</span>}
      <span className="settings-param-value flex-1 text-[var(--text-primary)] break-all text-xs">{display}</span>
    </div>
  )
}

/** 紧凑并排容器：多个短字段同行显示 */
export function ParamItemRow({ children }: { children: React.ReactNode }) {
  return <div className="settings-param-item-row flex items-center px-3.5 py-[5px] border-b border-[var(--border)] text-xs gap-4 flex-wrap">{children}</div>
}

/** 紧凑字段：key + desc + value 内联 */
export function CompactParamItem({ label, desc, value }: { label: string; desc?: string; value: unknown }) {
  const display =
    value === null || value === undefined
      ? '-'
      : typeof value === 'boolean'
        ? value ? '✅' : '❌'
        : String(value)
  return (
    <span className="settings-param-item-compact flex items-center gap-1.5 flex-1 min-w-[160px]">
      <span className="settings-param-key w-[120px] text-[var(--text-secondary)] font-[family-name:var(--font-mono)] text-[11px] shrink-0">{label}</span>
      {desc && <span className="settings-param-desc w-[72px] text-[var(--text-muted)] text-[11px] shrink-0">{desc}</span>}
      <span className="settings-param-value flex-1 text-[var(--text-primary)] break-all text-xs">{display}</span>
    </span>
  )
}

export interface EditableParamItemProps {
  label: string
  desc?: string
  value: string
  onChange?: (value: string) => void
  type?: 'input' | 'select' | 'readonly' | 'port'
  options?: Array<{ value: string; label: string }>
  mono?: boolean
}

export function EditableParamItem({ label, desc, value, onChange, type = 'input', options, mono }: EditableParamItemProps) {
  if (!onChange || type === 'readonly') {
    return (
      <div className="settings-param-item flex items-center px-3.5 py-[7px] border-b border-[var(--border)] text-xs min-h-[18px]">
        <span className="settings-param-key w-[120px] text-[var(--text-secondary)] font-[family-name:var(--font-mono)] text-[11px] shrink-0">{label}</span>
        {desc && <span className="settings-param-desc w-[72px] text-[var(--text-muted)] text-[11px] shrink-0">{desc}</span>}
        <span className={`settings-param-value flex-1 text-[var(--text-primary)] break-all text-xs ${mono ? 'font-[family-name:var(--font-mono)] text-[11px]' : ''}`}>{value || '-'}</span>
      </div>
    )
  }

  if (type === 'port') {
    return (
      <div className="settings-param-item flex items-center px-3.5 py-[7px] border-b border-[var(--border)] text-xs min-h-[18px]">
        <span className="settings-param-key w-[120px] text-[var(--text-secondary)] font-[family-name:var(--font-mono)] text-[11px] shrink-0">{label}</span>
        {desc && <span className="settings-param-desc w-[72px] text-[var(--text-muted)] text-[11px] shrink-0">{desc}</span>}
        <span className="settings-port-value text-[var(--accent)] font-semibold cursor-pointer px-1.5 py-0.5 rounded text-xs transition-[background_var(--transition)]" onClick={() => {}}>
          {Number(value || 0).toLocaleString()}
        </span>
      </div>
    )
  }

  if (type === 'select' && options) {
    return (
      <div className="settings-param-item flex items-center px-3.5 py-[7px] border-b border-[var(--border)] text-xs min-h-[18px]">
        <span className="settings-param-key w-[120px] text-[var(--text-secondary)] font-[family-name:var(--font-mono)] text-[11px] shrink-0">{label}</span>
        {desc && <span className="settings-param-desc w-[72px] text-[var(--text-muted)] text-[11px] shrink-0">{desc}</span>}
        <select className="settings-param-select flex-1 px-2 py-[3px] border border-[var(--border)] rounded text-xs bg-[var(--bg-primary)] text-[var(--text-primary)] min-w-0" value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">-- 选择 --</option>
          {options.map((o, i) => (
            <option key={`${o.value}-${i}`} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>
    )
  }

  return (
    <div className="settings-param-item flex items-center px-3.5 py-[7px] border-b border-[var(--border)] text-xs min-h-[18px]">
      <span className="settings-param-key w-[120px] text-[var(--text-secondary)] font-[family-name:var(--font-mono)] text-[11px] shrink-0">{label}</span>
      {desc && <span className="settings-param-desc w-[72px] text-[var(--text-muted)] text-[11px] shrink-0">{desc}</span>}
      <input
        className="settings-param-input flex-1 px-2 py-[3px] border border-[var(--border)] rounded text-xs bg-[var(--bg-primary)] text-[var(--text-primary)] min-w-0"
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}

export function ParamItemTagList({ label, desc, tags, onAdd, onRemove }: {
  label: string; desc?: string; tags: string[]
  onAdd?: () => void; onRemove?: (tag: string) => void
}) {
  return (
    <div className="settings-param-item flex items-center px-3.5 py-[7px] border-b border-[var(--border)] text-xs min-h-[18px]" style={{ alignItems: 'flex-start' }}>
      <span className="settings-param-key w-[120px] text-[var(--text-secondary)] font-[family-name:var(--font-mono)] text-[11px] shrink-0">{label}</span>
      {desc && <span className="settings-param-desc w-[72px] text-[var(--text-muted)] text-[11px] shrink-0">{desc}</span>}
      <div className="flex-1 flex flex-wrap gap-[3px] items-center min-w-[200px]">
        {tags.map((tag, i) => (
          <span key={`${tag}-${i}`} className="inline-flex items-center gap-[3px] px-1.5 py-px bg-[var(--bg-secondary)] border border-[var(--border)] rounded-[10px] text-[10px] font-[family-name:var(--font-mono)] text-[var(--text-primary)]">
            {tag}
            {onRemove && (
              <button className="settings-param-tag-remove border-none bg-none text-[var(--text-muted)] cursor-pointer px-px py-0 text-xs leading-none" onClick={() => onRemove(tag)} title="移除">×</button>
            )}
          </span>
        ))}
        {onAdd && (
          <button className="settings-param-tag-add border border-dashed border-[var(--border)] bg-none text-[var(--accent)] cursor-pointer px-1.5 py-px rounded-[10px] text-[11px]" onClick={onAdd} title="添加">+ 添加</button>
        )}
      </div>
    </div>
  )
}

/** 模型选择弹窗（多选 checkbox） */
export function ModelPickerPopup({
  visible,
  available,
  selected,
  primary,
  onConfirm,
  onClose
}: {
  visible: boolean
  available: Array<{ value: string; label: string }>
  selected: string[]
  primary: string
  onConfirm: (models: string[]) => void
  onClose: () => void
}) {
  const [checked, setChecked] = useState<Set<string>>(new Set())

  useEffect(() => {
    setChecked(new Set())
  }, [visible])

  if (!visible) return null

  const filtered = available.filter(
    (m) => !selected.includes(m.value) && m.value !== primary
  )

  const toggle = (value: string) => {
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(value)) next.delete(value)
      else next.add(value)
      return next
    })
  }

  const handleConfirm = () => {
    onConfirm([...selected, ...checked])
    onClose()
  }

  return ReactDOM.createPortal(
    <div className="fixed inset-0 bg-black/50 z-[1000] flex items-center justify-center" onClick={onClose}>
      <div className="bg-[var(--bg-primary)] border border-[var(--border)] rounded-xl p-5 min-w-[420px] max-w-[560px] max-h-[70vh] overflow-y-auto shadow-[0_8px_32px_rgba(0,0,0,0.3)]" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4 font-semibold text-sm text-[var(--text-primary)]">
          <span>📋 选择备用模型（可多选）</span>
          <button className="settings-model-picker-close border-none bg-none text-lg cursor-pointer text-[var(--text-muted)] px-1 py-0" onClick={onClose}>✕</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {filtered.length === 0 ? (
            <div className="text-[var(--text-muted)] p-5 text-center">所有可用模型均已添加</div>
          ) : (
            filtered.map((m) => (
              <label key={m.value} className="settings-model-picker-item flex items-center gap-2 px-2.5 py-2 rounded-md cursor-pointer transition-[background_var(--transition)]">
                <input
                  type="checkbox"
                  checked={checked.has(m.value)}
                  onChange={() => toggle(m.value)}
                />
                <span className="font-[family-name:var(--font-mono)] text-xs text-[var(--text-primary)]">{m.label}</span>
              </label>
            ))
          )}
        </div>
        <div className="flex gap-2 justify-end mt-4 pt-3 border-t border-[var(--border)]">
          <button className="settings-btn-secondary px-3 py-[5px] rounded-[var(--radius)] text-xs bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border border-[var(--border)] cursor-pointer transition-all inline-flex items-center gap-1" onClick={onClose}>取消</button>
          <button className="settings-btn-primary px-3 py-[5px] rounded-[var(--radius)] text-xs bg-[var(--accent)] text-white border-none cursor-pointer transition-all inline-flex items-center gap-1" onClick={handleConfirm} disabled={checked.size === 0}>
            确定 {checked.size > 0 && `(${checked.size})`}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

/** 通用字段变更：嵌套路径 set */
export function nestedSet(obj: Record<string, unknown>, path: string[], value: unknown): Record<string, unknown> {
  if (path.length === 1) return { ...obj, [path[0]]: value }
  const [head, ...rest] = path
  const child = (obj[head] && typeof obj[head] === 'object' ? obj[head] : {}) as Record<string, unknown>
  return { ...obj, [head]: nestedSet(child, rest, value) }
}

/** 可编辑配置区段 */
export function EditableConfigSection({
  data,
  fields,
  onChange
}: {
  data: Record<string, unknown>
  fields: Array<{ key: string; label: string; desc?: string }>
  onChange: (field: string, value: unknown) => void
}) {
  return fields
    .filter((f) => data[f.key] !== undefined)
    .map((f) => (
      <EditableParamItem
        key={f.key}
        label={f.label}
        desc={f.desc}
        value={String(data[f.key] ?? '')}
        onChange={(v) => onChange(f.key, v)}
      />
    ))
}

/** 模型 ID 输入框（与供应商 ID 相同机制：onChange 实时更新） */
export function ModelIdInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="settings-param-item flex items-center px-3.5 py-[7px] border-b border-[var(--border)] text-xs min-h-[18px]">
      <span className="settings-param-key w-[120px] text-[var(--text-secondary)] font-[family-name:var(--font-mono)] text-[11px] shrink-0">模型ID</span>
      <span className="settings-param-desc w-[72px] text-[var(--text-muted)] text-[11px] shrink-0">模型标识</span>
      <input
        className="settings-param-input flex-1 px-2 py-[3px] border border-[var(--border)] rounded text-xs bg-[var(--bg-primary)] text-[var(--text-primary)] min-w-0"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}

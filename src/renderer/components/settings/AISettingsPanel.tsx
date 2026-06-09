import { useState, useEffect, useCallback } from 'react'
import { useEchora } from '../../hooks/use-echora'
import type { NormalizedConfig, AiConfigListResult } from '../../../shared/ipc-types'
import {
  CollapsibleGroup,
  EditableParamItem,
  EditableConfigSection,
  ParamItem,
  ParamItemTagList,
  ModelPickerPopup,
  ModelIdInput,
  nestedSet
} from './GlobalSettings'

/* ================================================================
   AI Settings Panel
   ================================================================ */

export function AISettingsPanel({ aiType }: { aiType: string }) {
  const api = useEchora()
  const [config, setConfig] = useState<NormalizedConfig | null>(null)
  const [originalConfig, setOriginalConfig] = useState<NormalizedConfig | null>(null)
  const [configPath, setConfigPath] = useState('')
  const [loading, setLoading] = useState(true)
  const [dirty, setDirty] = useState(false)
  const [toast, setToast] = useState<{ text: string; type: 'success' | 'error' } | null>(null)
  const toastTimerRef = useState(() => ({ current: null as ReturnType<typeof setTimeout> | null }))[0]

  const loadConfig = useCallback(async () => {
    setLoading(true)
    try {
      const draftResult = (await api.draft.read(aiType)) as { success: boolean; data?: NormalizedConfig }
      if (draftResult?.success && draftResult.data) {
        setConfig(draftResult.data)
        setOriginalConfig(draftResult.data)
      } else {
        const list = (await api.aiConfig.list()) as AiConfigListResult
        const info = list[aiType]
        if (info) {
          setConfigPath(info.path || '')
          setConfig(info.preview || null)
          setOriginalConfig(info.preview || null)
        }
      }

      if (!configPath) {
        const paths = (await api.draft.paths()) as Record<string, { original?: string }>
        if (paths?.[aiType]?.original) {
          setConfigPath(paths[aiType].original)
        }
      }
    } catch {
      setConfig(null)
    } finally {
      setLoading(false)
    }
  }, [aiType])

  useEffect(() => {
    loadConfig()
  }, [loadConfig])

  useEffect(() => {
    if (!config || !originalConfig) {
      setDirty(false)
    } else {
      setDirty(JSON.stringify(config) !== JSON.stringify(originalConfig))
    }
  }, [config, originalConfig])

  const showToast = useCallback((text: string, type: 'success' | 'error' = 'success') => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    setToast({ text, type })
    toastTimerRef.current = setTimeout(() => setToast(null), 3000)
  }, [toastTimerRef])

  const handleFieldChange = useCallback(
    (sectionId: string | null, field: string, value: unknown) => {
      setConfig((prev) => {
        if (!prev) return prev
        return makeFieldChangeHelper(prev, sectionId, field, value)
      })
    },
    []
  )

  const handleBrowse = useCallback(async () => {
    const result = (await api.dialog.openFile({
      filters: [{ name: '配置文件', extensions: ['json', 'yaml', 'yml', 'toml'] }]
    })) as { canceled: boolean; filePaths: string[] }
    if (!result.canceled && result.filePaths[0]) {
      const path = result.filePaths[0]
      await api.aiConfig.setPath(aiType, path)
      setConfigPath(path)
      await loadConfig()
    }
  }, [aiType])

  const handleSave = useCallback(async () => {
    if (!config) return
    try {
      await api.draft.write(aiType, config)
      const result = (await api.draft.save(aiType)) as { success: boolean; error?: string }
      if (result.success) {
        setOriginalConfig(config)
        setDirty(false)
        showToast('✓ 保存成功')
      } else {
        showToast('✗ 保存失败', 'error')
      }
    } catch {
      showToast('✗ 保存失败', 'error')
    }
  }, [aiType, config, showToast])

  const handleReset = useCallback(async () => {
    try {
      const result = (await api.draft.reset(aiType)) as { success: boolean }
      if (result.success) {
        await loadConfig()
        showToast('✓ 重置成功')
      } else {
        showToast('✗ 重置失败', 'error')
      }
    } catch {
      showToast('✗ 重置失败', 'error')
    }
  }, [aiType, showToast])

  if (loading) {
    return null
  }

  if (!config) {
    return (
      <>
        <div className="flex flex-col items-center justify-center px-6 py-12 text-center gap-2 flex-1">
          <div className="text-5xl opacity-50">📂</div>
          <div className="text-sm text-[var(--text-secondary)]">未找到 {aiType} 的配置文件</div>
          <div className="text-xs text-[var(--text-muted)]">请选择配置文件路径，或让 Echora 自动搜索</div>
          <div className="mt-3 flex gap-2">
            <button className="settings-btn-primary px-3 py-[5px] rounded-[var(--radius)] text-xs bg-[var(--accent)] text-white border-none cursor-pointer transition-all inline-flex items-center gap-1" onClick={handleBrowse}>
              📂 手动选择
            </button>
          </div>
        </div>
      </>
    )
  }

  const isHermes = aiType === 'hermes'

  return (
    <>
      <div className="flex items-center gap-2 px-3.5 pb-2 shrink-0 bg-[var(--bg-secondary)]">
        <span className="text-xs text-[var(--text-muted)] shrink-0">配置文件:</span>
        <input className="flex-1 px-2.5 py-1.5 border border-[var(--border)] rounded-[var(--radius-sm)] bg-[var(--bg-primary)] text-[var(--text-secondary)] text-xs font-[family-name:var(--font-mono)] outline-none" value={configPath} readOnly />
        <button className="settings-btn-secondary px-3 py-[5px] rounded-[var(--radius)] text-xs bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border border-[var(--border)] cursor-pointer transition-all inline-flex items-center gap-1" onClick={handleBrowse}>
          📂 手动选择
        </button>
      </div>

      {isHermes ? (
        <HermesConfigView config={config} onFieldChange={handleFieldChange} />
      ) : (
        <QClawConfigView config={config} onFieldChange={handleFieldChange} />
      )}

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
          🔄 重置
        </button>
        <button className="settings-btn-primary px-3 py-[5px] rounded-[var(--radius)] text-xs bg-[var(--accent)] text-white border-none cursor-pointer transition-all inline-flex items-center gap-1" onClick={handleSave} disabled={!dirty}>
          💾 保存配置
        </button>
      </div>
    </>
  )
}

/* ================================================================
   辅助函数
   ================================================================ */

/** 嵌套路径字段变更的内联实现 */
function makeFieldChangeHelper(
  prev: NormalizedConfig,
  sectionId: string | null,
  field: string,
  value: unknown
): NormalizedConfig {
  const d = prev as Record<string, unknown>

  if (sectionId) {
    // 数组中按 id 匹配（agents 数组）
    const arr = d.agents
    if (!Array.isArray(arr)) return prev
    const updated = arr.map((item) => {
      if (item.id !== sectionId) return item
      if (field === 'modelFallbacks') {
        return { ...item, modelFallbacks: (value as string).split(',').filter(Boolean) }
      }
      return { ...item, [field]: value }
    })
    return { ...prev, agents: updated }
  }

  // sectionId 为空时，按点分路径更新顶级 section（gateway.port → d.gateway.port）
  // 或直接更新顶级字段（models → d.models）
  const dotIdx = field.indexOf('.')
  if (dotIdx > 0) {
    const sectionKey = field.slice(0, dotIdx)
    const subPath = field.slice(dotIdx + 1).split('.')
    const sectionObj = (d[sectionKey] && typeof d[sectionKey] === 'object'
      ? d[sectionKey]
      : {}) as Record<string, unknown>
    return { ...prev, [sectionKey]: nestedSet(sectionObj, subPath, value) }
  }
  // 无点号：直接替换顶级字段
  return { ...prev, [field]: value }
}

/** 从 models 数组收集所有可用模型选项（优先使用 fullPath，与 1.0 一致） */
function collectAllModelOptions(d: Record<string, unknown>): Array<{ value: string; label: string }> {
  if (!Array.isArray(d.models)) return []
  const options: Array<{ value: string; label: string }> = []
  const seen = new Set<string>()
  for (const provider of d.models || []) {
    if (!Array.isArray(provider.models)) continue
    const providerId = String(provider.id || provider.provider || '')
    for (const m of provider.models as Array<Record<string, unknown>>) {
      const value = `${providerId}/${m.id || ''}`
      if (!value || seen.has(value)) continue
      seen.add(value)
      options.push({ value, label: value })
    }
  }
  return options
}

/* ================================================================
   QClaw / OpenClaw 配置视图
   ================================================================ */

interface ConfigViewProps {
  config: NormalizedConfig
  onFieldChange: (sectionId: string | null, field: string, value: unknown) => void
}

function QClawConfigView({ config, onFieldChange }: ConfigViewProps) {
  const d = config
  const [pickerAgentId, setPickerAgentId] = useState<string | null>(null)

  // 从 models 中收集所有可用模型列表
  const allModelOptions = collectAllModelOptions(d)

  // 当前打开弹窗的 agent 数据
  const pickerAgent = pickerAgentId
    ? d.agents?.find((a) => a.id === pickerAgentId)
    : null

  const handlePickerConfirm = (models: string[]) => {
    if (pickerAgentId) {
      onFieldChange(pickerAgentId, 'modelFallbacks', models.join(','))
    }
  }

  return (
    <>
      {d.gateway && typeof d.gateway === 'object' && (
        <CollapsibleGroup title="🌐 Gateway 网关">
          <EditableParamItem
            label="gateway.port"
            desc="端口"
            value={String((d.gateway as Record<string, unknown>).port ?? '')}
            onChange={(v) => onFieldChange(null, 'gateway.port', Number(v))}
            type="port"
          />
          <EditableParamItem
            label="gateway.mode"
            desc="模式"
            value={String((d.gateway as Record<string, unknown>).mode ?? '')}
            onChange={(v) => onFieldChange(null, 'gateway.mode', v)}
          />
          <EditableParamItem
            label="gateway.bind"
            desc="绑定"
            value={String((d.gateway as Record<string, unknown>).bind ?? '')}
            onChange={(v) => onFieldChange(null, 'gateway.bind', v)}
          />
          <EditableParamItem
            label="gateway.auth.mode"
            desc="认证方式"
            value={String((d.gateway as Record<string, unknown>)['auth.mode'] ?? (d.gateway as Record<string, unknown>).auth?.toString() ?? '')}
            onChange={(v) => onFieldChange(null, 'gateway.auth.mode', v)}
          />
          <EditableConfigSection
            data={d.gateway as Record<string, unknown>}
            fields={[
              { key: 'http.chat', label: 'gateway.http.chat', desc: 'HTTP聊天接口' },
              { key: 'controlUI', label: 'gateway.controlUI', desc: '控制台免认证' },
              { key: 'tailscale', label: 'gateway.tailscale', desc: 'Tailscale' }
            ]}
            onChange={(field, value) => onFieldChange(null, `gateway.${field}`, value)}
          />
        </CollapsibleGroup>
      )}
      {Array.isArray(d.agents) && d.agents.length > 0 && (
        <CollapsibleGroup title={`🤖 Agent 列表 (${d.agents.length})`}>
          {d.agents.map((a, i) => (
            <div key={`agent-${a.id || i}`} className="border-2 border-dashed border-[var(--border)] rounded my-2 overflow-hidden">
              {/* Agent 标题行：emoji + 名称 */}
              <div className="flex items-center gap-2 px-3.5 py-[7px] text-xs font-semibold text-[var(--text-primary)] bg-[var(--bg-tertiary)] border-b border-[var(--border)]">
                {(() => {
                  const emoji = (a.emoji as string) || '🤖'
                  const avatar = a.avatar as string | undefined
                  const imgUrl = avatar || (emoji && (emoji.startsWith('http') || emoji.startsWith('/') || emoji.startsWith('data:')) ? emoji : null)
                  return imgUrl
                    ? <div style={{ width: 20, height: 20, borderRadius: '50%', backgroundImage: `url('${imgUrl}')`, backgroundSize: 'cover', backgroundPosition: 'center', flexShrink: 0 }} />
                    : <span className="text-base">{emoji}</span>
                })()}
                <span className="font-semibold text-[var(--text-primary)]">{String(a.name || '未命名')}</span>
                <span className="text-[var(--text-muted)] text-[11px] ml-auto">Agent</span>
              </div>
              {/* 字段列表 */}
              <EditableParamItem label="id" desc="Agent ID" value={String(a.id || '')} />
              <EditableParamItem
                label="name"
                desc="名称"
                value={String(a.name || '')}
                onChange={(v) => onFieldChange(String(a.id), 'name', v)}
              />
              <EditableParamItem
                label="workspace"
                desc="工作空间"
                value={String(a.workspace || '')}
                onChange={(v) => onFieldChange(String(a.id), 'workspace', v)}
              />
              {/* 主模型下拉 */}
              <EditableParamItem
                label="modelPrimary"
                desc="主模型"
                value={String(a.modelPrimary || '')}
                onChange={(v) => onFieldChange(String(a.id), 'modelPrimary', v)}
                type="select"
                options={allModelOptions}
              />
              {/* 备用模型 tag 芯片 + 弹窗选择器 */}
              <ParamItemTagList
                label="modelFallbacks"
                desc="备用模型"
                tags={Array.isArray(a.modelFallbacks) ? (a.modelFallbacks as string[]) : []}
                onAdd={() => setPickerAgentId(String(a.id))}
                onRemove={(tag) => {
                  const current = Array.isArray(a.modelFallbacks) ? (a.modelFallbacks as string[]) : []
                  const slashIdx = tag.indexOf('/')
                  const modelId = slashIdx > 0 ? tag.slice(slashIdx + 1) : tag
                  onFieldChange(String(a.id), 'modelFallbacks', current.filter((t) => {
                    const tSlash = t.indexOf('/')
                    const tModelId = tSlash > 0 ? t.slice(tSlash + 1) : t
                    return tModelId !== modelId
                  }).join(','))
                }}
              />
              <EditableParamItem
                label="reasoningDefault"
                desc="推理模式"
                value={String(a.reasoningDefault || '')}
                onChange={(v) => onFieldChange(String(a.id), 'reasoningDefault', v)}
              />
              <ParamItem label="skills" desc="Skills数量" value={Array.isArray(a.skills) ? a.skills.length : 0} />
            </div>
          ))}
        </CollapsibleGroup>
      )}
      {Array.isArray(d.models) && d.models.length > 0 && (
        <CollapsibleGroup title={`📋 模型列表 (${d.models.length})`}>
          {d.models.map((p, pi) => (
            <div key={`provider-${pi}`} className="border-2 border-dashed border-[var(--border)] rounded my-2 overflow-hidden">
              {/* 供应商标题行：对齐表格格式 key | desc | input */}
              <div className="settings-param-item flex items-center px-3.5 py-[7px] border-b border-[var(--border)] text-xs min-h-[18px]">
                <span className="settings-param-key w-[120px] text-[var(--text-secondary)] font-[family-name:var(--font-mono)] text-[11px] shrink-0">供应商</span>
                <span className="settings-param-desc w-[72px] text-[var(--text-muted)] text-[11px] shrink-0">ID</span>
                <input
                  className="settings-param-input flex-1 px-2 py-[3px] border border-[var(--border)] rounded text-xs bg-[var(--bg-primary)] text-[var(--text-primary)] min-w-0"
                  value={String(p.id || p.provider || '')}
                  onChange={(e) => {
                    const newId = e.target.value
                    const oldId = String(p.id || p.provider || '')
                    const models = [...(d.models || [])]
                    models[pi] = { ...models[pi], id: newId }
                    // 同步更新 agent 的 modelPrimary 和 modelFallbacks
                    if (oldId && newId && oldId !== newId && Array.isArray(d.agents)) {
                      const agents = (d.agents as Array<Record<string, unknown>>).map((a) => {
                        const updates: Record<string, unknown> = {}
                        if (typeof a.modelPrimary === 'string' && a.modelPrimary.startsWith(oldId + '/')) {
                          updates.modelPrimary = newId + a.modelPrimary.slice(oldId.length)
                        }
                        if (Array.isArray(a.modelFallbacks)) {
                          updates.modelFallbacks = (a.modelFallbacks as string[]).map((t) =>
                            t.startsWith(oldId + '/') ? newId + t.slice(oldId.length) : t
                          )
                        }
                        return Object.keys(updates).length ? { ...a, ...updates } : a
                      })
                      onFieldChange(null, 'models', models)
                      onFieldChange(null, 'agents', agents)
                      return
                    }
                    onFieldChange(null, 'models', models)
                  }}
                />
              </div>
              <EditableParamItem
                label="baseUrl"
                desc="API地址"
                value={String(p.baseUrl || '')}
                onChange={(v) => {
                  const models = [...(d.models || [])]
                  models[pi] = { ...models[pi], baseUrl: v }
                  onFieldChange(null, 'models', models)
                }}
              />
              <EditableParamItem
                label="api"
                desc="API协议"
                value={String(p.api || '')}
                onChange={(v) => {
                  const models = [...(d.models as Array<Record<string, unknown>>)]
                  models[pi] = { ...models[pi], api: v }
                  onFieldChange(null, 'models', models)
                }}
              />
              {Array.isArray(p.models) &&
                (p.models as Array<Record<string, unknown>>).map((m, mi) => (
                  <div key={`model-${pi}-${mi}`}>
                    {/* 完整路径：作为模型卡片表头 */}
                    <ParamItem
                      label="完整路径"
                      desc="调用标识"
                      value={`${p.id || p.provider || '-'}/${m.id || '-'}`}
                      className="bg-[var(--bg-tertiary)]"
                    />
                    {/* 模型 ID：可编辑输入框 */}
                    <ModelIdInput
                      value={String(m.id || '')}
                      onChange={(newId) => {
                        const oldId = String(m.id || '')
                        const providerId = String(p.id || p.provider || '')
                        const models = [...(d.models || [])]
                        const providerModels = [...(models[pi].models as Array<Record<string, unknown>>)]
                        providerModels[mi] = { ...providerModels[mi], id: newId }
                        models[pi] = { ...models[pi], models: providerModels }
                        // 同步更新 agent 的 modelPrimary 和 modelFallbacks
                        if (oldId && newId && oldId !== newId && providerId && Array.isArray(d.agents)) {
                          const oldPath = `${providerId}/${oldId}`
                          const newPath = `${providerId}/${newId}`
                          const agents = (d.agents as Array<Record<string, unknown>>).map((a) => {
                            const updates: Record<string, unknown> = {}
                            if (a.modelPrimary === oldPath) updates.modelPrimary = newPath
                            if (Array.isArray(a.modelFallbacks)) {
                              updates.modelFallbacks = (a.modelFallbacks as string[]).map((t) =>
                                t === oldPath ? newPath : t
                              )
                            }
                            return Object.keys(updates).length ? { ...a, ...updates } : a
                          })
                          onFieldChange(null, 'models', models)
                          onFieldChange(null, 'agents', agents)
                          return
                        }
                        onFieldChange(null, 'models', models)
                      }}
                    />
                    <EditableParamItem
                      label="name"
                      desc="显示名"
                      value={String(m.name || m.id || '')}
                      onChange={(v) => {
                        const models = [...(d.models || [])]
                        const providerModels = [...(models[pi].models as Array<Record<string, unknown>>)]
                        providerModels[mi] = { ...providerModels[mi], name: v }
                        models[pi] = { ...models[pi], models: providerModels }
                        onFieldChange(null, 'models', models)
                      }}
                    />
                    <EditableParamItem
                      label="contextWindow"
                      desc="上下文"
                      value={String(m.contextWindow || '')}
                      onChange={(v) => {
                        const models = [...(d.models || [])]
                        const providerModels = [...(models[pi].models as Array<Record<string, unknown>>)]
                        providerModels[mi] = { ...providerModels[mi], contextWindow: v }
                        models[pi] = { ...models[pi], models: providerModels }
                        onFieldChange(null, 'models', models)
                      }}
                    />
                    <EditableParamItem
                      label="maxTokens"
                      desc="最大输出"
                      value={String(m.maxTokens || '')}
                      onChange={(v) => {
                        const models = [...(d.models || [])]
                        const providerModels = [...(models[pi].models as Array<Record<string, unknown>>)]
                        providerModels[mi] = { ...providerModels[mi], maxTokens: v }
                        models[pi] = { ...models[pi], models: providerModels }
                        onFieldChange(null, 'models', models)
                      }}
                    />
                    <EditableParamItem
                      label="reasoning"
                      desc="思考"
                      value={m.reasoning ? '✅ 支持' : '❌ 不支持'}
                    />
                    <EditableParamItem
                      label="input"
                      desc="输入类型"
                      value={String(m.input || 'text')}
                    />
                  </div>
                ))}
            </div>
          ))}
        </CollapsibleGroup>
      )}
      {d.session && typeof d.session === 'object' && (
        <CollapsibleGroup title="💬 会话设置">
          <EditableConfigSection
            data={d.session as Record<string, unknown>}
            fields={[
              { key: 'resetMode', label: 'session.resetMode', desc: '重置模式' },
              { key: 'dmScope', label: 'session.dmScope', desc: '作用域' },
              { key: 'maxHistory', label: 'session.maxHistory', desc: '最大历史' }
            ]}
            onChange={(field, value) => onFieldChange(null, `session.${field}`, value)}
          />
        </CollapsibleGroup>
      )}
      {d.tools && typeof d.tools === 'object' && (
        <CollapsibleGroup title="🔧 工具设置">
          <EditableConfigSection
            data={d.tools as Record<string, unknown>}
            fields={[
              { key: 'allowBash', label: 'tools.allowBash', desc: '允许Bash' },
              { key: 'allowNetwork', label: 'tools.allowNetwork', desc: '允许网络' },
              { key: 'toolTimeout', label: 'tools.toolTimeout', desc: '工具超时' }
            ]}
            onChange={(field, value) => onFieldChange(null, `tools.${field}`, value)}
          />
        </CollapsibleGroup>
      )}
      {d.browser && typeof d.browser === 'object' && (
        <CollapsibleGroup title="🌍 浏览器">
          <EditableConfigSection
            data={d.browser as Record<string, unknown>}
            fields={[
              { key: 'enabled', label: 'browser.enabled', desc: '启用浏览器' },
              { key: 'engine', label: 'browser.engine', desc: '引擎' }
            ]}
            onChange={(field, value) => onFieldChange(null, `browser.${field}`, value)}
          />
        </CollapsibleGroup>
      )}
      {/* 模型选择弹窗 */}
      <ModelPickerPopup
        visible={pickerAgentId !== null}
        available={allModelOptions}
        selected={pickerAgent
          ? (Array.isArray(pickerAgent.modelFallbacks) ? (pickerAgent.modelFallbacks as string[]) : [])
          : []}
        primary={pickerAgent ? String(pickerAgent.modelPrimary || '') : ''}
        onConfirm={handlePickerConfirm}
        onClose={() => setPickerAgentId(null)}
      />
    </>
  )
}

/* ================================================================
   Hermes 配置视图
   ================================================================ */

function HermesConfigView({ config, onFieldChange }: ConfigViewProps) {
  const d = config as Record<string, unknown>

  return (
    <>
      {d.model && typeof d.model === 'object' && (
        <CollapsibleGroup title="🧠 模型设置">
          <EditableConfigSection
            data={d.model as Record<string, unknown>}
            fields={[
              { key: 'default', label: 'model.default', desc: '当前模型' },
              { key: 'main', label: 'model.main', desc: '主模型' },
              { key: 'maxTokens', label: 'model.maxTokens', desc: '最大输出token' },
              { key: 'temperature', label: 'model.temperature', desc: '温度' },
              { key: 'topP', label: 'model.topP', desc: 'Top P' }
            ]}
            onChange={(field, value) => onFieldChange(null, `model.${field}`, value)}
          />
        </CollapsibleGroup>
      )}
      {d.agent && typeof d.agent === 'object' && (
        <CollapsibleGroup title="🤖 Agent 设置">
          <EditableConfigSection
            data={d.agent as Record<string, unknown>}
            fields={[
              { key: 'maxTurns', label: 'agent.maxTurns', desc: '最大轮次' },
              { key: 'gatewayTimeout', label: 'agent.gatewayTimeout', desc: '网关超时' },
              { key: 'reasoningEffort', label: 'agent.reasoningEffort', desc: '推理强度' }
            ]}
            onChange={(field, value) => onFieldChange(null, `agent.${field}`, value)}
          />
        </CollapsibleGroup>
      )}
      {d.memory && typeof d.memory === 'object' && (
        <CollapsibleGroup title="💾 记忆设置">
          <EditableConfigSection
            data={d.memory as Record<string, unknown>}
            fields={[
              { key: 'enabled', label: 'memory.enabled', desc: '启用记忆' },
              { key: 'backend', label: 'memory.backend', desc: '存储后端' },
              { key: 'maxEntries', label: 'memory.maxEntries', desc: '最大条目' }
            ]}
            onChange={(field, value) => onFieldChange(null, `memory.${field}`, value)}
          />
        </CollapsibleGroup>
      )}
      {d.compression && typeof d.compression === 'object' && (
        <CollapsibleGroup title="📦 压缩策略">
          <EditableConfigSection
            data={d.compression as Record<string, unknown>}
            fields={[
              { key: 'enabled', label: 'compression.enabled', desc: '启用压缩' },
              { key: 'windowSize', label: 'compression.windowSize', desc: '窗口大小' },
              { key: 'truncateMode', label: 'compression.truncateMode', desc: '截断模式' }
            ]}
            onChange={(field, value) => onFieldChange(null, `compression.${field}`, value)}
          />
        </CollapsibleGroup>
      )}
      {d.browser && typeof d.browser === 'object' && (
        <CollapsibleGroup title="🌍 浏览器">
          <EditableConfigSection
            data={d.browser as Record<string, unknown>}
            fields={[
              { key: 'engine', label: '引擎' },
              { key: 'path', label: '路径' }
            ]}
            onChange={(field, value) => onFieldChange(null, `browser.${field}`, value)}
          />
        </CollapsibleGroup>
      )}
      {d.security && typeof d.security === 'object' && (
        <CollapsibleGroup title="🔒 安全设置">
          <EditableConfigSection
            data={d.security as Record<string, unknown>}
            fields={[
              { key: 'sandbox', label: '沙盒模式' },
              { key: 'approvalMode', label: '审批模式' }
            ]}
            onChange={(field, value) => onFieldChange(null, `security.${field}`, value)}
          />
        </CollapsibleGroup>
      )}
      {d.display && typeof d.display === 'object' && (
        <CollapsibleGroup title="🎨 显示设置">
          <EditableConfigSection
            data={d.display as Record<string, unknown>}
            fields={[
              { key: 'language', label: '语言' },
              { key: 'theme', label: '主题' }
            ]}
            onChange={(field, value) => onFieldChange(null, `display.${field}`, value)}
          />
        </CollapsibleGroup>
      )}
      {d.apiServer && typeof d.apiServer === 'object' && (
        <CollapsibleGroup title="🌐 API Server">
          <EditableConfigSection
            data={d.apiServer as Record<string, unknown>}
            fields={[
              { key: 'enabled', label: '启用API' },
              { key: 'port', label: '端口' },
              { key: 'host', label: '主机' }
            ]}
            onChange={(field, value) => onFieldChange(null, `apiServer.${field}`, value)}
          />
        </CollapsibleGroup>
      )}
      {Array.isArray(d.profiles) && d.profiles.length > 0 && (
        <CollapsibleGroup title={`👤 Profiles (${d.profiles.length})`}>
          {(d.profiles as Array<{ name: string; configPath?: string }>).map((p) => (
            <ParamItem
              key={p.name}
              label={p.name}
              value={p.configPath ? '✅ 有配置' : '❌ 无配置'}
            />
          ))}
        </CollapsibleGroup>
      )}
    </>
  )
}

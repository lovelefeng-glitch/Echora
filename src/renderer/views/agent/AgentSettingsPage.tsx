/**
 * Agent 设置页面
 * 独立的Agent设置视图，包含Provider配置、记忆管理、权限管理
 * 复用现有AgentSettings组件，扩展记忆和权限管理功能
 */

import React, { useState, useEffect, useCallback } from 'react'
import { AgentSettings } from '../../components/AgentSettings'

interface MemoryEntry {
  id: string
  key: string
  value: string
  category: string
  createdAt: number
  updatedAt: number
}

interface PermissionRule {
  id: string
  tool: string
  action: 'allow' | 'deny' | 'confirm'
  pattern: string
  description: string
}

/** 记忆管理标签页 */
type MemoryTab = 'list' | 'add'

/** 权限管理标签页 */
type PermissionTab = 'list' | 'add'

/* eslint-disable react/no-unknown-property */
const scrollbarStyles = `
.agent-settings-content::-webkit-scrollbar {
  width: 6px;
}
.agent-settings-content::-webkit-scrollbar-track {
  background: transparent;
}
.agent-settings-content::-webkit-scrollbar-thumb {
  background: rgba(128, 128, 128, 0.3);
  border-radius: 3px;
}
.agent-settings-content::-webkit-scrollbar-thumb:hover {
  background: rgba(128, 128, 128, 0.5);
}
@supports (scrollbar-width: thin) {
  .agent-settings-content {
    scrollbar-width: thin;
    scrollbar-color: rgba(128, 128, 128, 0.3) transparent;
  }
}
`

export const AgentSettingsPage: React.FC = () => {
  const [activeSection, setActiveSection] = useState<'provider' | 'memory' | 'permission'>('provider')

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      {/* 标题栏 */}
      <div className="flex items-center gap-2 px-6 py-[14px] border-b border-[var(--border)] shrink-0">
        <span className="text-[18px]">🤖</span>
        <span className="text-[15px] font-semibold text-[var(--text-primary)]">Agent 设置</span>
      </div>
      <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      {/* 顶部标签栏 */}
      <div className="flex items-center gap-1 px-6 py-2.5 border-b border-[var(--border)] shrink-0">
        <button
          className={`flex items-center gap-1.5 py-[7px] px-4 border border-transparent rounded-[var(--radius)] bg-transparent cursor-pointer text-[13px] font-[inherit] text-[var(--text-secondary)] transition-all duration-150 hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] ${activeSection === 'provider' ? 'bg-[var(--accent-light)] border-[var(--accent)] text-[var(--accent)] font-semibold' : ''}`}
          onClick={() => setActiveSection('provider')}
        >
          <span className="text-[14px]">☁️</span>
          <span className="text-[13px]">Provider 配置</span>
        </button>
        <button
          className={`flex items-center gap-1.5 py-[7px] px-4 border border-transparent rounded-[var(--radius)] bg-transparent cursor-pointer text-[13px] font-[inherit] text-[var(--text-secondary)] transition-all duration-150 hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] ${activeSection === 'memory' ? 'bg-[var(--accent-light)] border-[var(--accent)] text-[var(--accent)] font-semibold' : ''}`}
          onClick={() => setActiveSection('memory')}
        >
          <span className="text-[14px]">🧠</span>
          <span className="text-[13px]">记忆管理</span>
        </button>
        <button
          className={`flex items-center gap-1.5 py-[7px] px-4 border border-transparent rounded-[var(--radius)] bg-transparent cursor-pointer text-[13px] font-[inherit] text-[var(--text-secondary)] transition-all duration-150 hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] ${activeSection === 'permission' ? 'bg-[var(--accent-light)] border-[var(--accent)] text-[var(--accent)] font-semibold' : ''}`}
          onClick={() => setActiveSection('permission')}
        >
          <span className="text-[14px]">🔒</span>
          <span className="text-[13px]">权限管理</span>
        </button>
      </div>

      {/* 内容区域 */}
      <style>{scrollbarStyles}</style>
      <div className="agent-settings-content flex-1 overflow-y-auto px-6 py-4">
        {activeSection === 'provider' && <AgentSettings />}
        {activeSection === 'memory' && <MemoryManager />}
        {activeSection === 'permission' && <PermissionManager />}
      </div>
      </div>
    </div>
  )
}

/** 记忆管理组件 */
function MemoryManager() {
  const [memories, setMemories] = useState<MemoryEntry[]>([])
  const [activeTab, setActiveTab] = useState<MemoryTab>('list')
  const [newKey, setNewKey] = useState('')
  const [newValue, setNewValue] = useState('')
  const [newCategory, setNewCategory] = useState('general')
  const [editId, setEditId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  const loadMemories = useCallback(async () => {
    try {
      const api = (window as any).echora?.memory
      if (!api?.list) return
      const list = await api.list() as MemoryEntry[]
      setMemories(list || [])
    } catch {
      // memory API not available
    }
  }, [])

  useEffect(() => {
    loadMemories()
  }, [loadMemories])

  const handleSave = async () => {
    if (!newKey.trim() || !newValue.trim()) return
    try {
      const api = (window as any).echora?.memory
      if (!api) return
      if (editId) {
        await api.update(editId, { key: newKey, value: newValue, category: newCategory })
      } else {
        await api.add({ key: newKey, value: newValue, category: newCategory })
      }
      setNewKey('')
      setNewValue('')
      setNewCategory('general')
      setEditId(null)
      setActiveTab('list')
      await loadMemories()
    } catch (err) {
      console.error('保存记忆失败:', err)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      const api = (window as any).echora?.memory
      if (!api?.delete) return
      await api.delete(id)
      await loadMemories()
    } catch (err) {
      console.error('删除记忆失败:', err)
    }
  }

  const handleEdit = (entry: MemoryEntry) => {
    setNewKey(entry.key)
    setNewValue(entry.value)
    setNewCategory(entry.category)
    setEditId(entry.id)
    setActiveTab('add')
  }

  const filteredMemories = memories.filter(m => {
    if (!searchQuery) return true
    const q = searchQuery.toLowerCase()
    return m.key.toLowerCase().includes(q) || m.value.toLowerCase().includes(q) || m.category.toLowerCase().includes(q)
  })

  const categories = [...new Set(memories.map(m => m.category))]
  const canSave = newKey.trim() && newValue.trim()

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h3 className="m-0 text-[16px] font-semibold text-[var(--text-primary)]">🧠 记忆管理</h3>
        <div className="flex gap-2">
          {activeTab === 'list' ? (
            <button
              className="py-1.5 px-4 bg-[var(--accent)] text-white border-none rounded-[var(--radius-sm)] cursor-pointer text-[13px] font-[inherit] transition-[background] hover:not-disabled:bg-[var(--accent-hover)] disabled:bg-[var(--border)] disabled:cursor-not-allowed"
              onClick={() => { setEditId(null); setNewKey(''); setNewValue(''); setNewCategory('general'); setActiveTab('add') }}
            >
              + 添加记忆
            </button>
          ) : (
            <button
              className="py-1.5 px-4 bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border border-[var(--border)] rounded-[var(--radius-sm)] cursor-pointer text-[13px] font-[inherit] transition-all hover:not-disabled:bg-[var(--border)] hover:not-disabled:text-[var(--text-primary)]"
              onClick={() => setActiveTab('list')}
            >
              返回列表
            </button>
          )}
        </div>
      </div>

      {activeTab === 'list' ? (
        <>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="🔍 搜索记忆..."
            className="w-full py-2 px-3 border border-[var(--border)] rounded-[var(--radius-sm)] text-[13px] font-[inherit] bg-[var(--bg-primary)] text-[var(--text-primary)] mb-3 box-border transition-[border-color] placeholder:text-[var(--text-hint)] focus:outline-none focus:border-[var(--accent)]"
          />

          <div className="text-[12px] text-[var(--text-muted)] mb-3">
            共 {memories.length} 条记忆{categories.length > 0 ? `，${categories.length} 个分类` : ''}
          </div>

          {filteredMemories.length === 0 ? (
            <div className="p-8 text-center text-[var(--text-muted)] bg-[var(--bg-tertiary)] rounded-[var(--radius-md)]">
              {searchQuery ? '未找到匹配的记忆' : '暂无记忆条目'}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {filteredMemories.map(entry => (
                <div key={entry.id} className="flex items-start gap-3 py-3 px-4 border border-[var(--border)] rounded-[var(--radius-md)] bg-[var(--bg-card)] transition-[border-color] hover:border-[var(--accent)]">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-[13px] text-[var(--text-primary)]">{entry.key}</span>
                      <span className="text-[10px] py-px px-1.5 rounded-[var(--radius-sm)] bg-[var(--bg-tertiary)] text-[var(--text-secondary)]">{entry.category}</span>
                    </div>
                    <div className="text-[12px] text-[var(--text-secondary)] leading-6">{entry.value}</div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button className="py-1 px-2 border-none rounded-[var(--radius-sm)] bg-[var(--bg-tertiary)] cursor-pointer text-[12px] font-[inherit] transition-[background] hover:bg-[var(--border)]" onClick={() => handleEdit(entry)}>编辑</button>
                    <button className="py-1 px-2 border-none rounded-[var(--radius-sm)] bg-[var(--error-subtle)] text-[var(--error)] cursor-pointer text-[12px] font-[inherit] transition-[background] hover:bg-[var(--error)] hover:text-white" onClick={() => handleDelete(entry.id)}>删除</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="flex flex-col gap-4 max-w-[500px]">
          <div className="flex flex-col">
            <label className="block mb-1.5 font-semibold text-[13px] text-[var(--text-primary)]">Key（标识符）</label>
            <input
              type="text"
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              placeholder="例如: user_preference"
              className="w-full py-2 px-3 border border-[var(--border)] rounded-[var(--radius-sm)] text-[13px] font-[inherit] bg-[var(--bg-primary)] text-[var(--text-primary)] box-border transition-[border-color] placeholder:text-[var(--text-hint)] focus:outline-none focus:border-[var(--accent)]"
            />
          </div>
          <div className="flex flex-col">
            <label className="block mb-1.5 font-semibold text-[13px] text-[var(--text-primary)]">Value（值）</label>
            <textarea
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              placeholder="输入记忆内容..."
              rows={4}
              className="w-full py-2 px-3 border border-[var(--border)] rounded-[var(--radius-sm)] text-[13px] font-[inherit] bg-[var(--bg-primary)] text-[var(--text-primary)] resize-y box-border transition-[border-color] focus:outline-none focus:border-[var(--accent)]"
            />
          </div>
          <div className="flex flex-col">
            <label className="block mb-1.5 font-semibold text-[13px] text-[var(--text-primary)]">分类</label>
            <input
              type="text"
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              placeholder="general"
              className="w-full py-2 px-3 border border-[var(--border)] rounded-[var(--radius-sm)] text-[13px] font-[inherit] bg-[var(--bg-primary)] text-[var(--text-primary)] box-border transition-[border-color] placeholder:text-[var(--text-hint)] focus:outline-none focus:border-[var(--accent)]"
            />
          </div>
          <button
            className="py-1.5 px-4 bg-[var(--accent)] text-white border-none rounded-[var(--radius-sm)] cursor-pointer text-[13px] font-[inherit] transition-[background] hover:not-disabled:bg-[var(--accent-hover)] disabled:bg-[var(--border)] disabled:cursor-not-allowed"
            onClick={handleSave}
            disabled={!canSave}
          >
            {editId ? '更新记忆' : '保存记忆'}
          </button>
        </div>
      )}
    </div>
  )
}

/** 权限管理组件 */
function PermissionManager() {
  const [rules, setRules] = useState<PermissionRule[]>([])
  const [activeTab, setActiveTab] = useState<PermissionTab>('list')
  const [newTool, setNewTool] = useState('')
  const [newAction, setNewAction] = useState<'allow' | 'deny' | 'confirm'>('confirm')
  const [newPattern, setNewPattern] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [editId, setEditId] = useState<string | null>(null)

  const loadRules = useCallback(async () => {
    try {
      const api = (window as any).echora?.permission
      if (!api?.list) return
      const list = await api.list() as PermissionRule[]
      setRules(list || [])
    } catch {
      // permission API not available
    }
  }, [])

  useEffect(() => {
    loadRules()
  }, [loadRules])

  const handleSave = async () => {
    if (!newTool.trim()) return
    try {
      const api = (window as any).echora?.permission
      if (!api) return
      const ruleData = { tool: newTool, action: newAction, pattern: newPattern, description: newDescription }
      if (editId) {
        await api.update(editId, ruleData)
      } else {
        await api.add(ruleData)
      }
      setNewTool('')
      setNewAction('confirm')
      setNewPattern('')
      setNewDescription('')
      setEditId(null)
      setActiveTab('list')
      await loadRules()
    } catch (err) {
      console.error('保存权限规则失败:', err)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      const api = (window as any).echora?.permission
      if (!api?.delete) return
      await api.delete(id)
      await loadRules()
    } catch (err) {
      console.error('删除权限规则失败:', err)
    }
  }

  const handleEdit = (rule: PermissionRule) => {
    setNewTool(rule.tool)
    setNewAction(rule.action)
    setNewPattern(rule.pattern)
    setNewDescription(rule.description)
    setEditId(rule.id)
    setActiveTab('add')
  }

  const actionBadgeClass: Record<string, string> = {
    allow: 'bg-[var(--success-subtle)] text-[var(--success)]',
    deny: 'bg-[var(--error-subtle)] text-[var(--error)]',
    confirm: 'bg-[var(--warning-subtle)] text-[var(--warning)]'
  }

  const actionLabels: Record<string, string> = {
    allow: '允许',
    deny: '拒绝',
    confirm: '需确认'
  }

  const actionPickerClass: Record<string, string> = {
    allow: 'border-[var(--success)] bg-[var(--success-subtle)] text-[var(--success)]',
    deny: 'border-[var(--error)] bg-[var(--error-subtle)] text-[var(--error)]',
    confirm: 'border-[var(--warning)] bg-[var(--warning-subtle)] text-[var(--warning)]'
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h3 className="m-0 text-[16px] font-semibold text-[var(--text-primary)]">🔒 权限管理</h3>
        <div className="flex gap-2">
          {activeTab === 'list' ? (
            <button
              className="py-1.5 px-4 bg-[var(--accent)] text-white border-none rounded-[var(--radius-sm)] cursor-pointer text-[13px] font-[inherit] transition-[background] hover:not-disabled:bg-[var(--accent-hover)] disabled:bg-[var(--border)] disabled:cursor-not-allowed"
              onClick={() => { setEditId(null); setNewTool(''); setNewAction('confirm'); setNewPattern(''); setNewDescription(''); setActiveTab('add') }}
            >
              + 添加规则
            </button>
          ) : (
            <button
              className="py-1.5 px-4 bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border border-[var(--border)] rounded-[var(--radius-sm)] cursor-pointer text-[13px] font-[inherit] transition-all hover:not-disabled:bg-[var(--border)] hover:not-disabled:text-[var(--text-primary)]"
              onClick={() => setActiveTab('list')}
            >
              返回列表
            </button>
          )}
        </div>
      </div>

      {activeTab === 'list' ? (
        <>
          <div className="py-3 px-4 bg-[var(--accent-light)] rounded-[var(--radius-md)] text-[12px] text-[var(--text-primary)] mb-4 leading-relaxed">
            配置Agent使用工具时的权限策略。"允许"自动放行，"拒绝"直接拦截，"需确认"会在执行前询问用户。
          </div>

          {rules.length === 0 ? (
            <div className="p-8 text-center text-[var(--text-muted)] bg-[var(--bg-tertiary)] rounded-[var(--radius-md)]">
              暂无权限规则，Agent工具使用将遵循默认策略（需确认）
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {rules.map(rule => (
                <div key={rule.id} className="flex items-start gap-3 py-3 px-4 border border-[var(--border)] rounded-[var(--radius-md)] bg-[var(--bg-card)] transition-[border-color] hover:border-[var(--accent)]">
                  <span className={`py-0.5 px-2 rounded-[var(--radius-sm)] text-[12px] font-semibold shrink-0 ${actionBadgeClass[rule.action] || actionBadgeClass.confirm}`}>
                    {actionLabels[rule.action]}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-[13px] text-[var(--text-primary)]">{rule.tool}</div>
                    {rule.description && <div className="text-[12px] text-[var(--text-muted)] mt-0.5">{rule.description}</div>}
                    {rule.pattern && <div className="text-[11px] text-[var(--text-hint)] mt-0.5 font-[var(--font-mono)]">匹配: {rule.pattern}</div>}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button className="py-1 px-2 border-none rounded-[var(--radius-sm)] bg-[var(--bg-tertiary)] cursor-pointer text-[12px] font-[inherit] transition-[background] hover:bg-[var(--border)]" onClick={() => handleEdit(rule)}>编辑</button>
                    <button className="py-1 px-2 border-none rounded-[var(--radius-sm)] bg-[var(--error-subtle)] text-[var(--error)] cursor-pointer text-[12px] font-[inherit] transition-[background] hover:bg-[var(--error)] hover:text-white" onClick={() => handleDelete(rule.id)}>删除</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="flex flex-col gap-4 max-w-[500px]">
          <div className="flex flex-col">
            <label className="block mb-1.5 font-semibold text-[13px] text-[var(--text-primary)]">工具名称</label>
            <input
              type="text"
              value={newTool}
              onChange={(e) => setNewTool(e.target.value)}
              placeholder="例如: file_write, web_search"
              className="w-full py-2 px-3 border border-[var(--border)] rounded-[var(--radius-sm)] text-[13px] font-[inherit] bg-[var(--bg-primary)] text-[var(--text-primary)] box-border transition-[border-color] placeholder:text-[var(--text-hint)] focus:outline-none focus:border-[var(--accent)]"
            />
          </div>
          <div className="flex flex-col">
            <label className="block mb-1.5 font-semibold text-[13px] text-[var(--text-primary)]">权限策略</label>
            <div className="flex gap-2">
              {(['allow', 'deny', 'confirm'] as const).map(action => (
                <button
                  key={action}
                  onClick={() => setNewAction(action)}
                  className={`flex-1 py-2 border-2 border-[var(--border)] rounded-[var(--radius-sm)] bg-[var(--bg-card)] text-[var(--text-secondary)] cursor-pointer text-[13px] font-[inherit] transition-all ${newAction === action ? `font-semibold ${actionPickerClass[action]}` : ''}`}
                >
                  {actionLabels[action]}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col">
            <label className="block mb-1.5 font-semibold text-[13px] text-[var(--text-primary)]">匹配模式（可选）</label>
            <input
              type="text"
              value={newPattern}
              onChange={(e) => setNewPattern(e.target.value)}
              placeholder="例如: *.txt, /path/*"
              className="w-full py-2 px-3 border border-[var(--border)] rounded-[var(--radius-sm)] text-[13px] font-[inherit] bg-[var(--bg-primary)] text-[var(--text-primary)] box-border transition-[border-color] placeholder:text-[var(--text-hint)] focus:outline-none focus:border-[var(--accent)]"
            />
          </div>
          <div className="flex flex-col">
            <label className="block mb-1.5 font-semibold text-[13px] text-[var(--text-primary)]">描述（可选）</label>
            <input
              type="text"
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              placeholder="规则说明..."
              className="w-full py-2 px-3 border border-[var(--border)] rounded-[var(--radius-sm)] text-[13px] font-[inherit] bg-[var(--bg-primary)] text-[var(--text-primary)] box-border transition-[border-color] placeholder:text-[var(--text-hint)] focus:outline-none focus:border-[var(--accent)]"
            />
          </div>
          <button
            className="py-1.5 px-4 bg-[var(--accent)] text-white border-none rounded-[var(--radius-sm)] cursor-pointer text-[13px] font-[inherit] transition-[background] hover:not-disabled:bg-[var(--accent-hover)] disabled:bg-[var(--border)] disabled:cursor-not-allowed"
            onClick={handleSave}
            disabled={!newTool.trim()}
          >
            {editId ? '更新规则' : '保存规则'}
          </button>
        </div>
      )}
    </div>
  )
}

export default AgentSettingsPage

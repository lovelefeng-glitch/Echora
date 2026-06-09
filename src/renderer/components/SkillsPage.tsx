import { useState, useEffect, useCallback, useMemo } from 'react'
import { useAppStore } from '../stores/app-store'
import { useEchora } from '../hooks/use-echora'
import type { SkillsListResult } from '../../shared/ipc-types'

const AI_ICONS: Record<string, string> = {
  qclaw: '🐉',
  openclaw: '🦞',
  hermes: '🔮',
  cursor: '⚡',
  windsurf: '🌊',
  trae: '🚀'
}

const CATEGORY_ICONS: Record<string, string> = {
  'autonomous-ai-agents': '🤖',
  'creative': '🎨',
  'data-science': '📊',
  'devops': '🔧',
  'email': '📧',
  'gaming': '🎮',
  'github': '🐙',
  'management': '👔',
  'mcp': '🔌',
  'media': '🎬',
  'mlops': '🧠',
  'note-taking': '📝',
  'productivity': '📋',
  'research': '🔬',
  'smart-home': '🏠',
  'software-development': '💻',
  '内置技能': '📦',
  '已安装技能': '📥',
  '工作区技能': '📂',
  '额外技能': '🔌',
  '其他': '📁'
}

function getCategoryIcon(category: string): string {
  if (CATEGORY_ICONS[category]) return CATEGORY_ICONS[category]
  const parent = category.split('/')[0]
  if (CATEGORY_ICONS[parent]) return CATEGORY_ICONS[parent]
  if (category.includes('技能')) return '📂'
  return '📦'
}

function formatCategoryName(category: string): string {
  return category
    .split('/')
    .map((part) =>
      part
        .split('-')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ')
    )
    .join(' / ')
}

type Skill = SkillsListResult['skills'][number]

export function SkillsPage() {
  const api = useEchora()
  const agents = useAppStore((s) => s.agents)
  const aiTypes = useMemo(() => {
    const types = Array.from(new Set(Array.from(agents.values()).map((a) => a.aiType).filter(Boolean)))
    if (!types.includes('hermes')) types.unshift('hermes')
    return types
  }, [agents])

  const [currentAI, setCurrentAI] = useState(aiTypes[0] || 'hermes')
  const [skills, setSkills] = useState<Skill[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set())

  const loadSkills = useCallback(async () => {
    setLoading(true)
    try {
      const result = (await api.skills.list(currentAI)) as SkillsListResult
      if (result.success) {
        setSkills(result.skills || [])
        setCategories(result.categories || [])
      } else {
        setSkills([])
        setCategories([])
      }
    } catch (err) {
      console.error('Failed to load skills:', err)
      setSkills([])
    } finally {
      setLoading(false)
    }
  }, [currentAI])

  useEffect(() => {
    loadSkills()
  }, [loadSkills])

  const toggleCategory = useCallback((category: string) => {
    setCollapsedCategories((prev) => {
      const next = new Set(prev)
      if (next.has(category)) {
        next.delete(category)
      } else {
        next.add(category)
      }
      return next
    })
  }, [])

  const grouped = useMemo(() => {
    const map = new Map<string, Skill[]>()
    for (const skill of skills) {
      const list = map.get(skill.category) || []
      list.push(skill)
      map.set(skill.category, list)
    }
    return map
  }, [skills])

  const icon = AI_ICONS[currentAI] || '🤖'

  return (
    <div className="flex-1 flex min-h-0 overflow-hidden">
      <div className="w-14 min-w-14 bg-[var(--bg-secondary)] border-r border-[var(--border)] flex flex-col items-center py-2 gap-0.5 overflow-y-auto">
        {aiTypes.map((aiType) => {
          const aiIcon = AI_ICONS[aiType] || '🤖'
          return (
            <button
              key={aiType}
              className={`w-11 h-11 flex flex-col items-center justify-center gap-0.5 rounded-[var(--radius)] text-[var(--text-muted)] transition-all hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)] ${currentAI === aiType ? 'bg-[var(--accent-subtle)] text-[var(--accent)]' : ''}`}
              onClick={() => setCurrentAI(aiType)}
              title={aiType}
            >
              <span className="text-lg leading-none">{aiIcon}</span>
              <span className="text-[9px] uppercase tracking-[0.3px] whitespace-nowrap overflow-hidden text-ellipsis max-w-12">{aiType}</span>
            </button>
          )
        })}
      </div>

      <div className="flex-1 overflow-y-auto flex flex-col">
        <div className="px-6 pt-5 pb-4 border-b border-[var(--border)] shrink-0">
          <div className="text-[17px] font-semibold text-[var(--text-primary)]">{icon} {currentAI} 技能</div>
          <div className="text-xs text-[var(--text-muted)] mt-1">
            共 {currentAI} 的已安装技能
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2.5 px-6 py-12 text-[var(--text-muted)] text-[13px]">
            <span className="w-[18px] h-[18px] border-2 border-[var(--border)] border-t-[var(--accent)] rounded-full animate-spin" />
            加载技能列表...
          </div>
        ) : skills.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-12 text-center gap-2">
            <div className="text-5xl opacity-50">🧩</div>
            <div className="text-sm text-[var(--text-secondary)]">暂无已安装的技能</div>
          </div>
        ) : (
          <>
            <div className="px-6 py-2.5 text-xs text-[var(--text-muted)] border-b border-[var(--border)]">
              📊 共 {skills.length} 个技能，{categories.length} 个分类
            </div>
            {Array.from(grouped.entries()).map(([category, catSkills]) => {
              const isCollapsed = collapsedCategories.has(category)
              return (
                <div
                  key={category}
                  className={`border-b border-[var(--border)] ${isCollapsed ? 'collapsed' : ''}`}
                >
                  <div
                    className="flex items-center gap-2 px-6 py-2.5 cursor-pointer select-none transition-colors hover:bg-[var(--bg-tertiary)]"
                    onClick={() => toggleCategory(category)}
                  >
                    <span className="text-base shrink-0">
                      {getCategoryIcon(category)}
                    </span>
                    <span className="flex-1 text-[13px] font-semibold text-[var(--text-primary)]">
                      {formatCategoryName(category)}
                    </span>
                    <span className="text-[11px] text-[var(--text-muted)] bg-[var(--bg-tertiary)] px-1.5 rounded-full">{catSkills.length}</span>
                    <span className={`text-[10px] text-[var(--text-muted)] transition-transform ${isCollapsed ? '-rotate-90' : ''}`}>▼</span>
                  </div>
                  <div className={isCollapsed ? 'hidden' : 'px-6 pb-2'}>
                    {catSkills.map((skill, i) => (
                      <SkillItem key={`${skill.name}-${i}`} skill={skill} />
                    ))}
                  </div>
                </div>
              )
            })}
          </>
        )}
      </div>
    </div>
  )
}

function SkillItem({ skill }: { skill: Skill }) {
  const isEnabled = skill.enabled !== false

  return (
    <div className={`flex flex-col gap-0.5 px-3 py-1.5 my-0.5 rounded-[var(--radius)] transition-colors hover:bg-[var(--bg-tertiary)] ${!isEnabled ? 'opacity-50' : ''}`}>
      <div className="flex items-center gap-1.5 text-[13px] font-medium text-[var(--text-primary)]">
        {skill.enabled !== undefined && (
          <span
            className={`w-1.5 h-1.5 rounded-full shrink-0 ${isEnabled ? 'bg-[var(--success)]' : 'bg-[var(--text-muted)] opacity-50'}`}
          />
        )}
        {skill.name}
      </div>
      {skill.description && (
        <div className="text-[11px] text-[var(--text-muted)] leading-[1.4] pl-3">{skill.description}</div>
      )}
    </div>
  )
}

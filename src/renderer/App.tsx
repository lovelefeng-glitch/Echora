import { useEffect, useState, useCallback } from 'react'
import { useAppStore } from './stores/app-store'
import { installConsoleInterceptor } from './stores/log-store'
import { useEchora, useGatewayEvents, useWindowEvents } from './hooks/use-echora'
import { loadAllConversationsFromDisk } from './hooks/use-conversations'
import { Sidebar } from './components/Sidebar'
import { ChatArea } from './components/ChatArea'
import { TitleBar } from './components/TitleBar'
import { PageHeader } from './components/PageHeader'
import { SettingsPanel } from './components/SettingsPanel'
import { AIManagementPanel } from './components/AIManagementPanel'
import { SkillsPage } from './components/SkillsPage'
import { ErrorBoundary } from './components/ErrorBoundary'
import { AgentSettingsPage } from './views/agent/AgentSettingsPage'
import { GroupChatView } from './views/GroupChatView'
import { ToolConfirmDialog } from './components/ToolConfirmDialog'
import { PreviewPane } from './components/preview'
import type { ToolConfirmRequest } from './components/ToolConfirmDialog'
import type { GatewayStatusChangeData, GatewayStatusMap, AppConfig, DirectApiProvider, MessageChunkData, MessageDoneData, MessageToolCallData, MessageUsageData, ThinkingInfo, ToolStepInfo } from '../shared/ipc-types'
import type { DirectApiConfig } from '../shared/types'

function App() {
  const currentView = useAppStore((s) => s.currentView)
  const setGatewayStatus = useAppStore((s) => s.setGatewayStatus)
  const updateGatewayStatus = useAppStore((s) => s.updateGatewayStatus)
  const bumpAgentListVersion = useAppStore((s) => s.bumpAgentListVersion)
  const setDirectApiProviders = useAppStore((s) => s.setDirectApiProviders)
  const setDirectApiConfigs = useAppStore((s) => s.setDirectApiConfigs)
  const theme = useAppStore((s) => s.theme)
  const setTheme = useAppStore((s) => s.setTheme)
  const api = useEchora()

  // 安装 console 拦截器
  useEffect(() => {
    installConsoleInterceptor()
  }, [])

  // ── 工具确认对话框状态 ──
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmRequest, setConfirmRequest] = useState<ToolConfirmRequest | null>(null)

  // 监听工具确认请求
  useEffect(() => {
    const unsubscribe = api.tool.onConfirmRequest((data) => {
      setConfirmRequest(data)
      setConfirmOpen(true)
    })
    return unsubscribe
  }, [])

  const handleConfirmAccept = useCallback(() => {
    setConfirmOpen(false)
    setConfirmRequest(null)
    api.tool.respondConfirm(true)
  }, [])

  const handleConfirmReject = useCallback(() => {
    setConfirmOpen(false)
    setConfirmRequest(null)
    api.tool.respondConfirm(false)
  }, [])

  useGatewayEvents({
    onStatusChange: (data: GatewayStatusChangeData) => {
      updateGatewayStatus(data.aiType, {
        status: data.status as 'running' | 'offline' | 'starting' | 'error' | 'stopped',
        pid: data.pid,
        port: data.port
      })
      // 网关变为 running 时，触发 agent 列表刷新
      if (data.status === 'running') {
        bumpAgentListVersion()
      }
    },
    onStatusAll: (data: GatewayStatusMap) => {
      setGatewayStatus(data)
    }
  })

  useWindowEvents({
    onMaximized: () => {}
  })

  // ── 预览面板状态 ──
  const previewVisible = useAppStore((s) => s.previewVisible)
  const showPreview = useAppStore((s) => s.showPreview)
  const hidePreview = useAppStore((s) => s.hidePreview)
  const updatePreviewTarget = useAppStore((s) => s.updatePreviewTarget)

  // ── 快捷键监听 ──
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'p') {
        e.preventDefault()
        if (previewVisible) {
          hidePreview()
        } else {
          showPreview({ type: 'url', title: '工具面板' })
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [previewVisible, showPreview, hidePreview])

  // ── Preview API 事件监听 ──
  useEffect(() => {
    const handleShow = (e: CustomEvent) => showPreview(e.detail)
    const handleHide = () => hidePreview()
    const handleUpdate = (e: CustomEvent) => updatePreviewTarget(e.detail)

    window.addEventListener('preview:show', handleShow as EventListener)
    window.addEventListener('preview:hide', handleHide)
    window.addEventListener('preview:update', handleUpdate as EventListener)

    return () => {
      window.removeEventListener('preview:show', handleShow as EventListener)
      window.removeEventListener('preview:hide', handleHide)
      window.removeEventListener('preview:update', handleUpdate as EventListener)
    }
  }, [showPreview, hidePreview, updatePreviewTarget])

  const handleToggleToolPanel = useCallback(() => {
    if (previewVisible) {
      hidePreview()
    } else {
      showPreview({ type: 'url', title: '工具面板' })
    }
  }, [previewVisible, showPreview, hidePreview])

  useEffect(() => {
    const init = async () => {
      try {
        const [status, config] = await Promise.all([
          api.gateway.status(),
          api.config.getAll() as Promise<AppConfig>
        ])
        setGatewayStatus(status)
        if (config.settings) {
          useAppStore.getState().updateSettings(config.settings)
        }

        // Restore theme from config
        const savedTheme = (config as Record<string, unknown>)['theme'] as 'dark' | 'light' | undefined
        if (savedTheme && savedTheme !== useAppStore.getState().theme) {
          useAppStore.getState().setTheme(savedTheme)
          api.window.setTheme(savedTheme === 'light')
        }

        const directApiCfgs = (config as Record<string, unknown>)['directApiConfigs'] as DirectApiConfig[] | undefined
        if (directApiCfgs && directApiCfgs.length > 0) {
          setDirectApiConfigs(directApiCfgs)
        }

        // 从 agentProviders 配置加载直连 API 提供商（与 DirectApiAdapter 使用相同数据源）
        const agentProvidersCfg = (config as Record<string, unknown>)['agentProviders'] as Array<Record<string, unknown>> | undefined
        if (agentProvidersCfg && agentProvidersCfg.length > 0) {
          const mapped: DirectApiProvider[] = agentProvidersCfg.map((p) => ({
            id: p.id as string,
            name: p.name as string,
            baseUrl: p.baseUrl as string,
            hasApiKey: Boolean(p.apiKey),
            models: ((p.models as string[]) || []).map((m: string) => ({ id: m, name: m })),
            status: 'offline' as const
          }))
          setDirectApiProviders(mapped)
        }

        // Restore conversations from disk on startup
        await loadAllConversationsFromDisk()

        // Restore last active agent and conversation
        const lastAgent = (config as Record<string, unknown>)['lastActiveAgent'] as string | null
        const lastConvs = (config as Record<string, unknown>)['lastActiveConversations'] as Record<string, string | null> | undefined
        if (lastAgent) {
          useAppStore.getState().setActiveAgent(lastAgent)
        }
        if (lastConvs) {
          for (const [ak, cv] of Object.entries(lastConvs)) {
            if (cv) useAppStore.getState().setActiveConversation(ak, cv)
          }
        }

        // Restore agent sorting (pin order + notifications)
        const agentSorting = (config as Record<string, unknown>)['agentSorting'] as {
          lastAgentActivity?: Record<string, number>
          pendingNotifications?: string[]
        } | undefined
        if (agentSorting) {
          useAppStore.getState().restoreAgentSorting(agentSorting)
        }

        // Restore removedAIs (prevents removed agents from reappearing after restart)
        const removedAIs = (config as Record<string, unknown>)['removedAIs'] as string[] | undefined
        if (removedAIs && removedAIs.length > 0) {
          const store = useAppStore.getState()
          for (const aiType of removedAIs) {
            store.markAIRemoved(aiType)
          }
        }
      } catch (err) {
        console.error('Failed to initialize:', err)
      } finally {
        // 主题恢复后显示界面
        document.getElementById('root')?.removeAttribute('style')
      }
    }
    init()
  }, [])

  const handleToggleTheme = () => {
    const current = useAppStore.getState().theme
    const next = current === 'dark' ? 'light' : 'dark'
    setTheme(next)
    api.window.setTheme(next === 'light')
    api.config.set('theme', next)
  }

  return (
    <div className="app">
      <div className="app-body">
        <Sidebar />

        <main className="main-content">
          <TitleBar />

          {currentView === 'chat' && (
            <ErrorBoundary><ChatArea onToggleTheme={handleToggleTheme} /></ErrorBoundary>
          )}
          {(currentView === 'settings' || currentView === 'direct-api-settings') && (
            <>
              <PageHeader
                title="⚙️ 系统设置"
                rightContent={
                  <div className="flex items-center gap-2">
                    <button className="w-7 h-7 rounded-full border-none bg-[var(--bg-tertiary)] text-[var(--text-secondary)] cursor-pointer transition-all duration-150 flex items-center justify-center flex-shrink-0 hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]" onClick={handleToggleTheme} title="切换白昼/夜间模式">
                      {theme === 'dark' ? '☀️' : '🌙'}
                    </button>
                    <button 
                      className="w-7 h-7 rounded-full border-none bg-[var(--bg-tertiary)] text-[var(--text-secondary)] cursor-pointer transition-all duration-150 flex items-center justify-center flex-shrink-0 hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                      onClick={handleToggleToolPanel}
                      title="打开工具面板"
                    >
                      🛠️
                    </button>
                  </div>
                }
              />
              <div className="pageCard"><SettingsPanel /></div>
            </>
          )}
          {currentView === 'ai-mgmt' && (
            <>
              <PageHeader
                title="🖥️ AI 管理"
                rightContent={
                  <div className="flex items-center gap-2">
                    <button className="w-7 h-7 rounded-full border-none bg-[var(--bg-tertiary)] text-[var(--text-secondary)] cursor-pointer transition-all duration-150 flex items-center justify-center flex-shrink-0 hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]" onClick={handleToggleTheme} title="切换白昼/夜间模式">
                      {theme === 'dark' ? '☀️' : '🌙'}
                    </button>
                    <button 
                      className="w-7 h-7 rounded-full border-none bg-[var(--bg-tertiary)] text-[var(--text-secondary)] cursor-pointer transition-all duration-150 flex items-center justify-center flex-shrink-0 hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                      onClick={handleToggleToolPanel}
                      title="打开工具面板"
                    >
                      🛠️
                    </button>
                  </div>
                }
              />
              <div className="pageCard"><AIManagementPanel /></div>
            </>
          )}
          {currentView === 'skills' && (
            <>
              <PageHeader
                title="🧩 Skill 管理"
                rightContent={
                  <div className="flex items-center gap-2">
                    <button className="w-7 h-7 rounded-full border-none bg-[var(--bg-tertiary)] text-[var(--text-secondary)] cursor-pointer transition-all duration-150 flex items-center justify-center flex-shrink-0 hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]" onClick={handleToggleTheme} title="切换白昼/夜间模式">
                      {theme === 'dark' ? '☀️' : '🌙'}
                    </button>
                    <button 
                      className="w-7 h-7 rounded-full border-none bg-[var(--bg-tertiary)] text-[var(--text-secondary)] cursor-pointer transition-all duration-150 flex items-center justify-center flex-shrink-0 hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                      onClick={handleToggleToolPanel}
                      title="打开工具面板"
                    >
                      🛠️
                    </button>
                  </div>
                }
              />
              <div className="pageCard"><SkillsPage /></div>
            </>
          )}
          {currentView === 'agent-settings' && (
            <>
              <PageHeader
                title="🤖 Agent 设置"
                rightContent={
                  <div className="flex items-center gap-2">
                    <button className="w-7 h-7 rounded-full border-none bg-[var(--bg-tertiary)] text-[var(--text-secondary)] cursor-pointer transition-all duration-150 flex items-center justify-center flex-shrink-0 hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]" onClick={handleToggleTheme} title="切换白昼/夜间模式">
                      {theme === 'dark' ? '☀️' : '🌙'}
                    </button>
                    <button 
                      className="w-7 h-7 rounded-full border-none bg-[var(--bg-tertiary)] text-[var(--text-secondary)] cursor-pointer transition-all duration-150 flex items-center justify-center flex-shrink-0 hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                      onClick={handleToggleToolPanel}
                      title="打开工具面板"
                    >
                      🛠️
                    </button>
                  </div>
                }
              />
              <div className="pageCard"><AgentSettingsPage /></div>
            </>
          )}
          {currentView === 'groupchat' && (
            <>
              <PageHeader
                title="💬 群聊管理"
                rightContent={
                  <div className="flex items-center gap-2">
                    <button className="w-7 h-7 rounded-full border-none bg-[var(--bg-tertiary)] text-[var(--text-secondary)] cursor-pointer transition-all duration-150 flex items-center justify-center flex-shrink-0 hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]" onClick={handleToggleTheme} title="切换白昼/夜间模式">
                      {theme === 'dark' ? '☀️' : '🌙'}
                    </button>
                    <button 
                      className="w-7 h-7 rounded-full border-none bg-[var(--bg-tertiary)] text-[var(--text-secondary)] cursor-pointer transition-all duration-150 flex items-center justify-center flex-shrink-0 hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                      onClick={handleToggleToolPanel}
                      title="打开工具面板"
                    >
                      🛠️
                    </button>
                  </div>
                }
              />
              <div className="pageCard"><GroupChatView /></div>
            </>
          )}
        </main>

        <PreviewPane />
      </div>

      <ToolConfirmDialog
        open={confirmOpen}
        request={confirmRequest}
        onConfirm={handleConfirmAccept}
        onCancel={handleConfirmReject}
      />
    </div>
  )
}

export default App

import { create as createLog } from '../utils/console-logger'
import { ConfigManager } from '../managers/config-manager'
import type { IpcRouter } from '../ipc-router'

const log = createLog('EchoraAgent')

// ── Agent Manager（动态加载） ──────────────────────────────
let agentManager: any = null

/**
 * 初始化 Agent 管理器（动态导入）
 */
export function initAgentManager(): void {
  import('../agent/agent-manager').then(({ getAgentManager }) => {
    agentManager = getAgentManager()
    log.info('Agent管理器初始化完成')
  }).catch(err => {
    log.warn('Agent管理器加载失败:', err)
  })
}

/** 获取 agentManager 引用（供其他模块使用） */
export function getAgentManager(): any {
  return agentManager
}

/**
 * 注册 Echora Agent 相关的 IPC handler
 *
 * ═══════════════════════════════════════════════════
 * 【Echora Agent 专属 IPC 处理器】
 * 处理 agent:runStream / agent:run 等通道。
 * 接入 Agent 的 IPC 处理在 common-handlers.ts（message:sendStream）。
 * 两条路径最终都推送到 gateway:messageUsage / gateway:messageDone。
 * ═══════════════════════════════════════════════════
 */
export function registerEchoraAgentHandlers(router: IpcRouter): void {
  // ── Agent 运行 ──────────────────────────────────────────
  router.handle('agent:run', async (params: { providerId: string; model: string; message: string; systemPrompt?: string }) => {
    if (!agentManager) {
      return { success: false, error: 'Agent管理器未初始化' }
    }
    try {
      const agentProviders = ConfigManager.get('agentProviders') as any[] || []
      const providerConfig = agentProviders.find((p: any) => p.id === params.providerId)

      const agentId = `agent_${params.providerId}_${params.model}`
      let agent = agentManager.getAgent(agentId)
      if (!agent) {
        const providerRegistry = agentManager.getProviderRegistry()
        const existingProvider = providerRegistry.get(params.providerId)
        if (!existingProvider && providerConfig) {
          providerRegistry.create({
            id: params.providerId,
            name: providerConfig.name,
            type: 'openai',
            baseUrl: providerConfig.baseUrl,
            apiKey: providerConfig.apiKey,
            models: providerConfig.models || [],
            defaultModel: providerConfig.defaultModel || params.model
          })
        }

        agent = agentManager.createAgent({
          id: agentId,
          name: `Agent ${params.model}`,
          providerId: params.providerId,
          model: params.model,
          systemPrompt: params.systemPrompt,
          enableTools: true
        })
      }

      const result = await agentManager.runAgent(agentId, params.message)
      return { success: result.success, content: result.content, error: result.error }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  // ── Agent 流式运行 ──────────────────────────────────────
  router.on('agent:runStream', (params: { providerId: string; model: string; message: string; systemPrompt?: string; msgId: string; sessionId?: string }) => {
    log.info('[agent:runStream] 收到请求:', JSON.stringify(params).substring(0, 200))
    if (!agentManager) {
      log.warn('[agent:runStream] Agent管理器未初始化')
      router.send('gateway:messageDone', { msgId: params.msgId, error: 'Agent管理器未初始化' })
      return
    }

    try {
      const agentProviders = ConfigManager.get('agentProviders') as any[] || []
      const providerConfig = agentProviders.find((p: any) => p.id === params.providerId)
      log.info('[agent:runStream] providerId=%s, providerConfig=%s, agentProviders count=%d',
        params.providerId, providerConfig ? 'found' : 'NOT FOUND', agentProviders.length)

      const agentId = `agent_${params.providerId}_${params.model}`
      let agent = agentManager.getAgent(agentId)
      if (!agent) {
        const providerRegistry = agentManager.getProviderRegistry()
        const existingProvider = providerRegistry.get(params.providerId)
        log.info('[agent:runStream] Creating agent %s, existingProvider=%s', agentId, existingProvider ? 'found' : 'NOT FOUND')
        if (!existingProvider && providerConfig) {
          providerRegistry.create({
            id: params.providerId,
            name: providerConfig.name,
            type: 'openai',
            baseUrl: providerConfig.baseUrl,
            apiKey: providerConfig.apiKey,
            models: providerConfig.models || [],
            defaultModel: providerConfig.defaultModel || params.model
          })
        }

        agent = agentManager.createAgent({
          id: agentId,
          name: `Agent ${params.model}`,
          providerId: params.providerId,
          model: params.model,
          systemPrompt: params.systemPrompt,
          contextWindow: providerConfig?.contextWindow,
          contextCompression: providerConfig?.contextCompression
        })
      }

      const memoryCtx = agentManager.getMemoryContext()
      if (memoryCtx && agent) {
        agent.setMemoryContext(memoryCtx)
      }

      let accumulatedContent = ''
      agentManager.runAgentStream(agentId, params.message, (event: any) => {
        log.info('Agent 事件:', event.type, JSON.stringify(event).substring(0, 200))

        switch (event.type) {
          case 'token':
            accumulatedContent += event.token || ''
            router.send('gateway:messageChunk', {
              msgId: params.msgId,
              delta: event.token || '',
              content: accumulatedContent
            })
            break
          case 'complete': {
            // v2 - 2026-06-09: 移除估算兜底，直接使用 API 返回的真实 usage
            // 估算会覆盖 mimo 返回的真实 token 数据，导致 UI 显示错误
            const usageData = event.result?.totalUsage || { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
            log.info('[agent:runStream] complete event, usage:', JSON.stringify(usageData))
            router.send('gateway:messageUsage', {
              msgId: params.msgId,
              input: usageData.promptTokens || 0,
              output: usageData.completionTokens || 0,
              totalTokens: usageData.totalTokens || 0,
              contextUsed: usageData.promptTokens || 0,  // 输入 token ≈ 上下文占用
              aiType: 'echora',
              agentId: params.providerId
            })
            router.send('gateway:messageDone', {
              msgId: params.msgId,
              content: event.result?.content || accumulatedContent,
              metrics: { latency: event.result?.totalDuration }
            })
            break
          }
          case 'error':
            log.error('Agent 错误:', event.error)
            router.send('gateway:messageDone', {
              msgId: params.msgId,
              error: event.error || '未知错误'
            })
            break
          case 'tool_call':
            router.send('gateway:messageToolCall', {
              msgId: params.msgId,
              name: event.step?.toolCall?.name || '',
              status: 'running'
            })
            break
          case 'step':
            router.send('gateway:messageToolStep', {
              msgId: params.msgId,
              stepNumber: event.step?.stepNumber || 0,
              type: event.step?.type || '',
              content: event.step?.content || ''
            })
            break
        }
      }, params.sessionId || agentId)
    } catch (err) {
      router.send('gateway:messageDone', { msgId: params.msgId, error: String(err) })
    }
  })

  // ── Agent 控制 ──────────────────────────────────────────
  router.handle('agent:cancel', async () => {
    if (!agentManager) return { success: false }
    try {
      const agents = agentManager.getAllAgents()
      for (const agent of agents) {
        agent.cancel()
      }
      return { success: true }
    } catch {
      return { success: false }
    }
  })

  router.handle('agent:clearHistory', async (sessionId: string) => {
    if (!agentManager) return { success: false, error: 'Agent管理器未初始化' }
    try {
      agentManager.clearHistory(sessionId)
      return { success: true }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  router.handle('agent:getStatus', async () => {
    if (!agentManager) return { state: 'idle', currentStep: 0, totalSteps: 0 }
    try {
      const agents = agentManager.getAllAgents()
      if (agents.length > 0) {
        const agent = agents[0]
        return {
          state: agent.state || 'idle',
          currentStep: agent.currentStep || 0,
          totalSteps: agent.config?.maxSteps || 0
        }
      }
      return { state: 'idle', currentStep: 0, totalSteps: 0 }
    } catch {
      return { state: 'idle', currentStep: 0, totalSteps: 0 }
    }
  })

  // ── Agent 会话管理 ──────────────────────────────────────
  router.handle('agent:sessions:list', async (agentId?: string) => {
    if (!agentManager) return []
    try {
      const sessionManager = agentManager.getSessionManager()
      if (!sessionManager) return []
      return sessionManager.listSessions(agentId)
    } catch (err) {
      log.warn('获取会话列表失败:', (err as Error).message)
      return []
    }
  })

  router.handle('agent:sessions:load', async (sessionId: string) => {
    if (!agentManager) return null
    try {
      const sessionManager = agentManager.getSessionManager()
      if (!sessionManager) return null
      return sessionManager.loadSession(sessionId)
    } catch (err) {
      log.warn('加载会话失败:', (err as Error).message)
      return null
    }
  })

  router.handle('agent:sessions:delete', async (sessionId: string) => {
    if (!agentManager) return { success: false, error: 'Agent管理器未初始化' }
    try {
      const sessionManager = agentManager.getSessionManager()
      if (!sessionManager) return { success: false, error: '会话管理器未初始化' }
      const ok = sessionManager.deleteSession(sessionId)
      return ok ? { success: true } : { success: false, error: '会话不存在' }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  // ── 记忆管理 ────────────────────────────────────────────
  router.handle('memory:add', async (params: { content: string; category?: string; source?: string }) => {
    if (!agentManager) return { success: false, error: 'Agent管理器未初始化' }
    try {
      const memoryManager = agentManager.getMemoryManager()
      if (!memoryManager) return { success: false, error: '记忆管理器未初始化' }
      const category = (params.category || 'fact') as import('../agent/memory-manager').MemoryCategory
      const entry = memoryManager.add(params.content, category, params.source || 'agent')
      return { success: true, entry }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  router.handle('memory:search', async (params: { query: string; topK?: number }) => {
    if (!agentManager) return { success: false, error: 'Agent管理器未初始化', results: [] }
    try {
      const memoryManager = agentManager.getMemoryManager()
      if (!memoryManager) return { success: false, error: '记忆管理器未初始化', results: [] }
      const results = memoryManager.search(params.query, params.topK)
      return { success: true, results }
    } catch (err) {
      return { success: false, error: String(err), results: [] }
    }
  })

  router.handle('memory:delete', async (params: { id: string }) => {
    if (!agentManager) return { success: false, error: 'Agent管理器未初始化' }
    try {
      const memoryManager = agentManager.getMemoryManager()
      if (!memoryManager) return { success: false, error: '记忆管理器未初始化' }
      const ok = memoryManager.deleteById(params.id)
      return ok ? { success: true } : { success: false, error: '记忆不存在' }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  router.handle('memory:list', async () => {
    if (!agentManager) return { success: false, error: 'Agent管理器未初始化', memories: [] }
    try {
      const memoryManager = agentManager.getMemoryManager()
      if (!memoryManager) return { success: false, error: '记忆管理器未初始化', memories: [] }
      const memories = memoryManager.getAll()
      return { success: true, memories }
    } catch (err) {
      return { success: false, error: String(err), memories: [] }
    }
  })

  router.handle('memory:clear', async () => {
    if (!agentManager) return { success: false, error: 'Agent管理器未初始化' }
    try {
      const memoryManager = agentManager.getMemoryManager()
      if (!memoryManager) return { success: false, error: '记忆管理器未初始化' }
      const count = memoryManager.clearAll()
      return { success: true, count }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  router.handle('memory:context', async () => {
    if (!agentManager) return { success: false, error: 'Agent管理器未初始化', context: '' }
    try {
      const context = agentManager.getMemoryContext()
      return { success: true, context }
    } catch (err) {
      return { success: false, error: String(err), context: '' }
    }
  })
}

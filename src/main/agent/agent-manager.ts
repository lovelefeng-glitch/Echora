/**
 * Agent 管理器
 * 管理 Agent 实例的创建、配置和生命周期
 * P2 阶段：集成 Tool Registry 和内置工具
 */

import * as path from 'path'
import { app } from 'electron'
import { create } from '../utils/console-logger'
import { getProviderRegistry } from '../llm/provider-registry'
import { getTraceManager } from '../trace/trace-manager'
import { createInputValidator } from '../security/input-validator'
import { getToolRegistry, builtinTools } from '../tools'
import { getSessionManager, type SessionManager } from './session-manager'
import { AgentMemoryManager, createAgentMemoryManager } from './memory-manager'
import type { LLMProvider } from '../llm/provider-interface'
import type { ProviderConfig, ChatMessage } from '../llm/types'
import type { ToolRegistry } from '../tools/types'
import type { AgentConfig, AgentRuntime, AgentResult, AgentEventCallback } from './types'
import type { SessionMessage } from './session-manager'
import type { MemoryCategory } from './memory-manager'
import { createAgentLoop } from './agent-loop'

const log = create('AgentManager')

/** Agent 管理器配置 */
export interface AgentManagerConfig {
  /** 默认 Provider ID */
  defaultProviderId?: string
  /** 默认模型 */
  defaultModel?: string
  /** 默认最大步数 */
  defaultMaxSteps?: number
  /** 是否启用 Trace */
  enableTrace?: boolean
  /** 是否启用输入验证 */
  enableInputValidation?: boolean
  /** 是否启用工具系统 */
  enableTools?: boolean
  /** 最大历史消息轮数（每轮=用户+助手），默认 20 */
  maxHistoryRounds?: number
  /** 会话持久化数据目录（为空则自动使用 app userData 路径） */
  sessionDataDir?: string
  /** 是否启用会话持久化（JSONL 存储），默认 true */
  enableSessionPersistence?: boolean
  /** 是否启用记忆系统，默认 true */
  enableMemory?: boolean
}

/**
 * Agent 管理器
 * 单例模式，管理所有 Agent 实例
 */
export class AgentManager {
  private static _instance: AgentManager | null = null

  private _config: AgentManagerConfig
  private _agents = new Map<string, AgentRuntime>()
  private _providerRegistry = getProviderRegistry()
  private _traceManager = getTraceManager()
  private _inputValidator = createInputValidator()
  private _toolRegistry: ToolRegistry
  private _sessionHistory = new Map<string, ChatMessage[]>()
  private _sessionManager: SessionManager | null = null
  /** sessionId → SessionManager 中的会话 ID 映射 */
  private _sessionMapping = new Map<string, string>()
  /** 记忆管理器 */
  private _memoryManager: AgentMemoryManager | null = null

  private constructor(config?: AgentManagerConfig) {
    this._config = {
      defaultProviderId: 'default',
      defaultModel: 'gpt-3.5-turbo',
      defaultMaxSteps: 8, // P2 提升到 8 步
      enableTrace: true,
      enableInputValidation: true,
      enableTools: true,
      enableMemory: true,
      maxHistoryRounds: 20, // 默认保留 20 轮对话历史
      ...config
    }

    // 初始化 Tool Registry
    this._toolRegistry = getToolRegistry()

    // 初始化 SessionManager（会话持久化）
    if (this._config.enableSessionPersistence !== false) {
      try {
        const dataDir = this._config.sessionDataDir || this._resolveSessionDataDir()
        this._sessionManager = getSessionManager({ dataDir })
        log.info(`SessionManager 已初始化, 数据目录: ${dataDir}`)
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e)
        log.error(`SessionManager 初始化失败，会话持久化已禁用: ${msg}`)
      }
    }

    // 初始化记忆管理器
    if (this._config.enableMemory !== false) {
      try {
        const memoryDir = this._config.sessionDataDir || this._resolveSessionDataDir()
        const { join } = require('path')
        const storagePath = join(memoryDir, 'agent-memory.json')
        this._memoryManager = createAgentMemoryManager({ storagePath })
        log.info(`AgentMemoryManager 已初始化, 存储路径: ${storagePath}`)
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e)
        log.error(`AgentMemoryManager 初始化失败: ${msg}`)
      }
    }

    // 注册内置工具
    if (this._config.enableTools) {
      this._registerBuiltinTools()
    }
  }

  /**
   * 获取单例实例
   */
  static getInstance(config?: AgentManagerConfig): AgentManager {
    if (!AgentManager._instance) {
      AgentManager._instance = new AgentManager(config)
    }
    return AgentManager._instance
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<AgentManagerConfig>): void {
    this._config = { ...this._config, ...config }
  }

  /**
   * 注册内置工具
   */
  private _registerBuiltinTools(): void {
    for (const { definition, handler } of builtinTools) {
      this._toolRegistry.register(definition, handler)
    }
    log.info(`注册 ${builtinTools.length} 个内置工具`)
  }

  /**
   * 解析会话数据存储目录
   * 开发模式下使用项目根目录，生产模式使用 app userData
   */
  private _resolveSessionDataDir(): string {
    // 在 Electron 环境中使用 app.getPath('userData')
    // 在非 Electron 环境（如测试）中使用 process.cwd()
    try {
      if (app && app.isReady && app.isReady()) {
        return path.join(app.getPath('userData'), 'echora-data')
      }
    } catch {
      // 非 Electron 环境，忽略
    }
    // fallback: 使用当前工作目录下的 .echora-data
    return path.join(process.cwd(), '.echora-data')
  }

  /**
   * 生成会话标题（基于用户第一条消息，截取前 30 个字符）
   */
  private _generateSessionTitle(firstMessage: string): string {
    const cleaned = firstMessage.replace(/\s+/g, ' ').trim()
    if (cleaned.length <= 30) {
      return cleaned || '新会话'
    }
    return cleaned.substring(0, 30) + '...'
  }

  /**
   * 注册 Provider
   */
  registerProvider(config: ProviderConfig): LLMProvider {
    return this._providerRegistry.create(config)
  }

  /**
   * 创建 Agent
   */
  createAgent(config: AgentConfig): AgentRuntime {
    // 获取 Provider
    const provider = this._providerRegistry.get(config.providerId)
    if (!provider) {
      throw new Error(`Provider "${config.providerId}" 不存在`)
    }

    // 创建 Agent Loop（带工具支持）
    const agent = createAgentLoop(
      config,
      provider,
      this._config.enableTools ? this._toolRegistry : undefined
    )
    this._agents.set(config.id, agent)

    log.info(`创建 Agent: ${config.id}`)
    return agent
  }

  /**
   * 获取 Agent
   */
  getAgent(id: string): AgentRuntime | undefined {
    return this._agents.get(id)
  }

  /**
   * 获取所有 Agent
   */
  getAllAgents(): AgentRuntime[] {
    return Array.from(this._agents.values())
  }

  /**
   * 运行 Agent 任务
   */
  async runAgent(
    agentId: string,
    message: string,
    onEvent?: AgentEventCallback
  ): Promise<AgentResult> {
    const agent = this._agents.get(agentId)
    if (!agent) {
      throw new Error(`Agent "${agentId}" 不存在`)
    }

    // 输入验证
    if (this._config.enableInputValidation) {
      const validation = this._inputValidator.validate(message)
      if (!validation.valid) {
        return {
          success: false,
          content: '',
          steps: [],
          totalUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          totalDuration: 0,
          error: validation.error,
          finishReason: 'error'
        }
      }
    }

    // 开始 Trace
    let traceId = ''
    if (this._config.enableTrace) {
      traceId = this._traceManager.startTrace(agentId, { message })
    }

    try {
      // 运行 Agent（当前非流式模式暂不使用历史，后续可扩展）
      const result = await agent.run(message, onEvent)

      // 结束 Trace
      if (traceId) {
        this._traceManager.endTrace(
          traceId,
          result.success ? 'completed' : 'error',
          result.error
        )
      }

      return result
    } catch (error) {
      // 结束 Trace（错误）
      if (traceId) {
        this._traceManager.endTrace(traceId, 'error', String(error))
      }
      throw error
    }
  }

  /**
   * 流式运行 Agent 任务
   */
  runAgentStream(
    agentId: string,
    message: string,
    onEvent: AgentEventCallback,
    sessionId?: string
  ): AbortController {
    const agent = this._agents.get(agentId)
    if (!agent) {
      throw new Error(`Agent "${agentId}" 不存在`)
    }

    // 输入验证
    if (this._config.enableInputValidation) {
      const validation = this._inputValidator.validate(message)
      if (!validation.valid) {
        onEvent({
          type: 'error',
          error: validation.error
        })
        return new AbortController()
      }
    }

    // 获取历史消息（裁剪后）
    const sid = sessionId || agentId
    const history = this._getTrimmedHistory(sid)

    // 检测"记住"指令，提取并存储记忆
    if (this._memoryManager) {
      this._processMemoryCommand(message)
    }

    // 注入记忆上下文到 Agent
    if (this._memoryManager) {
      const memoryContext = this._memoryManager.generateMemoryPrompt()
      if (memoryContext) {
        agent.setMemoryContext(memoryContext)
      }
    }

    // 开始 Trace
    let traceId = ''
    if (this._config.enableTrace) {
      traceId = this._traceManager.startTrace(agentId, { message })
    }

    // 确保在 SessionManager 中有对应的持久化会话
    let persistentSessionId: string | null = null
    if (this._sessionManager && sessionId) {
      persistentSessionId = this._ensurePersistentSession(sessionId, agentId, message)
    }

    // 包装事件回调以添加 Trace + 保存历史 + 持久化 + 记忆提取
    const wrappedCallback: AgentEventCallback = (event) => {
      if (traceId && event.type === 'complete') {
        this._traceManager.endTrace(
          traceId,
          event.result?.success ? 'completed' : 'error',
          event.result?.error
        )

        // 保存用户消息和助手回复到内存历史
        if (sessionId) {
          this.addMessage(sessionId, { role: 'user', content: message })
          const assistantContent = event.result?.content || ''
          if (assistantContent) {
            this.addMessage(sessionId, { role: 'assistant', content: assistantContent })
          }
        }

        // 持久化到 JSONL
        if (this._sessionManager && persistentSessionId && event.result) {
          this._persistConversation(persistentSessionId, message, event.result)
        }

        // 对话结束后自动提取关键信息到记忆
        if (this._memoryManager && event.result?.content) {
          this._extractMemoryFromConversation(message, event.result.content)
        }
      }
      if (traceId && event.type === 'error') {
        this._traceManager.endTrace(traceId, 'error', event.error)
      }
      onEvent(event)
    }

    return agent.runStream(message, wrappedCallback, history)
  }

  /**
   * 销毁 Agent
   */
  destroyAgent(id: string): boolean {
    const agent = this._agents.get(id)
    if (!agent) {
      return false
    }

    agent.destroy()
    this._agents.delete(id)
    log.info(`销毁 Agent: ${id}`)
    return true
  }

  /**
   * 销毁所有 Agent
   */
  destroyAllAgents(): void {
    for (const [id, agent] of this._agents) {
      agent.destroy()
      log.info(`销毁 Agent: ${id}`)
    }
    this._agents.clear()
  }

  /**
   * 获取 Trace 管理器
   */
  getTraceManager() {
    return this._traceManager
  }

  /**
   * 获取输入验证器
   */
  getInputValidator() {
    return this._inputValidator
  }

  /**
   * 获取 Provider 注册中心
   */
  getProviderRegistry() {
    return this._providerRegistry
  }

  /**
   * 获取 Tool Registry
   */
  getToolRegistry() {
    return this._toolRegistry
  }

  /**
   * 获取 SessionManager 实例
   */
  getSessionManager() {
    return this._sessionManager
  }

  /**
   * 获取记忆管理器实例
   */
  getMemoryManager(): AgentMemoryManager | null {
    return this._memoryManager
  }

  /**
   * 处理用户消息中的"记住"指令
   * 来源: 用户消息文本
   * 输出: 提取并存储到长期记忆
   */
  private _processMemoryCommand(message: string): void {
    if (!this._memoryManager) return

    const memoryContent = this._memoryManager.detectRememberCommand(message)
    if (memoryContent) {
      const category = this._memoryManager.inferCategory(memoryContent)
      this._memoryManager.add(memoryContent, category, 'user_explicit')
      log.info(`用户记忆指令已处理: "${memoryContent.substring(0, 50)}..." (分类: ${category})`)
    }
  }

  /**
   * 对话结束后从对话中提取关键信息
   * 来源: 用户消息 + 助手回复
   * 输出: 提取的关键信息存储到长期记忆
   */
  private _extractMemoryFromConversation(userMessage: string, assistantContent: string): void {
    if (!this._memoryManager) return

    // 提取用户消息中的偏好和决策
    const userPrefPattern = /(?:我(?:喜欢|偏好|习惯|常用|倾向)|prefer|like|habit)/i
    const userDecisionPattern = /(?:决定|选择|确认|定了|敲定|方案|计划)/i

    if (userPrefPattern.test(userMessage)) {
      this._memoryManager.add(
        userMessage.substring(0, 200),
        'preference',
        'agent_detected'
      )
    } else if (userDecisionPattern.test(userMessage)) {
      this._memoryManager.add(
        userMessage.substring(0, 200),
        'decision',
        'agent_detected'
      )
    }

    // 提取助手回复中的关键事实
    const factIndicators = /(?:总结|归纳|结论|结论是|最终方案|重要的是|需要注意|关键点)/i
    if (factIndicators.test(assistantContent)) {
      // 提取结论部分
      const lines = assistantContent.split('\n').filter(l => l.trim().length > 0)
      const keyFacts = lines.filter(l =>
        factIndicators.test(l) ||
        l.startsWith('- ') ||
        l.startsWith('1.') ||
        l.startsWith('* ')
      )
      if (keyFacts.length > 0 && keyFacts.length <= 5) {
        const summary = keyFacts.join('; ').substring(0, 300)
        this._memoryManager.add(summary, 'fact', 'agent_detected')
      }
    }
  }

  /**
   * 搜索记忆
   */
  searchMemory(query: string, topK?: number) {
    if (!this._memoryManager) return []
    return this._memoryManager.search(query, topK)
  }

  /**
   * 添加记忆
   */
  addMemory(content: string, category: MemoryCategory, source?: string) {
    if (!this._memoryManager) return null
    return this._memoryManager.add(content, category, source || 'agent')
  }

  /**
   * 删除记忆
   */
  deleteMemory(id: string): boolean {
    if (!this._memoryManager) return false
    return this._memoryManager.deleteById(id)
  }

  /**
   * 获取所有记忆
   */
  getAllMemories() {
    if (!this._memoryManager) return []
    return this._memoryManager.getAll()
  }

  /**
   * 获取记忆上下文（用于注入系统提示）
   */
  getMemoryContext(): string {
    if (!this._memoryManager) return ''
    return this._memoryManager.generateMemoryPrompt()
  }

  /**
   * 从持久化存储恢复会话
   * 加载指定会话的消息到内存历史，使 Agent 可以继续上下文对话
   * @param sessionId 会话 ID（前端传入的 session 标识）
   * @returns 是否恢复成功
   */
  resumeSession(sessionId: string): boolean {
    if (!this._sessionManager) {
      log.warn('SessionManager 未初始化，无法恢复会话')
      return false
    }

    const persistentId = this._sessionMapping.get(sessionId)
    if (!persistentId) {
      log.warn(`未找到会话映射: ${sessionId}`)
      return false
    }

    const session = this._sessionManager.loadSession(persistentId)
    if (!session) {
      log.warn(`无法加载会话: ${persistentId}`)
      return false
    }

    // 将持久化消息转换为 ChatMessage 并加载到内存历史
    const history: ChatMessage[] = []
    for (const msg of session.messages) {
      if (msg.role === 'user' || msg.role === 'assistant' || msg.role === 'system') {
        history.push({
          role: msg.role as ChatMessage['role'],
          content: msg.content
        })
      }
    }

    // 替换内存中的历史
    this._sessionHistory.set(sessionId, history)
    log.info(`会话已恢复: ${sessionId} → ${persistentId} (${history.length} 条消息)`)
    return true
  }

  /**
   * 获取会话列表（从 SessionManager）
   * @param agentId 可选，按 Agent ID 过滤
   */
  listPersistedSessions(agentId?: string) {
    if (!this._sessionManager) {
      return []
    }
    return this._sessionManager.listSessions(agentId)
  }

  /**
   * 确保持久化会话存在，返回 SessionManager 中的会话 ID
   * 如果是新会话则自动创建（使用第一条消息作为标题）
   */
  private _ensurePersistentSession(
    sessionId: string,
    agentId: string,
    firstMessage: string
  ): string | null {
    if (!this._sessionManager) return null

    // 检查是否已有映射
    const existingId = this._sessionMapping.get(sessionId)
    if (existingId) {
      return existingId
    }

    // 新会话：使用第一条消息的前 30 个字符作为标题
    const title = this._generateSessionTitle(firstMessage)
    const meta = this._sessionManager.createSession(title, agentId)
    this._sessionMapping.set(sessionId, meta.id)
    log.info(`创建持久化会话: ${sessionId} → ${meta.id} (标题: "${title}")`)
    return meta.id
  }

  /**
   * 将对话结果持久化到 JSONL
   * 保存用户消息和助手回复，附带 token 使用量
   */
  private _persistConversation(
    persistentSessionId: string,
    userMessage: string,
    result: AgentResult
  ): void {
    if (!this._sessionManager) return

    // 保存用户消息
    const userMsg: SessionMessage = {
      role: 'user',
      content: userMessage,
      timestamp: Date.now()
    }
    this._sessionManager.appendMessage(persistentSessionId, userMsg)

    // 保存助手回复（附带 token 使用量）
    const assistantMsg: SessionMessage = {
      role: 'assistant',
      content: result.content,
      timestamp: Date.now(),
      tokenUsage: result.totalUsage
    }
    this._sessionManager.appendMessage(persistentSessionId, assistantMsg)

    log.info(
      `[Session:${persistentSessionId}] 已持久化对话, ` +
      `tokens: ${result.totalUsage.totalTokens}, ` +
      `耗时: ${result.totalDuration}ms`
    )
  }

  /**
   * 向 Session 历史中添加消息
   */
  addMessage(sessionId: string, message: ChatMessage): void {
    let history = this._sessionHistory.get(sessionId)
    if (!history) {
      history = []
      this._sessionHistory.set(sessionId, history)
    }
    history.push(message)
    log.info(`[Session:${sessionId}] 添加消息 (role: ${message.role}), 当前历史长度: ${history.length}`)
  }

  /**
   * 获取 Session 的历史消息
   */
  getHistory(sessionId: string): ChatMessage[] {
    return this._sessionHistory.get(sessionId) ?? []
  }

  /**
   * 清空 Session 的历史消息
   */
  clearHistory(sessionId: string): void {
    this._sessionHistory.delete(sessionId)
    log.info(`[Session:${sessionId}] 历史已清空`)
  }

  /**
   * 获取裁剪后的历史消息（上下文窗口管理）
   * 保留系统消息，对用户/助手消息按轮次裁剪，保留最近的 maxHistoryRounds 轮
   */
  private _getTrimmedHistory(sessionId: string): ChatMessage[] {
    const history = this._sessionHistory.get(sessionId)
    if (!history || history.length === 0) return []

    const maxRounds = this._config.maxHistoryRounds || 20

    // 分离系统消息和非系统消息
    const systemMessages: ChatMessage[] = []
    const nonSystemMessages: ChatMessage[] = []

    for (const msg of history) {
      if (msg.role === 'system') {
        systemMessages.push(msg)
      } else {
        nonSystemMessages.push(msg)
      }
    }

    // 计算最大保留消息数（每轮 = 1条用户 + 1条助手，工具消息属于同一轮）
    const maxNonSystem = maxRounds * 2
    if (nonSystemMessages.length <= maxNonSystem) {
      return [...nonSystemMessages]
    }

    // 裁剪：保留最近的 maxNonSystem 条非系统消息
    const trimmed = nonSystemMessages.slice(nonSystemMessages.length - maxNonSystem)
    log.info(
      `[Session:${sessionId}] 历史裁剪: ${nonSystemMessages.length} → ${trimmed.length} 条非系统消息 (窗口: ${maxRounds}轮)`
    )
    return trimmed
  }
}

/**
 * 获取全局 Agent 管理器实例
 */
export function getAgentManager(config?: AgentManagerConfig): AgentManager {
  return AgentManager.getInstance(config)
}

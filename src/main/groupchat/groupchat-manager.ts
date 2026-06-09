/**
 * 群聊管理器
 * 整合群聊适配器与Agent系统
 */

import { create } from '../utils/console-logger'
import type { AgentManager } from '../agent/agent-manager'
import type {
  GroupChatAdapter,
  GroupChatAdapterConfig,
  GroupMessage,
  GroupReply,
  GroupChatContext
} from './types'
import { GroupChatAdapterRegistry, getGroupChatAdapterRegistry } from './adapter-registry'
import { webhookAdapterRegistration } from './webhook-adapter'

const log = create('GroupChatManager')

/**
 * 群聊管理器配置
 */
export interface GroupChatManagerConfig {
  /** 默认 Agent ID */
  defaultAgentId?: string
  /** 是否启用 */
  enabled?: boolean
  /** 默认频率限制 */
  defaultRateLimit?: number
}

/** 默认配置 */
const DEFAULT_CONFIG: GroupChatManagerConfig = {
  defaultAgentId: 'default',
  enabled: true,
  defaultRateLimit: 5
}

/**
 * 群聊管理器
 */
export class GroupChatManager {
  private static _instance: GroupChatManager | null = null

  private _config: GroupChatManagerConfig
  private _adapterRegistry: GroupChatAdapterRegistry
  private _agentManager: AgentManager | null = null
  private _contexts = new Map<string, GroupChatContext>()
  private _initialized = false

  private constructor(config?: Partial<GroupChatManagerConfig>) {
    this._config = { ...DEFAULT_CONFIG, ...config }
    this._adapterRegistry = getGroupChatAdapterRegistry()
  }

  /**
   * 获取单例实例
   */
  static getInstance(config?: Partial<GroupChatManagerConfig>): GroupChatManager {
    if (!GroupChatManager._instance) {
      GroupChatManager._instance = new GroupChatManager(config)
    }
    return GroupChatManager._instance
  }

  /**
   * 初始化（注册默认适配器）
   */
  initialize(agentManager?: AgentManager): void {
    if (this._initialized) {
      return
    }

    // 注册默认的 Webhook 适配器
    this._adapterRegistry.register(webhookAdapterRegistration)

    // 设置 Agent 管理器
    if (agentManager) {
      this._agentManager = agentManager
    }

    this._initialized = true
    log.info('群聊管理器初始化完成')
  }

  /**
   * 设置 Agent 管理器
   */
  setAgentManager(manager: AgentManager): void {
    this._agentManager = manager
  }

  /**
   * 创建群聊适配器
   */
  createAdapter(type: string, config: GroupChatAdapterConfig): GroupChatAdapter {
    const adapter = this._adapterRegistry.create(type, config)

    // 注册消息处理回调
    adapter.onMessage((message) => {
      this._handleMessage(adapter, message).catch(err => {
        log.error('处理群聊消息失败:', err)
      })
    })

    return adapter
  }

  /**
   * 处理群聊消息
   */
  private async _handleMessage(adapter: GroupChatAdapter, message: GroupMessage): Promise<void> {
    log.info(`收到群聊消息 [${message.groupId}] ${message.senderName}: ${message.content.substring(0, 50)}`)

    // 更新上下文
    this._updateContext(message)

    // 获取或创建 Agent
    if (!this._agentManager) {
      log.warn('Agent 管理器未设置')
      return
    }

    const agentId = this._config.defaultAgentId || 'default'
    let agent = this._agentManager.getAgent(agentId)

    if (!agent) {
      // 创建临时 Agent
      log.info('创建临时群聊 Agent')
      // 这里需要根据实际情况创建 Agent
      return
    }

    // 构建群聊上下文提示
    const context = this._contexts.get(message.groupId)
    const contextPrompt = this._buildContextPrompt(context)

    // 运行 Agent
    try {
      const result = await this._agentManager.runAgent(
        agentId,
        `${contextPrompt}\n\n用户 ${message.senderName} 说: ${message.content}`
      )

      // 发送回复
      if (result.success && result.content) {
        const reply: GroupReply = {
          type: 'text',
          content: this._formatReply(result.content),
          replyTo: message.id
        }

        await adapter.sendMessage(message.groupId, reply)
      }
    } catch (error) {
      log.error('Agent 处理失败:', error)

      // 发送错误回复
      const errorReply: GroupReply = {
        type: 'text',
        content: '抱歉，处理您的消息时出现了错误。'
      }
      await adapter.sendMessage(message.groupId, errorReply)
    }
  }

  /**
   * 更新群聊上下文
   */
  private _updateContext(message: GroupMessage): void {
    let context = this._contexts.get(message.groupId)

    if (!context) {
      context = {
        groupId: message.groupId,
        recentMessages: [],
        activeMembers: [],
        lastActivityAt: Date.now()
      }
      this._contexts.set(message.groupId, context)
    }

    // 添加消息到历史
    context.recentMessages.push(message)

    // 保留最近 20 条消息
    if (context.recentMessages.length > 20) {
      context.recentMessages = context.recentMessages.slice(-20)
    }

    // 更新活跃成员
    const existingMember = context.activeMembers.find(m => m.id === message.senderId)
    if (!existingMember) {
      context.activeMembers.push({
        id: message.senderId,
        name: message.senderName
      })
    }

    context.lastActivityAt = Date.now()
  }

  /**
   * 构建上下文提示
   */
  private _buildContextPrompt(context?: GroupChatContext): string {
    if (!context || context.recentMessages.length === 0) {
      return '这是一个群聊场景。请简洁回复。'
    }

    const recentMessages = context.recentMessages.slice(-5)
    const history = recentMessages
      .map(m => `${m.senderName}: ${m.content}`)
      .join('\n')

    return `这是一个群聊场景。最近的对话:
${history}

请简洁回复（不超过 200 字），不要显示内部推理过程。`
  }

  /**
   * 格式化回复
   */
  private _formatReply(content: string): string {
    // 限制回复长度
    if (content.length > 500) {
      return content.substring(0, 497) + '...'
    }
    return content
  }

  /**
   * 获取群聊上下文
   */
  getContext(groupId: string): GroupChatContext | undefined {
    return this._contexts.get(groupId)
  }

  /**
   * 获取所有群聊上下文
   */
  getAllContexts(): GroupChatContext[] {
    return Array.from(this._contexts.values())
  }

  /**
   * 启动所有适配器
   */
  async startAll(): Promise<void> {
    await this._adapterRegistry.startAll()
  }

  /**
   * 停止所有适配器
   */
  async stopAll(): Promise<void> {
    await this._adapterRegistry.stopAll()
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<GroupChatManagerConfig>): void {
    this._config = { ...this._config, ...config }
  }

  /**
   * 获取配置
   */
  getConfig(): GroupChatManagerConfig {
    return { ...this._config }
  }
}

/**
 * 获取全局群聊管理器实例
 */
export function getGroupChatManager(config?: Partial<GroupChatManagerConfig>): GroupChatManager {
  return GroupChatManager.getInstance(config)
}

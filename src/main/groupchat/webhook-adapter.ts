/**
 * Webhook 群聊适配器
 * P5阶段：通用 Webhook 接口
 */

import { create } from '../utils/console-logger'
import type {
  GroupChatAdapter,
  GroupChatAdapterConfig,
  GroupMessage,
  GroupReply,
  GroupInfo,
  GroupMember
} from './types'

const log = create('WebhookAdapter')

/**
 * Webhook 群聊适配器
 * 提供 HTTP Webhook 接口接收和发送消息
 */
export class WebhookAdapter implements GroupChatAdapter {
  readonly name: string
  readonly config: GroupChatAdapterConfig

  private _messageCallback: ((message: GroupMessage) => void) | null = null
  private _groups = new Map<string, GroupInfo>()
  private _rateLimitMap = new Map<string, { count: number; resetTime: number }>()

  constructor(config: GroupChatAdapterConfig) {
    this.name = config.name
    this.config = config
  }

  /**
   * 启动适配器
   */
  async start(): Promise<void> {
    log.info(`启动 Webhook 适配器: ${this.name}`)
    // 实际实现需要启动 HTTP 服务器监听 Webhook
  }

  /**
   * 停止适配器
   */
  async stop(): Promise<void> {
    log.info(`停止 Webhook 适配器: ${this.name}`)
    // 实际实现需要停止 HTTP 服务器
  }

  /**
   * 发送消息到群聊
   */
  async sendMessage(groupId: string, reply: GroupReply): Promise<void> {
    log.info(`发送消息到群聊 ${groupId}:`, reply.content.substring(0, 100))
    // 实际实现需要调用外部 API 发送消息
  }

  /**
   * 获取群聊信息
   */
  async getGroupInfo(groupId: string): Promise<GroupInfo | null> {
    return this._groups.get(groupId) || null
  }

  /**
   * 获取群聊列表
   */
  async listGroups(): Promise<GroupInfo[]> {
    return Array.from(this._groups.values())
  }

  /**
   * 注册消息回调
   */
  onMessage(callback: (message: GroupMessage) => void): void {
    this._messageCallback = callback
  }

  /**
   * 检查是否应该响应
   */
  shouldRespond(message: GroupMessage): boolean {
    // 检查频率限制
    if (!this._checkRateLimit(message.groupId)) {
      log.warn(`群聊 ${message.groupId} 触发频率限制`)
      return false
    }

    // 根据触发方式判断
    switch (this.config.triggerMethod) {
      case 'mention':
        return message.isMentioned === true

      case 'keyword':
        if (!this.config.triggerKeywords?.length) return false
        return this.config.triggerKeywords.some(kw =>
          message.content.toLowerCase().includes(kw.toLowerCase())
        )

      case 'command':
        if (!this.config.commandPrefix) return false
        return message.content.startsWith(this.config.commandPrefix)

      case 'always':
        return true

      default:
        return false
    }
  }

  /**
   * 处理接收到的 Webhook 消息
   * 供外部 HTTP 服务器调用
   */
  handleIncomingMessage(data: {
    groupId: string
    senderId: string
    senderName: string
    content: string
    type?: string
  }): void {
    // 检查是否 @ 了 Agent
    const isMentioned = data.content.includes(`@${this.name}`) ||
      data.content.includes('@Echora')

    const message: GroupMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      groupId: data.groupId,
      senderId: data.senderId,
      senderName: data.senderName,
      type: (data.type as any) || 'text',
      content: data.content,
      timestamp: Date.now(),
      isMentioned
    }

    // 更新群聊信息
    this._updateGroupInfo(message)

    // 触发回调
    if (this._messageCallback && this.shouldRespond(message)) {
      this._messageCallback(message)
    }
  }

  /**
   * 检查频率限制
   */
  private _checkRateLimit(groupId: string): boolean {
    const now = Date.now()
    const limit = this._rateLimitMap.get(groupId)

    if (!limit || now > limit.resetTime) {
      this._rateLimitMap.set(groupId, {
        count: 1,
        resetTime: now + 60000 // 1 分钟后重置
      })
      return true
    }

    if (limit.count >= this.config.rateLimit) {
      return false
    }

    limit.count++
    return true
  }

  /**
   * 更新群聊信息
   */
  private _updateGroupInfo(message: GroupMessage): void {
    let group = this._groups.get(message.groupId)
    if (!group) {
      group = {
        id: message.groupId,
        name: `群聊 ${message.groupId}`,
        members: []
      }
      this._groups.set(message.groupId, group)
    }

    // 更新成员列表
    const existingMember = group.members.find(m => m.id === message.senderId)
    if (!existingMember) {
      group.members.push({
        id: message.senderId,
        name: message.senderName
      })
    }
  }
}

/**
 * Webhook 适配器工厂
 */
export function createWebhookAdapter(config: GroupChatAdapterConfig): GroupChatAdapter {
  return new WebhookAdapter(config)
}

/**
 * Webhook 适配器注册信息
 */
export const webhookAdapterRegistration = {
  type: 'webhook',
  name: 'Webhook 通用适配器',
  factory: createWebhookAdapter
}

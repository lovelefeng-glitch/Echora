/**
 * 群聊模块入口
 */

// 类型定义
export type {
  GroupMessageType,
  TriggerMethod,
  GroupMessage,
  GroupReply,
  GroupMember,
  GroupInfo,
  GroupChatAdapterConfig,
  GroupChatAdapter,
  GroupChatAdapterRegistration,
  GroupChatContext
} from './types'

// 实现
export { GroupChatAdapterRegistry, getGroupChatAdapterRegistry } from './adapter-registry'
export { WebhookAdapter, createWebhookAdapter, webhookAdapterRegistration } from './webhook-adapter'
export { GroupChatManager, getGroupChatManager } from './groupchat-manager'
export type { GroupChatManagerConfig } from './groupchat-manager'

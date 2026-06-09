/**
 * 群聊模块类型定义
 */

/** 群聊消息类型 */
export type GroupMessageType = 'text' | 'image' | 'card' | 'file'

/** 群聊触发方式 */
export type TriggerMethod = 'mention' | 'keyword' | 'command' | 'always'

/** 群聊消息 */
export interface GroupMessage {
  /** 消息 ID */
  id: string
  /** 群聊 ID */
  groupId: string
  /** 发送者 ID */
  senderId: string
  /** 发送者名称 */
  senderName: string
  /** 消息类型 */
  type: GroupMessageType
  /** 消息内容 */
  content: string
  /** 时间戳 */
  timestamp: number
  /** 是否 @ 了 Agent */
  isMentioned?: boolean
  /** 原始消息数据 */
  rawData?: unknown
}

/** 群聊回复 */
export interface GroupReply {
  /** 回复类型 */
  type: GroupMessageType
  /** 回复内容 */
  content: string
  /** 引用的消息 ID */
  replyTo?: string
  /** 额外数据 */
  data?: unknown
}

/** 群聊成员 */
export interface GroupMember {
  /** 成员 ID */
  id: string
  /** 成员名称 */
  name: string
  /** 是否为管理员 */
  isAdmin?: boolean
  /** 头像 URL */
  avatar?: string
}

/** 群聊信息 */
export interface GroupInfo {
  /** 群聊 ID */
  id: string
  /** 群聊名称 */
  name: string
  /** 成员列表 */
  members: GroupMember[]
  /** 群聊描述 */
  description?: string
}

/** 群聊适配器配置 */
export interface GroupChatAdapterConfig {
  /** 适配器名称 */
  name: string
  /** 触发方式 */
  triggerMethod: TriggerMethod
  /** 触发关键词（keyword 模式） */
  triggerKeywords?: string[]
  /** 触发命令前缀（command 模式） */
  commandPrefix?: string
  /** 是否启用 */
  enabled: boolean
  /** 频率限制（每分钟最大消息数） */
  rateLimit: number
  /** 仅启用只读工具 */
  readOnlyTools: boolean
}

/** 群聊适配器接口 */
export interface GroupChatAdapter {
  /** 适配器名称 */
  readonly name: string
  /** 适配器配置 */
  readonly config: GroupChatAdapterConfig

  /**
   * 启动适配器
   */
  start(): Promise<void>

  /**
   * 停止适配器
   */
  stop(): Promise<void>

  /**
   * 发送消息到群聊
   */
  sendMessage(groupId: string, reply: GroupReply): Promise<void>

  /**
   * 获取群聊信息
   */
  getGroupInfo(groupId: string): Promise<GroupInfo | null>

  /**
   * 获取群聊列表
   */
  listGroups(): Promise<GroupInfo[]>

  /**
   * 注册消息回调
   */
  onMessage(callback: (message: GroupMessage) => void): void

  /**
   * 检查是否应该响应
   */
  shouldRespond(message: GroupMessage): boolean
}

/** 群聊适配器注册信息 */
export interface GroupChatAdapterRegistration {
  /** 适配器类型 */
  type: string
  /** 适配器名称 */
  name: string
  /** 工厂函数 */
  factory: (config: GroupChatAdapterConfig) => GroupChatAdapter
}

/** 群聊会话上下文 */
export interface GroupChatContext {
  /** 群聊 ID */
  groupId: string
  /** 最近消息历史 */
  recentMessages: GroupMessage[]
  /** 活跃成员 */
  activeMembers: GroupMember[]
  /** 上次活动时间 */
  lastActivityAt: number
}

/**
 * 群聊管理视图
 * 显示群聊适配器列表和配置
 */

import React, { useState } from 'react'

/** 群聊适配器信息 */
interface GroupChatAdapter {
  id: string
  name: string
  type: string
  status: 'running' | 'stopped' | 'error'
  triggerMethod: string
  messageCount: number
  lastActivity?: number
}

/**
 * 群聊管理视图组件
 */
export const GroupChatView: React.FC = () => {
  const [adapters] = useState<GroupChatAdapter[]>([
    // 示例数据
    {
      id: 'webhook_default',
      name: 'Webhook 适配器',
      type: 'webhook',
      status: 'stopped',
      triggerMethod: 'mention',
      messageCount: 0
    }
  ])

  const [showAddModal, setShowAddModal] = useState(false)

  /** 状态颜色 */
  const statusColors: Record<string, string> = {
    running: '#52c41a',
    stopped: '#d9d9d9',
    error: '#ff4d4f'
  }

  /** 状态文本 */
  const statusTexts: Record<string, string> = {
    running: '运行中',
    stopped: '已停止',
    error: '错误'
  }

  /** 触发方式文本 */
  const triggerTexts: Record<string, string> = {
    mention: '@提及',
    keyword: '关键词',
    command: '命令前缀',
    always: '始终响应'
  }

  return (
    <div className="groupchat-view" style={{ padding: '24px' }}>
      {/* 头部 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div>
          <h2 style={{ margin: 0 }}>群聊管理</h2>
          <p style={{ color: '#666', margin: '8px 0 0 0' }}>
            管理群聊适配器，将 Echora Agent 接入群聊场景
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          style={{
            padding: '8px 16px',
            backgroundColor: '#1890ff',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer'
          }}
        >
          添加适配器
        </button>
      </div>

      {/* 适配器列表 */}
      <div className="adapter-list">
        {adapters.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              padding: '48px',
              color: '#999',
              backgroundColor: '#fafafa',
              borderRadius: '8px'
            }}
          >
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>💬</div>
            <div>暂无群聊适配器</div>
            <div style={{ fontSize: '14px', marginTop: '8px' }}>
              点击「添加适配器」开始配置
            </div>
          </div>
        ) : (
          adapters.map(adapter => (
            <div
              key={adapter.id}
              style={{
                border: '1px solid #f0f0f0',
                borderRadius: '8px',
                padding: '16px',
                marginBottom: '12px',
                backgroundColor: 'white'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontWeight: 'bold' }}>{adapter.name}</span>
                    <span
                      style={{
                        fontSize: '12px',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        backgroundColor: statusColors[adapter.status],
                        color: 'white'
                      }}
                    >
                      {statusTexts[adapter.status]}
                    </span>
                  </div>
                  <div style={{ fontSize: '14px', color: '#666', marginTop: '4px' }}>
                    类型: {adapter.type} | 触发: {triggerTexts[adapter.triggerMethod]}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    style={{
                      padding: '4px 12px',
                      backgroundColor: adapter.status === 'running' ? '#ff4d4f' : '#52c41a',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer'
                    }}
                  >
                    {adapter.status === 'running' ? '停止' : '启动'}
                  </button>
                  <button
                    style={{
                      padding: '4px 12px',
                      backgroundColor: '#d9d9d9',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer'
                    }}
                  >
                    配置
                  </button>
                </div>
              </div>

              {/* 统计信息 */}
              <div style={{ display: 'flex', gap: '24px', marginTop: '12px', fontSize: '14px', color: '#666' }}>
                <span>消息数: {adapter.messageCount}</span>
                {adapter.lastActivity && (
                  <span>最后活动: {new Date(adapter.lastActivity).toLocaleString()}</span>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* 使用说明 */}
      <div
        style={{
          marginTop: '24px',
          padding: '16px',
          backgroundColor: '#e6f7ff',
          borderRadius: '8px',
          border: '1px solid #91d5ff'
        }}
      >
        <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>使用说明</div>
        <ul style={{ margin: 0, paddingLeft: '20px' }}>
          <li>群聊适配器用于将 Echora Agent 接入外部群聊平台</li>
          <li>支持多种触发方式：@提及、关键词、命令前缀</li>
          <li>群聊模式下默认仅启用只读工具（web_search / kb_search）</li>
          <li>每个群每分钟最多响应 5 条消息（可配置）</li>
          <li>群聊回复以简洁卡片形式呈现，不显示内部推理过程</li>
        </ul>
      </div>
    </div>
  )
}

export default GroupChatView

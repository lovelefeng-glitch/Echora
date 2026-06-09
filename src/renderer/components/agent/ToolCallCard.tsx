/**
 * 工具调用卡片组件
 * 显示工具调用的状态和详情
 */

import React, { useState } from 'react'

/** 工具调用状态 */
export type ToolCallStatus = 'pending' | 'running' | 'completed' | 'error'

/** 工具调用属性 */
export interface ToolCallCardProps {
  /** 工具名称 */
  name: string
  /** 调用状态 */
  status: ToolCallStatus
  /** 参数 */
  arguments?: Record<string, unknown>
  /** 结果 */
  result?: string
  /** 错误信息 */
  error?: string
  /** 耗时（毫秒） */
  duration?: number
  /** 危险等级 */
  dangerLevel?: 'safe' | 'confirm' | 'dangerous'
  /** 是否展开详情 */
  defaultExpanded?: boolean
}

/**
 * 工具调用卡片组件
 */
export const ToolCallCard: React.FC<ToolCallCardProps> = ({
  name,
  status,
  arguments: args,
  result,
  error,
  duration,
  dangerLevel = 'safe',
  defaultExpanded = false
}) => {
  const [expanded, setExpanded] = useState(defaultExpanded)

  /** 状态图标 */
  const statusIcons: Record<ToolCallStatus, string> = {
    pending: '⏳',
    running: '🔄',
    completed: '✅',
    error: '❌'
  }

  /** 危险等级颜色 */
  const dangerColors: Record<string, string> = {
    safe: '#52c41a',
    confirm: '#faad14',
    dangerous: '#ff4d4f'
  }

  /** 状态颜色 */
  const statusColors: Record<ToolCallStatus, string> = {
    pending: '#d9d9d9',
    running: '#1890ff',
    completed: '#52c41a',
    error: '#ff4d4f'
  }

  return (
    <div
      className="tool-call-card"
      style={{
        border: `1px solid ${statusColors[status]}`,
        borderRadius: '8px',
        padding: '12px',
        margin: '8px 0',
        backgroundColor: status === 'error' ? '#fff2f0' : '#fafafa'
      }}
    >
      {/* 头部 */}
      <div
        className="tool-call-header"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer'
        }}
        onClick={() => setExpanded(!expanded)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span>{statusIcons[status]}</span>
          <span style={{ fontWeight: 'bold' }}>{name}</span>
          {dangerLevel !== 'safe' && (
            <span
              style={{
                fontSize: '12px',
                padding: '2px 6px',
                borderRadius: '4px',
                backgroundColor: dangerColors[dangerLevel],
                color: 'white'
              }}
            >
              {dangerLevel}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {duration && (
            <span style={{ fontSize: '12px', color: '#999' }}>
              {duration}ms
            </span>
          )}
          <span>{expanded ? '▼' : '▶'}</span>
        </div>
      </div>

      {/* 详情 */}
      {expanded && (
        <div className="tool-call-details" style={{ marginTop: '12px' }}>
          {/* 参数 */}
          {args && Object.keys(args).length > 0 && (
            <div style={{ marginBottom: '8px' }}>
              <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>
                参数:
              </div>
              <pre
                style={{
                  backgroundColor: '#f5f5f5',
                  padding: '8px',
                  borderRadius: '4px',
                  fontSize: '12px',
                  overflow: 'auto',
                  maxHeight: '100px'
                }}
              >
                {JSON.stringify(args, null, 2)}
              </pre>
            </div>
          )}

          {/* 结果 */}
          {result && (
            <div style={{ marginBottom: '8px' }}>
              <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>
                结果:
              </div>
              <pre
                style={{
                  backgroundColor: '#f6ffed',
                  padding: '8px',
                  borderRadius: '4px',
                  fontSize: '12px',
                  overflow: 'auto',
                  maxHeight: '150px',
                  border: '1px solid #b7eb8f'
                }}
              >
                {result}
              </pre>
            </div>
          )}

          {/* 错误 */}
          {error && (
            <div>
              <div style={{ fontSize: '12px', color: '#ff4d4f', marginBottom: '4px' }}>
                错误:
              </div>
              <pre
                style={{
                  backgroundColor: '#fff2f0',
                  padding: '8px',
                  borderRadius: '4px',
                  fontSize: '12px',
                  overflow: 'auto',
                  maxHeight: '100px',
                  border: '1px solid #ffccc7'
                }}
              >
                {error}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default ToolCallCard

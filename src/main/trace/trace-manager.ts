/**
 * Trace 管理器
 * Agent 执行追踪与可观测性实现
 */

import { create } from '../utils/console-logger'
import type {
  TraceEvent,
  TraceRecord,
  TraceConfig,
  TraceEventType,
  TraceLevel
} from './types'
import type { TokenUsage } from '../llm/types'

const log = create('TraceManager')

/** 默认配置 */
const DEFAULT_CONFIG: TraceConfig = {
  enabled: true,
  level: 'info',
  maxRecords: 100,
  consoleOutput: true
}

/**
 * Trace 管理器
 * 单例模式，管理所有 Agent 执行追踪
 */
export class TraceManager {
  private static _instance: TraceManager | null = null

  private _config: TraceConfig
  private _records = new Map<string, TraceRecord>()
  private _activeTraces = new Map<string, TraceRecord>()

  private constructor(config?: Partial<TraceConfig>) {
    this._config = { ...DEFAULT_CONFIG, ...config }
  }

  /**
   * 获取单例实例
   */
  static getInstance(config?: Partial<TraceConfig>): TraceManager {
    if (!TraceManager._instance) {
      TraceManager._instance = new TraceManager(config)
    }
    return TraceManager._instance
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<TraceConfig>): void {
    this._config = { ...this._config, ...config }
  }

  /**
   * 开始新的 Trace
   */
  startTrace(agentId: string, metadata?: Record<string, unknown>): string {
    if (!this._config.enabled) {
      return ''
    }

    const traceId = this._generateId()
    const record: TraceRecord = {
      id: traceId,
      agentId,
      startTime: Date.now(),
      status: 'running',
      events: [],
      totalUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      metadata
    }

    this._activeTraces.set(traceId, record)

    this._addEvent(traceId, {
      type: 'agent_start',
      level: 'info',
      source: 'TraceManager',
      message: `Agent ${agentId} 开始执行`,
      data: metadata
    })

    return traceId
  }

  /**
   * 结束 Trace
   */
  endTrace(traceId: string, status: TraceRecord['status'] = 'completed', error?: string): void {
    const record = this._activeTraces.get(traceId)
    if (!record) {
      return
    }

    record.endTime = Date.now()
    record.status = status
    if (error) {
      record.error = error
    }

    this._addEvent(traceId, {
      type: 'agent_end',
      level: status === 'error' ? 'error' : 'info',
      source: 'TraceManager',
      message: `Agent 执行${status === 'completed' ? '完成' : status}`,
      duration: record.endTime - record.startTime,
      error
    })

    // 移动到已完成记录
    this._activeTraces.delete(traceId)
    this._records.set(traceId, record)

    // 清理旧记录
    this._cleanup()
  }

  /**
   * 添加事件
   */
  addEvent(
    traceId: string,
    type: TraceEventType,
    message: string,
    data?: Record<string, unknown>,
    options?: {
      level?: TraceLevel
      source?: string
      usage?: TokenUsage
      duration?: number
      error?: string
      parentId?: string
    }
  ): void {
    if (!this._config.enabled) {
      return
    }

    this._addEvent(traceId, {
      type,
      level: options?.level || 'info',
      source: options?.source || 'Unknown',
      message,
      data,
      usage: options?.usage,
      duration: options?.duration,
      error: options?.error,
      parentId: options?.parentId
    })
  }

  /**
   * 记录 LLM 调用
   */
  logLLMCall(
    traceId: string,
    model: string,
    messages: number,
    usage?: TokenUsage,
    duration?: number
  ): void {
    this.addEvent(traceId, 'llm_call', `LLM 调用: ${model}`, {
      model,
      messageCount: messages
    }, {
      source: 'LLMProvider',
      usage,
      duration
    })
  }

  /**
   * 记录工具调用
   */
  logToolCall(
    traceId: string,
    toolName: string,
    args: Record<string, unknown>,
    result?: string,
    duration?: number,
    error?: string
  ): void {
    this.addEvent(traceId, 'tool_call', `工具调用: ${toolName}`, {
      toolName,
      arguments: args,
      result
    }, {
      source: 'ToolRegistry',
      duration,
      error,
      level: error ? 'error' : 'info'
    })
  }

  /**
   * 记录状态变更
   */
  logStateChange(
    traceId: string,
    fromState: string,
    toState: string,
    source: string
  ): void {
    this.addEvent(traceId, 'state_change', `状态变更: ${fromState} → ${toState}`, {
      fromState,
      toState
    }, { source })
  }

  /**
   * 获取 Trace 记录
   */
  getTrace(traceId: string): TraceRecord | undefined {
    return this._activeTraces.get(traceId) || this._records.get(traceId)
  }

  /**
   * 获取所有 Trace 记录
   */
  getAllTraces(): TraceRecord[] {
    return [
      ...Array.from(this._activeTraces.values()),
      ...Array.from(this._records.values())
    ]
  }

  /**
   * 获取最近的 Trace 记录
   */
  getRecentTraces(limit: number = 10): TraceRecord[] {
    const all = this.getAllTraces()
    return all
      .sort((a, b) => b.startTime - a.startTime)
      .slice(0, limit)
  }

  /**
   * 按 Agent ID 过滤
   */
  getTracesByAgent(agentId: string): TraceRecord[] {
    return this.getAllTraces().filter(t => t.agentId === agentId)
  }

  /**
   * 清除所有记录
   */
  clear(): void {
    this._records.clear()
    this._activeTraces.clear()
  }

  /**
   * 导出 Trace 为 JSON
   */
  exportTrace(traceId: string): string | null {
    const record = this.getTrace(traceId)
    if (!record) {
      return null
    }
    return JSON.stringify(record, null, 2)
  }

  /**
   * 内部添加事件
   */
  private _addEvent(traceId: string, event: Omit<TraceEvent, 'id' | 'traceId' | 'timestamp'>): void {
    const record = this._activeTraces.get(traceId)
    if (!record) {
      return
    }

    // 检查日志级别
    if (!this._shouldLog(event.level)) {
      return
    }

    const fullEvent: TraceEvent = {
      ...event,
      id: this._generateId(),
      traceId,
      timestamp: Date.now()
    }

    record.events.push(fullEvent)

    // 更新 Token 使用量
    if (event.usage) {
      record.totalUsage.promptTokens += event.usage.promptTokens
      record.totalUsage.completionTokens += event.usage.completionTokens
      record.totalUsage.totalTokens += event.usage.totalTokens
    }

    // 输出到控制台
    if (this._config.consoleOutput) {
      this._consoleLog(fullEvent)
    }
  }

  /**
   * 检查是否应该记录
   */
  private _shouldLog(level: TraceLevel): boolean {
    const levels: TraceLevel[] = ['debug', 'info', 'warn', 'error']
    const configLevel = levels.indexOf(this._config.level)
    const eventLevel = levels.indexOf(level)
    return eventLevel >= configLevel
  }

  /**
   * 控制台输出
   */
  private _consoleLog(event: TraceEvent): void {
    const prefix = `[Trace][${event.source}]`
    const message = `${prefix} ${event.message}`

    switch (event.level) {
      case 'debug':
        log.debug(message, event.data)
        break
      case 'info':
        log.info(message, event.data)
        break
      case 'warn':
        log.warn(message, event.data)
        break
      case 'error':
        log.error(message, event.error || event.data)
        break
    }
  }

  /**
   * 清理旧记录
   */
  private _cleanup(): void {
    if (this._records.size <= this._config.maxRecords) {
      return
    }

    // 按时间排序，移除最旧的
    const entries = Array.from(this._records.entries())
      .sort((a, b) => b[1].startTime - a[1].startTime)

    const toRemove = entries.slice(this._config.maxRecords)
    for (const [id] of toRemove) {
      this._records.delete(id)
    }
  }

  /**
   * 生成唯一 ID
   */
  private _generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  }
}

/**
 * 获取全局 Trace 管理器实例
 */
export function getTraceManager(config?: Partial<TraceConfig>): TraceManager {
  return TraceManager.getInstance(config)
}

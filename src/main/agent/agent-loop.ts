/**
 * Agent Loop 核心实现
 * 基于 ReAct 框架的 Observe-Think-Act 循环
 * P2 阶段：集成 Tool Registry
 *
 * ═══════════════════════════════════════════════════
 * 【Echora Agent 专属模块】
 * 不属于接入 Agent（Hermes/OpenClaw/QClaw/Cursor）。
 * 接入 Agent 的通信层在 src/main/adapters/。
 * Echora Agent 通过 src/main/llm/ 直连 API（如 mimo）。
 * IPC 入口：agent:runStream → echora-agent-handlers.ts
 * ═══════════════════════════════════════════════════
 */

import { create } from '../utils/console-logger'
import type { LLMProvider } from '../llm/provider-interface'
import type { ChatMessage, StreamEvent, TokenUsage, ToolCall } from '../llm/types'
import type { ToolRegistry, ToolContext, ToolResult } from '../tools/types'
import { collectSystemInfo } from '../tools'
import { parseToolCallsFromText } from './tool-call-parser'
import type {
  AgentConfig,
  AgentState,
  AgentStep,
  AgentResult,
  AgentEvent,
  AgentEventCallback,
  AgentRuntime
} from './types'
import type { ContextCompressionConfig } from './types'

const log = create('AgentLoop')

/** 默认配置 */
const DEFAULT_CONFIG = {
  maxSteps: 8, // P2 提升到 8 步
  temperature: 0.7,
  maxTokens: 4096
}

/**
 * Agent Loop 实现
 * 基于 ReAct 框架：Observe → Think → Act → Observe
 */
export class AgentLoop implements AgentRuntime {
  private _config: AgentConfig
  private _provider: LLMProvider
  private _toolRegistry: ToolRegistry | null
  private _state: AgentState = 'idle'
  private _currentStep = 0
  private _steps: AgentStep[] = []
  private _abortController: AbortController | null = null
  private _totalUsage: TokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 }

  constructor(config: AgentConfig, provider: LLMProvider, toolRegistry?: ToolRegistry) {
    this._config = {
      ...DEFAULT_CONFIG,
      ...config
    }
    this._provider = provider
    this._toolRegistry = toolRegistry || null
  }

  get config(): AgentConfig {
    return { ...this._config }
  }

  get state(): AgentState {
    return this._state
  }

  get currentStep(): number {
    return this._currentStep
  }

  get steps(): AgentStep[] {
    return [...this._steps]
  }

  /**
   * 执行 Agent 任务（非流式）
   */
  async run(message: string, onEvent?: AgentEventCallback): Promise<AgentResult> {
    const startTime = Date.now()
    this.reset()
    this._setState('observing', onEvent)

    try {
      // 构建初始消息
      const messages = this._buildInitialMessages(message)
      let finalContent = ''
      let finishReason: AgentResult['finishReason'] = 'completed'

      // ReAct 循环
      while (this._currentStep < (this._config.maxSteps || DEFAULT_CONFIG.maxSteps)) {
        // 检查是否取消
        if (this._state === 'cancelled') {
          finishReason = 'cancelled'
          break
        }

        this._currentStep++
        this._setState('thinking', onEvent)

        // 记录思考步骤
        const thoughtStep: AgentStep = {
          stepNumber: this._currentStep,
          type: 'thought',
          content: `Step ${this._currentStep}: 分析用户请求...`,
          timestamp: Date.now()
        }
        this._steps.push(thoughtStep)
        this._emitEvent({ type: 'step', step: thoughtStep }, onEvent)

        // 调用 LLM（带工具定义）
        const stepStart = Date.now()
        const tools = this._toolRegistry?.toOpenAIFunctions()
        const response = await this._provider.chat({
          model: this._config.model,
          messages,
          temperature: this._config.temperature,
          max_tokens: this._config.maxTokens,
          tools: tools?.length ? tools : undefined,
          tool_choice: tools?.length ? 'auto' : undefined
        })

        const stepDuration = Date.now() - stepStart

        // 解析响应
        const parsed = this._parseResponse(response)

        // 记录行动步骤
        const actionStep: AgentStep = {
          stepNumber: this._currentStep,
          type: 'action',
          content: parsed.content,
          timestamp: Date.now(),
          duration: stepDuration
        }

        if (parsed.toolCalls && parsed.toolCalls.length > 0) {
          actionStep.toolCall = {
            name: parsed.toolCalls[0].function.name,
            arguments: this._safeParseJSON(parsed.toolCalls[0].function.arguments)
          }
          this._emitEvent({
            type: 'tool_call',
            step: actionStep
          }, onEvent)
        }

        this._steps.push(actionStep)

        // 将助手回复添加到消息历史
        messages.push({
          role: 'assistant',
          content: response,
          tool_calls: parsed.toolCalls
        })

        // 如果有工具调用，执行工具并添加观察
        if (parsed.toolCalls && parsed.toolCalls.length > 0) {
          this._setState('acting', onEvent)

          for (const toolCall of parsed.toolCalls) {
            const observation = await this._executeTool(toolCall)
            const observationStep: AgentStep = {
              stepNumber: this._currentStep,
              type: 'observation',
              content: observation.output,
              timestamp: Date.now(),
              toolCall: {
                name: toolCall.function.name,
                arguments: this._safeParseJSON(toolCall.function.arguments),
                result: observation.output
              }
            }
            this._steps.push(observationStep)
            this._emitEvent({ type: 'step', step: observationStep }, onEvent)

            // 将工具结果添加到消息历史
            messages.push({
              role: 'tool',
              content: observation.output,
              tool_call_id: toolCall.id
            })
          }
        } else {
          // 没有工具调用，认为任务完成
          finalContent = parsed.content
          break
        }
      }

      // 检查是否达到最大步数
      if (this._currentStep >= (this._config.maxSteps || DEFAULT_CONFIG.maxSteps)) {
        finishReason = 'max_steps'
        finalContent = finalContent || '已达到最大步数限制，任务未完成。'
      }

      const result: AgentResult = {
        success: finishReason === 'completed',
        content: finalContent,
        steps: this._steps,
        totalUsage: this._totalUsage,
        totalDuration: Date.now() - startTime,
        finishReason
      }

      this._setState('completed', onEvent)
      this._emitEvent({ type: 'complete', result }, onEvent)

      return result
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      log.error('Agent 执行失败:', errorMessage)

      const result: AgentResult = {
        success: false,
        content: '',
        steps: this._steps,
        totalUsage: this._totalUsage,
        totalDuration: Date.now() - startTime,
        error: errorMessage,
        finishReason: 'error'
      }

      this._setState('error', onEvent)
      this._emitEvent({ type: 'error', error: errorMessage, result }, onEvent)

      return result
    }
  }

  /**
   * 流式执行 Agent 任务
   */
  runStream(message: string, onEvent: AgentEventCallback, history?: ChatMessage[]): AbortController {
    const controller = new AbortController()
    this._abortController = controller

    // 异步执行
    this._runStreamInternal(message, onEvent, controller.signal, history)
      .catch(error => {
        log.error('流式执行错误:', error)
      })
      .finally(() => {
        this._abortController = null
      })

    return controller
  }

  /**
   * 取消当前执行
   */
  cancel(): void {
    if (this._abortController) {
      this._abortController.abort()
    }
    this._state = 'cancelled'
  }

  /**
   * 重置 Agent 状态
   */
  reset(): void {
    this._state = 'idle'
    this._currentStep = 0
    this._steps = []
    this._totalUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
    this._abortController = null
  }

  /**
   * 销毁 Agent
   */
  destroy(): void {
    this.cancel()
    this.reset()
  }

  /**
   * 设置记忆上下文（注入系统提示）
   */
  setMemoryContext(context: string): void {
    this._config = { ...this._config, memoryContext: context }
  }

  /**
   * 内部流式执行
   */
  private async _runStreamInternal(
    message: string,
    onEvent: AgentEventCallback,
    signal: AbortSignal,
    history?: ChatMessage[]
  ): Promise<void> {
    const startTime = Date.now()
    this.reset()
    this._setState('observing', onEvent)

    try {
      const messages = this._buildInitialMessages(message, history)
      let finalContent = ''
      let finishReason: AgentResult['finishReason'] = 'completed'
      const maxSteps = this._config.maxSteps || DEFAULT_CONFIG.maxSteps

      // 上下文压缩：在开始前检查是否需要压缩历史消息
      const compressedMessages = this._compressContext(messages)
      if (compressedMessages !== messages) {
        // 重建消息数组（压缩后长度可能不同）
        messages.length = 0
        messages.push(...compressedMessages)
      }

      // ReAct 循环
      while (this._currentStep < maxSteps) {
        if (signal.aborted) {
          finishReason = 'cancelled'
          break
        }

        this._currentStep++
        this._setState('thinking', onEvent)

        // 记录思考步骤
        const thoughtStep: AgentStep = {
          stepNumber: this._currentStep,
          type: 'thought',
          content: `Step ${this._currentStep}: 分析中...`,
          timestamp: Date.now()
        }
        this._steps.push(thoughtStep)
        onEvent({ type: 'step', step: thoughtStep })

        // 流式调用 LLM
        const stepStart = Date.now()
        let fullResponse = ''
        let toolCalls: ToolCall[] | undefined

        await new Promise<void>((resolve, reject) => {
          // 只有在启用工具系统时才发送tools参数
          const tools = this._config.enableTools ? this._toolRegistry?.toOpenAIFunctions() : undefined
          const providerController = this._provider.chatStream(
            {
              model: this._config.model,
              messages,
              temperature: this._config.temperature,
              max_tokens: this._config.maxTokens,
              stream: true,
              tools: tools?.length ? tools : undefined,
              tool_choice: tools?.length ? 'auto' : undefined
            },
            (event: StreamEvent) => {
              switch (event.type) {
                case 'token':
                  fullResponse += event.content || ''
                  onEvent({ type: 'token', token: event.content })
                  break
                case 'tool_call':
                  if (event.toolCall) {
                    if (!toolCalls) toolCalls = []
                    toolCalls.push(event.toolCall)
                  }
                  break
                case 'usage':
                  log.info('[AgentLoop] 收到 usage 事件:', JSON.stringify(event.usage))
                  if (event.usage) {
                    this._totalUsage.promptTokens += event.usage.promptTokens
                    this._totalUsage.completionTokens += event.usage.completionTokens
                    this._totalUsage.totalTokens += event.usage.totalTokens
                    log.info('[AgentLoop] 累加后 _totalUsage:', JSON.stringify(this._totalUsage))
                  }
                  break
                case 'done':
                  log.info('[AgentLoop] done 事件, _totalUsage:', JSON.stringify(this._totalUsage))
                  resolve()
                  break
                case 'error':
                  reject(new Error(event.error))
                  break
              }
            }
          )

          // 监听取消信号
          signal.addEventListener('abort', () => {
            providerController.abort()
            resolve()
          })
        })

        const stepDuration = Date.now() - stepStart

        // 记录行动步骤
        const actionStep: AgentStep = {
          stepNumber: this._currentStep,
          type: 'action',
          content: fullResponse,
          timestamp: Date.now(),
          duration: stepDuration,
          toolCall: toolCalls?.[0] ? {
            name: toolCalls[0].function.name,
            arguments: this._safeParseJSON(toolCalls[0].function.arguments)
          } : undefined
        }
        this._steps.push(actionStep)
        onEvent({ type: 'step', step: actionStep })

        // 将助手回复添加到消息历史
        messages.push({
          role: 'assistant',
          content: fullResponse,
          tool_calls: toolCalls
        })

        // 处理工具调用
        if (toolCalls && toolCalls.length > 0) {
          this._setState('acting', onEvent)
          onEvent({ type: 'tool_call', step: actionStep })

          for (const toolCall of toolCalls) {
            const observation = await this._executeTool(toolCall)
            const observationStep: AgentStep = {
              stepNumber: this._currentStep,
              type: 'observation',
              content: observation.output,
              timestamp: Date.now(),
              toolCall: {
                name: toolCall.function.name,
                arguments: this._safeParseJSON(toolCall.function.arguments),
                result: observation.output
              }
            }
            this._steps.push(observationStep)
            onEvent({ type: 'step', step: observationStep })

            messages.push({
              role: 'tool',
              content: observation.output,
              tool_call_id: toolCall.id
            })
          }

          // 上下文压缩：每轮工具调用后检查是否需要压缩
          if (this._shouldCompressContext(messages)) {
            const compressed = this._compressContext(messages)
            if (compressed !== messages) {
              messages.length = 0
              messages.push(...compressed)
            }
          }
        } else {
          // 尝试从文本中解析tool call（支持不支持标准tool calling的模型）
          const parsedToolCalls = parseToolCallsFromText(fullResponse)
          if (parsedToolCalls && parsedToolCalls.length > 0) {
            toolCalls = parsedToolCalls
            log.info('从文本中解析到', toolCalls.length, '个tool call')
          } else {
            finalContent = fullResponse
            break
          }
        }
      }

      // 检查最大步数
      if (this._currentStep >= maxSteps) {
        finishReason = 'max_steps'
        finalContent = finalContent || '已达到最大步数限制。'
      }

      const result: AgentResult = {
        success: finishReason === 'completed',
        content: finalContent,
        steps: this._steps,
        totalUsage: this._totalUsage,
        totalDuration: Date.now() - startTime,
        finishReason
      }

      this._setState('completed', onEvent)
      onEvent({ type: 'complete', result })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)

      const result: AgentResult = {
        success: false,
        content: '',
        steps: this._steps,
        totalUsage: this._totalUsage,
        totalDuration: Date.now() - startTime,
        error: errorMessage,
        finishReason: 'error'
      }

      this._setState('error', onEvent)
      onEvent({ type: 'error', error: errorMessage, result })
    }
  }

  /**
   * 构建初始消息列表
   */
  private _buildInitialMessages(userMessage: string, history?: ChatMessage[]): ChatMessage[] {
    const messages: ChatMessage[] = []

    // 系统提示词（含系统信息与工具使用说明）
    const systemPrompt = this._buildEnhancedSystemPrompt()
    if (systemPrompt) {
      messages.push({
        role: 'system',
        content: systemPrompt
      })
    }

    // 历史消息
    if (history && history.length > 0) {
      messages.push(...history)
    }

    // 用户消息
    messages.push({
      role: 'user',
      content: userMessage
    })

    return messages
  }

  /**
   * 构建增强系统提示
   * 在原始系统提示基础上追加系统信息、文件操作工具使用说明和安全限制
   */
  private _buildEnhancedSystemPrompt(): string {
    const parts: string[] = []

    // 1. 原始系统提示
    if (this._config.systemPrompt) {
      parts.push(this._config.systemPrompt)
    }

    // 2. 记忆上下文
    if (this._config.memoryContext) {
      parts.push(this._config.memoryContext)
    }

    // 3. 系统环境信息
    const sysInfo = collectSystemInfo()
    parts.push(`## 系统环境信息

- 操作系统: ${sysInfo.osType} ${sysInfo.osRelease} (${sysInfo.arch})
- 用户名: ${sysInfo.username}
- 桌面路径: ${sysInfo.desktopPath}
- 主目录: ${sysInfo.homeDir}
- 主机名: ${sysInfo.hostname}`)

    // 4. 文件操作工具使用说明
    parts.push(`## 文件操作工具使用方法

### file_read — 读取文件
- 参数: \`path\`（文件路径，支持绝对路径和相对路径）
- 安全等级: safe（无需确认）
- 示例: 调用 file_read 读取项目中的配置文件

### file_write — 写入文件
- 参数: \`path\`（文件路径）、\`content\`（写入内容）
- 安全等级: confirm（需要用户确认）
- 会自动备份原文件（如果文件已存在）
- 会自动创建不存在的父目录
- 示例: 调用 file_write 创建或更新文件内容`)

    // 4.5. 网络搜索和抓取工具
    parts.push(`## 网络工具使用方法

### web_search — 搜索互联网
- 参数: \`query\`（搜索关键词）、\`max_results\`（最大结果数，默认5）
- 安全等级: safe（无需确认）
- 使用 DuckDuckGo 搜索引擎
- 当用户询问实时信息、新闻、技术文档时使用
- 返回标题、链接和摘要

### web_fetch — 抓取网页内容
- 参数: \`url\`（网页URL）、\`max_length\`（最大内容长度，默认5000字符）
- 安全等级: safe（无需确认）
- 自动将HTML转为纯文本，提取正文内容
- 配合 web_search 使用：先搜索获取URL，再抓取详细内容
- 支持JSON API和普通网页`)

    // 5. PowerShell 命令执行说明
    parts.push(`## PowerShell 命令执行方法

### powershell_execute — 执行 PowerShell 命令
- 参数: \`command\`（PowerShell 命令）、\`timeout\`（超时毫秒数，默认 30000，最大 300000）、\`cwd\`（工作目录，可选）
- 安全等级: dangerous（需要二次确认）
- 使用 PowerShell.exe 作为执行引擎
- 示例: 调用 powershell_execute 执行构建、测试等系统命令

### code_execute — 执行 JavaScript 代码
- 参数: \`language\`（固定为 'javascript'）、\`code\`（代码内容）、\`timeout\`（超时毫秒数）
- 安全等级: dangerous（需要二次确认）`)

    // 6. 安全限制说明
    parts.push(`## 安全限制

1. **白名单目录限制**: 文件操作（file_read / file_write）仅允许在白名单目录内进行。白名单为空时不做限制；非白名单路径会被拒绝访问。
2. **用户确认机制**:
   - file_write（写入文件）需要用户确认后才能执行
   - powershell_execute（执行命令）需要用户二次确认
   - code_execute（执行代码）需要用户二次确认
3. **超时控制**: PowerShell 命令默认 30 秒超时，最长 300 秒。超过超时时间命令将被终止。
4. **路径安全**: 所有路径会经过解析和白名单校验，防止目录遍历攻击。`)

    return parts.join('\n\n')
  }

  /**
   * 解析 LLM 响应
   */
  private _parseResponse(response: string): {
    content: string
    toolCalls?: ToolCall[]
  } {
    // 尝试解析 JSON 格式的工具调用
    try {
      const jsonMatch = response.match(/```json\n([\s\S]*?)\n```/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[1])
        if (parsed.tool_call) {
          return {
            content: parsed.thought || response,
            toolCalls: [{
              id: `call_${Date.now()}`,
              type: 'function',
              function: {
                name: parsed.tool_call.name,
                arguments: JSON.stringify(parsed.tool_call.arguments || {})
              }
            }]
          }
        }
      }
    } catch {
      // 忽略解析错误
    }

    // 检查是否包含工具调用标记
    const toolCallMatch = response.match(/\[Tool Call: (\w+)\((.*?)\)\]/)
    if (toolCallMatch) {
      return {
        content: response.replace(toolCallMatch[0], '').trim(),
        toolCalls: [{
          id: `call_${Date.now()}`,
          type: 'function',
          function: {
            name: toolCallMatch[1],
            arguments: toolCallMatch[2]
          }
        }]
      }
    }

    return { content: response }
  }

  /**
   * 执行工具
   */
  private async _executeTool(toolCall: ToolCall): Promise<ToolResult> {
    if (!this._toolRegistry) {
      return {
        success: false,
        output: '',
        error: '工具系统未启用'
      }
    }

    const context: ToolContext = {
      callerId: this._config.id,
      sessionId: undefined,
      workingDirectory: process.cwd()
    }

    return this._toolRegistry.execute(
      {
        name: toolCall.function.name,
        callId: toolCall.id,
        arguments: this._safeParseJSON(toolCall.function.arguments)
      },
      context
    )
  }

  /**
   * 估算 token 数量（粗略估计：1个中文字符≈1.5 token，1个英文单词≈1.3 token）
   * 使用简单的字符计数法：每4个字符≈1个token
   */
  private _estimateTokens(text: string): number {
    if (!text) return 0
    return Math.ceil(text.length / 4)
  }

  /**
   * 检查是否需要压缩上下文
   */
  private _shouldCompressContext(messages: ChatMessage[]): boolean {
    const compression = this._config.contextCompression
    if (!compression?.enabled || !this._config.contextWindow || this._config.contextWindow <= 0) {
      return false
    }

    const thresholdPct = compression.thresholdPct ?? 80
    const totalTokens = messages.reduce((sum, msg) => sum + this._estimateTokens(msg.content), 0)
    const usagePct = (totalTokens / this._config.contextWindow) * 100

    return usagePct >= thresholdPct
  }

  /**
   * 压缩上下文：保留系统提示 + 最近N轮对话
   * 策略：保留所有 system 消息 + 最近的 user/assistant 对话轮次，直到目标 token 数
   */
  private _compressContext(messages: ChatMessage[]): ChatMessage[] {
    if (messages.length === 0) return messages

    const compression = this._config.contextCompression
    const contextWindow = this._config.contextWindow
    if (!contextWindow || contextWindow <= 0) return messages

    const targetPct = compression?.targetPct ?? 50
    const targetTokens = Math.floor((contextWindow * targetPct) / 100)

    // 分离系统消息和对话消息
    const systemMessages: ChatMessage[] = []
    const conversationMessages: ChatMessage[] = []

    for (const msg of messages) {
      if (msg.role === 'system') {
        systemMessages.push(msg)
      } else {
        conversationMessages.push(msg)
      }
    }

    // 计算系统消息的 token 数
    const systemTokens = systemMessages.reduce((sum, msg) => sum + this._estimateTokens(msg.content), 0)
    const remainingBudget = targetTokens - systemTokens

    if (remainingBudget <= 0) {
      // 系统消息已超过目标，只保留系统消息
      log.warn('上下文压缩：系统消息已超过目标 token 数，仅保留系统消息')
      return systemMessages
    }

    // 从最近的消息开始，保留对话直到达到预算
    // 尊重 user/assistant 配对：不能只保留半个轮次
    const keptMessages: ChatMessage[] = []
    let usedTokens = 0

    for (let i = conversationMessages.length - 1; i >= 0; i--) {
      const msg = conversationMessages[i]
      const msgTokens = this._estimateTokens(msg.content)

      // 如果加上这条消息会超预算，检查是否需要保留下一条（配对）
      if (usedTokens + msgTokens > remainingBudget) {
        // 如果当前是 assistant，且前一条是 user，保留 user（不完整轮次）
        // 如果当前是 user，停止
        break
      }

      usedTokens += msgTokens
      keptMessages.unshift(msg)
    }

    // 确保对话以 user 消息结尾（如果不是，移除最后的 assistant 消息以保持配对）
    if (keptMessages.length > 0 && keptMessages[keptMessages.length - 1].role === 'assistant') {
      // 检查是否还有后续的 user 消息（被裁掉的）
      // 如果最后一个 kept 是 assistant，说明最后一个轮次不完整，移除它
      const removed = keptMessages.pop()
      if (removed) {
        usedTokens -= this._estimateTokens(removed.content)
      }
    }

    // 添加压缩提示消息
    const droppedCount = conversationMessages.length - keptMessages.length
    const compressionNotice: ChatMessage = {
      role: 'system',
      content: `[上下文已压缩：丢弃了最早的 ${droppedCount} 条消息，保留最近 ${keptMessages.length} 条消息]`
    }

    const result = [...systemMessages, compressionNotice, ...keptMessages]
    const finalTokens = result.reduce((sum, msg) => sum + this._estimateTokens(msg.content), 0)
    log.info(`上下文压缩完成：${messages.length} → ${result.length} 条消息，约 ${finalTokens} tokens (目标 ${targetTokens})`)

    return result
  }

  /**
   * 设置状态
   */
  private _setState(state: AgentState, onEvent?: AgentEventCallback): void {
    this._state = state
    this._emitEvent({ type: 'state_change', state }, onEvent)
  }

  /**
   * 发送事件
   */
  private _emitEvent(event: AgentEvent, onEvent?: AgentEventCallback): void {
    if (onEvent) {
      onEvent(event)
    }
  }

  /**
   * 安全的 JSON 解析
   */
  private _safeParseJSON(str: string): Record<string, unknown> {
    try {
      return JSON.parse(str)
    } catch {
      return {}
    }
  }
}

/**
 * 创建 Agent Loop 实例
 */
export function createAgentLoop(
  config: AgentConfig,
  provider: LLMProvider,
  toolRegistry?: ToolRegistry
): AgentRuntime {
  return new AgentLoop(config, provider, toolRegistry)
}

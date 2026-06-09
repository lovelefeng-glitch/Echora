/**
 * OpenAI 兼容 Provider 实现
 * 支持所有 OpenAI 兼容 API（DeepSeek / Qwen / 豆包 / Moonshot / mimo 等）
 *
 * ═══════════════════════════════════════════════════
 * 【Echora Agent 专属模块】
 * 这是 Echora Agent 的 LLM 通信层，不属于接入 Agent。
 * Echora Agent 通过此 Provider 直连 API（如 mimo）。
 * 接入 Agent（Hermes/OpenClaw/QClaw）使用 src/main/adapters/。
 * ═══════════════════════════════════════════════════
 */

import { create } from '../utils/console-logger'
import type { LLMProvider } from './provider-interface'
import type {
  ProviderConfig,
  ChatRequest,
  ChatMessage,
  StreamEvent,
  ModelInfo,
  ConnectionResult,
  EmbeddingRequest,
  EmbeddingResponse,
  ProviderStatus,
  TokenUsage
} from './types'

const log = create('OpenAIProvider')

/**
 * OpenAI 兼容 Provider
 * 实现 OpenAI API 协议，兼容所有支持 OpenAI 格式的服务商
 */
export class OpenAIProvider implements LLMProvider {
  readonly id: string
  readonly name: string
  readonly type = 'openai'

  private _status: ProviderStatus = 'idle'
  private _config: ProviderConfig
  private _activeRequests = new Set<AbortController>()

  constructor(config: ProviderConfig) {
    this.id = config.id
    this.name = config.name
    this._config = config
  }

  get status(): ProviderStatus {
    return this._status
  }

  get config(): ProviderConfig {
    return { ...this._config }
  }

  /**
   * 连接验证
   * 调用 /v1/models 验证 API Key 和连接
   */
  async validate(): Promise<ConnectionResult> {
    this._status = 'connecting'
    try {
      const response = await this._fetch('/v1/models')
      if (!response.ok) {
        const error = await response.text()
        this._status = 'error'
        return { success: false, message: `API 验证失败: ${error}` }
      }

      const data = await response.json()
      const models: ModelInfo[] = (data.data || []).map((m: Record<string, unknown>) => ({
        id: m.id as string,
        name: m.id as string,
        owned_by: m.owned_by as string | undefined,
        created: m.created as number | undefined
      }))

      this._status = 'connected'
      return { success: true, models }
    } catch (error) {
      this._status = 'error'
      return {
        success: false,
        message: `连接失败: ${error instanceof Error ? error.message : String(error)}`
      }
    }
  }

  /**
   * 获取可用模型列表
   */
  async listModels(): Promise<ModelInfo[]> {
    try {
      const response = await this._fetch('/v1/models')
      if (!response.ok) {
        throw new Error(`获取模型列表失败: ${response.statusText}`)
      }

      const data = await response.json()
      return (data.data || []).map((m: Record<string, unknown>) => ({
        id: m.id as string,
        name: m.id as string,
        owned_by: m.owned_by as string | undefined,
        created: m.created as number | undefined
      }))
    } catch (error) {
      log.error('获取模型列表失败:', error)
      return []
    }
  }

  /**
   * 聊天补全（非流式）
   */
  async chat(request: ChatRequest): Promise<string> {
    const body = {
      model: request.model || this._config.defaultModel,
      messages: request.messages,
      stream: false,
      temperature: request.temperature,
      max_tokens: request.max_tokens,
      tools: request.tools,
      tool_choice: request.tool_choice
    }

    const response = await this._fetch('/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`聊天请求失败: ${error}`)
    }

    const data = await response.json()
    return data.choices?.[0]?.message?.content || ''
  }

  /**
   * 聊天补全（流式）
   * 使用 fetch + ReadableStream 实现，优化首 token 延迟
   */
  chatStream(
    request: ChatRequest,
    onEvent: (event: StreamEvent) => void
  ): AbortController {
    const controller = new AbortController()
    this._activeRequests.add(controller)

    const body = {
      model: request.model || this._config.defaultModel,
      messages: request.messages,
      stream: true,
      stream_options: { include_usage: true },
      temperature: request.temperature,
      max_tokens: request.max_tokens,
      tools: request.tools,
      tool_choice: request.tool_choice
    }

    // 异步执行流式请求
    this._streamRequest(body, controller.signal, onEvent)
      .finally(() => {
        this._activeRequests.delete(controller)
      })

    return controller
  }

  /**
   * 文本嵌入
   */
  async embed(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    const body = {
      model: request.model,
      input: request.input
    }

    const response = await this._fetch('/v1/embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Embedding 请求失败: ${error}`)
    }

    return await response.json()
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<ProviderConfig>): void {
    this._config = { ...this._config, ...config }
  }

  /**
   * 销毁 Provider
   */
  destroy(): void {
    // 取消所有活跃请求
    for (const controller of this._activeRequests) {
      controller.abort()
    }
    this._activeRequests.clear()
    this._status = 'idle'
  }

  /**
   * 内部 HTTP 请求方法
   * 自动处理 baseUrl 中的路径，避免重复
   */
  private async _fetch(path: string, options?: RequestInit): Promise<Response> {
    // 处理 baseUrl，确保不会重复路径
    let baseUrl = this._config.baseUrl
    // 移除 baseUrl 末尾的斜杠
    baseUrl = baseUrl.replace(/\/+$/, '')
    // 如果 path 以 /v1 开头且 baseUrl 已经以 /v1 结尾，则不再添加
    if (path.startsWith('/v1') && baseUrl.endsWith('/v1')) {
      baseUrl = baseUrl.replace(/\/v1$/, '')
    }
    
    const url = `${baseUrl}${path}`
    log.info('API 请求 URL:', url)
    
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this._config.apiKey}`,
      ...(options?.headers as Record<string, string> || {})
    }

    return fetch(url, {
      ...options,
      headers,
      signal: options?.signal
    })
  }

  /**
   * 流式请求实现
   */
  private async _streamRequest(
    body: Record<string, unknown>,
    signal: AbortSignal,
    onEvent: (event: StreamEvent) => void
  ): Promise<void> {
    try {
      log.info('开始流式请求:', JSON.stringify({ model: body.model, baseUrl: this._config.baseUrl }))
      
      const response = await this._fetch('/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal
      })

      if (!response.ok) {
        const error = await response.text()
        log.error('流式请求失败:', response.status, error)
        onEvent({ type: 'error', error: `流式请求失败: ${response.status} ${error}` })
        return
      }

      log.info('流式请求成功，开始读取响应流')

      const reader = response.body?.getReader()
      if (!reader) {
        onEvent({ type: 'error', error: '无法获取响应流' })
        return
      }

      const decoder = new TextDecoder()
      let buffer = ''
      let chunkCount = 0

      while (true) {
        const { done, value } = await reader.read()
        if (done) {
          // v3 - 2026-06-09: 处理 buffer 中残留的最后一行（usage 数据通常在最后一行）
          if (buffer.trim()) {
            const remainingLines = buffer.split('\n')
            for (const line of remainingLines) {
              const trimmed = line.trim()
              if (!trimmed || !trimmed.startsWith('data: ')) continue
              const data = trimmed.slice(6)
              // v1.2 - 2026-06-09: 不在这里发送 done 事件，等 usage 数据处理完后再发送
              if (data === '[DONE]') { continue }
              try {
                this._handleStreamChunk(JSON.parse(data), onEvent)
              } catch {}
            }
          }
          log.info('响应流结束，共处理', chunkCount, '个数据块')
          break
        }

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed || !trimmed.startsWith('data: ')) continue

          const data = trimmed.slice(6)
          if (data === '[DONE]') {
            log.info('收到 [DONE] 信号')
            // v1.2 - 2026-06-09: 不在这里发送 done 事件，等 usage 数据处理完后再发送
            // onEvent({ type: 'done' })
            // return
            continue
          }

          try {
            const parsed = JSON.parse(data)
            chunkCount++
            if (chunkCount <= 3 || chunkCount % 10 === 0 || parsed.usage) {
              log.info('处理数据块:', chunkCount, JSON.stringify(parsed).substring(0, 300))
            }
            this._handleStreamChunk(parsed, onEvent)
          } catch (e) {
            log.warn('解析数据块失败:', data.substring(0, 100))
          }
        }
      }

      log.info('流式请求完成')
      onEvent({ type: 'done' })
    } catch (error) {
      if (signal.aborted) {
        onEvent({ type: 'error', error: '请求已取消' })
      } else {
        onEvent({
          type: 'error',
          error: `流式请求错误: ${error instanceof Error ? error.message : String(error)}`
        })
      }
    }
  }

  /**
   * 处理流式数据块
   */
  private _handleStreamChunk(
    chunk: Record<string, unknown>,
    onEvent: (event: StreamEvent) => void
  ): void {
    const choices = chunk.choices as Array<Record<string, unknown>> | undefined

    // 处理 usage chunk（include_usage: true 时，usage 在 choices 为空的独立 chunk 中）
    if (chunk.usage) {
      const usage = chunk.usage as Record<string, unknown>
      log.info('[OpenAI] ✅ chunk.usage found:', JSON.stringify(usage))
      onEvent({
        type: 'usage',
        usage: {
          promptTokens: usage.prompt_tokens as number || 0,
          completionTokens: usage.completion_tokens as number || 0,
          totalTokens: usage.total_tokens as number || 0
        }
      })
    }

    if (!choices?.length) {
      // choices 为空且没有 usage — 记录警告（API 可能没返回 usage）
      if (!chunk.usage) {
        log.warn('[OpenAI] choices 为空且无 usage 数据, chunk keys:', Object.keys(chunk).join(','))
      }
      return
    }

    const choice = choices[0]
    const delta = choice.delta as Record<string, unknown> | undefined
    const finishReason = choice.finish_reason as string | undefined

    // 处理工具调用
    if (delta?.tool_calls) {
      const toolCalls = delta.tool_calls as Array<Record<string, unknown>>
      for (const tc of toolCalls) {
        onEvent({
          type: 'tool_call',
          toolCall: {
            id: tc.id as string || '',
            type: 'function',
            function: {
              name: (tc.function as Record<string, unknown>)?.name as string || '',
              arguments: (tc.function as Record<string, unknown>)?.arguments as string || ''
            }
          }
        })
      }
    }

    // 处理文本内容
    if (delta?.content) {
      onEvent({ type: 'token', content: delta.content as string })
    }

    // 处理完成
    // v2 - 2026-06-09: 不在 finishReason 中重复发送 usage
    // usage 已在函数顶部统一处理，此处重复发送会导致 AgentLoop 双倍累加
    // v1.3 - 2026-06-09: 不在 finishReason 中发送 done 事件
    // 原因: finishReason 在 usage chunk 之前到达，会导致 AgentLoop 提前返回，usage 为 0
    // done 事件统一在流结束后发送（_streamRequest 的 onEvent({ type: 'done' })）
    // if (finishReason) {
    //   onEvent({ type: 'done', finishReason })
    // }
  }
}

/**
 * 创建 OpenAI Provider 实例
 */
export function createOpenAIProvider(config: ProviderConfig): LLMProvider {
  return new OpenAIProvider(config)
}

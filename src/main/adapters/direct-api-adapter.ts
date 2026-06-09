import http from 'http'
import https from 'https'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import {
  BaseAdapter,
  type AdapterConfig,
  type AdapterAgentItem,
  type AdapterModelInfo,
  type AdapterModelItem,
  type StartResult,
  type StopResult,
  type StatusResult,
  type SendMessageResult,
  type StreamCallbacks
} from './base-adapter'
import type { DirectApiConfig } from '../../shared/types'

/**
 * Echora Agent 独立配置文件格式（类似 openclaw.json）
 */
export interface EchoraAgentConfig {
  agent: {
    name: string
    emoji: string
    description: string
  }
  providers: DirectApiConfig[]
}

const TAG = 'DirectApi'

/**
 * 获取 echora-agent.json 配置文件路径
 * 位于 ~/.echora/echora-agent.json
 */
function getConfigPath(): string {
  const home = os.homedir()
  return path.join(home, '.echora', 'echora-agent.json')
}

/**
 * DirectApiAdapter - Echora Agent 直连 API 适配器
 * 绕过网关，直接调用 OpenAI 兼容 API（DeepSeek / Qwen / 豆包 / Moonshot 等）
 */

interface DirectApiAdapterConfig extends AdapterConfig {
  providers?: DirectApiConfig[]
}

/** 创建默认的 Echora Agent 配置 */
function createDefaultAgentConfig(): EchoraAgentConfig {
  return {
    agent: {
      name: 'Echora Agent',
      emoji: '🤖',
      description: 'Echora 内置 Agent (直连 API)',
    },
    providers: [],
  }
}

export class DirectApiAdapter extends BaseAdapter<DirectApiAdapterConfig> {
  private _providers: DirectApiConfig[] = []
  private _currentModel: string | null = null

  constructor(config: DirectApiAdapterConfig = {}) {
    super({ ...config, aiType: 'echora' })
    this.name = 'direct-api'
    this.baseUrl = ''
    this._providers = config.providers || []
  }

  /** 更新 Provider 配置（由 ConfigManager 变更时调用） */
  updateProviders(providers: DirectApiConfig[]): void {
    console.log('[DirectApiAdapter] updateProviders:', providers.length, 'providers, contextWindow:', providers[0]?.contextWindow)
    this._providers = providers
  }

  // ── echora-agent.json 配置文件读写 ──

  /** 读取 echora-agent.json 配置文件 */
  static readConfigFile(): EchoraAgentConfig {
    const configPath = getConfigPath()
    try {
      if (!fs.existsSync(configPath)) {
        return createDefaultAgentConfig()
      }
      const raw = fs.readFileSync(configPath, 'utf-8')
      const data = JSON.parse(raw) as Partial<EchoraAgentConfig>
      return {
        agent: { ...createDefaultAgentConfig().agent, ...data.agent },
        providers: Array.isArray(data.providers) ? data.providers : [],
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      console.warn(`[${TAG}] 读取 echora-agent.json 失败:`, msg)
      return createDefaultAgentConfig()
    }
  }

  /** 写入 echora-agent.json 配置文件 */
  static writeConfigFile(data: EchoraAgentConfig): boolean {
    const configPath = getConfigPath()
    try {
      const dir = path.dirname(configPath)
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }
      fs.writeFileSync(configPath, JSON.stringify(data, null, 2), 'utf-8')
      console.log(`[${TAG}] echora-agent.json 已保存:`, configPath)
      return true
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error(`[${TAG}] 写入 echora-agent.json 失败:`, msg)
      return false
    }
  }

  /** 同步 providers 到 echora-agent.json（从 ConfigManager 合并） */
  static syncFromFile(providers: DirectApiConfig[]): DirectApiConfig[] {
    const fileConfig = DirectApiAdapter.readConfigFile()
    if (fileConfig.providers.length === 0 && providers.length > 0) {
      // 文件为空但 ConfigManager 有数据，写入文件
      DirectApiAdapter.writeConfigFile({
        ...fileConfig,
        providers,
      })
      return providers
    }
    if (fileConfig.providers.length > 0 && providers.length === 0) {
      // 文件有数据但 ConfigManager 为空，从文件读取
      return fileConfig.providers
    }
    // 两边都有数据，以 ConfigManager 为准（用户可能在 UI 修改了配置）
    if (providers.length > 0) {
      DirectApiAdapter.writeConfigFile({
        ...fileConfig,
        providers,
      })
      return providers
    }
    return fileConfig.providers
  }

  /** 更新单个 provider 的 contextWindow 配置 */
  static updateProviderContextWindow(
    providerId: string,
    contextWindow: number | undefined,
    compression?: { enabled?: boolean; thresholdPct?: number; targetPct?: number }
  ): boolean {
    const fileConfig = DirectApiAdapter.readConfigFile()
    const provider = fileConfig.providers.find(p => p.id === providerId)
    if (!provider) return false
    if (contextWindow !== undefined) {
      provider.contextWindow = contextWindow
    }
    if (compression) {
      provider.contextCompression = {
        ...provider.contextCompression,
        ...compression,
      }
    }
    return DirectApiAdapter.writeConfigFile(fileConfig)
  }

  /** 获取配置文件路径（用于 IPC 返回） */
  static getConfigFilePath(): string {
    return getConfigPath()
  }

  /** 获取当前活跃的 provider（优先选有 apiKey 的） */
  private _getActiveProvider(): DirectApiConfig | null {
    if (this._providers.length === 0) return null
    // 优先选有 apiKey 的
    const withKey = this._providers.find(p => p.apiKey && p.apiKey.length > 0)
    return withKey || this._providers[0]
  }

  /** 获取默认模型 */
  private _getDefaultModel(): string {
    const provider = this._getActiveProvider()
    if (provider?.defaultModel) return provider.defaultModel
    if (provider?.models && provider.models.length > 0) return provider.models[0]
    return 'gpt-3.5-turbo'
  }

  async start(): Promise<StartResult> {
    this.status = 'running'
    return { success: true }
  }

  async stop(): Promise<StopResult> {
    this.status = 'stopped'
    return { success: true }
  }

  async getStatus(): Promise<StatusResult> {
    const provider = this._getActiveProvider()
    if (!provider) {
      return { status: 'offline', message: '未配置 API 提供商' }
    }
    return {
      status: this._providers.length > 0 ? 'running' : 'offline',
      hasChatAPI: true,
    }
  }

  async listAgents(): Promise<AdapterAgentItem[]> {
    return [{
      id: 'echora-agent',
      name: 'Echora Agent',
      emoji: '🤖',
      description: 'Echora 内置 Agent (直连 API)',
    }]
  }

  async sendMessage(agentId: string, message: string, userId?: string): Promise<SendMessageResult> {
    const provider = this._getActiveProvider()
    if (!provider || !provider.apiKey) {
      return { success: false, message: '未配置 API 提供商或 API Key 缺失' }
    }

    const model = this._currentModel || this._getDefaultModel()
    const body = JSON.stringify({
      model,
      messages: [{ role: 'user', content: message }],
      stream: false,
      max_tokens: 4096,
    })

    return new Promise((resolve) => {
      const url = new URL(provider.baseUrl.replace(/\/+$/, '') + '/v1/chat/completions')
      const isHttps = url.protocol === 'https:'
      const transport = isHttps ? https : http

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${provider.apiKey}`,
      }

      const options: http.RequestOptions = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname,
        method: 'POST',
        timeout: this._requestTimeout,
        headers,
      }

      const req = transport.request(options, (res) => {
        let data = ''
        res.on('data', (chunk) => (data += chunk))
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data)
            if (parsed.choices && parsed.choices[0]) {
              const content = parsed.choices[0].message?.content || ''
              resolve({
                success: true,
                content,
                messageId: parsed.id,
                model: parsed.model,
              })
            } else if (parsed.error) {
              resolve({ success: false, message: parsed.error.message || JSON.stringify(parsed.error) })
            } else {
              resolve({ success: false, message: '无效的响应格式' })
            }
          } catch {
            resolve({ success: false, message: `解析响应失败: ${data.substring(0, 200)}` })
          }
        })
      })

      req.on('error', (err) => {
        resolve({ success: false, message: `请求失败: ${err.message}` })
      })

      req.on('timeout', () => {
        req.destroy()
        resolve({ success: false, message: '请求超时' })
      })

      req.write(body)
      req.end()
    })
  }

  sendMessageStream(
    agentId: string,
    messages: string | unknown[],
    callbacks?: StreamCallbacks,
    _userId?: string
  ): http.ClientRequest | null {
    const { onChunk, onDone, onError, onUsage } = callbacks || {}

    const provider = this._getActiveProvider()
    if (!provider || !provider.apiKey) {
      console.error('[DirectApi] 未配置 API 提供商或 API Key 缺失, providers count:', this._providers.length)
      if (onError) onError(new Error('未配置 API 提供商或 API Key 缺失'))
      return null
    }

    let latestMessage: string
    if (Array.isArray(messages)) {
      latestMessage = (messages[messages.length - 1] as Record<string, unknown>)?.content as string || ''
    } else {
      latestMessage = messages || ''
    }

    const model = this._currentModel || this._getDefaultModel()
    console.log('[DirectApi] sendMessageStream: provider=%s baseUrl=%s model=%s', provider.name, provider.baseUrl, model)
    const body = JSON.stringify({
      model,
      messages: [{ role: 'user', content: latestMessage }],
      stream: true,
      stream_options: { include_usage: true },
      max_tokens: 4096,
    })

    const url = new URL(provider.baseUrl.replace(/\/+$/, '') + '/v1/chat/completions')
    const isHttps = url.protocol === 'https:'
    const transport = isHttps ? https : http

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body).toString(),
      'Accept': 'text/event-stream',
      'Authorization': `Bearer ${provider.apiKey}`,
    }

    const options: http.RequestOptions = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname,
      method: 'POST',
      timeout: this._requestTimeout,
      headers,
    }

    let fullContent = ''

    const req = transport.request(options, (res) => {
      console.log('[DirectApi] HTTP response: status=%d', res.statusCode)
      if (res.statusCode && res.statusCode >= 400) {
        let errBody = ''
        res.on('data', (c) => (errBody += c))
        res.on('end', () => {
          if (onError) onError(new Error(`${res.statusCode}: ${errBody.substring(0, 200)}`))
        })
        return
      }

      let buffer = ''
      let lastUsage: { input: number; output: number; totalTokens: number } | null = null
      let inputMessage = ''
      res.on('data', (chunk) => {
        buffer += chunk.toString()
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed || !trimmed.startsWith('data: ')) continue
          const payload = trimmed.slice(6)
          if (payload === "[DONE]") {
            console.log("[DirectApi] 收到 DONE 信号, lastUsage:", lastUsage)
            // 如果还没有 usage 数据，发送非流式请求获取
            if (!lastUsage && fullContent) {
              try {
                const https2 = require('https')
                const nonStreamBody = JSON.stringify({
                  model: model,
                  messages: [{ role: 'user', content: latestMessage }],
                  stream: false,
                  max_tokens: 10
                })
                const nonStreamReq = https2.request(url.href, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': headers['Authorization']
                  }
                }, (nonStreamRes) => {
                  let nonStreamData = ''
                  nonStreamRes.on('data', (c) => (nonStreamData += c))
                  nonStreamRes.on('end', () => {
                    try {
                      const parsed = JSON.parse(nonStreamData)
                      if (parsed.usage) {
                        lastUsage = {
                          input: parsed.usage.prompt_tokens || 0,
                          output: parsed.usage.completion_tokens || 0,
                          totalTokens: parsed.usage.total_tokens || 0
                        }
                        console.log('[DirectApi] 从非流式请求获取 usage:', lastUsage)
                      }
                    } catch (e) {
                      console.log('[DirectApi] 解析非流式响应失败:', (e as Error).message)
                    }
                    if (onUsage && lastUsage) onUsage(lastUsage)
                    if (onDone) onDone(fullContent, null, lastUsage || null, undefined)
                  })
                })
                nonStreamReq.write(nonStreamBody)
                nonStreamReq.end()
                return
              } catch (e) {
                console.log('[DirectApi] 非流式请求失败:', (e as Error).message)
              }
            }
            if (onUsage && lastUsage) {
              onUsage(lastUsage)
            }
            if (onDone) onDone(fullContent, null, lastUsage || null, undefined)
            return
          }
          try {
            const parsed = JSON.parse(payload)
            console.log('[DirectApi] parsed:', JSON.stringify(parsed).substring(0, 200))
            const choice = parsed.choices?.[0]
            if (!choice) {
              // 检查是否有 usage 数据（API 可能在 choices 为空时返回）
              if (parsed.usage && parsed.usage.prompt_tokens > 0) {
                lastUsage = {
                  input: parsed.usage.prompt_tokens || 0,
                  output: parsed.usage.completion_tokens || 0,
                  totalTokens: parsed.usage.total_tokens || 0
                }
                console.log('[DirectApi] 从空 choices 块获取 usage:', lastUsage)
                if (onUsage) onUsage(lastUsage)
              }
              continue
            }

            // 处理 tool_calls（如果 API 返回）
            if (choice.delta?.tool_calls && onUsage) {
              // tool call 暂不处理，直接忽略
            }

            const delta = choice.delta?.content
            if (delta) {
              fullContent += delta
              if (onChunk) onChunk(delta, fullContent)
            }

            if (choice.finish_reason === 'stop') {
              console.log('[DirectApi] finish_reason=stop, parsed.usage:', parsed.usage)
              const usage = parsed.usage
                ? { input: parsed.usage.prompt_tokens, output: parsed.usage.completion_tokens, totalTokens: parsed.usage.total_tokens }
                : null
              console.log('[DirectApi] extracted usage:', usage)
              // 调用 onUsage 传递 token 信息（与 Hermes 适配器行为一致）
              lastUsage = usage;
              if (onUsage && usage) {
                onUsage({ input: usage.input, output: usage.output, totalTokens: usage.totalTokens })
              }
              // 如果没有 usage 数据，发送非流式请求获取
              if (!usage && fullContent) {
                console.log('[DirectApi] 流式响应无 usage，发送非流式请求')
                const nonStreamBody = JSON.stringify({
                  model: model,
                  messages: [{ role: 'user', content: latestMessage }],
                  stream: false,
                  max_tokens: 10
                })
                const https2 = require('https')
                const nonStreamReq = https2.request(url.href, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': headers['Authorization']
                  }
                }, (nonStreamRes) => {
                  let nonStreamData = ''
                  nonStreamRes.on('data', (c) => (nonStreamData += c))
                  nonStreamRes.on('end', () => {
                    try {
                      const parsed2 = JSON.parse(nonStreamData)
                      if (parsed2.usage) {
                        lastUsage = {
                          input: parsed2.usage.prompt_tokens || 0,
                          output: parsed2.usage.completion_tokens || 0,
                          totalTokens: parsed2.usage.total_tokens || 0
                        }
                        console.log('[DirectApi] 非流式请求获取 usage:', lastUsage)
                        if (onUsage) onUsage(lastUsage)
                      }
                    } catch (e) {
                      console.log('[DirectApi] 解析非流式响应失败:', e.message)
                    }
                  })
                })
                nonStreamReq.write(nonStreamBody)
                nonStreamReq.end()
              }
            }
          } catch {
            // 解析失败的行跳过
          }
        }
      })

      res.on('end', () => {
        // 流结束时如果还没触发 done，补发
        if (fullContent && onDone) {
          onDone(fullContent, null, null, undefined)
        }
      })
    })

    req.on('error', (err) => {
      console.error('[DirectApi] Request error:', err.message)
      if (onError) onError(err)
    })

    req.on('timeout', () => {
      console.error('[DirectApi] Request timeout')
      req.destroy()
      if (onError) onError(new Error('请求超时'))
    })

    req.write(body)
    req.end()

    return req as http.ClientRequest
  }

  getCurrentModel(): string | null {
    return this._currentModel
  }

  async getModelInfo(): Promise<AdapterModelInfo> {
    const provider = this._getActiveProvider()
    const contextWindow = provider?.contextWindow ?? null
    return {
      model: this._currentModel || this._getDefaultModel(),
      contextWindow,
      contextUsed: null,
      usagePct: null,
    }
  }

  async listModels(): Promise<AdapterModelItem[]> {
    const provider = this._getActiveProvider()
    if (!provider) return []
    return (provider.models || []).map((model) => ({
      id: model,
      name: model,
      isDefault: model === provider.defaultModel,
      provider: provider.id,
    }))
  }

  setModel(modelId: string | null): { success: boolean; model: string | null } {
    this._currentModel = modelId
    return { success: true, model: modelId }
  }
}

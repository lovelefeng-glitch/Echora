import axios, { AxiosError } from 'axios'
import { loadConfig, type AIConfig } from './config'

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export interface ChatCompletionRequest {
  messages: ChatMessage[]
  model?: string
  stream?: boolean
  temperature?: number
  max_tokens?: number
}

export interface ChatCompletionResponse {
  id: string
  choices: Array<{
    index: number
    message: {
      role: string
      content: string
    }
    finish_reason: string
  }>
  usage?: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

export interface AIResponse {
  success: boolean
  content?: string
  error?: string
  usage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
  latencyMs: number
}

let config: AIConfig | null = null

function getConfig(): AIConfig {
  if (!config) config = loadConfig()
  return config
}

export async function askHermes(
  message: string,
  options: {
    model?: string
    temperature?: number
    maxTokens?: number
    timeoutMs?: number
  } = {}
): Promise<AIResponse> {
  const cfg = getConfig()
  const startTime = Date.now()

  try {
    const request: ChatCompletionRequest = {
      messages: [{ role: 'user', content: message }],
      stream: false,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 4096
    }
    if (options.model) request.model = options.model

    const response = await axios.post<ChatCompletionResponse>(
      `${cfg.hermes.baseUrl}/v1/chat/completions`,
      request,
      {
        headers: {
          'Authorization': `Bearer ${cfg.hermes.apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: options.timeoutMs ?? 300000  // 默认 5 分钟
      }
    )

    const latencyMs = Date.now() - startTime
    const choice = response.data.choices[0]

    return {
      success: true,
      content: choice?.message?.content,
      usage: response.data.usage ? {
        promptTokens: response.data.usage.prompt_tokens,
        completionTokens: response.data.usage.completion_tokens,
        totalTokens: response.data.usage.total_tokens
      } : undefined,
      latencyMs
    }
  } catch (error) {
    const latencyMs = Date.now() - startTime
    const axiosError = error as AxiosError

    return {
      success: false,
      error: axiosError.message || 'Unknown error',
      latencyMs
    }
  }
}

export async function askOpenClaw(
  message: string,
  options: {
    model?: string
    agentId?: string
    temperature?: number
    maxTokens?: number
    timeoutMs?: number
  } = {}
): Promise<AIResponse> {
  const cfg = getConfig()
  const startTime = Date.now()

  try {
    const request: ChatCompletionRequest = {
      messages: [{ role: 'user', content: message }],
      stream: false,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 4096
    }
    if (options.model) request.model = options.model

    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    }
    if (cfg.openclaw.token) {
      headers['Authorization'] = `Bearer ${cfg.openclaw.token}`
    }

    const response = await axios.post<ChatCompletionResponse>(
      `${cfg.openclaw.baseUrl}/v1/chat/completions`,
      request,
      {
        headers,
        timeout: options.timeoutMs ?? 300000  // 默认 5 分钟
      }
    )

    const latencyMs = Date.now() - startTime
    const choice = response.data.choices[0]

    return {
      success: true,
      content: choice?.message?.content,
      usage: response.data.usage ? {
        promptTokens: response.data.usage.prompt_tokens,
        completionTokens: response.data.usage.completion_tokens,
        totalTokens: response.data.usage.total_tokens
      } : undefined,
      latencyMs
    }
  } catch (error) {
    const latencyMs = Date.now() - startTime
    const axiosError = error as AxiosError

    return {
      success: false,
      error: axiosError.message || 'Unknown error',
      latencyMs
    }
  }
}

export async function checkStatus(hermesPort?: number, openclawPort?: number): Promise<{
  hermes: { running: boolean; port: number; latencyMs?: number }
  openclaw: { running: boolean; port: number; latencyMs?: number }
}> {
  const cfg = getConfig()
  const hermesP = hermesPort ?? cfg.hermes.port
  const openclawP = openclawPort ?? cfg.openclaw.port

  const [hermesResult, openclawResult] = await Promise.allSettled([
    checkPort(hermesP),
    checkPort(openclawP)
  ])

  return {
    hermes: {
      running: hermesResult.status === 'fulfilled' && hermesResult.value,
      port: hermesP,
      latencyMs: hermesResult.status === 'fulfilled' ? hermesResult.value : undefined
    },
    openclaw: {
      running: openclawResult.status === 'fulfilled' && openclawResult.value,
      port: openclawP,
      latencyMs: openclawResult.status === 'fulfilled' ? openclawResult.value : undefined
    }
  }
}

async function checkPort(port: number): Promise<number | false> {
  try {
    const startTime = Date.now()
    await axios.get(`http://127.0.0.1:${port}/v1/models`, {
      timeout: 2000
    })
    return Date.now() - startTime
  } catch {
    return false
  }
}

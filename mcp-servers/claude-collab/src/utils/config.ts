import fs from 'fs'
import path from 'path'
import os from 'os'
import yaml from 'js-yaml'

export interface AIConfig {
  hermes: {
    port: number
    apiKey: string
    baseUrl: string
  }
  openclaw: {
    port: number
    token: string
    baseUrl: string
  }
}

const DEFAULT_CONFIG: AIConfig = {
  hermes: {
    port: 8083,
    apiKey: '[REDACTED]',
    baseUrl: 'http://127.0.0.1:8083'
  },
  openclaw: {
    port: 18789,
    token: '',
    baseUrl: 'http://127.0.0.1:18789'
  }
}

export function loadConfig(): AIConfig {
  const config = { ...DEFAULT_CONFIG }

  // 尝试从 Echora 配置读取
  try {
    const echoraConfigPath = path.join(os.homedir(), 'AppData', 'Local', 'Echora', 'echora-config.json')
    if (fs.existsSync(echoraConfigPath)) {
      const raw = JSON.parse(fs.readFileSync(echoraConfigPath, 'utf8'))
      if (raw.hermesPort) config.hermes.port = raw.hermesPort
      if (raw.openclawPort) config.openclaw.port = raw.openclawPort
    }
  } catch (e) {
    // 忽略错误，使用默认值
  }

  // 尝试从 OpenClaw 配置读取 token
  try {
    const openclawConfigPath = path.join(os.homedir(), '.openclaw', 'openclaw.json')
    if (fs.existsSync(openclawConfigPath)) {
      const raw = JSON.parse(fs.readFileSync(openclawConfigPath, 'utf8'))
      if (raw.gateway?.auth?.token) config.openclaw.token = raw.gateway.auth.token
      if (raw.gateway?.port) config.openclaw.port = raw.gateway.port
    }
  } catch (e) {
    // 忽略错误
  }

  // 从环境变量覆盖
  if (process.env.HERMES_PORT) config.hermes.port = parseInt(process.env.HERMES_PORT)
  if (process.env.HERMES_API_KEY) config.hermes.apiKey = process.env.HERMES_API_KEY
  if (process.env.OPENCLAW_PORT) config.openclaw.port = parseInt(process.env.OPENCLAW_PORT)
  if (process.env.OPENCLAW_TOKEN) config.openclaw.token = process.env.OPENCLAW_TOKEN

  // 更新 baseUrl
  config.hermes.baseUrl = `http://127.0.0.1:${config.hermes.port}`
  config.openclaw.baseUrl = `http://127.0.0.1:${config.openclaw.port}`

  return config
}

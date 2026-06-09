import http from 'http'
import { create } from './utils/console-logger'
import type { BaseAdapter } from './adapters/base-adapter'

const _log = create('ApiServer')

interface ScanResultItem {
  name?: string
  category?: string
  found?: boolean
  path?: string | null
  source?: string | null
  gateway?: { running?: boolean; port?: number | null; pid?: number } | null
  [key: string]: unknown
}

interface APIContext {
  getConfig: () => Record<string, unknown>
  getState: () => Record<string, unknown>
  AIDetector: {
    scanAll: (paths: Record<string, string>) => Promise<Record<string, ScanResultItem>>
  }
  gatewayManager: {
    getAllStatus: () => Record<string, unknown>
  }
  getAdapters?: () => Record<string, BaseAdapter>
  doScan?: () => Promise<Record<string, ScanResultItem>>
}

type Handler = (body?: Record<string, unknown>, res?: http.ServerResponse) => Promise<unknown> | unknown

function createAPIServer(ctx: APIContext, port = 18790): http.Server {
  const handlers: Record<string, Handler> = {
    'GET /api/ping': () => ({ ok: true, time: Date.now() }),

    'GET /api/status': async () => {
      const config = ctx.getConfig()
      const detected = await ctx.AIDetector.scanAll((config.aiPaths as Record<string, string>) || {})
      const gateways = ctx.gatewayManager.getAllStatus()
      const aiList = Object.entries(detected).map(([id, info]) => ({
        id,
        name: info.name,
        path: info.path,
        found: info.found,
        status: info.gateway?.running ? 'running' : 'offline',
        port: info.gateway?.port || null,
      }))
      return {
        aiList,
        gateways,
        config: { aiPaths: (config.aiPaths as Record<string, string>) || {}, firstRun: config.firstRun },
      }
    },

    'POST /api/scan': async () => {
      const config = ctx.getConfig()
      const detected = await ctx.AIDetector.scanAll((config.aiPaths as Record<string, string>) || {})
      return {
        ok: true,
        detected: Object.entries(detected).map(([id, info]) => ({
          id,
          name: info.name,
          found: info.found,
          gateway: info.gateway?.running
            ? { port: info.gateway.port, pid: info.gateway.pid }
            : null,
        })),
      }
    },

    'GET /api/config': () => ctx.getConfig(),

    'GET /api/overview': async () => {
      const config = ctx.getConfig()
      const detected = await ctx.AIDetector.scanAll((config.aiPaths as Record<string, string>) || {})
      const running = Object.entries(detected)
        .filter(([, info]) => info.gateway?.running)
        .map(([id, info]) => `${id}:${info.gateway!.port}`)
      const configured = Object.keys((config.aiPaths as Record<string, string>) || {})
      return {
        app: 'Echora',
        version: '0.3.1',
        configuredAIs: configured,
        runningGateways: running,
        firstRun: !!config.firstRun,
      }
    },

    'GET /api/agents': async () => {
      const adapters = ctx.getAdapters ? ctx.getAdapters() : {}
      const agents: Array<Record<string, unknown>> = []
      for (const [aiType, adapter] of Object.entries(adapters)) {
        try {
          const list = await adapter.listAgents()
          agents.push(...list.map((item) => ({ ...item })))
        } catch (_e) {
          agents.push({
            agentKey: `${aiType}:main`,
            agentId: 'main',
            aiType,
            agentName: `${aiType} (默认)`,
            status: 'unknown',
          })
        }
      }
      return agents
    },

    'POST /api/send': async (body) => {
      console.log('[API] /api/send called:', JSON.stringify(body))
      const { agentKey, message } = body || {}
      if (!agentKey || !message) return { error: '需要 agentKey 和 message' }
      const [aiType, agentId] = (agentKey as string).split(':')
      const adapters = ctx.getAdapters ? ctx.getAdapters() : {}
      const adapter = adapters[aiType]
      if (!adapter) return { error: `适配器 ${aiType} 不存在` }
      try {
        const result = await adapter.sendMessage(agentId || 'main', message as string, `cli-${Date.now()}`)
        return { success: true, reply: result.message || result.content || '' }
      } catch (e) {
        return { error: (e as Error).message }
      }
    },

    'POST /api/send-stream': async (body, res) => {
      const { agentKey, message } = body || {}
      if (!agentKey || !message) return { error: '需要 agentKey 和 message' }
      const [aiType, agentId] = (agentKey as string).split(':')
      const adapters = ctx.getAdapters ? ctx.getAdapters() : {}
      const adapter = adapters[aiType]
      if (!adapter) return { error: `适配器 ${aiType} 不存在` }

      res!.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      })

      try {
        await adapter.sendMessageStream(agentId || 'main', message as string, {
          onChunk: (delta: string, content: string) => {
            res!.write(`data: ${JSON.stringify({ type: 'chunk', delta, content })}\n\n`)
          },
          onDone: (content: string, _error?: Error | null, metrics?: Record<string, unknown> | null) => {
            console.log("[API Server] onDone called, metrics:", metrics)
            res!.write(`data: ${JSON.stringify({ type: 'done', content, metrics })}\n\n`)
            res!.end()
          },
          onError: (error: Error) => {
            res!.write(`data: ${JSON.stringify({ type: 'error', message: error.message })}\n\n`)
            res!.end()
          },
          onToolCall: (info: Record<string, unknown>) => {
            res!.write(`data: ${JSON.stringify({ type: 'tool', ...info })}\n\n`)
          },
        }, `cli-${Date.now()}`)
      } catch (e) {
        res!.write(`data: ${JSON.stringify({ type: 'error', message: (e as Error).message })}\n\n`)
        res!.end()
      }
    },
  }

  const server = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      return res.end()
    }

    const key = `${req.method} ${req.url}`
    console.log('[API] Request:', key)
    const handler = handlers[key]

    if (!handler) {
      res.writeHead(404, { 'Content-Type': 'application/json' })
      return res.end(JSON.stringify({ error: 'not found', path: req.url }))
    }

    try {
      let body = ''
      if (req.method === 'POST') {
        await new Promise<void>((resolve) => {
          req.on('data', (c: Buffer) => (body += c.toString()))
          req.on('end', resolve)
        })
      }

      const isSSE = key.includes('stream')
      const result = handler.length > 0
        ? await handler(JSON.parse(body || '{}'), isSSE ? res : undefined)
        : await handler()

      if (!isSSE) {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(result, null, 2))
      }
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: (e as Error).message }))
    }
  })

  server.listen(port, '127.0.0.1', () => {
    _log.info('API server listening on http://127.0.0.1:' + port)
  })

  server.on('error', (e: NodeJS.ErrnoException) => {
    if (e.code === 'EADDRINUSE') {
      _log.warn('Port %d in use, trying %d', port, port + 1)
    } else {
      _log.error('API server error:', e.message)
    }
  })

  return server
}

export { createAPIServer }

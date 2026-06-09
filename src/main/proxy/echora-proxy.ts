import http from 'http'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { execSync } from 'child_process'
import { create } from '../utils/console-logger'

const _log = create('Proxy')

const PROXY_PORT = 8085
const UPSTREAM_URL = 'http://127.0.0.1:8083'
const LOG_DIR = path.join(os.homedir(), 'AppData', 'Local', 'Echora', 'logs')

if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true })

function log(level: string, msg: string, data?: Record<string, unknown>): void {
  try {
    const ts = new Date().toISOString()
    const line = `[${ts}] [${level}] ${msg}${data ? ' ' + JSON.stringify(data) : ''}\n`
    fs.appendFileSync(path.join(LOG_DIR, 'proxy.log'), line)
  } catch (_e) {}
}

function killPortProcess(port: number): boolean {
  try {
    const netstat = execSync('netstat -ano', { encoding: 'utf-8', timeout: 3000 })
    for (const line of netstat.split('\n')) {
      const m = line.match(
        new RegExp(`TCP\\s+127\\.0\\.0\\.1:${port}\\s+\\S+\\s+LISTENING\\s+(\\d+)`)
      )
      if (m) {
        const pid = parseInt(m[1], 10)
        if (pid && pid !== process.pid) {
          try {
            execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' })
            log('INFO', `Killed stale process on port ${port}`, { pid })
            return true
          } catch (_e) {}
        }
      }
    }
  } catch (_e) {}
  return false
}

interface StreamMetrics {
  startTime: number
  firstChunkTime: number | null
  chunks: number
  toolCalls: Array<{ name: string; index?: number }>
  usage: Record<string, unknown> | null
  model: string | null
  finishReason: string | null
}

const server = http.createServer((req, res) => {
  const startTime = Date.now()
  const targetUrl = new URL(req.url || '/', UPSTREAM_URL)

  let bodyChunks: Buffer[] = []
  req.on('data', (chunk: Buffer) => bodyChunks.push(chunk))
  req.on('end', () => {
    const body = Buffer.concat(bodyChunks)
    let bodyJson: Record<string, unknown> | null = null
    try {
      bodyJson = JSON.parse(body.toString())
    } catch (_e) {}

    const isStreaming = (bodyJson as Record<string, unknown> | null)?.stream === true
    const requestId = `proxy-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`

    log('INFO', `→ ${req.method} ${req.url}`, {
      requestId,
      model: (bodyJson as Record<string, unknown> | null)?.model as string,
      stream: isStreaming,
      contentLength: body.length,
    })

    const headers = { ...req.headers }
    headers.host = targetUrl.host
    delete headers['content-length']
    headers['content-length'] = String(body.length)

    const options: http.RequestOptions = {
      hostname: targetUrl.hostname,
      port: targetUrl.port,
      path: req.url,
      method: req.method,
      headers,
      timeout: 300000,
    }

    const proxyReq = http.request(options, (proxyRes) => {
      const latency = Date.now() - startTime

      if (!isStreaming) {
        let resBody: Buffer[] = []
        proxyRes.on('data', (chunk: Buffer) => resBody.push(chunk))
        proxyRes.on('end', () => {
          const fullBody = Buffer.concat(resBody).toString()
          let parsed: Record<string, unknown> | null = null
          try {
            parsed = JSON.parse(fullBody)
          } catch (_e) {}

          log('INFO', `← ${proxyRes.statusCode} (${latency}ms)`, {
            requestId,
            model: parsed?.model as string,
            usage: parsed?.usage as Record<string, unknown>,
          })

          res.writeHead(proxyRes.statusCode || 500, proxyRes.headers as http.OutgoingHttpHeaders)
          res.end(fullBody)
        })
        return
      }

      res.writeHead(proxyRes.statusCode || 500, proxyRes.headers as http.OutgoingHttpHeaders)

      let buffer = ''
      const metrics: StreamMetrics = {
        startTime,
        firstChunkTime: null,
        chunks: 0,
        toolCalls: [],
        usage: null,
        model: null,
        finishReason: null,
      }

      proxyRes.on('data', (chunk: Buffer) => {
        if (!metrics.firstChunkTime) metrics.firstChunkTime = Date.now()

        buffer += chunk.toString()
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        let metricsInjected = false

        for (const line of lines) {
          const trimmed = line.trim()

          if (trimmed.startsWith('event:')) {
            res.write(line + '\n')
            continue
          }

          if (!trimmed) {
            res.write('\n')
            continue
          }

          if (!trimmed.startsWith('data: ')) {
            res.write(line + '\n')
            continue
          }

          const payload = trimmed.slice(6).trim()
          metrics.chunks++

          try {
            const parsed = JSON.parse(payload)

            if (parsed.usage) {
              metrics.usage = parsed.usage
              metrics.model = parsed.model || metrics.model
            }

            const finishReason = parsed.choices?.[0]?.finish_reason
            if (finishReason) metrics.finishReason = finishReason

            const toolCalls = parsed.choices?.[0]?.delta?.tool_calls
            if (Array.isArray(toolCalls)) {
              for (const tc of toolCalls) {
                if (tc.function?.name) {
                  metrics.toolCalls.push({
                    name: tc.function.name,
                    index: tc.index,
                  })
                }
              }
            }

            if (parsed.model) metrics.model = parsed.model
          } catch (_e) {}

          res.write(line + '\n')

          if (payload === '[DONE]' && !metricsInjected) {
            metricsInjected = true
            const totalLatency = Date.now() - startTime
            const timeToFirstChunk = metrics.firstChunkTime
              ? metrics.firstChunkTime - startTime
              : null

            const metricsEvent = {
              requestId,
              latency: totalLatency,
              timeToFirstChunk,
              chunks: metrics.chunks,
              usage: metrics.usage,
              model: metrics.model,
              finishReason: metrics.finishReason,
              toolCalls:
                metrics.toolCalls.length > 0 ? metrics.toolCalls : undefined,
            }

            const metricsSSE = `event: echora.metrics\ndata: ${JSON.stringify(metricsEvent)}\n\n`
            res.write(metricsSSE)

            log('INFO', `← [DONE] (${totalLatency}ms, ${metrics.chunks} chunks)`, {
              requestId,
              usage: metrics.usage as unknown as Record<string, unknown>,
              toolCalls: metrics.toolCalls.length,
              timeToFirstChunk,
            })
          }
        }
      })

      proxyRes.on('end', () => {
        res.end()
      })

      proxyRes.on('error', (err: Error) => {
        log('ERROR', 'upstream error', { requestId, error: err.message })
        res.end()
      })
    })

    proxyReq.on('error', (err: Error) => {
      log('ERROR', 'proxy error', { requestId, error: err.message })
      res.writeHead(502, { 'Content-Type': 'application/json' })
      res.end(
        JSON.stringify({ error: { message: `Proxy error: ${err.message}`, type: 'proxy_error' } })
      )
    })

    proxyReq.on('timeout', () => {
      proxyReq.destroy()
      log('ERROR', 'upstream timeout', { requestId })
      res.writeHead(504, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: { message: 'Upstream timeout', type: 'timeout' } }))
    })

    if (body.length > 0) proxyReq.write(body)
    proxyReq.end()
  })
})

let proxyRetryCount = 0

function startProxy(): void {
  server.listen(PROXY_PORT, '127.0.0.1', () => {
    log('INFO', 'Echora Proxy started', { port: PROXY_PORT, upstream: UPSTREAM_URL })
    _log.info(`Listening on http://127.0.0.1:${PROXY_PORT}`)
    _log.info(`Upstream: ${UPSTREAM_URL}`)
  })
}

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE' && proxyRetryCount < 2) {
    proxyRetryCount++
    log('WARN', `Port ${PROXY_PORT} in use, killing stale process...`)
    _log.warn(`Port ${PROXY_PORT} in use, cleaning up...`)
    const killed = killPortProcess(PROXY_PORT)
    if (killed) {
      setTimeout(() => startProxy(), 500)
    } else {
      _log.error(`Could not free port ${PROXY_PORT}, proxy disabled`)
      log('ERROR', 'Could not free port, proxy disabled')
    }
  } else {
    _log.error('Error:', err.message)
    log('ERROR', `Proxy error: ${err.message}`)
  }
})

startProxy()

export { server, PROXY_PORT, UPSTREAM_URL }

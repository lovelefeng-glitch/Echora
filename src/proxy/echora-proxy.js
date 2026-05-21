/**
 * Echora Proxy — 轻量中间层
 * 
 * 架构: Echora → Proxy (8084) → Hermes (8083)
 * 
 * 功能:
 * 1. 透传所有请求到 Hermes
 * 2. 拦截 SSE 流，提取 token 用量、工具调用、延迟等
 * 3. 注入 echora.metrics SSE 事件
 * 4. 记录请求/响应日志
 * 
 * 用法:
 *   node src/proxy/echora-proxy.js [--port 8084] [--upstream http://127.0.0.1:8083]
 */

const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');
const os = require('os');

// ========== 配置 ==========
const PROXY_PORT = parseInt(process.argv.find((_, i, a) => a[i-1] === '--port') || '8084', 10);
const UPSTREAM_URL = process.argv.find((_, i, a) => a[i-1] === '--upstream') || 'http://127.0.0.1:8083';
const LOG_DIR = path.join(os.homedir(), 'AppData', 'Local', 'Echora', 'logs');

// ========== 日志 ==========
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

function log(level, msg, data) {
  try {
    const ts = new Date().toISOString();
    const line = `[${ts}] [${level}] ${msg}${data ? ' ' + JSON.stringify(data) : ''}\n`;
    fs.appendFileSync(path.join(LOG_DIR, 'proxy.log'), line);
  } catch (e) {}
}

// ========== 代理逻辑 ==========
const server = http.createServer((req, res) => {
  const startTime = Date.now();
  const targetUrl = new URL(req.url, UPSTREAM_URL);
  const isStream = req.headers.accept?.includes('text/event-stream') ||
    (req.method === 'POST' && req.url.includes('/chat/completions'));

  // 收集请求体
  let bodyChunks = [];
  req.on('data', chunk => bodyChunks.push(chunk));
  req.on('end', () => {
    const body = Buffer.concat(bodyChunks);
    let bodyJson = null;
    try { bodyJson = JSON.parse(body.toString()); } catch (e) {}

    const isStreaming = bodyJson?.stream === true;
    const requestId = `proxy-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    log('INFO', `→ ${req.method} ${req.url}`, {
      requestId,
      model: bodyJson?.model,
      stream: isStreaming,
      contentLength: body.length,
    });

    // 构建上游请求头
    const headers = { ...req.headers };
    headers.host = targetUrl.host;
    delete headers['content-length']; // 重新计算
    headers['content-length'] = body.length;

    const options = {
      hostname: targetUrl.hostname,
      port: targetUrl.port,
      path: req.url,
      method: req.method,
      headers,
      timeout: 300000,
    };

    const proxyReq = http.request(options, (proxyRes) => {
      const latency = Date.now() - startTime;

      // 非流式响应：直接转发
      if (!isStreaming) {
        let resBody = [];
        proxyRes.on('data', chunk => resBody.push(chunk));
        proxyRes.on('end', () => {
          const fullBody = Buffer.concat(resBody).toString();
          let parsed = null;
          try { parsed = JSON.parse(fullBody); } catch (e) {}

          log('INFO', `← ${proxyRes.statusCode} (${latency}ms)`, {
            requestId,
            model: parsed?.model,
            usage: parsed?.usage,
          });

          // 转发响应
          res.writeHead(proxyRes.statusCode, proxyRes.headers);
          res.end(fullBody);
        });
        return;
      }

      // 流式响应：拦截 SSE
      res.writeHead(proxyRes.statusCode, proxyRes.headers);

      let buffer = '';
      let currentEvent = '';
      let metrics = {
        startTime,
        firstChunkTime: null,
        chunks: 0,
        toolCalls: [],
        usage: null,
        model: null,
        finishReason: null,
      };

      proxyRes.on('data', (chunk) => {
        // 首个 chunk 计时
        if (!metrics.firstChunkTime) metrics.firstChunkTime = Date.now();

        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        let metricsInjected = false;

        for (const line of lines) {
          const trimmed = line.trim();

          // 追踪 SSE event type
          if (trimmed.startsWith('event:')) {
            currentEvent = trimmed.slice(6).trim();
            res.write(line + '\n');
            continue;
          }

          if (!trimmed) {
            currentEvent = '';
            res.write('\n');
            continue;
          }

          if (!trimmed.startsWith('data: ')) {
            res.write(line + '\n');
            continue;
          }

          const payload = trimmed.slice(6).trim();
          metrics.chunks++;

          // 解析 SSE data
          try {
            const parsed = JSON.parse(payload);

            // 提取 token usage
            if (parsed.usage) {
              metrics.usage = parsed.usage;
              metrics.model = parsed.model || metrics.model;
            }

            // 提取 finish_reason
            const finishReason = parsed.choices?.[0]?.finish_reason;
            if (finishReason) metrics.finishReason = finishReason;

            // 提取 tool_calls
            const toolCalls = parsed.choices?.[0]?.delta?.tool_calls;
            if (Array.isArray(toolCalls)) {
              for (const tc of toolCalls) {
                if (tc.function?.name) {
                  metrics.toolCalls.push({
                    name: tc.function.name,
                    index: tc.index,
                  });
                }
              }
            }

            // 提取 model
            if (parsed.model) metrics.model = parsed.model;

          } catch (e) {}

          // 转发原始 SSE data
          res.write(line + '\n');

          // 在 [DONE] 之前注入 echora.metrics
          if (payload === '[DONE]' && !metricsInjected) {
            metricsInjected = true;
            const totalLatency = Date.now() - startTime;
            const timeToFirstChunk = metrics.firstChunkTime ? metrics.firstChunkTime - startTime : null;

            const metricsEvent = {
              requestId,
              latency: totalLatency,
              timeToFirstChunk,
              chunks: metrics.chunks,
              usage: metrics.usage,
              model: metrics.model,
              finishReason: metrics.finishReason,
              toolCalls: metrics.toolCalls.length > 0 ? metrics.toolCalls : undefined,
            };

            const metricsSSE = `event: echora.metrics\ndata: ${JSON.stringify(metricsEvent)}\n\n`;
            res.write(metricsSSE);

            log('INFO', `← [DONE] (${totalLatency}ms, ${metrics.chunks} chunks)`, {
              requestId,
              usage: metrics.usage,
              toolCalls: metrics.toolCalls.length,
              timeToFirstChunk,
            });
          }
        }
      });

      proxyRes.on('end', () => {
        res.end();
      });

      proxyRes.on('error', (err) => {
        log('ERROR', `upstream error`, { requestId, error: err.message });
        res.end();
      });
    });

    proxyReq.on('error', (err) => {
      log('ERROR', `proxy error`, { requestId, error: err.message });
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { message: `Proxy error: ${err.message}`, type: 'proxy_error' } }));
    });

    proxyReq.on('timeout', () => {
      proxyReq.destroy();
      log('ERROR', `upstream timeout`, { requestId });
      res.writeHead(504, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { message: 'Upstream timeout', type: 'timeout' } }));
    });

    if (body.length > 0) proxyReq.write(body);
    proxyReq.end();
  });
});

// ========== 启动 ==========
server.listen(PROXY_PORT, '127.0.0.1', () => {
  log('INFO', `Echora Proxy started`, { port: PROXY_PORT, upstream: UPSTREAM_URL });
  console.log(`[Echora Proxy] 🚀 Listening on http://127.0.0.1:${PROXY_PORT}`);
  console.log(`[Echora Proxy] → Upstream: ${UPSTREAM_URL}`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[Echora Proxy] ❌ Port ${PROXY_PORT} already in use`);
  } else {
    console.error(`[Echora Proxy] ❌ Error:`, err.message);
  }
  process.exit(1);
});

module.exports = { server, PROXY_PORT, UPSTREAM_URL };

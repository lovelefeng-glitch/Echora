// Echora API Server v0.1
// 暴露 HTTP API，让外部 AI 可以控制 Echoa
// 集成到 Electron 主进程，自动随应用启动

const http = require('http');

/**
 * 创建 Echoa 控制 API 服务器
 * @param {object} ctx - { getState, doScan, getConfig, setConfig, gatewayManager, AIDetector }
 * @param {number} port - 默认 18790 (18789+1)
 */
function createAPIServer(ctx, port = 18790) {
  const handlers = {
    // 健康检查
    'GET /api/ping': () => ({ ok: true, time: Date.now() }),

    // 完整状态快照
    'GET /api/status': async () => {
      const config = ctx.getConfig();
      const detected = await ctx.AIDetector.scanAll(config.aiPaths || {});
      const gateways = ctx.gatewayManager.getAllStatus();
      const aiList = Object.entries(detected).map(([id, info]) => ({
        id, name: info.name, path: info.path,
        found: info.found, status: info.gateway?.running ? 'running' : 'offline',
        port: info.gateway?.port || null,
      }));
      return {
        aiList,
        gateways,
        config: { aiPaths: config.aiPaths || {}, firstRun: config.firstRun },
      };
    },

    // 触发重扫描
    'POST /api/scan': async () => {
      const config = ctx.getConfig();
      const detected = await ctx.AIDetector.scanAll(config.aiPaths || {});
      return {
        ok: true,
        detected: Object.entries(detected).map(([id, info]) => ({
          id, name: info.name, found: info.found,
          gateway: info.gateway?.running ? { port: info.gateway.port, pid: info.gateway.pid } : null,
        })),
      };
    },

    // 读配置
    'GET /api/config': () => ctx.getConfig(),

    // 匿名状态（给外部AI看，不含敏感信息）
    'GET /api/overview': async () => {
      const config = ctx.getConfig();
      const detected = await ctx.AIDetector.scanAll(config.aiPaths || {});
      const running = Object.entries(detected)
        .filter(([, info]) => info.gateway?.running)
        .map(([id, info]) => `${id}:${info.gateway.port}`);
      const configured = Object.keys(config.aiPaths || {});
      return {
        app: 'Echora',
        version: '0.3.1',
        configuredAIs: configured,
        runningGateways: running,
        firstRun: !!config.firstRun,
      };
    },
  };

  const server = http.createServer(async (req, res) => {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      return res.end();
    }

    const key = `${req.method} ${req.url}`;
    const handler = handlers[key];

    if (!handler) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'not found', path: req.url }));
    }

    try {
      // 读取 POST body
      let body = '';
      if (req.method === 'POST') {
        await new Promise((resolve) => {
          req.on('data', c => body += c);
          req.on('end', resolve);
        });
      }

      const result = handler.length > 0
        ? await handler(JSON.parse(body || '{}'))
        : await handler();

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result, null, 2));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
  });

  server.listen(port, '127.0.0.1', () => {
    console.log('[Echora API] ✅ http://127.0.0.1:' + port);
  });

  server.on('error', (e) => {
    if (e.code === 'EADDRINUSE') {
      console.log('[Echora API] ⚠️ Port %d in use, trying %d', port, port + 1);
      // 不重试，避免无限递归
    } else {
      console.error('[Echora API] ❌', e.message);
    }
  });

  return server;
}

module.exports = { createAPIServer };
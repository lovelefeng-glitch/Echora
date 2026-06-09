import fs from 'fs'
import http from 'http'
import { join } from 'path'
import { dialog, ipcMain, BrowserWindow } from 'electron'
import { create as createLog } from '../utils/console-logger'
import { EnvChecker } from '../detectors/env-checker'
import { AIDetector } from '../detectors/ai-detector'
import { ConfigManager } from '../managers/config-manager'
import { ConfigReader } from '../managers/config-reader'
import { DraftManager } from '../managers/draft-manager'
import { HermesAdapter, DIRECT_PORT as HERMES_PORT } from '../adapters/hermes-adapter'
import { adapters, getOrCreateAdapter } from '../adapter-factory'
import { scanOpenClawSkills } from './openclaw-handlers'
import { getAgentManager } from './echora-agent-handlers'
import { pendingConfirmResolve, pendingConfirmTimer } from '../tool-confirm'
import { setAllowedDirs } from '../tools'
import type { IpcRouter } from '../ipc-router'
import type {
  GatewayStatusMap,
  NormalizedConfig,
  MessageSendParams,
  MessageStreamParams,
  MessageAbortParams,
  ConvData,
  ConversationsBulkSaveParams,
  SkillsListResult,
  AiConfigListResult,
  AiConfigDiscoverResult,
  DraftPathsResult,
  UsageInfo,
  AIDetected
} from '../../shared/ipc-types'

const log = createLog('Common')

/**
 * 注册通用 IPC handler
 */
export function registerCommonHandlers(
  router: IpcRouter,
  getWindow: () => BrowserWindow | null,
  conversationsPath: string
): void {
  // ── 窗口控制 ──────────────────────────────────────────
  router.handle('window:minimize', () => {
    getWindow()?.minimize()
  })
  router.handle('window:maximize', () => {
    const win = getWindow()
    if (win) {
      if (win.isMaximized()) win.unmaximize()
      else win.maximize()
    }
  })
  router.handle('window:close', () => {
    getWindow()?.close()
  })
  router.handle('window:isMaximized', () => {
    const win = getWindow()
    return win ? win.isMaximized() : false
  })
  router.handle('window:setTheme', (_isLight: boolean) => {})

  // ── 技能列表 ──────────────────────────────────────────
  router.handle('skills:list', async (aiType: string): Promise<SkillsListResult> => {
    try {
      const home = process.env.USERPROFILE || process.env.HOME || '~'

      if (aiType === 'openclaw') {
        const result = scanOpenClawSkills()
        return { success: true, skills: result.skills, categories: result.categories }
      }

      const skillsPaths: Record<string, string> = {
        hermes: join(home, 'AppData', 'Local', 'hermes', 'skills'),
        qclaw: join(home, '.qclaw', 'skills'),
      }
      const skillsDir = skillsPaths[aiType] || skillsPaths.hermes
      if (!fs.existsSync(skillsDir)) return { success: true, skills: [], categories: [] }

      const skills: Array<{
        name: string
        category: string
        description: string
        path: string
      }> = []
      const categories = new Set<string>()

      function scanDir(dir: string, categoryName: string, depth: number): void {
        const entries = fs.readdirSync(dir, { withFileTypes: true })
        for (const entry of entries) {
          if (!entry.isDirectory()) continue
          if (entry.name.startsWith('.')) continue

          const skillMd = join(dir, entry.name, 'SKILL.md')
          const hasOwnSkill = fs.existsSync(skillMd)
          const childEntries = fs.readdirSync(join(dir, entry.name), { withFileTypes: true })
          const hasChildSkills = childEntries.some(
            (e) => e.isDirectory() && !e.name.startsWith('.') && fs.existsSync(join(dir, entry.name, e.name, 'SKILL.md'))
          )

          if (hasOwnSkill) {
            const content = fs.readFileSync(skillMd, 'utf8').substring(0, 500)
            const descMatch = content.match(/description:\s*(.+)/i)
            const desc = descMatch ? descMatch[1].trim().substring(0, 100) : ''
            const catName = depth === 0 && !hasChildSkills ? '其他' : depth === 0 ? entry.name : categoryName
            skills.push({ name: entry.name, category: catName, description: desc, path: skillMd })
            categories.add(catName)
          }

          if (hasChildSkills) {
            const catName = depth === 0 ? entry.name : `${categoryName}/${entry.name}`
            scanDir(join(dir, entry.name), catName, depth + 1)
          }
        }
      }

      scanDir(skillsDir, '', 0)
      return { success: true, skills, categories: Array.from(categories).sort() }
    } catch (e) {
      return { success: false, skills: [], categories: [], error: (e as Error).message }
    }
  })

  // ── 通用 Agent 操作 ──────────────────────────────────
  router.handle('agent:list', async (aiType: string) => {
    try {
      const adapter = getOrCreateAdapter(aiType || 'qclaw')
      const items = await adapter.listAgents()
      return items.map((item) => ({
        id: item.id,
        name: item.name,
        emoji: item.emoji ?? undefined,
        avatar: item.avatar ?? undefined,
        description: item.description,
      }))
    } catch (_e) {
      return [{ id: 'main', name: '默认 Agent', description: '' }]
    }
  })

  router.handle('agent:modelInfo', async (aiType: string, agentId?: string) => {
    try {
      // Echora Agent 不使用 adapter，从 agentProviders 配置读取 contextWindow
      if (aiType === 'echora') {
        const agentConfig = ConfigManager.get('agent') as Record<string, unknown> || {}
        const agentProviders = ConfigManager.get('agentProviders') as Array<Record<string, unknown>> || []
        const provider = agentProviders[0] || {}
        const contextWindow = (agentConfig.contextWindow as number) || (provider.contextWindow as number) || null
        return { model: agentConfig.defaultModel || provider.defaultModel || null, contextWindow, contextUsed: null, usagePct: null }
      }
      const adapter = getOrCreateAdapter(aiType)
      if (!adapter) return { model: null, contextWindow: null, contextUsed: null, usagePct: null }
      return await adapter.getModelInfo(agentId)
    } catch (_e) {
      return { model: null, contextWindow: null, contextUsed: null, usagePct: null }
    }
  })

  router.handle('agent:listModels', async (aiType: string, agentId?: string) => {
    try {
      const adapter = adapters.get(aiType)
      if (!adapter) return []
      return await adapter.listModels(agentId)
    } catch (_e) {
      return []
    }
  })

  router.handle('agent:setModel', async (aiType: string, modelId: string, agentId?: string) => {
    try {
      const adapter = adapters.get(aiType)
      if (!adapter) return { success: false, needsRestart: false, message: '适配器未找到' }
      let result
      if (typeof adapter.switchModel === 'function') {
        result = await adapter.switchModel(modelId, agentId)
      } else if (typeof adapter.setModel === 'function') {
        const r = adapter.setModel(modelId)
        result = { ...r, needsRestart: false }
      } else {
        return { success: false, needsRestart: false }
      }
      if (result.needsRestart && result.success) {
        try {
          const status = await adapter.getStatus()
          router?.send('gateway:statusChange', {
            aiType,
            status: status.status || 'running',
            port: (adapter as unknown as HermesAdapter).apiPort || HERMES_PORT,
          })
        } catch (_e) { log.warn('agent:setModel status notify failed:', (_e as Error).message) }
      }
      return result
    } catch (e) {
      return { success: false, needsRestart: false, error: (e as Error).message }
    }
  })

  // ── 消息操作 ──────────────────────────────────────────
  const activeStreams = new Map<string, http.ClientRequest>()

  router.handle('message:send', async (params: MessageSendParams) => {
    const { aiType, agentId, text } = params
    const adapter = getOrCreateAdapter(aiType || 'qclaw')
    return adapter.sendMessage(agentId || 'main', text, params.userId)
  })

  router.on('message:sendStream', async (params: MessageStreamParams) => {
    const { aiType, agentId, text, userId, msgId, attachments } = params
    log.info(`[message:sendStream] aiType=${aiType} agentId=${agentId} msgId=${msgId}`)
    const adapter = getOrCreateAdapter(aiType || 'qclaw')
    log.info(`[message:sendStream] adapter=${adapter?.name || 'null'} adapterType=${adapter?.constructor?.name || 'unknown'}`)

    // 检测"记住"指令并存储记忆
    const agentManager = getAgentManager()
    if (agentManager) {
      const memoryManager = agentManager.getMemoryManager()
      if (memoryManager) {
        const memoryContent = memoryManager.detectRememberCommand(text)
        if (memoryContent) {
          const category = memoryManager.inferCategory(memoryContent)
          memoryManager.add(memoryContent, category, 'user_explicit')
          log.info(`[memory] 用户记忆指令已处理: "${memoryContent.substring(0, 50)}..."`)
        }
      }
    }

    const send = (channel: string, data: Record<string, unknown>) => {
      const win = getWindow()
      if (win && !win.isDestroyed()) {
        if (channel === 'gateway:messageUsage') log.debug('send messageUsage to webContents')
        win.webContents.send(channel, { msgId, ...data })
      } else {
        if (channel === 'gateway:messageUsage') log.warn('send messageUsage FAILED: mainWindow unavailable')
      }
    }
    try {
      log.info(`[message:sendStream] calling adapter.sendMessageStream(${agentId || 'main'}, text=${text.substring(0, 50)}...)`)
      const req = adapter.sendMessageStream(agentId || 'main', text, {
        onChunk: (delta: string, fullContent: string) => {
          send('gateway:messageChunk', { delta, content: fullContent })
        },
        onDone: (fullContent: string, error?: Error | null, metrics?: Record<string, unknown> | null, sessionKey?: string) => {
          activeStreams.delete(msgId)
          if (error) send('gateway:messageDone', { error: error.message || String(error) })
          else send('gateway:messageDone', { content: fullContent, metrics: metrics || null, sessionKey: sessionKey || null })
        },
        onError: (error: Error) => {
          activeStreams.delete(msgId)
          send('gateway:messageDone', { error: error.message || String(error) })
        },
        onToolCall: (toolInfo: Record<string, unknown>) => {
          send('gateway:messageToolCall', { ...toolInfo, msgId })
        },
        onUsage: (usageInfo: Record<string, unknown>) => {
          log.debug('onUsage:', JSON.stringify(usageInfo))
          send('gateway:messageUsage', { ...usageInfo, aiType, agentId })
        },
        onThinking: (info: Record<string, unknown>) => {
          send('gateway:messageThinking', info)
        },
        onToolStep: (info: Record<string, unknown>) => {
          send('gateway:messageToolStep', info)
        },
      }, userId, attachments)
      log.info(`[message:sendStream] sendMessageStream returned: req=${req ? 'ok' : 'null'}`)
      if (req) activeStreams.set(msgId, req as http.ClientRequest)
    } catch (e) {
      log.error(`[message:sendStream] ERROR: ${(e as Error).message}`)
      log.error(`[message:sendStream] STACK: ${(e as Error).stack}`)
      send('gateway:messageDone', { error: (e as Error).message })
    }
  })

  router.on('message:abortStream', (params: MessageAbortParams) => {
    const { msgId } = params
    const req = msgId ? activeStreams.get(msgId) : null
    if (req) {
      try { req.destroy() } catch (_e) {}
      activeStreams.delete(msgId)
    }
  })

  router.handle('message:usage', async (params: { aiType: string; sessionKey?: string }) => {
    const adapter = adapters.get(params.aiType || 'openclaw')
    if (!adapter || !adapter._lastUsage) return null
    return adapter._lastUsage as unknown as UsageInfo
  })

  router.handle('message:status', async (aiType: string) => {
    const adapter = adapters.get(aiType || 'qclaw')
    if (!adapter) return { status: 'offline' }
    return adapter.getStatus()
  })

  // ── 配置管理 ──────────────────────────────────────────
  router.handle('config:get', async (key: string) => {
    return ConfigManager.get(key)
  })

  router.handle('config:set', async (key: string, value: unknown) => {
    return ConfigManager.set(key, value)
  })

  router.handle('config:getAll', async () => {
    return ConfigManager.getAll()
  })

  router.handle('fileWhitelist:save', async (dirs: string[]) => {
    ConfigManager.set('fileWhitelistDirs', dirs)
    setAllowedDirs(dirs)
    return true
  })

  // ── AI 检测与管理 ────────────────────────────────────
  router.handle('ai:setPath', async (aiType: string, exePath: string) => {
    const paths = (ConfigManager.get('aiPaths') as Record<string, string>) || {}
    paths[aiType] = exePath
    ConfigManager.set('aiPaths', paths)

    const removedAIs = (ConfigManager.get('removedAIs') as string[]) || []
    const filtered = removedAIs.filter((t) => t !== aiType)
    if (filtered.length !== removedAIs.length) {
      ConfigManager.set('removedAIs', filtered)
    }
    return true
  })

  router.handle('ai:removePath', async (aiType: string) => {
    const paths = (ConfigManager.get('aiPaths') as Record<string, string>) || {}
    delete paths[aiType]
    ConfigManager.set('aiPaths', paths)

    const gwConfigs = (ConfigManager.get('gatewayConfigs') as Record<string, unknown>) || {}
    if (gwConfigs[aiType]) {
      delete gwConfigs[aiType]
      ConfigManager.set('gatewayConfigs', gwConfigs)
    }

    // 停止运行中的网关进程
    const adapter = adapters.get(aiType)
    if (adapter) {
      try { await adapter.stop() } catch { /* ignore */ }
    }

    const removedAIs = (ConfigManager.get('removedAIs') as string[]) || []
    if (!removedAIs.includes(aiType)) {
      removedAIs.push(aiType)
      ConfigManager.set('removedAIs', removedAIs)
    }

    adapters.delete(aiType)
    return true
  })

  router.handle('ai:rescan', async () => {
    const paths = (ConfigManager.get('aiPaths') as Record<string, string>) || {}
    const result = await AIDetector.scanAll(paths) as unknown as AIDetected

    const autoPaths = (ConfigManager.get('autoRecordedPaths') as Record<string, string>) || {}
    for (const [aiType, autoPath] of Object.entries(autoPaths)) {
      const existing = (result as Record<string, unknown>)[aiType] as Record<string, unknown> | undefined
      if (existing?.source === 'manual') continue
      if (fs.existsSync(autoPath)) {
        const def = AIDetector.getKnownList().find((k) => k.id === aiType)
        ;(result as Record<string, unknown>)[aiType] = {
          name: def?.name || aiType,
          category: def?.category || 'unknown',
          found: true,
          path: autoPath,
          source: 'auto-recorded',
          verified: true,
        }
      }
    }
    return result
  })

  router.handle('ai:scan', async () => {
    const paths = (ConfigManager.get('aiPaths') as Record<string, string>) || {}
    const result = await AIDetector.scanAll(paths) as unknown as AIDetected

    const autoPaths = (ConfigManager.get('autoRecordedPaths') as Record<string, string>) || {}
    for (const [aiType, autoPath] of Object.entries(autoPaths)) {
      const existing = (result as Record<string, unknown>)[aiType] as Record<string, unknown> | undefined
      if (existing?.source === 'manual') continue
      if (fs.existsSync(autoPath)) {
        const def = AIDetector.getKnownList().find((k) => k.id === aiType)
        ;(result as Record<string, unknown>)[aiType] = {
          name: def?.name || aiType,
          category: def?.category || 'unknown',
          found: true,
          path: autoPath,
          source: 'auto-recorded',
          verified: true,
        }
      }
    }
    return result
  })

  router.handle('env:check', async () => {
    return EnvChecker.checkAll() as unknown as import('../../shared/ipc-types').StartupEnvCheckData
  })

  router.handle('ai:scanFull', async () => {
    const paths = (ConfigManager.get('aiPaths') as Record<string, string>) || {}
    const result = await AIDetector.scanFull(paths)
    return {
      discovered: Object.values(result.results) as unknown as import('../../shared/ipc-types').AIDetected[],
      configured: Object.values(result.results) as unknown as import('../../shared/ipc-types').AIDetected[],
    }
  })

  router.handle('ai:probePort', async (port: number) => {
    const result = await AIDetector.probePort(port)
    const r = result as unknown as Record<string, unknown>
    return {
      alive: r.alive as boolean,
      aiType: r.aiType as string | undefined,
      port: r.port as number | undefined,
      name: r.name as string | undefined,
    }
  })

  router.handle('ai:addDiscovered', async (params: { aiType: string; name?: string; port?: number; exePath?: string }) => {
    const { aiType, exePath, port } = params
    if (exePath) {
      ConfigManager.set('aiPaths', {
        ...(ConfigManager.get('aiPaths') as Record<string, string>),
        [aiType]: exePath,
      })
    }
    if (port) {
      ConfigManager.set('gatewayConfigs', {
        ...(ConfigManager.get('gatewayConfigs') as Record<string, unknown>),
        [aiType]: { port },
      })
    }

    const removedAIs = (ConfigManager.get('removedAIs') as string[]) || []
    const filtered = removedAIs.filter((t) => t !== aiType)
    if (filtered.length !== removedAIs.length) {
      ConfigManager.set('removedAIs', filtered)
    }
    return { success: true }
  })

  router.handle('env:install', async (tool: string) => {
    return EnvChecker.install(tool)
  })

  // ── 对话框 ────────────────────────────────────────────
  router.handle('dialog:openFile', async (options?: Electron.OpenDialogOptions) => {
    const opts: Electron.OpenDialogOptions = {
      title: options?.title || '选择 AI 程序文件',
      filters: [
        { name: '程序/脚本 (*.exe, *.cmd, *.bat)', extensions: ['exe', 'cmd', 'bat', 'ps1'] },
        { name: '所有文件 (*.*)', extensions: ['*'] },
      ],
      properties: ['openFile', 'dontAddToRecent'],
    }
    const win = getWindow()
    return dialog.showOpenDialog(win!, opts)
  })

  router.handle('dialog:openDir', async (options?: Electron.OpenDialogOptions) => {
    const opts: Electron.OpenDialogOptions = {
      title: options?.title || '选择 AI 安装目录',
      properties: ['openDirectory', 'dontAddToRecent'],
    }
    const win = getWindow()
    return dialog.showOpenDialog(win!, opts)
  })

  // ── AI 配置 ───────────────────────────────────────────
  router.handle('ai-config:set-path', async (aiType: string, filePath: string) => {
    const paths = (ConfigManager.get('aiConfigPaths') as Record<string, string>) || {}
    paths[aiType] = filePath
    ConfigManager.set('aiConfigPaths', paths)
    return true
  })

  router.handle('ai-config:read', async (aiType: string) => {
    const paths = (ConfigManager.get('aiConfigPaths') as Record<string, string>) || {}
    const filePath = paths[aiType]
    if (!filePath) return { success: false, error: `未注册 ${aiType} 的配置路径` }
    const result = ConfigReader.read(filePath)
    if (result.success && result.data) {
      const normalized = ConfigReader.normalize(aiType, result.data)
      return { success: true, data: normalized as unknown as NormalizedConfig, error: undefined }
    }
    return result
  })

  router.handle('ai-config:discover', async (): Promise<AiConfigDiscoverResult> => {
    return ConfigReader.discover()
  })

  router.handle('ai-config:list', async () => {
    const paths = (ConfigManager.get('aiConfigPaths') as Record<string, string>) || {}
    const list: AiConfigListResult = {}
    for (const [aiType, filePath] of Object.entries(paths)) {
      const result = ConfigReader.read(filePath)
      list[aiType] = {
        path: filePath,
        status: result.success ? 'ok' : 'error',
        preview: result.success && result.data
          ? ConfigReader.normalize(aiType, result.data) as unknown as NormalizedConfig
          : null,
        error: result.error || null,
      }
    }
    return list
  })

  // ── 草稿管理 ──────────────────────────────────────────
  router.handle('draft:read', async (aiType: string) => {
    return DraftManager.readDraft(aiType)
  })

  router.handle('draft:write', async (aiType: string, data: NormalizedConfig) => {
    return DraftManager.writeDraft(aiType, data)
  })

  router.handle('draft:save', async (aiType: string) => {
    return DraftManager.saveToOriginal(aiType)
  })

  router.handle('draft:reset', async (aiType: string) => {
    return DraftManager.resetDraft(aiType)
  })

  router.handle('draft:backups', async (aiType: string) => {
    return DraftManager.listBackups(aiType)
  })

  router.handle('draft:paths', async () => {
    return {
      qclaw: { original: DraftManager.getOriginalPath('qclaw'), draft: DraftManager.getDraftPath('qclaw') },
      openclaw: { original: DraftManager.getOriginalPath('openclaw'), draft: DraftManager.getDraftPath('openclaw') },
      hermes: { original: DraftManager.getOriginalPath('hermes'), draft: DraftManager.getDraftPath('hermes') },
    } as DraftPathsResult
  })

  // ── 会话管理 ──────────────────────────────────────────
  const CONV_DIR = join(__dirname, '..', '..', 'conversations')
  function getConvPath(agentKey: string, convId: string): string {
    const parts = agentKey.split(':')
    const aiType = parts[0] || 'unknown'
    const agentId = parts[1] || '__default__'
    const safeId = convId.replace(/[\\/:*?"<>|]/g, '_')
    return join(CONV_DIR, aiType, agentId, `${safeId}.json`)
  }
  function ensureDir(dir: string): void {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  }

  router.handle('conv:list', async (agentKey?: string) => {
    const parts = agentKey ? agentKey.split(':') : []
    let searchDir = CONV_DIR
    if (parts[0]) searchDir = join(CONV_DIR, parts[0])
    if (parts[1]) searchDir = join(CONV_DIR, parts[0], parts[1])
    const result: Record<string, Record<string, ConvData>> = {}
    if (!fs.existsSync(searchDir)) return result

    const walk = (dir: string, key: string): void => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          walk(join(dir, entry.name), key ? `${key}:${entry.name}` : entry.name)
        } else if (entry.name.endsWith('.json')) {
          const convId = entry.name.replace('.json', '')
          try {
            const conv = JSON.parse(fs.readFileSync(join(dir, entry.name), 'utf8'))
            if (!result[key]) result[key] = {}
            result[key][convId] = conv
          } catch (_e) { log.warn('Conversation parse failed:', (_e as Error).message) }
        }
      }
    }

    if (agentKey) {
      if (fs.existsSync(searchDir)) walk(searchDir, agentKey)
    } else {
      walk(CONV_DIR, '')
    }
    return result
  })

  router.handle('conv:get', async (agentKey: string, convId: string) => {
    const p = getConvPath(agentKey, convId)
    if (!fs.existsSync(p)) return null
    try {
      return JSON.parse(fs.readFileSync(p, 'utf8'))
    } catch {
      return null
    }
  })

  router.handle('conv:save', async (agentKey: string, convId: string, conv: ConvData) => {
    const p = getConvPath(agentKey, convId)
    ensureDir(require('path').dirname(p))
    fs.writeFileSync(p, JSON.stringify(conv, null, 2), 'utf8')
    return true
  })

  router.handle('conv:delete', async (agentKey: string, convId: string) => {
    const p = getConvPath(agentKey, convId)
    if (fs.existsSync(p)) fs.unlinkSync(p)
    const dir = require('path').dirname(p)
    if (fs.existsSync(dir) && fs.readdirSync(dir).length === 0) {
      const parent = require('path').dirname(dir)
      if (fs.existsSync(parent) && fs.readdirSync(parent).length === 0) {
        fs.rmdirSync(parent)
      }
      fs.rmdirSync(dir)
    }
    return true
  })

  router.handle('conv:deleteAll', async (agentKey: string) => {
    const parts = agentKey ? agentKey.split(':') : []
    let dir = CONV_DIR
    if (parts[0]) dir = join(CONV_DIR, parts[0])
    if (parts[1]) dir = join(CONV_DIR, parts[0], parts[1])
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true })
    }
    return true
  })

  router.handle('conversations:save', async (params: ConversationsBulkSaveParams) => {
    try {
      const dir = require('path').dirname(conversationsPath)
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(conversationsPath, JSON.stringify(params, null, 2), 'utf8')
      return true
    } catch {
      return false
    }
  })

  router.handle('conversations:load', async () => {
    try {
      if (!conversationsPath || !fs.existsSync(conversationsPath)) return {}
      return JSON.parse(fs.readFileSync(conversationsPath, 'utf8'))
    } catch {
      return {}
    }
  })

  // ── 工具确认 IPC ──────────────────────────────────────
  ipcMain.handle('tool:confirm-response', (_event, confirmed: boolean) => {
    if (pendingConfirmTimer) {
      clearTimeout(pendingConfirmTimer)
    }
    if (pendingConfirmResolve) {
      pendingConfirmResolve(confirmed)
      log.info(`用户确认响应: ${confirmed ? '确认' : '取消'}`)
    }
  })

  ipcMain.handle('tool:confirm-cancel', () => {
    if (pendingConfirmTimer) {
      clearTimeout(pendingConfirmTimer)
    }
    if (pendingConfirmResolve) {
      pendingConfirmResolve(false)
      log.info('用户取消了工具确认')
    }
  })
}

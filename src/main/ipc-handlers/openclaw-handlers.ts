import fs from 'fs'
import { create as createLog } from '../utils/console-logger'
import { OpenClawAdapter } from '../adapters/openclaw-adapter'
import { getOrCreateAdapter, setOpenclawToken } from '../adapter-factory'
import type { IpcRouter } from '../ipc-router'
import type { OcSession, OcSessionHistoryMessage } from '../../shared/ipc-types'

const log = createLog('OpenClaw')

/** OpenClaw 端口（模块内维护） */
let openclawPort = 18789

/**
 * 加载 OpenClaw 配置文件，提取 token 和端口
 */
export function loadOpenClawConfig(): void {
  try {
    const home = process.env.USERPROFILE || process.env.HOME || '~'
    const cfg = JSON.parse(
      fs.readFileSync(require('path').join(home, '.openclaw', 'openclaw.json'), 'utf8')
    )
    const token = cfg.gateway?.auth?.token || ''
    openclawPort = cfg.gateway?.port || 18789
    setOpenclawToken(token)
    log.info('OpenClaw token loaded (port %d)', openclawPort)
  } catch (e) {
    log.warn('OpenClaw config not found:', (e as Error).message)
  }
}

/**
 * 扫描 OpenClaw 技能目录，返回技能列表
 * 供 common-handlers 中 skills:list 使用
 */
export function scanOpenClawSkills(): {
  skills: Array<{ name: string; category: string; description: string; path: string; enabled: boolean }>
  categories: string[]
} {
  const home = process.env.USERPROFILE || process.env.HOME || '~'
  const ocConfigPath = require('path').join(home, '.openclaw', 'openclaw.json')
  const enabledMap: Record<string, boolean> = {}
  if (fs.existsSync(ocConfigPath)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(ocConfigPath, 'utf8'))
      const entries = cfg.skills?.entries || {}
      for (const [k, v] of Object.entries(entries) as Array<[string, { enabled?: boolean }]>) {
        enabledMap[k] = v.enabled !== false
      }
    } catch (_e) { log.warn('OpenClaw skills config parse failed:', (_e as Error).message) }
  }

  const skills: Array<{
    name: string
    category: string
    description: string
    path: string
    enabled: boolean
  }> = []
  const categories = new Set<string>()

  function scanOCDir(dir: string, source: string): void {
    if (!fs.existsSync(dir)) return
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!e.isDirectory() || e.name.startsWith('.')) continue
      const skillMd = require('path').join(dir, e.name, 'SKILL.md')
      if (fs.existsSync(skillMd)) {
        const content = fs.readFileSync(skillMd, 'utf8').substring(0, 500)
        const descMatch = content.match(/description:\s*(.+)/i)
        const desc = descMatch ? descMatch[1].trim().substring(0, 100) : ''
        const enabled = enabledMap[e.name] !== false
        skills.push({
          name: e.name,
          category: source,
          description: desc,
          path: skillMd,
          enabled,
        })
        categories.add(source)
      }
    }
  }

  const npmGlobal = require('path').join(home, 'AppData', 'Roaming', 'npm', 'node_modules')
  const bundledDir = require('path').join(npmGlobal, 'openclaw', 'skills')
  scanOCDir(bundledDir, '内置技能')

  const managedDir = require('path').resolve(require('path').join(home, '.openclaw', 'skills'))
  scanOCDir(managedDir, '已安装技能')

  const ocDir = require('path').join(home, '.openclaw')
  if (fs.existsSync(ocDir)) {
    for (const e of fs.readdirSync(ocDir, { withFileTypes: true })) {
      if (e.isDirectory() && e.name.startsWith('workspace-')) {
        const agentName = e.name.replace('workspace-', '')
        const wsSkills = require('path').join(ocDir, e.name, 'skills')
        scanOCDir(wsSkills, agentName + ' 技能')
      }
    }
  }

  if (fs.existsSync(ocConfigPath)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(ocConfigPath, 'utf8'))
      const extraDirs: string[] = cfg.skills?.load?.extraDirs || []
      for (const d of extraDirs) {
        const resolved = require('path').resolve(d.replace(/^~/, home))
        if (resolved !== managedDir && fs.existsSync(resolved)) {
          scanOCDir(resolved, '额外技能')
        }
      }
    } catch (_e) { log.warn('OpenClaw extra dirs scan failed:', (_e as Error).message) }
  }

  return { skills, categories: Array.from(categories).sort() }
}

/**
 * 注册 OpenClaw 相关的 IPC handler
 */
export function registerOpenClawHandlers(router: IpcRouter): void {
  router.handle('oc-sessions:list', async (aiType: string, opts?: Record<string, unknown>) => {
    const adapter = getOrCreateAdapter(aiType || 'openclaw') as OpenClawAdapter
    if (!adapter || !adapter.listSessions) throw new Error('适配器不支持会话列表')
    const result = await adapter.listSessions(opts || {})
    return result as OcSession[]
  })

  router.handle('oc-sessions:history', async (sessionKey: string, limit?: number) => {
    const adapter = getOrCreateAdapter('openclaw') as OpenClawAdapter
    if (!adapter || !adapter.getSessionHistory) throw new Error('适配器不支持会话历史')
    const result = await adapter.getSessionHistory(sessionKey, limit)
    return result as OcSessionHistoryMessage[]
  })

  router.handle('oc-sessions:create', async (params: Record<string, unknown>) => {
    const adapter = getOrCreateAdapter('openclaw') as OpenClawAdapter
    if (!adapter || !adapter.createSession) throw new Error('适配器不支持创建会话')
    return adapter.createSession(params) as Promise<unknown>
  })

  router.handle('oc-sessions:delete', async (sessionKey: string) => {
    const adapter = getOrCreateAdapter('openclaw') as OpenClawAdapter
    if (!adapter || !adapter.deleteSession) throw new Error('适配器不支持删除会话')
    await adapter.deleteSession(sessionKey)
    return true
  })

  router.handle('oc-sessions:reset', async (sessionKey: string) => {
    const adapter = getOrCreateAdapter('openclaw') as OpenClawAdapter
    if (!adapter || !adapter.resetSession) throw new Error('适配器不支持重置会话')
    await adapter.resetSession(sessionKey)
    return true
  })
}

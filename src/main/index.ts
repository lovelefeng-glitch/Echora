import { app, BrowserWindow, dialog, Tray, Menu, nativeImage, session, shell } from 'electron'
import { join } from 'path'
import { exec } from 'child_process'
import fs from 'fs'
import http from 'http'
import { create as createLog } from './utils/console-logger'
import { createDatabaseManager } from './store/db-manager'

const is = { dev: !app.isPackaged }
import { IpcRouter } from './ipc-router'
import { EnvChecker } from './detectors/env-checker'
import { AIDetector } from './detectors/ai-detector'
import { GatewayManager } from './managers/gateway-manager'
import { ConfigManager } from './managers/config-manager'
import { createAPIServer } from './api-server'
import { setAllowedDirs } from './tools'
import { adapters, getOrCreateAdapter, loadQclawConfig, setGatewayManagerRef } from './adapter-factory'
import { loadOpenClawConfig } from './ipc-handlers/openclaw-handlers'
import { getHermesProfilePorts } from './ipc-handlers/hermes-handlers'
import { registerAllHandlers } from './ipc-handlers'
import { initToolConfirm, setupToolConfirmCallback } from './tool-confirm'
import { initStatusPolling, startStatusPolling } from './status-polling'
import { HermesAdapter, DIRECT_PORT as HERMES_PORT } from './adapters/hermes-adapter'
import { DraftManager } from './managers/draft-manager'

const log = createLog('Echora')

process.on('uncaughtException', (err) => {
  const msg = err?.message || String(err)
  if (msg.includes('ECONNREFUSED') || msg.includes('WebSocket') || msg.includes('closed before')) {
    log.warn('Suppressed uncaught:', msg)
  } else {
    log.error('Uncaught exception:', err)
  }
})
process.on('unhandledRejection', (reason) => {
  const msg = (reason as Error)?.message || String(reason)
  if (msg.includes('ECONNREFUSED') || msg.includes('WebSocket') || msg.includes('closed before')) {
    log.warn('Suppressed unhandled rejection:', msg)
  } else {
    log.error('Unhandled rejection:', reason)
  }
})

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let isQuitting = false
let gatewayManager: GatewayManager | null = null
let apiServer: http.Server | null = null
let ipcRouter: IpcRouter | null = null
let conversationsPath = ''

// ── 窗口创建 ──────────────────────────────────────────

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    title: 'Echora',
    icon: join(__dirname, '..', '..', 'assets', 'icon.png'),
    titleBarStyle: 'hidden',
    titleBarOverlay: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
    },
    backgroundColor: ConfigManager.get('theme') === 'light' ? '#F0F2F5' : '#353535',
    show: false,
  })

  if (gatewayManager) gatewayManager.setMainWindow(mainWindow)

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  if (is.dev) mainWindow.webContents.openDevTools()

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
    runStartupChecks()
  })

  mainWindow.on('close', (event) => {
    if (!isQuitting && tray) {
      event.preventDefault()
      mainWindow?.hide()
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  if (ipcRouter) {
    mainWindow.on('maximize', () => {
      ipcRouter?.send('window:maximized', { maximized: true })
    })
    mainWindow.on('unmaximize', () => {
      ipcRouter?.send('window:maximized', { maximized: false })
    })
  }

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (is.dev && process.env['ELECTRON_RENDERER_URL'] && url.startsWith(process.env['ELECTRON_RENDERER_URL'])) {
      return
    }
    if (!is.dev && url.startsWith('file://')) {
      return
    }
    event.preventDefault()
    shell.openExternal(url)
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url && (url.startsWith('http:') || url.startsWith('https:'))) {
      shell.openExternal(url)
    }
    return { action: 'deny' }
  })
}

// ── 系统托盘 ──────────────────────────────────────────

function createTray(): void {
  const iconPath = join(__dirname, '..', '..', 'assets', 'icon.png')
  let icon: Electron.NativeImage
  try {
    icon = nativeImage.createFromPath(iconPath)
    if (process.platform === 'win32') {
      icon = icon.resize({ width: 16, height: 16 })
    }
  } catch (_e) {
    icon = nativeImage.createEmpty()
  }

  tray = new Tray(icon)
  tray.setToolTip('Echora - AI Hub')

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '显示 Echora',
      click: () => {
        if (mainWindow) {
          mainWindow.show()
          mainWindow.focus()
        }
      },
    },
    { type: 'separator' },
    {
      label: '退出 Echora',
      click: () => {
        isQuitting = true
        app.quit()
      },
    },
  ])

  tray.setContextMenu(contextMenu)

  tray.on('click', () => {
    if (!mainWindow) return
    if (mainWindow.isVisible()) {
      mainWindow.focus()
    } else {
      mainWindow.show()
      mainWindow.focus()
    }
  })

  app.on('activate', () => {
    if (mainWindow) {
      mainWindow.show()
      mainWindow.focus()
    } else {
      createWindow()
    }
  })
}

// ── 启动检测 ──────────────────────────────────────────

async function runStartupChecks(): Promise<void> {
  const config = ConfigManager.getAll()

  if (config.firstRun !== false) {
    const envResult = await EnvChecker.checkAll()
    ipcRouter?.send('startup:env-check', envResult as never)
  }

  const gateways = await AIDetector.scanGateways()
  // 收集已知的 hermes profile 端口
  const startupProfilePorts = getHermesProfilePorts()
  for (const [aiType, info] of Object.entries(gateways)) {
    if (info.running && gatewayManager && info.port) {
      if (aiType === 'hermes' && startupProfilePorts.has(info.port)) continue
      gatewayManager.attach(aiType, { pid: info.pid, port: info.port, url: info.url || undefined })
      log.info(`自动接管 ${aiType} 网关 (端口 ${info.port})`)
    }
  }

  // Hermes 主实例状态确认
  const hermesAdapter = getOrCreateAdapter('hermes')
  try {
    const hermesStatus = await hermesAdapter.getStatus()
    if (hermesStatus.status === 'running' && gatewayManager) {
      gatewayManager.attach('hermes', {
        pid: hermesStatus.pid || 0,
        port: (hermesAdapter as unknown as HermesAdapter).apiPort || HERMES_PORT,
        url: `http://127.0.0.1:${(hermesAdapter as unknown as HermesAdapter).apiPort || HERMES_PORT}`,
      })
      log.success('Hermes 状态确认: running (via getStatus)')
    }
  } catch (_e) { log.warn('Hermes status check failed:', (_e as Error).message) }

  const aiPaths = config.aiPaths || {}
  const configured: Record<string, Record<string, unknown>> = {}
  for (const [aiType, aiPath] of Object.entries(aiPaths)) {
    const def = AIDetector.getKnownList().find((k) => k.id === aiType)
    configured[aiType] = {
      name: def?.name || aiType,
      category: def?.category || 'unknown',
      found: true,
      path: aiPath as string,
      source: 'manual',
      verified: true,
    }
  }
  ipcRouter?.send('startup:ai-detected', configured as unknown as import('../shared/ipc-types').AIDetected)

  if (gatewayManager) {
    const gwStatus = gatewayManager.getAllStatus()
    ipcRouter?.send('gateway:statusAll', gwStatus as never)
  }

  if (config.firstRun !== false) {
    ConfigManager.set('firstRun', false)
  }

  DraftManager.initAll()
  startStatusPolling()
}

// ── 端口冲突检测 ──────────────────────────────────────

function checkPortConflict(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    exec(
      `netstat -ano | findstr :${port} | findstr LISTENING`,
      { timeout: 3000 },
      (err, stdout) => {
        if (err || !stdout || !stdout.trim()) {
          return resolve(false)
        }

        const m = stdout.trim().split(/\r?\n/)[0].match(/(\d+)$/)
        const pid = m ? m[1] : '?'

        dialog
          .showMessageBox({
            type: 'warning',
            title: 'Echora - 端口冲突',
            message: '检测到 Echora 已在运行',
            detail: `端口 ${port} 已被占用 (PID ${pid})。\n\n点击「关闭旧进程」将终止旧实例并重新启动。\n点击「取消」则退出本次启动。`,
            buttons: ['关闭旧进程', '取消'],
            defaultId: 0,
            cancelId: 1,
            noLink: true,
          })
          .then(({ response }) => {
            if (response === 0) {
              exec(`taskkill /pid ${pid} /T /F`, (killErr) => {
                if (killErr) {
                  log.warn('taskkill 失败:', killErr.message)
                }
                setTimeout(() => resolve(true), 2000)
              })
            } else {
              app.quit()
              resolve(false)
            }
          })
      }
    )
  })
}

// ── 单实例锁：防止多开 ──
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.show()
      mainWindow.focus()
    }
  })
}

app.whenReady().then(async () => {
  if (!gotTheLock) return
  app.setAppUserModelId('com.echora.app')

  // 修复 CDN 防盗链 403：为外部图片请求注入 Referer 头
  const AVATAR_DOMAINS = ['aiarea.qclaw.qq.com', 'qclawimage']
  session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
    const url = details.url
    if (AVATAR_DOMAINS.some((d) => url.includes(d)) || /\.(png|jpg|jpeg|gif|svg|webp)($|\?)/i.test(url)) {
      details.requestHeaders['Referer'] = new URL(url).origin + '/'
    }
    callback({ requestHeaders: details.requestHeaders })
  })

  const configDir = is.dev ? join(__dirname, '..', '..') : join(__dirname)
  const configPath = join(configDir, 'echora-config.json')
  conversationsPath = join(configDir, 'echora-conversations.json')

  if (!fs.existsSync(configPath)) {
    const oldPath = join(app.getPath('userData'), 'echora-config.json')
    if (fs.existsSync(oldPath)) {
      try {
        const oldData = JSON.parse(fs.readFileSync(oldPath, 'utf8'))
        const { conversations, ...rest } = oldData
        fs.writeFileSync(configPath, JSON.stringify(rest, null, 2), 'utf8')
        if (conversations && Object.keys(conversations).length > 0) {
          fs.writeFileSync(conversationsPath, JSON.stringify(conversations, null, 2), 'utf8')
        }
        console.log('[Echora] 已从 AppData 迁移配置到项目目录')
      } catch (e) {
        console.error('[Echora] 迁移失败:', (e as Error).message)
      }
    }
  }

  ConfigManager.init(configPath)
  const savedWhitelist = ConfigManager.get('fileWhitelistDirs') as string[] | undefined
  if (savedWhitelist && savedWhitelist.length > 0) {
    setAllowedDirs(savedWhitelist)
  }
  if (!fs.existsSync(conversationsPath)) {
    const convs = ConfigManager.get('conversations') as Record<string, unknown> | null
    if (convs && Object.keys(convs).length > 0) {
      fs.writeFileSync(conversationsPath, JSON.stringify(convs, null, 2), 'utf8')
      ConfigManager.set('conversations', null)
    }
  }

  // 初始化 SQLite 数据库
  try {
    const dbManager = createDatabaseManager()
    await dbManager.initialize()
    log.success('SQLite 数据库初始化完成')
  } catch (e) {
    log.error('SQLite 数据库初始化失败:', (e as Error).message)
    // 继续运行，使用旧存储
  }

  await checkPortConflict(18790)

  gatewayManager = new GatewayManager()
  setGatewayManagerRef(gatewayManager)

  loadQclawConfig()
  loadOpenClawConfig()

  // 初始化工具确认模块
  initToolConfirm(() => mainWindow)

  // 创建 IPC 路由并注册所有 handler
  ipcRouter = new IpcRouter({ getWindow: () => mainWindow })
  registerAllHandlers(ipcRouter, {
    getWindow: () => mainWindow,
    getGatewayManager: () => gatewayManager,
    conversationsPath,
  })

  setupToolConfirmCallback()

  // 初始化状态轮询
  initStatusPolling({
    getWindow: () => mainWindow,
    getGatewayManager: () => gatewayManager,
    getRouter: () => ipcRouter,
  })

  createWindow()
  createTray()

  apiServer = createAPIServer(
    {
      getConfig: () => ConfigManager.getAll() as unknown as Record<string, unknown>,
      getState: () => ({}),
      AIDetector: {
        scanAll: async (paths: Record<string, string>) => {
          return AIDetector.scanAll(paths) as unknown as Record<string, Record<string, unknown>>
        },
      },
      gatewayManager: gatewayManager!,
      getAdapters: () => Object.fromEntries(adapters),
      doScan: async () => {
        return AIDetector.scanAll(
          (ConfigManager.getAll().aiPaths as Record<string, string>) || {}
        ) as unknown as Record<string, Record<string, unknown>>
      },
    },
    9300
  )
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
  }
})

app.on('before-quit', () => {
  isQuitting = true
  if (apiServer) {
    apiServer.close()
    apiServer = null
  }
  if (gatewayManager) {
    gatewayManager.shutdownAll()
  }
})

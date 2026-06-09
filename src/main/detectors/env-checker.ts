import { execSync, exec } from 'child_process'

interface AutoInstallConfig {
  win?: { cmd: string; fallback?: string }
  mac?: { cmd: string }
  linux?: { cmd: string }
}

interface ToolDefinition {
  name: string
  category: 'required' | 'recommended'
  description: string
  checkCmd: string
  versionPattern: RegExp
  minVersion: string
  installUrl: string
  autoInstall: AutoInstallConfig | null
  whyNeed: string
}

export interface ToolCheckResult {
  name: string
  installed: boolean
  version: string | null
  versionOk: boolean
  output?: string
  error?: string
  installUrl?: string
  canAutoInstall?: boolean
}

export interface InstallResult {
  success: boolean
  message: string
  installUrl?: string
}

const REQUIRED_ENV: Record<string, ToolDefinition> = {
  node: {
    name: 'Node.js',
    category: 'required',
    description: 'JavaScript 运行时',
    checkCmd: 'node --version',
    versionPattern: /v(\d+\.\d+\.\d+)/,
    minVersion: '18.0.0',
    installUrl: 'https://nodejs.org/zh-cn/download/',
    autoInstall: {
      win: {
        cmd: 'winget install OpenJS.NodeJS.LTS --silent --accept-package-agreements',
        fallback: 'winget install OpenJS.NodeJS --silent --accept-package-agreements',
      },
      mac: {
        cmd: 'brew install node',
      },
      linux: {
        cmd: 'curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt-get install -y nodejs',
      },
    },
    whyNeed: 'Electron 和大部分 AI 工具的运行环境',
  },
  python: {
    name: 'Python',
    category: 'recommended',
    description: 'Python 解释器',
    checkCmd: 'python --version || python3 --version || py --version',
    versionPattern: /Python\s+(\d+\.\d+\.\d+)/,
    minVersion: '3.8.0',
    installUrl: 'https://www.python.org/downloads/',
    autoInstall: {
      win: {
        cmd: 'winget install Python.Python.3.12 --silent --accept-package-agreements',
      },
      mac: {
        cmd: 'brew install python@3.12',
      },
      linux: {
        cmd: 'sudo apt-get install -y python3 python3-pip',
      },
    },
    whyNeed: '部分 AI 工具的脚本依赖',
  },
  git: {
    name: 'Git',
    category: 'recommended',
    description: '版本控制工具',
    checkCmd: 'git --version',
    versionPattern: /git version (\d+\.\d+\.\d+)/,
    minVersion: '2.30.0',
    installUrl: 'https://git-scm.com/downloads',
    autoInstall: {
      win: {
        cmd: 'winget install Git.Git --silent --accept-package-agreements',
      },
      mac: {
        cmd: 'brew install git',
      },
      linux: {
        cmd: 'sudo apt-get install -y git',
      },
    },
    whyNeed: '克隆和管理 AI 项目仓库',
  },
  npm: {
    name: 'npm',
    category: 'required',
    description: 'Node.js 包管理器',
    checkCmd: 'npm --version',
    versionPattern: /(\d+\.\d+\.\d+)/,
    minVersion: '8.0.0',
    installUrl: 'https://nodejs.org/zh-cn/download/',
    autoInstall: null,
    whyNeed: '安装和管理 JavaScript 依赖',
  },
}

export const EnvChecker = {
  async checkAll(): Promise<Record<string, ToolCheckResult>> {
    const results: Record<string, ToolCheckResult> = {}
    for (const key of Object.keys(REQUIRED_ENV)) {
      results[key] = await EnvChecker.check(key)
    }
    return results
  },

  async check(toolKey: string): Promise<ToolCheckResult> {
    const def = REQUIRED_ENV[toolKey]
    if (!def) return { name: toolKey, installed: false, version: null, versionOk: false, error: '未知工具' }

    try {
      let output: string
      try {
        output = execSync(def.checkCmd, {
          encoding: 'utf-8',
          timeout: 5000,
          stdio: ['pipe', 'pipe', 'pipe'],
        }).trim()
      } catch (e) {
        if (toolKey === 'python') {
          output = execSync('py --version', { encoding: 'utf-8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] }).trim()
        } else {
          throw e
        }
      }

      const version = EnvChecker.parseVersion(output!, def.versionPattern)
      const versionOk = version !== null && EnvChecker.compareVersion(version, def.minVersion) >= 0

      return {
        name: def.name,
        installed: true,
        version,
        versionOk,
        output: output!.trim(),
      }

    } catch (e) {
      return {
        name: def.name,
        installed: false,
        version: null,
        versionOk: false,
        error: (e as Error).message,
        installUrl: def.installUrl,
        canAutoInstall: !!def.autoInstall,
      }
    }
  },

  async install(toolKey: string): Promise<InstallResult> {
    const def = REQUIRED_ENV[toolKey]
    if (!def) return { success: false, message: '未知工具' }
    if (!def.autoInstall) return { success: false, message: '该工具不支持自动安装，请手动安装: ' + def.installUrl }

    const platform = process.platform === 'win32' ? 'win' :
                     process.platform === 'darwin' ? 'mac' : 'linux'
    const installConfig = def.autoInstall[platform]
    if (!installConfig) return { success: false, message: '当前平台不支持自动安装' }

    return new Promise((resolve) => {
      exec(installConfig!.cmd, { timeout: 300000 }, (error) => {
        if (error && 'fallback' in installConfig! && installConfig!.fallback) {
          exec(installConfig!.fallback, { timeout: 300000 }, (err2) => {
            if (err2) {
              resolve({
                success: false,
                message: `自动安装失败: ${err2.message}。请手动安装: ${def.installUrl}`,
                installUrl: def.installUrl,
              })
            } else {
              resolve({ success: true, message: `${def.name} 安装成功!` })
            }
          })
          return
        }

        if (error) {
          resolve({
            success: false,
            message: `自动安装失败: ${error.message}。请手动安装: ${def.installUrl}`,
            installUrl: def.installUrl,
          })
        } else {
          resolve({ success: true, message: `${def.name} 安装成功!` })
        }
      })
    })
  },

  parseVersion(output: string, pattern: RegExp): string | null {
    const match = output.match(pattern)
    return match ? match[1] : null
  },

  compareVersion(v1: string, v2: string): number {
    const parts1 = v1.split('.').map(Number)
    const parts2 = v2.split('.').map(Number)
    for (let i = 0; i < 3; i++) {
      if ((parts1[i] || 0) > (parts2[i] || 0)) return 1
      if ((parts1[i] || 0) < (parts2[i] || 0)) return -1
    }
    return 0
  },
}

// 环境检查器
// 自动检测运行 Echora 所需的环境依赖，并支持自动安装

const { execSync, exec } = require('child_process');
const os = require('os');
const fs = require('fs');
const path = require('path');

/**
 * 所需环境清单
 */
const REQUIRED_ENV = {
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
        // Windows: 使用 winget
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
    // npm 随 Node.js 安装，不需要单独安装
    autoInstall: null,
    whyNeed: '安装和管理 JavaScript 依赖',
  },
};

const EnvChecker = {
  /**
   * 检查所有环境
   * @returns {object} 检查结果
   */
  async checkAll() {
    const results = {};
    for (const [key, def] of Object.entries(REQUIRED_ENV)) {
      results[key] = await this.check(key);
    }
    return results;
  },

  /**
   * 检查单个工具
   */
  async check(toolKey) {
    const def = REQUIRED_ENV[toolKey];
    if (!def) return { name: toolKey, error: '未知工具' };

    try {
      let output;
      try {
        output = execSync(def.checkCmd, {
          encoding: 'utf-8',
          timeout: 5000,
          stdio: ['pipe', 'pipe', 'pipe'],
        }).trim();
      } catch (e) {
        // 尝试备用命令
        if (toolKey === 'python') {
          output = execSync('py --version', { encoding: 'utf-8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
        } else {
          throw e;
        }
      }

      const version = this.parseVersion(output, def.versionPattern);
      const versionOk = version && this.compareVersion(version, def.minVersion) >= 0;

      return {
        name: def.name,
        installed: true,
        version,
        versionOk,
        output: output.trim(),
      };

    } catch (e) {
      return {
        name: def.name,
        installed: false,
        version: null,
        versionOk: false,
        error: e.message,
        installUrl: def.installUrl,
        canAutoInstall: !!def.autoInstall,
      };
    }
  },

  /**
   * 自动安装某工具
   * @returns {Promise<{success: boolean, message: string}>}
   */
  async install(toolKey) {
    const def = REQUIRED_ENV[toolKey];
    if (!def) return { success: false, message: '未知工具' };
    if (!def.autoInstall) return { success: false, message: '该工具不支持自动安装，请手动安装: ' + def.installUrl };

    const platform = process.platform === 'win32' ? 'win' : 
                     process.platform === 'darwin' ? 'mac' : 'linux';
    const installConfig = def.autoInstall[platform];
    if (!installConfig) return { success: false, message: '当前平台不支持自动安装' };

    return new Promise((resolve) => {
      exec(installConfig.cmd, { timeout: 300000 }, (error, stdout, stderr) => {
        if (error && installConfig.fallback) {
          // 尝试备用安装命令
          exec(installConfig.fallback, { timeout: 300000 }, (err2, out2, err22) => {
            if (err2) {
              resolve({
                success: false,
                message: `自动安装失败: ${err2.message}。请手动安装: ${def.installUrl}`,
                installUrl: def.installUrl,
              });
            } else {
              resolve({ success: true, message: `${def.name} 安装成功!` });
            }
          });
          return;
        }

        if (error) {
          resolve({
            success: false,
            message: `自动安装失败: ${error.message}。请手动安装: ${def.installUrl}`,
            installUrl: def.installUrl,
          });
        } else {
          resolve({ success: true, message: `${def.name} 安装成功!` });
        }
      });
    });
  },

  // ========== 辅助方法 ==========

  parseVersion(output, pattern) {
    const match = output.match(pattern);
    return match ? match[1] : null;
  },

  compareVersion(v1, v2) {
    const parts1 = v1.split('.').map(Number);
    const parts2 = v2.split('.').map(Number);
    for (let i = 0; i < 3; i++) {
      if ((parts1[i] || 0) > (parts2[i] || 0)) return 1;
      if ((parts1[i] || 0) < (parts2[i] || 0)) return -1;
    }
    return 0;
  },
};

module.exports = EnvChecker;
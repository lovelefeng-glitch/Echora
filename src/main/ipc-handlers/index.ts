import { BrowserWindow } from 'electron'
import type { IpcRouter } from '../ipc-router'
import type { GatewayManager } from '../managers/gateway-manager'
import { registerGatewayHandlers } from './gateway-handlers'
import { registerHermesHandlers } from './hermes-handlers'
import { registerOpenClawHandlers } from './openclaw-handlers'
import { registerEchoraAgentHandlers, initAgentManager } from './echora-agent-handlers'
import { registerCommonHandlers } from './common-handlers'
import { registerFileSystemHandlers } from './file-system-handlers'

/**
 * 注册所有 IPC handler
 * 按网关/软件维度分模块注册
 */
export function registerAllHandlers(
  router: IpcRouter,
  deps: {
    getWindow: () => BrowserWindow | null
    getGatewayManager: () => GatewayManager | null
    conversationsPath: string
  }
): void {
  // 初始化 Agent 管理器（异步加载）
  initAgentManager()

  // 通用网关生命周期
  registerGatewayHandlers(router, deps.getGatewayManager)

  // Hermes 网关专用
  registerHermesHandlers(router, deps.getGatewayManager)

  // OpenClaw 网关专用
  registerOpenClawHandlers(router)

  // Echora Agent + 直连API
  registerEchoraAgentHandlers(router)

  // 通用功能（窗口、配置、会话、消息等）
  registerCommonHandlers(router, deps.getWindow, deps.conversationsPath)

  // 文件系统
  registerFileSystemHandlers()
}

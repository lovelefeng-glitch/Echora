/**
 * Agent 容错工具函数
 * 来源：app-store (agents, gatewayStatus, activeAgentKey)
 * 输出：findFirstOnlineAgent, validateActiveAgent
 * 依赖：app-store 类型, ipc-types
 */
import { useAppStore, type AgentInfo } from '../stores/app-store'
import type { GatewayStatusMap } from '../../shared/ipc-types'

/**
 * 找到第一个网关在线的 agent key
 * @param agents - agent Map
 * @param gatewayStatus - 网关状态 Map
 * @returns 第一个在线 agent 的 key，或 null
 */
export function findFirstOnlineAgent(
  agents: Map<string, AgentInfo>,
  gatewayStatus: GatewayStatusMap
): string | null {
  for (const [key, agent] of agents) {
    // 直连 API agent 和 Echora 内置 agent 不依赖网关
    if (key.startsWith('direct-api:') || agent.aiType === 'echora') continue
    const status = gatewayStatus[agent.aiType]?.status
    if (status === 'running') return key
  }
  return null
}

/**
 * 校验并执行 agent fallback
 * 仅在 activeAgentKey 对应的 agent 不存在时自动切换；网关停止时不做自动切换
 */
export function validateAndFallbackAgent(
  agents: Map<string, AgentInfo>,
  gatewayStatus: GatewayStatusMap
): void {
  const activeAgentKey = useAppStore.getState().activeAgentKey
  if (!activeAgentKey) return

  // 直连 API agent 和 Echora 内置 agent 不依赖网关，跳过
  if (activeAgentKey.startsWith('direct-api:') || activeAgentKey.startsWith('echora:')) return

  // agent 仍存在 → 有效（网关停止时由 ChatArea 处理引导）
  if (agents.has(activeAgentKey)) return

  // agent 不存在 → 尝试 fallback 到首位在线 agent
  const fallbackKey = findFirstOnlineAgent(agents, gatewayStatus)
  if (fallbackKey) {
    useAppStore.getState().setActiveAgent(fallbackKey)
  } else {
    useAppStore.setState({ activeAgentKey: null })
    try { window.echora?.config?.set('lastActiveAgent', null) } catch { /* ignore */ }
  }
}

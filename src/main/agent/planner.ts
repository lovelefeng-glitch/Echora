/**
 * 任务规划器
 * P4阶段：任务分解与多步推理
 */

import { create } from '../utils/console-logger'
import type { LLMProvider } from '../llm/provider-interface'
import type { ChatMessage } from '../llm/types'

const log = create('Planner')

/** 计划步骤状态 */
export type StepStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped'

/** 计划步骤 */
export interface PlanStep {
  /** 步骤 ID */
  id: string
  /** 步骤序号 */
  index: number
  /** 步骤目标 */
  goal: string
  /** 依赖的步骤 ID */
  dependencies: string[]
  /** 预期使用的工具 */
  expectedTools?: string[]
  /** 成功标准 */
  successCriteria?: string
  /** 当前状态 */
  status: StepStatus
  /** 执行结果 */
  result?: string
  /** 错误信息 */
  error?: string
  /** 重试次数 */
  retryCount: number
}

/** 执行计划 */
export interface Plan {
  /** 计划 ID */
  id: string
  /** 原始用户请求 */
  originalRequest: string
  /** 计划步骤 */
  steps: PlanStep[]
  /** 创建时间 */
  createdAt: number
  /** 更新时间 */
  updatedAt: number
  /** 当前状态 */
  status: 'pending' | 'executing' | 'completed' | 'failed' | 'cancelled'
  /** 当前执行步骤索引 */
  currentStepIndex: number
}

/** 规划器配置 */
export interface PlannerConfig {
  /** 最大步骤数 */
  maxSteps: number
  /** 最大重试次数 */
  maxRetries: number
  /** 是否启用用户审批 */
  enableUserApproval: boolean
}

/** 默认配置 */
const DEFAULT_PLANNER_CONFIG: PlannerConfig = {
  maxSteps: 15,
  maxRetries: 1,
  enableUserApproval: true
}

/**
 * 任务规划器
 */
export class Planner {
  private _provider: LLMProvider
  private _config: PlannerConfig
  private _currentPlan: Plan | null = null

  constructor(provider: LLMProvider, config?: Partial<PlannerConfig>) {
    this._provider = provider
    this._config = { ...DEFAULT_PLANNER_CONFIG, ...config }
  }

  /**
   * 生成执行计划
   */
  async createPlan(request: string): Promise<Plan> {
    log.info('生成执行计划:', request.substring(0, 100))

    const planId = `plan_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    // 使用 LLM 生成计划
    const steps = await this._generateSteps(request)

    const plan: Plan = {
      id: planId,
      originalRequest: request,
      steps,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      status: 'pending',
      currentStepIndex: 0
    }

    this._currentPlan = plan
    log.info(`计划生成完成: ${steps.length} 个步骤`)

    return plan
  }

  /**
   * 使用 LLM 生成步骤
   */
  private async _generateSteps(request: string): Promise<PlanStep[]> {
    const prompt = `你是一个任务规划专家。请将以下用户请求分解为可执行的步骤序列。

用户请求: ${request}

请以 JSON 格式返回步骤列表，格式如下:
{
  "steps": [
    {
      "goal": "步骤目标",
      "dependencies": [],  // 依赖的步骤序号（从0开始）
      "expectedTools": ["工具名称"],
      "successCriteria": "成功标准"
    }
  ]
}

要求:
1. 每个步骤应该是原子的、可验证的
2. 步骤之间有明确的依赖关系
3. 最多 ${this._config.maxSteps} 个步骤
4. 只返回 JSON，不要其他内容`

    try {
      const response = await this._provider.chat({
        model: this._provider.config.defaultModel,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3
      })

      // 解析 JSON
      const jsonMatch = response.match(/\{[\s\S]*\}/)
      if (!jsonMatch) {
        throw new Error('无法解析计划 JSON')
      }

      const parsed = JSON.parse(jsonMatch[0])
      const rawSteps = parsed.steps || []

      // 转换为 PlanStep
      return rawSteps.map((step: any, index: number) => ({
        id: `step_${index}`,
        index,
        goal: step.goal || `步骤 ${index + 1}`,
        dependencies: (step.dependencies || []).map((dep: number) => `step_${dep}`),
        expectedTools: step.expectedTools || [],
        successCriteria: step.successCriteria,
        status: 'pending' as StepStatus,
        retryCount: 0
      }))
    } catch (error) {
      log.error('生成计划失败:', error)
      // 返回单步骤计划
      return [{
        id: 'step_0',
        index: 0,
        goal: request,
        dependencies: [],
        status: 'pending',
        retryCount: 0
      }]
    }
  }

  /**
   * 获取当前计划
   */
  getCurrentPlan(): Plan | null {
    return this._currentPlan
  }

  /**
   * 获取下一个待执行步骤
   */
  getNextStep(): PlanStep | null {
    if (!this._currentPlan) {
      return null
    }

    // 找到第一个满足依赖条件的待执行步骤
    for (const step of this._currentPlan.steps) {
      if (step.status !== 'pending') {
        continue
      }

      // 检查依赖是否都已完成
      const dependenciesMet = step.dependencies.every(depId => {
        const depStep = this._currentPlan!.steps.find(s => s.id === depId)
        return depStep?.status === 'completed'
      })

      if (dependenciesMet) {
        return step
      }
    }

    return null
  }

  /**
   * 更新步骤状态
   */
  updateStepStatus(stepId: string, status: StepStatus, result?: string, error?: string): void {
    if (!this._currentPlan) {
      return
    }

    const step = this._currentPlan.steps.find(s => s.id === stepId)
    if (!step) {
      return
    }

    step.status = status
    if (result) {
      step.result = result
    }
    if (error) {
      step.error = error
    }

    this._currentPlan.updatedAt = Date.now()

    // 检查计划是否完成
    this._checkPlanCompletion()
  }

  /**
   * 检查计划完成状态
   */
  private _checkPlanCompletion(): void {
    if (!this._currentPlan) {
      return
    }

    const allCompleted = this._currentPlan.steps.every(s => s.status === 'completed')
    const anyFailed = this._currentPlan.steps.some(s => s.status === 'failed')

    if (allCompleted) {
      this._currentPlan.status = 'completed'
      log.info('计划执行完成')
    } else if (anyFailed) {
      this._currentPlan.status = 'failed'
      log.warn('计划执行失败')
    }
  }

  /**
   * 重试失败步骤
   */
  retryStep(stepId: string): boolean {
    if (!this._currentPlan) {
      return false
    }

    const step = this._currentPlan.steps.find(s => s.id === stepId)
    if (!step || step.status !== 'failed') {
      return false
    }

    if (step.retryCount >= this._config.maxRetries) {
      log.warn(`步骤 ${stepId} 已达到最大重试次数`)
      return false
    }

    step.status = 'pending'
    step.retryCount++
    step.error = undefined

    return true
  }

  /**
   * 取消计划
   */
  cancelPlan(): void {
    if (this._currentPlan) {
      this._currentPlan.status = 'cancelled'
      log.info('计划已取消')
    }
  }

  /**
   * 重置规划器
   */
  reset(): void {
    this._currentPlan = null
  }

  /**
   * 生成计划摘要（用于展示给用户）
   */
  generatePlanSummary(): string {
    if (!this._currentPlan) {
      return '无执行计划'
    }

    const lines = ['执行计划:']
    for (const step of this._currentPlan.steps) {
      const statusIcon = this._getStatusIcon(step.status)
      const deps = step.dependencies.length > 0
        ? ` (依赖: ${step.dependencies.map(d => d.replace('step_', '#')).join(', ')})`
        : ''
      lines.push(`${statusIcon} ${step.index + 1}. ${step.goal}${deps}`)
    }

    return lines.join('\n')
  }

  /**
   * 获取状态图标
   */
  private _getStatusIcon(status: StepStatus): string {
    switch (status) {
      case 'pending': return '⏳'
      case 'in_progress': return '🔄'
      case 'completed': return '✅'
      case 'failed': return '❌'
      case 'skipped': return '⏭️'
      default: return '❓'
    }
  }
}

/**
 * 创建规划器实例
 */
export function createPlanner(provider: LLMProvider, config?: Partial<PlannerConfig>): Planner {
  return new Planner(provider, config)
}

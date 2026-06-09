/**
 * Agent 功能自动化测试脚本
 * 用于验证 Agent IPC 通信和 Provider 配置
 */

import { getAgentManager } from '../src/main/agent/agent-manager'
import { getProviderRegistry } from '../src/main/llm/provider-registry'
import type { DirectApiConfig } from '../src/shared/types'

// 测试配置
const TEST_PROVIDER: DirectApiConfig = {
  id: 'test_openai',
  name: 'Test OpenAI',
  baseUrl: 'https://api.openai.com/v1',
  apiKey: 'test-api-key',
  models: ['gpt-3.5-turbo', 'gpt-4'],
  defaultModel: 'gpt-3.5-turbo'
}

async function runTests() {
  console.log('=== Agent 功能自动化测试 ===\n')

  // 测试 1: Provider 注册
  console.log('测试 1: Provider 注册')
  try {
    const providerRegistry = getProviderRegistry()
    const provider = providerRegistry.create({
      id: TEST_PROVIDER.id,
      name: TEST_PROVIDER.name,
      type: 'openai',
      baseUrl: TEST_PROVIDER.baseUrl,
      apiKey: TEST_PROVIDER.apiKey,
      models: TEST_PROVIDER.models,
      defaultModel: TEST_PROVIDER.defaultModel
    })
    console.log('✓ Provider 注册成功')

    // 验证 Provider 存在
    const retrieved = providerRegistry.get(TEST_PROVIDER.id)
    if (retrieved) {
      console.log('✓ Provider 获取成功')
    } else {
      console.error('✗ Provider 获取失败')
    }
  } catch (error) {
    console.error('✗ Provider 注册失败:', error)
  }

  // 测试 2: Agent Manager 初始化
  console.log('\n测试 2: Agent Manager 初始化')
  try {
    const agentManager = getAgentManager()
    console.log('✓ Agent Manager 初始化成功')

    // 测试 3: 创建 Agent
    console.log('\n测试 3: 创建 Agent')
    const agent = agentManager.createAgent({
      id: 'test_agent',
      name: 'Test Agent',
      providerId: TEST_PROVIDER.id,
      model: TEST_PROVIDER.defaultModel,
      maxSteps: 5,
      temperature: 0.7
    })
    console.log('✓ Agent 创建成功')

    // 验证 Agent 存在
    const retrievedAgent = agentManager.getAgent('test_agent')
    if (retrievedAgent) {
      console.log('✓ Agent 获取成功')
      console.log('  Agent 状态:', retrievedAgent.state)
      console.log('  Agent 配置:', retrievedAgent.config)
    } else {
      console.error('✗ Agent 获取失败')
    }
  } catch (error) {
    console.error('✗ Agent Manager 测试失败:', error)
  }

  // 测试 4: Agent 运行（非流式）
  console.log('\n测试 4: Agent 运行（非流式）')
  try {
    const agentManager = getAgentManager()
    const result = await agentManager.runAgent('test_agent', 'Hello, this is a test message.')
    console.log('✓ Agent 运行完成')
    console.log('  结果:', result)
  } catch (error) {
    console.error('✗ Agent 运行失败:', error)
  }

  // 测试 5: Agent 运行（流式）
  console.log('\n测试 5: Agent 运行（流式）')
  try {
    const agentManager = getAgentManager()
    const controller = agentManager.runAgentStream('test_agent', 'Hello, this is a streaming test.', (event) => {
      console.log('  流式事件:', event.type)
    })
    console.log('✓ Agent 流式运行启动成功')
    console.log('  使用 controller.abort() 可以取消')

    // 延迟 1 秒后取消
    await new Promise(resolve => setTimeout(resolve, 1000))
    controller.abort()
    console.log('✓ Agent 流式运行取消成功')
  } catch (error) {
    console.error('✗ Agent 流式运行失败:', error)
  }

  // 测试 6: 清理
  console.log('\n测试 6: 清理')
  try {
    const agentManager = getAgentManager()
    agentManager.destroyAgent('test_agent')
    console.log('✓ Agent 销毁成功')

    const providerRegistry = getProviderRegistry()
    providerRegistry.unregister(TEST_PROVIDER.id)
    console.log('✓ Provider 注销成功')
  } catch (error) {
    console.error('✗ 清理失败:', error)
  }

  console.log('\n=== 测试完成 ===')
}

// 运行测试
runTests().catch(console.error)

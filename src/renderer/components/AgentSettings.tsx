/**
 * Agent 设置组件
 * 配置Agent相关的设置项
 */

import React, { useState, useEffect } from 'react'
import { AgentProviderForm } from './AgentProviderForm'
import type { DirectApiConfig } from '../../shared/types'

/** Agent配置 */
interface AgentConfig {
  enabled: boolean
  toolsEnabled: boolean
  kbEnabled: boolean
  reasoningEnabled: boolean
  defaultProvider: string
  defaultModel: string
  maxSteps: number
  temperature: number
  contextWindow?: number
  contextCompression?: {
    enabled?: boolean
    thresholdPct?: number
    targetPct?: number
  }
}

/** 默认配置 */
const DEFAULT_CONFIG: AgentConfig = {
  enabled: false,
  toolsEnabled: false,
  kbEnabled: false,
  reasoningEnabled: false,
  defaultProvider: 'default',
  defaultModel: 'gpt-3.5-turbo',
  maxSteps: 8,
  temperature: 0.7
}

/**
 * Agent 设置组件
 */
export const AgentSettings: React.FC = () => {
  const [config, setConfig] = useState<AgentConfig>(DEFAULT_CONFIG)
  const [providers, setProviders] = useState<DirectApiConfig[]>([])
  const [saved, setSaved] = useState(false)
  const [showProviderForm, setShowProviderForm] = useState(false)
  const [editingProvider, setEditingProvider] = useState<DirectApiConfig | undefined>()
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [whitelistDirs, setWhitelistDirs] = useState<string[]>([])
  const [whitelistSaved, setWhitelistSaved] = useState(false)

  // 加载配置
  useEffect(() => {
    loadConfig()
    loadProviders()
    loadWhitelist()
  }, [])

  const loadConfig = async () => {
    try {
      const api = window.echora?.config
      if (!api) return

      const agentConfig = await api.get('agent') as AgentConfig | null
      if (agentConfig) {
        setConfig({ ...DEFAULT_CONFIG, ...agentConfig })
      }
    } catch (err) {
      console.error('加载Agent配置失败:', err)
    }
  }

  const loadProviders = async () => {
    try {
      const api = window.echora?.config
      if (!api) return

      const agentProviders = await api.get('agentProviders') as DirectApiConfig[] | null
      if (agentProviders) {
        setProviders(agentProviders)
      }
    } catch (err) {
      console.error('加载Provider配置失败:', err)
    }
  }

  const loadWhitelist = async () => {
    try {
      const api = window.echora?.config
      if (!api) return

      const dirs = await api.get('fileWhitelistDirs') as string[] | null
      if (dirs) {
        setWhitelistDirs(dirs)
      }
    } catch (err) {
      console.error('加载白名单配置失败:', err)
    }
  }

  const handleAddWhitelistDir = async () => {
    try {
      const api = (window as any).echora?.fileWhitelist
      if (!api) return

      const result = await api.openDir({
        title: '选择白名单目录',
        properties: ['openDirectory', 'dontAddToRecent']
      })
      if (!result.canceled && result.filePaths && result.filePaths.length > 0) {
        const dirPath = result.filePaths[0]
        if (!whitelistDirs.includes(dirPath)) {
          setWhitelistDirs(prev => [...prev, dirPath])
        }
      }
    } catch (err) {
      console.error('选择目录失败:', err)
    }
  }

  const handleRemoveWhitelistDir = (dirPath: string) => {
    setWhitelistDirs(prev => prev.filter(d => d !== dirPath))
  }

  const handleSaveWhitelist = async () => {
    try {
      const api = (window as any).echora?.fileWhitelist
      if (!api) return

      await api.save(whitelistDirs)
      setWhitelistSaved(true)
      setTimeout(() => setWhitelistSaved(false), 2000)
    } catch (err) {
      console.error('保存白名单配置失败:', err)
    }
  }

  const saveConfig = async () => {
    try {
      const api = window.echora?.config
      if (!api) return

      await api.set('agent', config)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      console.error('保存Agent配置失败:', err)
    }
  }

  const saveProviders = async (newProviders: DirectApiConfig[]) => {
    try {
      const api = window.echora?.config
      if (!api) return

      await api.set('agentProviders', newProviders)
      setProviders(newProviders)
    } catch (err) {
      console.error('保存Provider配置失败:', err)
    }
  }

  const handleChange = <K extends keyof AgentConfig>(key: K, value: AgentConfig[K]) => {
    setConfig(prev => ({ ...prev, [key]: value }))
  }

  /** 添加Provider */
  const handleAddProvider = () => {
    setEditingProvider(undefined)
    setShowProviderForm(true)
  }

  /** 编辑Provider */
  const handleEditProvider = (provider: DirectApiConfig) => {
    setEditingProvider(provider)
    setShowProviderForm(true)
  }

  /** 保存Provider */
  const handleSaveProvider = (providerConfig: DirectApiConfig) => {
    let newProviders: DirectApiConfig[]
    if (editingProvider) {
      // 编辑模式
      newProviders = providers.map(p => p.id === editingProvider.id ? providerConfig : p)
    } else {
      // 添加模式
      newProviders = [...providers, providerConfig]
    }
    saveProviders(newProviders)
    setShowProviderForm(false)
    setEditingProvider(undefined)
  }

  /** 删除Provider */
  const handleDeleteProvider = (providerId: string) => {
    setDeleteConfirm(providerId)
  }

  /** 确认删除 */
  const confirmDelete = () => {
    if (deleteConfirm) {
      const newProviders = providers.filter(p => p.id !== deleteConfirm)
      saveProviders(newProviders)
      setDeleteConfirm(null)
      // 如果删除的是当前默认Provider，重置默认Provider
      if (config.defaultProvider === deleteConfirm) {
        handleChange('defaultProvider', newProviders.length > 0 ? newProviders[0].id : 'default')
      }
    }
  }

  /** 遮罩API Key */
  const maskApiKey = (key: string) => {
    if (key.length <= 8) return '****'
    return `${key.substring(0, 4)}...${key.substring(key.length - 4)}`
  }

  return (
    <div style={{ padding: '20px', background: 'var(--bg-card)', borderRadius: 'var(--radius-lg, 12px)' }}>
      <h2 style={{ marginBottom: '24px', fontSize: '15px', fontWeight: 600 }}>🤖 Agent 设置</h2>

      {/* Feature Flags */}
      <div style={{ marginBottom: '32px' }}>
        <h3 style={{ marginBottom: '16px', fontSize: '16px' }}>功能开关</h3>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <input
              type="checkbox"
              checked={config.enabled}
              onChange={(e) => handleChange('enabled', e.target.checked)}
            />
            <div>
              <div style={{ fontWeight: 'bold' }}>启用 Agent 模式</div>
              <div style={{ fontSize: '13px', color: '#666' }}>
                开启后可在侧边栏访问Agent模式
              </div>
            </div>
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <input
              type="checkbox"
              checked={config.toolsEnabled}
              onChange={(e) => handleChange('toolsEnabled', e.target.checked)}
              disabled={!config.enabled}
            />
            <div>
              <div style={{ fontWeight: 'bold' }}>启用工具系统</div>
              <div style={{ fontSize: '13px', color: '#666' }}>
                允许Agent调用工具（搜索、文件操作等）
              </div>
            </div>
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <input
              type="checkbox"
              checked={config.kbEnabled}
              onChange={(e) => handleChange('kbEnabled', e.target.checked)}
              disabled={!config.enabled}
            />
            <div>
              <div style={{ fontWeight: 'bold' }}>启用知识库</div>
              <div style={{ fontSize: '13px', color: '#666' }}>
                允许Agent检索本地知识库
              </div>
            </div>
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <input
              type="checkbox"
              checked={config.reasoningEnabled}
              onChange={(e) => handleChange('reasoningEnabled', e.target.checked)}
              disabled={!config.enabled}
            />
            <div>
              <div style={{ fontWeight: 'bold' }}>启用多步推理</div>
              <div style={{ fontSize: '13px', color: '#666' }}>
                允许Agent进行任务分解和多步推理
              </div>
            </div>
          </label>
        </div>
      </div>

      {/* Provider设置 */}
      <div style={{ marginBottom: '32px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ fontSize: '16px', margin: 0 }}>Provider 配置</h3>
          <button
            onClick={handleAddProvider}
            style={{
              padding: '6px 16px',
              backgroundColor: '#1890ff',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '13px'
            }}
          >
            + 添加 Provider
          </button>
        </div>
        
        {/* Provider列表 */}
        {providers.length === 0 ? (
          <div style={{
            padding: '24px',
            backgroundColor: '#f9f9f9',
            borderRadius: '8px',
            textAlign: 'center',
            color: '#999'
          }}>
            暂未配置Provider，点击上方按钮添加
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {providers.map(provider => (
              <div
                key={provider.id}
                style={{
                  padding: '16px',
                  border: `1px solid ${config.defaultProvider === provider.id ? '#1890ff' : '#e8e8e8'}`,
                  borderRadius: '8px',
                  backgroundColor: config.defaultProvider === provider.id ? '#e6f7ff' : 'white'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>
                      {provider.name}
                      {config.defaultProvider === provider.id && (
                        <span style={{ marginLeft: '8px', fontSize: '12px', color: '#1890ff' }}>默认</span>
                      )}
                    </div>
                    <div style={{ fontSize: '13px', color: '#666' }}>
                      {provider.baseUrl}
                    </div>
                    <div style={{ fontSize: '12px', color: '#999', marginTop: '4px' }}>
                      API Key: {maskApiKey(provider.apiKey)} | 模型: {provider.models.length}个
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={() => handleChange('defaultProvider', provider.id)}
                      style={{
                        padding: '4px 12px',
                        backgroundColor: config.defaultProvider === provider.id ? '#52c41a' : '#d9d9d9',
                        color: config.defaultProvider === provider.id ? 'white' : '#666',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '12px'
                      }}
                    >
                      {config.defaultProvider === provider.id ? '已默认' : '设为默认'}
                    </button>
                    <button
                      onClick={() => handleEditProvider(provider)}
                      style={{
                        padding: '4px 12px',
                        backgroundColor: '#faad14',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '12px'
                      }}
                    >
                      编辑
                    </button>
                    <button
                      onClick={() => handleDeleteProvider(provider.id)}
                      style={{
                        padding: '4px 12px',
                        backgroundColor: '#ff4d4f',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '12px'
                      }}
                    >
                      删除
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Agent参数 */}
      <div style={{ marginBottom: '32px' }}>
        <h3 style={{ marginBottom: '16px', fontSize: '16px' }}>Agent 参数</h3>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
              默认模型
            </label>
            <input
              type="text"
              value={config.defaultModel}
              onChange={(e) => handleChange('defaultModel', e.target.value)}
              placeholder="gpt-3.5-turbo"
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '6px',
                border: '1px solid #d9d9d9',
                boxSizing: 'border-box'
              }}
            />
            <div style={{ fontSize: '12px', color: '#999', marginTop: '4px' }}>
              如果Provider配置了模型列表，可在此指定默认使用的模型
            </div>
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
              最大步数: {config.maxSteps}
            </label>
            <input
              type="range"
              min="1"
              max="15"
              value={config.maxSteps}
              onChange={(e) => handleChange('maxSteps', parseInt(e.target.value))}
              style={{ width: '100%' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#999' }}>
              <span>1</span>
              <span>15</span>
            </div>
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
              温度: {config.temperature}
            </label>
            <input
              type="range"
              min="0"
              max="2"
              step="0.1"
              value={config.temperature}
              onChange={(e) => handleChange('temperature', parseFloat(e.target.value))}
              style={{ width: '100%' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#999' }}>
              <span>0 (精确)</span>
              <span>2 (创造)</span>
            </div>
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
              上下文窗口大小 (tokens)
            </label>
            <input
              type="number"
              value={config.contextWindow || ''}
              onChange={(e) => {
                const val = e.target.value ? parseInt(e.target.value) : undefined
                setConfig(prev => ({ ...prev, contextWindow: val }))
              }}
              placeholder="例如: 128000"
              min="0"
              step="1000"
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '6px',
                border: '1px solid #d9d9d9',
                boxSizing: 'border-box'
              }}
            />
            <div style={{ fontSize: '12px', color: '#999', marginTop: '4px' }}>
              模型的上下文窗口大小（token数）。用于计算 Token 使用率和触发上下文压缩。
              常见值：GPT-4o=128000, Claude=200000, DeepSeek=64000
            </div>
          </div>

          {/* 上下文压缩配置 */}
          <div style={{ padding: '16px', backgroundColor: '#f9f9f9', borderRadius: '8px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
              <input
                type="checkbox"
                checked={config.contextCompression?.enabled ?? false}
                onChange={(e) => {
                  setConfig(prev => ({
                    ...prev,
                    contextCompression: {
                      ...prev.contextCompression,
                      enabled: e.target.checked
                    }
                  }))
                }}
                disabled={!config.contextWindow}
              />
              <div>
                <div style={{ fontWeight: 'bold' }}>启用上下文压缩</div>
                <div style={{ fontSize: '13px', color: '#666' }}>
                  当上下文占用超过阈值时，自动裁剪早期消息以释放空间
                </div>
              </div>
            </label>

            {config.contextCompression?.enabled && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', paddingLeft: '24px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold', fontSize: '13px' }}>
                    压缩阈值: {config.contextCompression?.thresholdPct ?? 80}%
                  </label>
                  <input
                    type="range"
                    min="50"
                    max="95"
                    step="5"
                    value={config.contextCompression?.thresholdPct ?? 80}
                    onChange={(e) => {
                      setConfig(prev => ({
                        ...prev,
                        contextCompression: {
                          ...prev.contextCompression,
                          thresholdPct: parseInt(e.target.value)
                        }
                      }))
                    }}
                    style={{ width: '100%' }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#999' }}>
                    <span>50%</span>
                    <span>95%</span>
                  </div>
                  <div style={{ fontSize: '12px', color: '#999', marginTop: '2px' }}>
                    当上下文占用超过此比例时触发压缩
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold', fontSize: '13px' }}>
                    压缩目标: {config.contextCompression?.targetPct ?? 50}%
                  </label>
                  <input
                    type="range"
                    min="20"
                    max="80"
                    step="5"
                    value={config.contextCompression?.targetPct ?? 50}
                    onChange={(e) => {
                      setConfig(prev => ({
                        ...prev,
                        contextCompression: {
                          ...prev.contextCompression,
                          targetPct: parseInt(e.target.value)
                        }
                      }))
                    }}
                    style={{ width: '100%' }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#999' }}>
                    <span>20%</span>
                    <span>80%</span>
                  </div>
                  <div style={{ fontSize: '12px', color: '#999', marginTop: '2px' }}>
                    压缩后上下文占用目标比例。压缩策略：保留系统提示 + 最近N轮对话
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 文件操作白名单 */}
      <div style={{ marginBottom: '32px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ fontSize: '16px', margin: 0 }}>文件操作白名单</h3>
          <button
            onClick={handleAddWhitelistDir}
            style={{
              padding: '6px 16px',
              backgroundColor: '#1890ff',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '13px'
            }}
          >
            + 添加目录
          </button>
        </div>

        <div style={{ fontSize: '13px', color: '#666', marginBottom: '12px' }}>
          配置Agent可以访问的目录范围。白名单为空时不限制访问；添加目录后Agent仅能操作这些目录内的文件。
        </div>

        {whitelistDirs.length === 0 ? (
          <div style={{
            padding: '24px',
            backgroundColor: '#f9f9f9',
            borderRadius: '8px',
            textAlign: 'center',
            color: '#999'
          }}>
            白名单为空，Agent可访问所有目录
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {whitelistDirs.map(dirPath => (
              <div
                key={dirPath}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 16px',
                  border: '1px solid #e8e8e8',
                  borderRadius: '6px',
                  backgroundColor: 'white'
                }}
              >
                <div style={{ fontSize: '13px', color: '#333', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, marginRight: '12px' }}>
                  📁 {dirPath}
                </div>
                <button
                  onClick={() => handleRemoveWhitelistDir(dirPath)}
                  style={{
                    padding: '4px 12px',
                    backgroundColor: '#ff4d4f',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '12px',
                    flexShrink: 0
                  }}
                >
                  删除
                </button>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
          <button
            onClick={handleSaveWhitelist}
            style={{
              padding: '8px 20px',
              backgroundColor: '#1890ff',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '13px'
            }}
          >
            保存白名单
          </button>
          {whitelistSaved && (
            <span style={{ color: '#52c41a', lineHeight: '36px' }}>
              ✓ 已保存
            </span>
          )}
        </div>
      </div>

      {/* 保存按钮 */}
      <div style={{ display: 'flex', gap: '12px' }}>
        <button
          onClick={saveConfig}
          style={{
            padding: '10px 24px',
            backgroundColor: '#1890ff',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer'
          }}
        >
          保存配置
        </button>
        {saved && (
          <span style={{ color: '#52c41a', lineHeight: '40px' }}>
            ✓ 已保存
          </span>
        )}
      </div>

      {/* Provider表单弹窗 */}
      {showProviderForm && (
        <AgentProviderForm
          initialData={editingProvider}
          onSave={handleSaveProvider}
          onCancel={() => {
            setShowProviderForm(false)
            setEditingProvider(undefined)
          }}
        />
      )}

      {/* 删除确认弹窗 */}
      {deleteConfirm && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1001
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '12px',
            padding: '24px',
            width: '400px'
          }}>
            <h3 style={{ margin: '0 0 16px 0' }}>确认删除</h3>
            <p style={{ margin: '0 0 20px 0', color: '#666' }}>
              确定要删除这个Provider配置吗？此操作不可撤销。
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button
                onClick={() => setDeleteConfirm(null)}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#d9d9d9',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer'
                }}
              >
                取消
              </button>
              <button
                onClick={confirmDelete}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#ff4d4f',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer'
                }}
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 说明 */}
      <div style={{
        marginTop: '32px',
        padding: '16px',
        backgroundColor: '#f9f9f9',
        borderRadius: '8px',
        fontSize: '13px',
        color: '#666'
      }}>
        <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>说明</div>
        <ul style={{ margin: 0, paddingLeft: '20px' }}>
          <li>Agent模式支持多步推理和工具调用</li>
          <li>最大步数限制Agent的推理深度，防止无限循环</li>
          <li>温度控制输出的随机性，越低越精确</li>
          <li>所有功能默认关闭，需要手动启用</li>
          <li>添加Provider后可配置API Key、BaseUrl等参数</li>
          <li>支持测试Provider连接，确保配置正确</li>
          <li>文件操作白名单为空时不限制访问，添加后Agent仅能操作白名单内的文件</li>
          <li>上下文窗口大小用于计算Token使用率，需根据实际模型手动填写</li>
          <li>上下文压缩可在对话过长时自动裁剪早期消息，保留系统提示和最近对话</li>
        </ul>
      </div>
    </div>
  )
}

export default AgentSettings

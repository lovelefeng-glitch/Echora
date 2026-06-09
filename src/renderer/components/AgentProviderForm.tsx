/**
 * Agent Provider 配置表单组件
 * 支持添加/编辑自定义LLM Provider
 */

import React, { useState, useEffect } from 'react'
import type { DirectApiConfig } from '../../shared/types'

/** Provider表单属性 */
interface AgentProviderFormProps {
  /** 初始数据（编辑模式） */
  initialData?: DirectApiConfig
  /** 保存回调 */
  onSave: (config: DirectApiConfig) => void
  /** 取消回调 */
  onCancel: () => void
}

/** 表单错误 */
interface FormErrors {
  name?: string
  baseUrl?: string
  apiKey?: string
}

/**
 * Agent Provider 配置表单组件
 */
export const AgentProviderForm: React.FC<AgentProviderFormProps> = ({
  initialData,
  onSave,
  onCancel
}) => {
  const [name, setName] = useState(initialData?.name || '')
  const [baseUrl, setBaseUrl] = useState(initialData?.baseUrl || '')
  const [apiKey, setApiKey] = useState(initialData?.apiKey || '')
  const [modelsInput, setModelsInput] = useState(initialData?.models?.join('\n') || '')
  const [defaultModel, setDefaultModel] = useState(initialData?.defaultModel || '')
  const [contextWindow, setContextWindow] = useState(initialData?.contextWindow?.toString() || '')
  const [showApiKey, setShowApiKey] = useState(false)
  const [errors, setErrors] = useState<FormErrors>({})
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; models?: string[] } | null>(null)

  /** 验证表单 */
  const validate = (): boolean => {
    const newErrors: FormErrors = {}

    if (!name.trim()) {
      newErrors.name = '请输入Provider名称'
    }

    if (!baseUrl.trim()) {
      newErrors.baseUrl = '请输入BaseUrl'
    } else {
      try {
        new URL(baseUrl)
      } catch {
        newErrors.baseUrl = '请输入有效的URL'
      }
    }

    if (!apiKey.trim()) {
      newErrors.apiKey = '请输入API Key'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  /** 测试连接 */
  const handleTestConnection = async () => {
    if (!baseUrl.trim() || !apiKey.trim()) {
      setTestResult({ success: false, message: '请先填写BaseUrl和API Key' })
      return
    }

    setTesting(true)
    setTestResult(null)

    try {
      const response = await fetch(`${baseUrl}/models`, {
        headers: {
          'Authorization': `Bearer ${apiKey}`
        }
      })

      if (response.ok) {
        const data = await response.json()
        const modelIds = (data.data || []).map((m: any) => m.id)
        setTestResult({
          success: true,
          message: `连接成功，发现 ${modelIds.length} 个模型`,
          models: modelIds
        })
      } else {
        const error = await response.text()
        setTestResult({ success: false, message: `连接失败: ${error}` })
      }
    } catch (err) {
      setTestResult({ success: false, message: `连接错误: ${err instanceof Error ? err.message : String(err)}` })
    } finally {
      setTesting(false)
    }
  }

  /** 保存 */
  const handleSave = () => {
    if (!validate()) return

    const models = modelsInput
      .split('\n')
      .map(m => m.trim())
      .filter(m => m.length > 0)

    const contextWindowNum = contextWindow.trim() ? parseInt(contextWindow.trim(), 10) : undefined
    const isContextWindowValid = contextWindowNum !== undefined && !isNaN(contextWindowNum) && contextWindowNum > 0
    const config: DirectApiConfig = {
      id: initialData?.id || `provider_${Date.now()}`,
      name: name.trim(),
      baseUrl: baseUrl.trim(),
      apiKey: apiKey.trim(),
      models,
      defaultModel: defaultModel.trim() || models[0] || '',
      ...(isContextWindowValid ? { contextWindow: contextWindowNum } : {})
    }

    onSave(config)
  }

  /** 遮罩API Key */
  const maskApiKey = (key: string) => {
    if (key.length <= 8) return '****'
    return `${key.substring(0, 4)}...${key.substring(key.length - 4)}`
  }

  return (
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
      zIndex: 1000
    }}>
      <div style={{
        backgroundColor: 'white',
        borderRadius: '12px',
        padding: '24px',
        width: '500px',
        maxHeight: '80vh',
        overflow: 'auto'
      }}>
        <h3 style={{ margin: '0 0 20px 0' }}>
          {initialData ? '编辑 Provider' : '添加 Provider'}
        </h3>

        {/* Provider名称 */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
            Provider 名称 <span style={{ color: 'red' }}>*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例如: OpenAI、DeepSeek、通义千问"
            style={{
              width: '100%',
              padding: '10px 12px',
              borderRadius: '6px',
              border: `1px solid ${errors.name ? '#ff4d4f' : '#d9d9d9'}`,
              boxSizing: 'border-box'
            }}
          />
          {errors.name && <div style={{ color: '#ff4d4f', fontSize: '12px', marginTop: '4px' }}>{errors.name}</div>}
        </div>

        {/* BaseUrl */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
            Base URL <span style={{ color: 'red' }}>*</span>
          </label>
          <input
            type="text"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://api.openai.com/v1"
            style={{
              width: '100%',
              padding: '10px 12px',
              borderRadius: '6px',
              border: `1px solid ${errors.baseUrl ? '#ff4d4f' : '#d9d9d9'}`,
              boxSizing: 'border-box'
            }}
          />
          {errors.baseUrl && <div style={{ color: '#ff4d4f', fontSize: '12px', marginTop: '4px' }}>{errors.baseUrl}</div>}
          <div style={{ fontSize: '12px', color: '#999', marginTop: '4px' }}>
            示例: https://api.openai.com/v1、https://api.deepseek.com/v1
          </div>
        </div>

        {/* API Key */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
            API Key <span style={{ color: 'red' }}>*</span>
          </label>
          <div style={{ position: 'relative' }}>
            <input
              type={showApiKey ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-..."
              style={{
                width: '100%',
                padding: '10px 12px',
                paddingRight: '80px',
                borderRadius: '6px',
                border: `1px solid ${errors.apiKey ? '#ff4d4f' : '#d9d9d9'}`,
                boxSizing: 'border-box'
              }}
            />
            <button
              onClick={() => setShowApiKey(!showApiKey)}
              style={{
                position: 'absolute',
                right: '8px',
                top: '50%',
                transform: 'translateY(-50%)',
                padding: '4px 8px',
                backgroundColor: 'transparent',
                border: '1px solid #d9d9d9',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '12px'
              }}
            >
              {showApiKey ? '隐藏' : '显示'}
            </button>
          </div>
          {errors.apiKey && <div style={{ color: '#ff4d4f', fontSize: '12px', marginTop: '4px' }}>{errors.apiKey}</div>}
        </div>

        {/* 模型列表 */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
            模型列表（每行一个）
          </label>
          <textarea
            value={modelsInput}
            onChange={(e) => setModelsInput(e.target.value)}
            placeholder={"gpt-3.5-turbo\ngpt-4\ngpt-4-turbo"}
            rows={4}
            style={{
              width: '100%',
              padding: '10px 12px',
              borderRadius: '6px',
              border: '1px solid #d9d9d9',
              boxSizing: 'border-box',
              resize: 'vertical'
            }}
          />
          <div style={{ fontSize: '12px', color: '#999', marginTop: '4px' }}>
            可选，留空则使用Provider返回的模型列表
          </div>
        </div>

        {/* 默认模型 */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
            默认模型
          </label>
          <input
            type="text"
            value={defaultModel}
            onChange={(e) => setDefaultModel(e.target.value)}
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
            留空则使用模型列表中的第一个
          </div>
        </div>

        {/* 上下文窗口大小 */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
            上下文窗口大小 (Context Window)
          </label>
          <input
            type="number"
            value={contextWindow}
            onChange={(e) => setContextWindow(e.target.value)}
            placeholder="例如: 128000"
            min="0"
            style={{
              width: '100%',
              padding: '10px 12px',
              borderRadius: '6px',
              border: '1px solid #d9d9d9',
              boxSizing: 'border-box'
            }}
          />
          <div style={{ fontSize: '12px', color: '#999', marginTop: '4px' }}>
            模型的上下文窗口大小（token数），留空则不显示Token信息
          </div>
        </div>

        {/* 测试连接 */}
        <div style={{ marginBottom: '20px' }}>
          <button
            onClick={handleTestConnection}
            disabled={testing}
            style={{
              padding: '8px 16px',
              backgroundColor: testing ? '#d9d9d9' : '#52c41a',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: testing ? 'not-allowed' : 'pointer'
            }}
          >
            {testing ? '测试中...' : '测试连接'}
          </button>
          {testResult && (
            <div style={{
              marginTop: '8px',
              padding: '8px 12px',
              backgroundColor: testResult.success ? '#f6ffed' : '#fff2f0',
              border: `1px solid ${testResult.success ? '#b7eb8f' : '#ffccc7'}`,
              borderRadius: '6px',
              fontSize: '13px'
            }}>
              {testResult.message}
              {testResult.models && testResult.models.length > 0 && (
                <div style={{ marginTop: '8px' }}>
                  <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>可用模型:</div>
                  <div style={{ maxHeight: '100px', overflow: 'auto' }}>
                    {testResult.models.map(m => (
                      <div key={m} style={{ padding: '2px 0' }}>• {m}</div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 操作按钮 */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
          <button
            onClick={onCancel}
            style={{
              padding: '10px 20px',
              backgroundColor: '#d9d9d9',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer'
            }}
          >
            取消
          </button>
          <button
            onClick={handleSave}
            style={{
              padding: '10px 20px',
              backgroundColor: '#1890ff',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer'
            }}
          >
            保存
          </button>
        </div>
      </div>
    </div>
  )
}

export default AgentProviderForm

/**
 * 知识库搜索工具（占位）
 * dangerLevel: safe
 * P2 阶段：定义接口，P3 阶段实现真实功能
 */

import type { ToolDefinition, ToolHandler } from '../types'

/** kb_search 工具定义 */
export const kbSearchDefinition: ToolDefinition = {
  name: 'kb_search',
  description: '搜索本地知识库获取相关信息。返回与查询最相关的文档片段。',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: '搜索查询'
      },
      kb_id: {
        type: 'string',
        description: '知识库 ID（可选，默认搜索所有已挂载的知识库）'
      },
      top_k: {
        type: 'number',
        description: '返回结果数量，默认 5',
        default: 5
      }
    },
    required: ['query']
  },
  dangerLevel: 'safe',
  category: 'knowledge',
  enabled: true
}

/** kb_search 工具处理器 */
export const kbSearchHandler: ToolHandler = async (args, context) => {
  const query = args.query as string

  // P2 阶段：返回占位响应
  // P3 阶段：实现真实的向量检索
  return {
    success: true,
    output: `[知识库搜索占位]\n\n查询: ${query}\n\n知识库功能将在 P3 阶段实现。届时将支持：\n1. 文档导入与索引\n2. 向量相似度检索\n3. 来源引用标注`,
    data: { query, placeholder: true }
  }
}

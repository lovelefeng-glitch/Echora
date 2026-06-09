/**
 * 网页抓取工具 — 真实实现
 * dangerLevel: safe
 * v2 - 2026-06-09: 替换占位实现，支持 HTML 转文本
 */

import type { ToolDefinition, ToolHandler } from '../types'

/** web_fetch 工具定义 */
export const webFetchDefinition: ToolDefinition = {
  name: 'web_fetch',
  description: '抓取指定URL的网页内容，自动提取正文文本。适合获取文章、文档、API文档等内容。',
  parameters: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: '要抓取的网页URL'
      },
      max_length: {
        type: 'number',
        description: '最大返回内容长度（字符），默认 5000',
        default: 5000
      }
    },
    required: ['url']
  },
  dangerLevel: 'safe',
  category: 'web',
  enabled: true
}

/**
 * 简易 HTML → 纯文本转换
 * 移除 script/style/nav/footer 等无关标签，保留正文
 */
function htmlToText(html: string): string {
  let text = html

  // 移除 script/style/nav/footer/header 等无关标签及其内容
  text = text.replace(/<script[\s\S]*?<\/script>/gi, '')
  text = text.replace(/<style[\s\S]*?<\/style>/gi, '')
  text = text.replace(/<nav[\s\S]*?<\/nav>/gi, '')
  text = text.replace(/<footer[\s\S]*?<\/footer>/gi, '')
  text = text.replace(/<header[\s\S]*?<\/header>/gi, '')
  text = text.replace(/<aside[\s\S]*?<\/aside>/gi, '')

  // 块级标签转换行
  text = text.replace(/<\/?(div|p|h[1-6]|li|tr|br|hr)[^>]*>/gi, '\n')
  text = text.replace(/<[^>]*>/g, '')  // 移除所有剩余标签

  // 解码常见 HTML 实体
  text = text.replace(/&amp;/g, '&')
  text = text.replace(/&lt;/g, '<')
  text = text.replace(/&gt;/g, '>')
  text = text.replace(/&quot;/g, '"')
  text = text.replace(/&#39;/g, "'")
  text = text.replace(/&nbsp;/g, ' ')

  // 清理多余空白
  text = text.replace(/\n{3,}/g, '\n\n')
  text = text.replace(/[ \t]+/g, ' ')
  text = text.split('\n').map(l => l.trim()).filter(l => l.length > 0).join('\n')

  return text
}

/** web_fetch 工具处理器 */
export const webFetchHandler: ToolHandler = async (args, _context) => {
  const url = args.url as string
  const maxLength = (args.max_length as number) || 5000

  try {
    // 验证 URL 格式
    new URL(url)

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,text/plain,application/json',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
      },
      signal: AbortSignal.timeout(15000),
      redirect: 'follow'
    })

    if (!response.ok) {
      return { success: false, output: '', error: `HTTP ${response.status}: ${response.statusText}` }
    }

    const contentType = response.headers.get('content-type') || ''
    const raw = await response.text()

    let content: string
    if (contentType.includes('text/html')) {
      content = htmlToText(raw)
    } else if (contentType.includes('application/json')) {
      // JSON 内容直接格式化输出
      try {
        const parsed = JSON.parse(raw)
        content = JSON.stringify(parsed, null, 2)
      } catch {
        content = raw
      }
    } else {
      content = raw
    }

    // 添加来源信息
    const header = `[来源: ${url}]\n[类型: ${contentType.split(';')[0]}]\n\n`
    const full = header + content

    return {
      success: true,
      output: full.substring(0, maxLength),
      data: { url, contentType, length: content.length, fetchedAt: new Date().toISOString() }
    }
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('Invalid URL')) {
      return { success: false, output: '', error: `无效的URL: ${url}` }
    }
    return {
      success: false,
      output: '',
      error: `抓取失败: ${error instanceof Error ? error.message : String(error)}`
    }
  }
}

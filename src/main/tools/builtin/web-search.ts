/**
 * 网络搜索工具 — DuckDuckGo 实现
 * dangerLevel: safe
 * v2 - 2026-06-09: 替换占位实现为真实 DuckDuckGo 搜索
 */

import type { ToolDefinition, ToolHandler } from '../types'

/** web_search 工具定义 */
export const webSearchDefinition: ToolDefinition = {
  name: 'web_search',
  description: '搜索互联网获取信息。使用 DuckDuckGo 搜索引擎，返回搜索结果列表，包含标题、链接和摘要。',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: '搜索关键词'
      },
      max_results: {
        type: 'number',
        description: '最大返回结果数量，默认 5',
        default: 5
      }
    },
    required: ['query']
  },
  dangerLevel: 'safe',
  category: 'search',
  enabled: true
}

/** DuckDuckGo HTML 搜索结果接口 */
interface DDGResult {
  title: string
  url: string
  snippet: string
}

/**
 * 解析 DuckDuckGo HTML 搜索结果
 * 从 lite.duckduckgo.com 的 HTML 中提取结构化数据
 */
function parseDDGHtml(html: string, maxResults: number): DDGResult[] {
  const results: DDGResult[] = []

  // 匹配 lite 版的搜索结果：每个结果在 <a> 标签中，href 后面跟着标题
  // lite 版格式：<a rel="nofollow" href="URL" class="result-link">TITLE</a><td class="result-snippet">SNIPPET</td>
  const resultRegex = /<a[^>]*class="result-link"[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/g
  const snippetRegex = /<td class="result-snippet">(.*?)<\/td>/g

  const urls: string[] = []
  const titles: string[] = []
  const snippets: string[] = []

  let match
  while ((match = resultRegex.exec(html)) !== null && urls.length < maxResults) {
    urls.push(match[1])
    titles.push(match[2].trim())
  }
  while ((match = snippetRegex.exec(html)) !== null && snippets.length < maxResults) {
    snippets.push(match[1].replace(/<[^>]*>/g, '').trim())
  }

  for (let i = 0; i < Math.min(urls.length, titles.length, maxResults); i++) {
    results.push({
      title: titles[i],
      url: urls[i],
      snippet: snippets[i] || ''
    })
  }

  return results
}

/** web_search 工具处理器 */
export const webSearchHandler: ToolHandler = async (args, _context) => {
  const query = args.query as string
  const maxResults = (args.max_results as number) || 5

  try {
    // 使用 DuckDuckGo lite 版本（轻量 HTML，易解析）
    const params = new URLSearchParams({ q: query, kl: 'cn-zh' })  // 中文搜索
    const url = `https://lite.duckduckgo.com/lite?${params.toString()}`

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
      },
      signal: AbortSignal.timeout(15000)
    })

    if (!response.ok) {
      return { success: false, output: '', error: `搜索请求失败: HTTP ${response.status}` }
    }

    const html = await response.text()
    const results = parseDDGHtml(html, maxResults)

    if (results.length === 0) {
      // Fallback: 尝试 DuckDuckGo instant answer API
      try {
        const iaUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`
        const iaRes = await fetch(iaUrl, { signal: AbortSignal.timeout(10000) })
        if (iaRes.ok) {
          const data = await iaRes.json() as Record<string, unknown>
          const abstract = data.Abstract as string
          const heading = data.Heading as string
          if (abstract) {
            results.push({ title: heading || query, url: (data.AbstractURL as string) || '', snippet: abstract })
          }
        }
      } catch {}
    }

    return {
      success: true,
      output: results.length > 0
        ? JSON.stringify(results, null, 2)
        : `未找到关于 "${query}" 的搜索结果`,
      data: results
    }
  } catch (error) {
    return {
      success: false,
      output: '',
      error: `搜索失败: ${error instanceof Error ? error.message : String(error)}`
    }
  }
}

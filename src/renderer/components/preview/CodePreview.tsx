import { useEffect, useRef, useState } from 'react'
import { codeToHtml } from 'shiki'

/**
 * CodePreview - 代码预览组件（带语法高亮）
 * 来源: Phase 3 代码预览
 * 输出: 带 Shiki 语法高亮的代码显示
 * 依赖: shiki
 */
interface CodePreviewProps {
  content: string
  language?: string
  path?: string
}

// 语言映射：扩展名 → Shiki 语言名
const LANGUAGE_MAP: Record<string, string> = {
  js: 'javascript',
  jsx: 'jsx',
  ts: 'typescript',
  tsx: 'tsx',
  py: 'python',
  rb: 'ruby',
  go: 'go',
  rs: 'rust',
  java: 'java',
  c: 'c',
  cpp: 'cpp',
  h: 'c',
  hpp: 'cpp',
  css: 'css',
  scss: 'scss',
  less: 'less',
  html: 'html',
  htm: 'html',
  xml: 'xml',
  json: 'json',
  yaml: 'yaml',
  yml: 'yaml',
  md: 'markdown',
  sql: 'sql',
  sh: 'bash',
  bash: 'bash',
  zsh: 'bash',
  ps1: 'powershell',
  dockerfile: 'dockerfile',
  vue: 'vue',
  svelte: 'svelte',
}

function detectLanguage(path?: string, language?: string): string {
  if (language) return language
  if (!path) return 'text'
  
  const ext = path.split('.').pop()?.toLowerCase()
  return ext ? LANGUAGE_MAP[ext] || 'text' : 'text'
}

export function CodePreview({ content, language, path }: CodePreviewProps) {
  const [html, setHtml] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false

    async function highlight() {
      setLoading(true)
      const lang = detectLanguage(path, language)
      
      try {
        const result = await codeToHtml(content, {
          lang: lang === 'text' ? 'text' : lang,
          theme: 'github-dark-default',
        })
        
        if (!cancelled) {
          setHtml(result)
          setLoading(false)
        }
      } catch (err) {
        // 降级：显示纯文本
        if (!cancelled) {
          setHtml(`<pre class="shiki" style="background-color:#24292e;color:#e1e4e8;padding:16px;margin:0;overflow:auto;"><code>${escapeHtml(content)}</code></pre>`)
          setLoading(false)
        }
      }
    }

    highlight()
    return () => { cancelled = true }
  }, [content, language, path])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-[var(--text-secondary)]">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-[var(--border)] border-t-[var(--accent)] rounded-full animate-spin mb-3" />
          <span className="text-sm">高亮处理中...</span>
        </div>
      </div>
    )
  }

  return (
    <div ref={containerRef} className="h-full overflow-auto preview-code-container" style={{ backgroundColor: '#24292e' }}>
      <div 
        className="m-0 p-4 text-[13px] leading-[1.6] font-[var(--font-mono)] whitespace-pre-wrap break-words min-w-full"
        style={{ color: '#e1e4e8' }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  )
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

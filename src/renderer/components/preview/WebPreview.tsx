import { useRef, useState, useEffect } from 'react'

/**
 * WebPreview - 网页预览组件
 */
interface WebPreviewProps {
  url?: string
  html?: string
}

export function WebPreview({ url, html }: WebPreviewProps) {
  const webviewRef = useRef<HTMLWebViewElement>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // 计算 src
  const src = html 
    ? `data:text/html;charset=utf-8,${encodeURIComponent(html)}`
    : url || ''

  useEffect(() => {
    if (!src) {
      setLoading(false)
      return
    }

    console.log('[WebPreview] src 变化:', src.substring(0, 50) + '...')
    setLoading(true)
    setError(null)
  }, [src])

  const handleLoadStart = () => {
    console.log('[WebPreview] 开始加载')
    setLoading(true)
  }

  const handleLoadStop = () => {
    console.log('[WebPreview] 加载完成')
    setLoading(false)
  }

  const handleDidFailLoad = (e: any) => {
    console.log('[WebPreview] 加载失败:', e)
    setLoading(false)
    setError('加载失败')
  }

  if (!src) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-[var(--text-secondary)]">
        <div className="text-4xl mb-3 opacity-50">🌐</div>
        <div className="text-sm mb-2">等待预览内容</div>
        <div className="text-xs text-[var(--text-hint)]">AI 生成网页时会自动显示</div>
      </div>
    )
  }

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <webview
        ref={webviewRef}
        src={src}
        partition="persist:preview"
        style={{ width: '100%', height: '100%', border: 'none' }}
      />
    </div>
  )
}

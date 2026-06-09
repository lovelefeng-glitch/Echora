import { useState } from 'react'

/**
 * ImagePreview - 图片预览组件
 */
interface ImagePreviewProps {
  path: string
  content?: string
}

export function ImagePreview({ path, content }: ImagePreviewProps) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // 如果有 content（base64），直接使用；否则从文件路径构建 data URL
  const src = content || `file://${path}`

  const handleLoad = () => {
    setLoading(false)
  }

  const handleError = () => {
    setLoading(false)
    setError('图片加载失败')
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-[var(--error)]">
        <div className="text-4xl mb-3">⚠️</div>
        <div className="text-sm">{error}</div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col items-center justify-center bg-[#1e1e1e] p-4">
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-[var(--text-secondary)]">加载中...</div>
        </div>
      )}
      <img
        src={src}
        alt={path.split('/').pop()}
        onLoad={handleLoad}
        onError={handleError}
        className="max-w-full max-h-full object-contain"
        style={{ display: loading ? 'none' : 'block' }}
      />
      <div className="mt-2 text-xs text-[var(--text-hint)] text-center">
        {path.split('/').pop()}
      </div>
    </div>
  )
}

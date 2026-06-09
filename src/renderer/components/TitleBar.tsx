import { useState, useEffect } from 'react'
import { useEchora } from '../hooks/use-echora'

export function TitleBar() {
  const api = useEchora()
  const [isMaximized, setIsMaximized] = useState(false)

  useEffect(() => {
    api.window.isMaximized().then(setIsMaximized)
    const cleanup = api.window.onMaximized(setIsMaximized)
    return cleanup
  }, [])

  return (
    <div className="window-controls">
      <button
        className="btn-win-min"
        onClick={() => api.window.minimize()}
        title="最小化"
      >
        <svg width="10" height="1" viewBox="0 0 10 1">
          <rect width="10" height="1" fill="currentColor" />
        </svg>
      </button>
      <button
        className="btn-win-max"
        onClick={() => api.window.maximize()}
        title={isMaximized ? '还原' : '最大化'}
      >
        <svg width="9" height="9" viewBox="0 0 9 9" fill="none" stroke="currentColor" strokeWidth="1.2">
          <rect x="0.6" y="0.6" width="7.8" height="7.8" rx="0.5" />
        </svg>
      </button>
      <button
        className="btn-win-close"
        onClick={() => api.window.close()}
        title="关闭"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.3">
          <line x1="1" y1="1" x2="9" y2="9" />
          <line x1="9" y1="1" x2="1" y2="9" />
        </svg>
      </button>
    </div>
  )
}

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useAppStore } from '../../stores/app-store'
import { ImagePopup } from './ImagePopup'

/**
 * FileExplorer - 文件浏览器组件（真实文件系统版）
 * 来源: Phase 2 - 文件浏览器深度优化
 * 输出: 真实文件树，搜索，最近打开，点击预览
 * 依赖: app-store, IPC file API
 */
interface FileNode {
  name: string
  path: string
  type: 'file' | 'directory'
  children?: FileNode[]
  size?: number
  modified?: number
}

interface FileExplorerProps {
  rootPath?: string
  onFileSelect?: (path: string, content: string) => void
}

// 文件图标映射
const FILE_ICONS: Record<string, string> = {
  tsx: '⚛️',
  ts: '📘',
  jsx: '⚛️',
  js: '📜',
  css: '🎨',
  scss: '🎨',
  html: '🌐',
  md: '📝',
  json: '📋',
  yaml: '⚙️',
  yml: '⚙️',
  py: '🐍',
  jpg: '🖼️',
  jpeg: '🖼️',
  png: '🖼️',
  gif: '🖼️',
  svg: '🖼️',
  webp: '🖼️',
  ico: '🖼️',
  bmp: '🖼️',
}

// 图片文件扩展名
const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'ico', 'bmp'])

export function FileExplorer({ rootPath, onFileSelect }: FileExplorerProps) {
  const showPreview = useAppStore((s) => s.showPreview)
  const [files, setFiles] = useState<FileNode[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(() => {
    // 从 localStorage 恢复展开状态
    try {
      const saved = localStorage.getItem('echora-expanded-dirs')
      return saved ? new Set(JSON.parse(saved)) : new Set()
    } catch {
      return new Set()
    }
  })
  const [selectedFile, setSelectedFile] = useState<string>(() => {
    // 从 localStorage 恢复选中文件
    try {
      return localStorage.getItem('echora-selected-file') || ''
    } catch {
      return ''
    }
  })
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<FileNode[]>([])
  const [recentFiles, setRecentFiles] = useState<string[]>([])
  const [currentPath, setCurrentPath] = useState('')
  
  // 图片弹窗状态
  const [imagePopup, setImagePopup] = useState<{ src: string; title?: string } | null>(null)

  // 加载最近打开的文件
  useEffect(() => {
    const saved = localStorage.getItem('echora-recent-files')
    if (saved) {
      try {
        setRecentFiles(JSON.parse(saved))
      } catch { /* ignore */ }
    }
  }, [])

  // 保存最近打开的文件
  const addRecentFile = useCallback((path: string) => {
    setRecentFiles(prev => {
      const next = [path, ...prev.filter(p => p !== path)].slice(0, 10)
      localStorage.setItem('echora-recent-files', JSON.stringify(next))
      return next
    })
  }, [])

  // 加载文件树
  const loadFiles = useCallback(async (dirPath: string) => {
    setLoading(true)
    setError(null)
    
    try {
      console.log('[FileExplorer] 加载目录:', dirPath)
      const result = await window.echora?.file?.list(dirPath)
      console.log('[FileExplorer] 结果:', result)
      
      if (result?.success && result.data) {
        setFiles(result.data)
        setCurrentPath(dirPath)
      } else {
        setError(result?.error || '加载失败')
      }
    } catch (err) {
      console.error('[FileExplorer] 错误:', err)
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  // 初始化：获取 cwd 并加载文件
  useEffect(() => {
    const init = async () => {
      // 如果有指定的 rootPath，直接加载
      if (rootPath) {
        loadFiles(rootPath)
        return
      }

      // 否则获取当前工作目录
      try {
        console.log('[FileExplorer] 获取 cwd...')
        const result = await window.echora?.file?.cwd()
        console.log('[FileExplorer] cwd 结果:', result)
        
        if (result?.success && result.data) {
          loadFiles(result.data)
        } else {
          // 如果获取 cwd 失败，使用默认路径
          setError('无法获取工作目录')
          setLoading(false)
        }
      } catch (err) {
        console.error('[FileExplorer] 获取 cwd 失败:', err)
        setError(String(err))
        setLoading(false)
      }
    }
    
    init()
  }, [rootPath, loadFiles])

  // 滚动到选中的文件
  useEffect(() => {
    if (selectedFile) {
      const elementId = `file-${selectedFile.replace(/\//g, '-')}`
      const element = document.getElementById(elementId)
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    }
  }, [selectedFile, files])

  // 搜索文件
  const handleSearch = useCallback(async (query: string) => {
    setSearchQuery(query)
    
    if (!query.trim()) {
      setSearchResults([])
      return
    }

    try {
      const result = await window.echora?.file?.search(currentPath || '.', query)
      if (result?.success && result.data) {
        setSearchResults(result.data)
      }
    } catch (err) {
      console.error('搜索失败:', err)
    }
  }, [currentPath])

  // 切换目录展开/折叠
  const toggleDir = useCallback((path: string) => {
    setExpandedDirs(prev => {
      const next = new Set(prev)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      // 保存到 localStorage
      try {
        localStorage.setItem('echora-expanded-dirs', JSON.stringify(Array.from(next)))
      } catch { /* ignore */ }
      return next
    })
  }, [])

  // 点击文件
  const handleFileClick = useCallback(async (node: FileNode) => {
    if (node.type === 'directory') {
      toggleDir(node.path)
      return
    }

    // 自动展开文件所在的父目录
    const parts = node.path.split('/')
    if (parts.length > 1) {
      const dirsToExpand: string[] = []
      for (let i = 1; i < parts.length; i++) {
        const dirPath = parts.slice(0, i).join('/')
        dirsToExpand.push(dirPath)
      }
      setExpandedDirs(prev => {
        const next = new Set(prev)
        for (const dir of dirsToExpand) {
          next.add(dir)
        }
        // 保存到 localStorage
        try {
          localStorage.setItem('echora-expanded-dirs', JSON.stringify(Array.from(next)))
        } catch { /* ignore */ }
        return next
      })
    }

    // 读取文件内容
    try {
      const fullPath = currentPath ? `${currentPath}/${node.path}` : node.path
      console.log('[FileExplorer] 读取文件:', fullPath)
      const result = await window.echora?.file?.read(fullPath)
      
      if (result?.success && result.data) {
        addRecentFile(node.path)
        
        // 保存选中的文件
        setSelectedFile(node.path)
        try {
          localStorage.setItem('echora-selected-file', node.path)
        } catch { /* ignore */ }
        
        // 根据文件类型选择预览方式
        const ext = node.name.split('.').pop()?.toLowerCase() || ''
        const isHtml = ext === 'html' || ext === 'htm'
        const isMarkdown = ext === 'md'
        const isImage = IMAGE_EXTENSIONS.has(ext)
        
        console.log('[FileExplorer] 文件名:', node.name, '扩展名:', ext, '是HTML:', isHtml, '是图片:', isImage)
        
        if (isImage) {
          // 图片文件显示拍立得弹窗
          console.log('[FileExplorer] 使用图片弹窗')
          try {
            const imageResult = await window.echora.file.readBase64(fullPath)
            if (imageResult.success && imageResult.data) {
              setImagePopup({ src: imageResult.data, title: node.name })
            } else {
              console.error('[FileExplorer] 读取图片失败:', imageResult.error)
            }
          } catch (error) {
            console.error('[FileExplorer] 读取图片异常:', error)
          }
        } else if (isHtml) {
          // HTML 文件用网页预览
          console.log('[FileExplorer] 使用网页预览')
          showPreview({
            type: 'html',
            html: result.data,
            title: node.name,
          })
        } else if (isMarkdown) {
          // Markdown 文件用代码预览（带语法高亮）
          showPreview({
            type: 'file',
            path: node.path,
            content: result.data,
            language: 'markdown',
            title: node.name,
          })
        } else {
          // 其他文件用代码预览
          showPreview({
            type: 'file',
            path: node.path,
            content: result.data,
            title: node.name,
          })
        }
        
        onFileSelect?.(node.path, result.data)
      } else {
        console.error('[FileExplorer] 读取失败:', result?.error)
      }
    } catch (err) {
      console.error('读取文件失败:', err)
    }
  }, [currentPath, toggleDir, addRecentFile, showPreview, onFileSelect])

  // 获取文件图标
  const getFileIcon = useCallback((node: FileNode) => {
    if (node.type === 'directory') {
      return expandedDirs.has(node.path) ? '📂' : '📁'
    }
    const ext = node.name.split('.').pop()?.toLowerCase() || ''
    return FILE_ICONS[ext] || '📄'
  }, [expandedDirs])

  // 格式化文件大小
  const formatSize = useCallback((bytes?: number) => {
    if (!bytes) return ''
    if (bytes < 1024) return `${bytes}B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
  }, [])

  // 渲染文件节点
  const renderNode = useMemo(() => {
    const render = (node: FileNode, depth: number = 0): React.ReactNode => {
      const isExpanded = expandedDirs.has(node.path)
      const isSelected = selectedFile === node.path
      const indent = depth * 16

      return (
        <div key={node.path}>
          <div
            id={`file-${node.path.replace(/\//g, '-')}`}
            className={`flex items-center gap-1.5 py-1 px-2 cursor-pointer text-sm group transition-colors ${
              isSelected 
                ? 'bg-[var(--accent-light)] text-[var(--accent)] border-l-2 border-[var(--accent)]' 
                : 'hover:bg-[var(--bg-hover)] text-[var(--text-primary)] border-l-2 border-transparent'
            }`}
            style={{ paddingLeft: `${indent + 8}px` }}
            onClick={() => handleFileClick(node)}
            title={node.path}
          >
            <span className="text-sm flex-shrink-0">{getFileIcon(node)}</span>
            <span className="truncate flex-1">{node.name}</span>
            {node.type === 'file' && node.size !== undefined && (
              <span className="text-[10px] text-[var(--text-hint)] opacity-0 group-hover:opacity-100 transition-opacity">
                {formatSize(node.size)}
              </span>
            )}
          </div>
          {node.type === 'directory' && isExpanded && node.children && (
            <div>
              {node.children.map(child => render(child, depth + 1))}
            </div>
          )}
        </div>
      )
    }
    return render
  }, [expandedDirs, selectedFile, handleFileClick, getFileIcon, formatSize])

  // 搜索结果渲染
  const renderSearchResult = useCallback((node: FileNode) => (
    <div
      key={node.path}
      className="flex items-center gap-1.5 py-1 px-2 hover:bg-[var(--bg-hover)] cursor-pointer text-sm text-[var(--text-primary)]"
      onClick={() => handleFileClick(node)}
      title={node.path}
    >
      <span className="text-sm flex-shrink-0">{getFileIcon(node)}</span>
      <span className="truncate flex-1">{node.name}</span>
      <span className="text-[10px] text-[var(--text-hint)] truncate max-w-[150px]">
        {node.path}
      </span>
    </div>
  ), [handleFileClick, getFileIcon])

  return (
    <div className="h-full flex flex-col">
      {/* 当前路径 */}
      <div className="px-2 py-1 text-[10px] text-[var(--text-hint)] bg-[var(--bg-secondary)] border-b border-[var(--border)] truncate">
        📂 {currentPath || '加载中...'}
      </div>

      {/* 搜索框 */}
      <div className="px-2 py-1.5 border-b border-[var(--border)]">
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="🔍 搜索文件..."
            className="w-full px-2 py-1 text-sm bg-[var(--bg-primary)] border border-[var(--border)] rounded-md focus:outline-none focus:border-[var(--accent)] text-[var(--text-primary)] placeholder:text-[var(--text-hint)]"
          />
          {searchQuery && (
            <button
              className="absolute right-1 top-1/2 -translate-y-1/2 text-[var(--text-hint)] hover:text-[var(--text-primary)]"
              onClick={() => handleSearch('')}
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* 内容区域 */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-full text-[var(--text-secondary)]">
            <div className="text-center">
              <div className="w-6 h-6 border-2 border-[var(--border)] border-t-[var(--accent)] rounded-full animate-spin mx-auto mb-2" />
              <span className="text-sm">加载文件树...</span>
            </div>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-full text-[var(--error)]">
            <div className="text-center">
              <span className="text-sm">{error}</span>
              <button
                onClick={() => {
                  setError(null)
                  setLoading(true)
                  // 重新加载
                  window.echora?.file?.cwd().then(r => {
                    if (r?.data) loadFiles(r.data)
                    else setLoading(false)
                  })
                }}
                className="block mx-auto mt-2 text-xs text-[var(--accent)] hover:underline"
              >
                重试
              </button>
            </div>
          </div>
        ) : searchQuery ? (
          // 搜索结果
          <div>
            {searchResults.length === 0 ? (
              <div className="text-center text-[var(--text-hint)] text-sm py-4">
                未找到匹配的文件
              </div>
            ) : (
              searchResults.map(renderSearchResult)
            )}
          </div>
        ) : (
          // 文件树
          <div>
            {/* 最近打开的文件 */}
            {recentFiles.length > 0 && (
              <>
                <div className="px-2 py-1 text-xs text-[var(--text-hint)] font-medium bg-[var(--bg-secondary)]">
                  ⭐ 最近打开
                </div>
                {recentFiles.slice(0, 5).map(path => {
                  const name = path.split('/').pop() || path
                  const ext = name.split('.').pop()?.toLowerCase() || ''
                  return (
                    <div
                      key={path}
                      className="flex items-center gap-1.5 py-1 px-2 pl-4 hover:bg-[var(--bg-hover)] cursor-pointer text-sm text-[var(--text-primary)]"
                      onClick={() => {
                        showPreview({
                          type: 'file',
                          path,
                          content: `// 文件: ${path}\n// 点击刷新加载最新内容`,
                          title: name,
                        })
                      }}
                    >
                      <span className="text-sm">{FILE_ICONS[ext] || '📄'}</span>
                      <span className="truncate">{name}</span>
                    </div>
                  )
                })}
                <div className="border-b border-[var(--border)]" />
              </>
            )}
            
            {/* 文件树 */}
            {files.length === 0 ? (
              <div className="text-center text-[var(--text-hint)] text-sm py-4">
                空目录
              </div>
            ) : (
              files.map(node => renderNode(node))
            )}
          </div>
        )}
      </div>
      
      {/* 图片弹窗 */}
      {imagePopup && (
        <ImagePopup
          src={imagePopup.src}
          title={imagePopup.title}
          onClose={() => setImagePopup(null)}
        />
      )}
    </div>
  )
}

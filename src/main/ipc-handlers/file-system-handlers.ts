import { ipcMain } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import { create as createLog } from '../utils/console-logger'

const log = createLog('FileSystem')

// 文件节点类型
interface FileNode {
  name: string
  path: string
  type: 'file' | 'directory'
  children?: FileNode[]
  size?: number
  modified?: number
}

// 忽略的目录
const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  '.vscode',
  '.idea',
  'dist',
  'build',
  'out',
  '.next',
  '__pycache__',
  '.cache',
])

// 忽略的文件
const IGNORED_FILES = new Set([
  '.DS_Store',
  'Thumbs.db',
  'desktop.ini',
])

/**
 * 递归读取目录结构
 */
function readDirRecursive(dirPath: string, relativePath: string = ''): FileNode[] {
  const nodes: FileNode[] = []
  
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true })
    
    // 先添加目录，再添加文件
    const dirs = entries.filter(e => e.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))
    const files = entries.filter(e => e.isFile()).sort((a, b) => a.name.localeCompare(b.name))
    
    for (const dir of dirs) {
      if (IGNORED_DIRS.has(dir.name)) continue
      
      const fullPath = path.join(dirPath, dir.name)
      const relPath = relativePath ? `${relativePath}/${dir.name}` : dir.name
      
      nodes.push({
        name: dir.name,
        path: relPath,
        type: 'directory',
        children: readDirRecursive(fullPath, relPath),
      })
    }
    
    for (const file of files) {
      if (IGNORED_FILES.has(file.name)) continue
      
      const fullPath = path.join(dirPath, file.name)
      const relPath = relativePath ? `${relativePath}/${file.name}` : file.name
      
      try {
        const stats = fs.statSync(fullPath)
        nodes.push({
          name: file.name,
          path: relPath,
          type: 'file',
          size: stats.size,
          modified: stats.mtimeMs,
        })
      } catch {
        nodes.push({
          name: file.name,
          path: relPath,
          type: 'file',
        })
      }
    }
  } catch (err) {
    log.error(`读取目录失败: ${dirPath}`, err)
  }
  
  return nodes
}

/**
 * 搜索文件
 */
function searchFiles(dirPath: string, query: string, relativePath: string = ''): FileNode[] {
  const results: FileNode[] = []
  const lowerQuery = query.toLowerCase()
  
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true })
    
    for (const entry of entries) {
      if (IGNORED_DIRS.has(entry.name) || IGNORED_FILES.has(entry.name)) continue
      
      const fullPath = path.join(dirPath, entry.name)
      const relPath = relativePath ? `${relativePath}/${entry.name}` : entry.name
      
      if (entry.name.toLowerCase().includes(lowerQuery)) {
        results.push({
          name: entry.name,
          path: relPath,
          type: entry.isDirectory() ? 'directory' : 'file',
        })
      }
      
      if (entry.isDirectory()) {
        results.push(...searchFiles(fullPath, query, relPath))
      }
    }
  } catch (err) {
    // 忽略无权限的目录
  }
  
  return results
}

/**
 * 注册文件系统 IPC 处理器
 */
export function registerFileSystemHandlers(): void {
  // 列出目录
  ipcMain.handle('file:list', async (_event, dirPath: string) => {
    try {
      log.info(`列出目录: ${dirPath}`)
      const nodes = readDirRecursive(dirPath)
      return { success: true, data: nodes }
    } catch (err) {
      log.error('列出目录失败:', err)
      return { success: false, error: String(err) }
    }
  })
  
  // 读取文件
  ipcMain.handle('file:read', async (_event, filePath: string) => {
    try {
      log.info(`读取文件: ${filePath}`)
      const content = fs.readFileSync(filePath, 'utf-8')
      return { success: true, data: content }
    } catch (err) {
      log.error('读取文件失败:', err)
      return { success: false, error: String(err) }
    }
  })
  
  // 搜索文件
  ipcMain.handle('file:search', async (_event, dirPath: string, query: string) => {
    try {
      log.info(`搜索文件: ${query} in ${dirPath}`)
      const results = searchFiles(dirPath, query)
      return { success: true, data: results }
    } catch (err) {
      log.error('搜索文件失败:', err)
      return { success: false, error: String(err) }
    }
  })
  
  // 获取文件状态
  ipcMain.handle('file:stat', async (_event, filePath: string) => {
    try {
      const stats = fs.statSync(filePath)
      return { 
        success: true, 
        data: {
          size: stats.size,
          modified: stats.mtimeMs,
          created: stats.birthtimeMs,
          isDirectory: stats.isDirectory(),
          isFile: stats.isFile(),
        }
      }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  // 读取文件为 base64
  ipcMain.handle('file:readBase64', async (_event, filePath: string) => {
    try {
      log.info(`读取文件为 base64: ${filePath}`)
      const buffer = fs.readFileSync(filePath)
      const base64 = buffer.toString('base64')
      
      // 根据扩展名确定 MIME 类型
      const ext = path.extname(filePath).toLowerCase()
      const mimeTypes: Record<string, string> = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
        '.webp': 'image/webp',
        '.ico': 'image/x-icon',
        '.bmp': 'image/bmp',
      }
      const mimeType = mimeTypes[ext] || 'application/octet-stream'
      
      return { success: true, data: `data:${mimeType};base64,${base64}` }
    } catch (err) {
      log.error('读取文件为 base64 失败:', err)
      return { success: false, error: String(err) }
    }
  })

  // 获取当前工作目录
  ipcMain.handle('file:cwd', async () => {
    return { success: true, data: process.cwd() }
  })
  
  log.info('文件系统 IPC 处理器已注册')
}

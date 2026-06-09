/**
 * 记忆模块入口
 */

// 类型定义
export type {
  MemoryType,
  MemoryEntry,
  MemorySearchResult,
  MemoryConfig
} from './types'

export { DEFAULT_MEMORY_CONFIG } from './types'

// 实现
export { MemoryManager, createMemoryManager } from './memory-manager'

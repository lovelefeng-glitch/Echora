/**
 * 知识库模块入口
 */

// 类型定义
export type {
  DocumentFormat,
  DocumentStatus,
  KnowledgeBaseConfig,
  DocumentMetadata,
  DocumentChunk,
  SearchResult,
  RetrievalConfig,
  EmbeddingProvider,
  KnowledgeBaseStats
} from './types'

// 实现
export { Chunker, createChunker } from './chunker'
export type { ChunkerConfig } from './chunker'
export { VectorStore, createVectorStore } from './vector-store'
export { KnowledgeBaseManager, createKnowledgeBaseManager } from './kb-manager'

/**
 * 知识库类型定义
 */

/** 文档格式 */
export type DocumentFormat = 'txt' | 'md' | 'pdf' | 'docx' | 'html' | 'csv' | 'code'

/** 文档状态 */
export type DocumentStatus = 'pending' | 'processing' | 'indexed' | 'error'

/** 知识库配置 */
export interface KnowledgeBaseConfig {
  /** 知识库 ID */
  id: string
  /** 知识库名称 */
  name: string
  /** 描述 */
  description?: string
  /** 存储路径 */
  storagePath: string
  /** Chunk 大小（字符数） */
  chunkSize: number
  /** Chunk 重叠（字符数） */
  chunkOverlap: number
  /** 最大文档大小（字节） */
  maxDocumentSize: number
  /** 支持的格式 */
  supportedFormats: DocumentFormat[]
}

/** 文档元数据 */
export interface DocumentMetadata {
  /** 文档 ID */
  id: string
  /** 文件名 */
  filename: string
  /** 文件路径 */
  filepath: string
  /** 文件格式 */
  format: DocumentFormat
  /** 文件大小（字节） */
  size: number
  /** 创建时间 */
  createdAt: number
  /** 更新时间 */
  updatedAt: number
  /** 状态 */
  status: DocumentStatus
  /** Chunk 数量 */
  chunkCount: number
  /** 错误信息 */
  error?: string
}

/** 文档 Chunk */
export interface DocumentChunk {
  /** Chunk ID */
  id: string
  /** 文档 ID */
  documentId: string
  /** Chunk 序号 */
  index: number
  /** 内容 */
  content: string
  /** 元数据 */
  metadata: {
    /** 文件名 */
    filename: string
    /** 段落号 */
    paragraph?: number
    /** 起始位置 */
    startOffset: number
    /** 结束位置 */
    endOffset: number
  }
  /** 嵌入向量 */
  embedding?: number[]
}

/** 检索结果 */
export interface SearchResult {
  /** Chunk */
  chunk: DocumentChunk
  /** 相似度分数 */
  score: number
  /** 来源引用 */
  citation: string
}

/** 检索配置 */
export interface RetrievalConfig {
  /** 返回数量 */
  topK: number
  /** 最小相似度阈值 */
  minScore: number
  /** 是否启用混合检索 */
  hybridSearch: boolean
  /** BM25 权重（混合检索时） */
  bm25Weight: number
  /** 向量权重（混合检索时） */
  vectorWeight: number
}

/** Embedding 接口 */
export interface EmbeddingProvider {
  /** 提供者名称 */
  name: string
  /** 生成嵌入向量 */
  embed(texts: string[]): Promise<number[][]>
  /** 获取向量维度 */
  getDimension(): number
}

/** 知识库状态 */
export interface KnowledgeBaseStats {
  /** 文档数量 */
  documentCount: number
  /** Chunk 数量 */
  chunkCount: number
  /** 总大小（字节） */
  totalSize: number
  /** 最后更新时间 */
  lastUpdated: number
}

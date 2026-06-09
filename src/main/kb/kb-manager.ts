/**
 * 知识库管理器
 * 管理知识库的创建、文档导入、索引和检索
 */

import { create } from '../utils/console-logger'
import type {
  KnowledgeBaseConfig,
  DocumentMetadata,
  DocumentChunk,
  SearchResult,
  EmbeddingProvider,
  RetrievalConfig,
  KnowledgeBaseStats
} from './types'
import { Chunker, createChunker } from './chunker'
import { VectorStore, createVectorStore } from './vector-store'

const log = create('KBManager')

/** 默认知识库配置 */
const DEFAULT_CONFIG: Partial<KnowledgeBaseConfig> = {
  chunkSize: 500,
  chunkOverlap: 100,
  maxDocumentSize: 50 * 1024 * 1024, // 50MB
  supportedFormats: ['txt', 'md', 'pdf', 'docx', 'html', 'csv', 'code']
}

/** 默认检索配置 */
const DEFAULT_RETRIEVAL_CONFIG: RetrievalConfig = {
  topK: 5,
  minScore: 0.3,
  hybridSearch: true,
  bm25Weight: 0.3,
  vectorWeight: 0.7
}

/**
 * 知识库管理器
 */
export class KnowledgeBaseManager {
  private _config: KnowledgeBaseConfig
  private _chunker: Chunker
  private _vectorStore: VectorStore
  private _embeddingProvider: EmbeddingProvider | null = null
  private _documents = new Map<string, DocumentMetadata>()
  private _retrievalConfig: RetrievalConfig

  constructor(config: KnowledgeBaseConfig, embeddingProvider?: EmbeddingProvider) {
    this._config = { ...DEFAULT_CONFIG, ...config }
    this._chunker = createChunker({
      chunkSize: this._config.chunkSize,
      chunkOverlap: this._config.chunkOverlap
    })
    this._vectorStore = createVectorStore()
    this._embeddingProvider = embeddingProvider || null
    this._retrievalConfig = { ...DEFAULT_RETRIEVAL_CONFIG }
  }

  /**
   * 设置 Embedding 提供者
   */
  setEmbeddingProvider(provider: EmbeddingProvider): void {
    this._embeddingProvider = provider
  }

  /**
   * 更新检索配置
   */
  updateRetrievalConfig(config: Partial<RetrievalConfig>): void {
    this._retrievalConfig = { ...this._retrievalConfig, ...config }
  }

  /**
   * 导入文档
   */
  async importDocument(
    filename: string,
    content: string,
    format: string
  ): Promise<DocumentMetadata> {
    // 生成文档 ID
    const documentId = `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    // 创建文档元数据
    const metadata: DocumentMetadata = {
      id: documentId,
      filename,
      filepath: `${this._config.storagePath}/${filename}`,
      format: format as any,
      size: content.length,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      status: 'processing',
      chunkCount: 0
    }

    this._documents.set(documentId, metadata)

    try {
      // 分块
      const chunks = this._chunker.chunkText(content, documentId, filename)

      // 生成嵌入向量
      if (this._embeddingProvider) {
        const texts = chunks.map(c => c.content)
        const embeddings = await this._embeddingProvider.embed(texts)

        // 添加嵌入向量到 Chunk
        const chunksWithEmbeddings: DocumentChunk[] = chunks.map((chunk, i) => ({
          ...chunk,
          embedding: embeddings[i]
        }))

        // 存储到向量存储
        this._vectorStore.addMany(chunksWithEmbeddings)

        // 更新元数据
        metadata.status = 'indexed'
        metadata.chunkCount = chunks.length
        metadata.updatedAt = Date.now()

        log.info(`文档 ${filename} 导入完成: ${chunks.length} 个 Chunk`)
      } else {
        // 没有 Embedding 提供者，存储 Chunk 但不生成向量
        metadata.status = 'indexed'
        metadata.chunkCount = chunks.length
        log.warn(`文档 ${filename} 导入完成但未生成嵌入向量（缺少 Embedding 提供者）`)
      }

      return metadata
    } catch (error) {
      metadata.status = 'error'
      metadata.error = error instanceof Error ? error.message : String(error)
      log.error(`文档 ${filename} 导入失败:`, metadata.error)
      return metadata
    }
  }

  /**
   * 删除文档
   */
  removeDocument(documentId: string): boolean {
    const metadata = this._documents.get(documentId)
    if (!metadata) {
      return false
    }

    // 从向量存储中删除
    this._vectorStore.removeByDocument(documentId)

    // 删除元数据
    this._documents.delete(documentId)

    log.info(`删除文档: ${metadata.filename}`)
    return true
  }

  /**
   * 检索
   */
  async search(query: string, config?: Partial<RetrievalConfig>): Promise<SearchResult[]> {
    const retrievalConfig = { ...this._retrievalConfig, ...config }

    if (!this._embeddingProvider) {
      log.warn('缺少 Embedding 提供者，无法执行向量检索')
      return []
    }

    // 生成查询向量
    const queryEmbeddings = await this._embeddingProvider.embed([query])
    const queryEmbedding = queryEmbeddings[0]

    // 向量检索
    const vectorResults = this._vectorStore.search(
      queryEmbedding,
      retrievalConfig.topK * 2, // 获取更多结果用于混合排序
      retrievalConfig.minScore
    )

    if (!retrievalConfig.hybridSearch) {
      return vectorResults.slice(0, retrievalConfig.topK)
    }

    // 混合检索：结合 BM25
    const bm25Results = this._bm25Search(query, retrievalConfig.topK * 2)

    // 合并结果
    const mergedResults = this._mergeResults(
      vectorResults,
      bm25Results,
      retrievalConfig.vectorWeight,
      retrievalConfig.bm25Weight,
      retrievalConfig.topK
    )

    return mergedResults
  }

  /**
   * BM25 检索（简化实现）
   */
  private _bm25Search(query: string, topK: number): SearchResult[] {
    const queryTerms = query.toLowerCase().split(/\s+/)
    const results: SearchResult[] = []

    for (const chunk of this._vectorStore.getAll()) {
      const content = chunk.content.toLowerCase()
      let score = 0

      // 简单的词频匹配
      for (const term of queryTerms) {
        const regex = new RegExp(term, 'gi')
        const matches = content.match(regex)
        if (matches) {
          score += matches.length
        }
      }

      // 归一化
      score = score / (queryTerms.length * 10)

      if (score > 0) {
        results.push({
          chunk,
          score,
          citation: `[来源: ${chunk.metadata.filename}, 段落 ${chunk.metadata.paragraph}]`
        })
      }
    }

    results.sort((a, b) => b.score - a.score)
    return results.slice(0, topK)
  }

  /**
   * 合并向量和 BM25 结果
   */
  private _mergeResults(
    vectorResults: SearchResult[],
    bm25Results: SearchResult[],
    vectorWeight: number,
    bm25Weight: number,
    topK: number
  ): SearchResult[] {
    const mergedMap = new Map<string, SearchResult>()

    // 添加向量结果
    for (const result of vectorResults) {
      mergedMap.set(result.chunk.id, {
        ...result,
        score: result.score * vectorWeight
      })
    }

    // 合并 BM25 结果
    for (const result of bm25Results) {
      const existing = mergedMap.get(result.chunk.id)
      if (existing) {
        existing.score += result.score * bm25Weight
      } else {
        mergedMap.set(result.chunk.id, {
          ...result,
          score: result.score * bm25Weight
        })
      }
    }

    // 排序并返回
    const merged = Array.from(mergedMap.values())
    merged.sort((a, b) => b.score - a.score)
    return merged.slice(0, topK)
  }

  /**
   * 获取文档列表
   */
  getDocuments(): DocumentMetadata[] {
    return Array.from(this._documents.values())
  }

  /**
   * 获取文档
   */
  getDocument(documentId: string): DocumentMetadata | undefined {
    return this._documents.get(documentId)
  }

  /**
   * 获取统计信息
   */
  getStats(): KnowledgeBaseStats {
    const documents = this.getDocuments()
    const vectorStats = this._vectorStore.getStats()

    return {
      documentCount: documents.length,
      chunkCount: vectorStats.chunkCount,
      totalSize: documents.reduce((sum, doc) => sum + doc.size, 0),
      lastUpdated: Math.max(...documents.map(doc => doc.updatedAt), 0)
    }
  }

  /**
   * 清空知识库
   */
  clear(): void {
    this._documents.clear()
    this._vectorStore.clear()
    log.info('知识库已清空')
  }
}

/**
 * 创建知识库管理器实例
 */
export function createKnowledgeBaseManager(
  config: KnowledgeBaseConfig,
  embeddingProvider?: EmbeddingProvider
): KnowledgeBaseManager {
  return new KnowledgeBaseManager(config, embeddingProvider)
}

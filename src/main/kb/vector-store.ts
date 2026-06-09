/**
 * 向量存储
 * P3 阶段：内存余弦相似度 + JSON 持久化
 */

import { create } from '../utils/console-logger'
import type { DocumentChunk, SearchResult } from './types'

const log = create('VectorStore')

/**
 * 向量存储
 * 基于内存的向量存储，支持余弦相似度检索
 */
export class VectorStore {
  private _chunks = new Map<string, DocumentChunk>()
  private _vectors = new Map<string, number[]>()

  /**
   * 添加 Chunk
   */
  add(chunk: DocumentChunk): void {
    if (!chunk.embedding) {
      throw new Error(`Chunk ${chunk.id} 没有嵌入向量`)
    }
    this._chunks.set(chunk.id, chunk)
    this._vectors.set(chunk.id, chunk.embedding)
  }

  /**
   * 批量添加 Chunk
   */
  addMany(chunks: DocumentChunk[]): void {
    for (const chunk of chunks) {
      this.add(chunk)
    }
    log.info(`添加 ${chunks.length} 个 Chunk 到向量存储`)
  }

  /**
   * 删除 Chunk
   */
  remove(chunkId: string): boolean {
    const deleted = this._chunks.delete(chunkId)
    this._vectors.delete(chunkId)
    return deleted
  }

  /**
   * 按文档 ID 删除
   */
  removeByDocument(documentId: string): number {
    let count = 0
    for (const [id, chunk] of this._chunks) {
      if (chunk.documentId === documentId) {
        this._chunks.delete(id)
        this._vectors.delete(id)
        count++
      }
    }
    return count
  }

  /**
   * 检索相似 Chunk
   */
  search(queryEmbedding: number[], topK: number = 5, minScore: number = 0): SearchResult[] {
    const results: SearchResult[] = []

    for (const [id, chunk] of this._chunks) {
      const chunkEmbedding = this._vectors.get(id)
      if (!chunkEmbedding) continue

      const score = this._cosineSimilarity(queryEmbedding, chunkEmbedding)
      if (score >= minScore) {
        results.push({
          chunk,
          score,
          citation: `[来源: ${chunk.metadata.filename}, 段落 ${chunk.metadata.paragraph}]`
        })
      }
    }

    // 按分数排序
    results.sort((a, b) => b.score - a.score)

    return results.slice(0, topK)
  }

  /**
   * 获取 Chunk
   */
  get(chunkId: string): DocumentChunk | undefined {
    return this._chunks.get(chunkId)
  }

  /**
   * 获取所有 Chunk
   */
  getAll(): DocumentChunk[] {
    return Array.from(this._chunks.values())
  }

  /**
   * 按文档 ID 获取
   */
  getByDocument(documentId: string): DocumentChunk[] {
    return this.getAll().filter(c => c.documentId === documentId)
  }

  /**
   * 获取统计信息
   */
  getStats(): { chunkCount: number; documentCount: number } {
    const documentIds = new Set(this._chunks.values().map(c => c.documentId))
    return {
      chunkCount: this._chunks.size,
      documentCount: documentIds.size
    }
  }

  /**
   * 清空
   */
  clear(): void {
    this._chunks.clear()
    this._vectors.clear()
  }

  /**
   * 余弦相似度计算
   */
  private _cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('向量维度不匹配')
    }

    let dotProduct = 0
    let normA = 0
    let normB = 0

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i]
      normA += a[i] * a[i]
      normB += b[i] * b[i]
    }

    normA = Math.sqrt(normA)
    normB = Math.sqrt(normB)

    if (normA === 0 || normB === 0) {
      return 0
    }

    return dotProduct / (normA * normB)
  }

  /**
   * 导出为 JSON
   */
  toJSON(): string {
    const data = {
      chunks: Array.from(this._chunks.entries()),
      vectors: Array.from(this._vectors.entries())
    }
    return JSON.stringify(data)
  }

  /**
   * 从 JSON 导入
   */
  fromJSON(json: string): void {
    const data = JSON.parse(json)
    this._chunks = new Map(data.chunks)
    this._vectors = new Map(data.vectors)
    log.info(`从 JSON 导入 ${this._chunks.size} 个 Chunk`)
  }
}

/**
 * 创建向量存储实例
 */
export function createVectorStore(): VectorStore {
  return new VectorStore()
}

/**
 * 文档分块器
 * 将文档内容切分为 Chunk
 */

import { create } from '../utils/console-logger'
import type { DocumentChunk } from './types'

const log = create('Chunker')

/** 分块配置 */
export interface ChunkerConfig {
  /** Chunk 大小（字符数） */
  chunkSize: number
  /** Chunk 重叠（字符数） */
  chunkOverlap: number
}

/** 默认配置 */
const DEFAULT_CONFIG: ChunkerConfig = {
  chunkSize: 500,
  chunkOverlap: 100
}

/**
 * 文档分块器
 */
export class Chunker {
  private _config: ChunkerConfig

  constructor(config?: Partial<ChunkerConfig>) {
    this._config = { ...DEFAULT_CONFIG, ...config }
  }

  /**
   * 将文本切分为 Chunk
   */
  chunkText(
    text: string,
    documentId: string,
    filename: string
  ): Array<Omit<DocumentChunk, 'embedding'>> {
    const chunks: Array<Omit<DocumentChunk, 'embedding'>> = []

    // 智能分块：按段落、句子、字符三级切分
    const segments = this._smartSplit(text)

    let currentChunk = ''
    let currentOffset = 0
    let chunkIndex = 0

    for (const segment of segments) {
      // 如果当前 Chunk 加上新段落超过大小限制
      if (currentChunk.length + segment.length > this._config.chunkSize && currentChunk.length > 0) {
        // 保存当前 Chunk
        chunks.push(this._createChunk(
          documentId,
          chunkIndex,
          currentChunk.trim(),
          filename,
          currentOffset - currentChunk.length,
          currentOffset
        ))
        chunkIndex++

        // 保留重叠部分
        const overlapStart = Math.max(0, currentChunk.length - this._config.chunkOverlap)
        currentChunk = currentChunk.substring(overlapStart) + segment
        currentOffset += segment.length
      } else {
        currentChunk += segment
        currentOffset += segment.length
      }
    }

    // 保存最后一个 Chunk
    if (currentChunk.trim().length > 0) {
      chunks.push(this._createChunk(
        documentId,
        chunkIndex,
        currentChunk.trim(),
        filename,
        currentOffset - currentChunk.length,
        currentOffset
      ))
    }

    log.info(`文档 ${filename} 分块完成: ${chunks.length} 个 Chunk`)
    return chunks
  }

  /**
   * 智能分块：按段落、句子、字符三级切分
   */
  private _smartSplit(text: string): string[] {
    const segments: string[] = []

    // 第一级：按段落切分（双换行）
    const paragraphs = text.split(/\n\s*\n/)

    for (const paragraph of paragraphs) {
      if (paragraph.length <= this._config.chunkSize) {
        // 段落小于 Chunk 大小，直接添加
        segments.push(paragraph + '\n\n')
      } else {
        // 第二级：按句子切分
        const sentences = this._splitSentences(paragraph)
        for (const sentence of sentences) {
          if (sentence.length <= this._config.chunkSize) {
            segments.push(sentence)
          } else {
            // 第三级：按字符切分（保留单词边界）
            const wordChunks = this._splitByWords(sentence)
            segments.push(...wordChunks)
          }
        }
      }
    }

    return segments
  }

  /**
   * 按句子切分
   */
  private _splitSentences(text: string): string[] {
    // 中英文句子切分
    const sentenceRegex = /[^。！？.!?\n]+[。！？.!?\n]+/g
    const sentences: string[] = []
    let match

    while ((match = sentenceRegex.exec(text)) !== null) {
      sentences.push(match[0])
    }

    // 处理没有标点结尾的部分
    const lastMatch = sentenceRegex.lastIndex
    if (lastMatch < text.length) {
      sentences.push(text.substring(lastMatch))
    }

    return sentences.length > 0 ? sentences : [text]
  }

  /**
   * 按单词切分（保留单词边界）
   */
  private _splitByWords(text: string): string[] {
    const chunks: string[] = []
    const words = text.split(/(\s+)/)
    let currentChunk = ''

    for (const word of words) {
      if (currentChunk.length + word.length > this._config.chunkSize) {
        if (currentChunk.length > 0) {
          chunks.push(currentChunk)
        }
        currentChunk = word
      } else {
        currentChunk += word
      }
    }

    if (currentChunk.length > 0) {
      chunks.push(currentChunk)
    }

    return chunks.length > 0 ? chunks : [text]
  }

  /**
   * 创建 Chunk 对象
   */
  private _createChunk(
    documentId: string,
    index: number,
    content: string,
    filename: string,
    startOffset: number,
    endOffset: number
  ): Omit<DocumentChunk, 'embedding'> {
    return {
      id: `${documentId}_chunk_${index}`,
      documentId,
      index,
      content,
      metadata: {
        filename,
        paragraph: index,
        startOffset,
        endOffset
      }
    }
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<ChunkerConfig>): void {
    this._config = { ...this._config, ...config }
  }
}

/**
 * 创建分块器实例
 */
export function createChunker(config?: Partial<ChunkerConfig>): Chunker {
  return new Chunker(config)
}

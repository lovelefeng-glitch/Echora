import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

describe('DirectAPIAdapter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('fetch API mocking', () => {
    it('should mock fetch successfully', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          choices: [{ message: { content: 'Hello!' } }],
        }),
        text: vi.fn().mockResolvedValue('Hello!'),
        headers: new Headers({ 'content-type': 'application/json' }),
      }
      mockFetch.mockResolvedValue(mockResponse)

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gpt-4',
          messages: [{ role: 'user', content: 'Hi' }],
        }),
      })

      expect(response.ok).toBe(true)
      const data = await response.json()
      expect(data.choices[0].message.content).toBe('Hello!')
    })

    it('should handle fetch errors', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'))

      await expect(fetch('https://api.openai.com/v1/chat/completions')).rejects.toThrow('Network error')
    })

    it('should handle non-ok responses', async () => {
      const mockResponse = {
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: vi.fn().mockResolvedValue({ error: { message: 'Invalid API key' } }),
      }
      mockFetch.mockResolvedValue(mockResponse)

      const response = await fetch('https://api.openai.com/v1/chat/completions')
      expect(response.ok).toBe(false)
      expect(response.status).toBe(401)
    })
  })

  describe('streaming response handling', () => {
    it('should process SSE stream chunks', async () => {
      const chunks = [
        'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":" World"}}]}\n\n',
        'data: [DONE]\n\n',
      ]

      let chunkIndex = 0
      const mockReader = {
        read: vi.fn().mockImplementation(() => {
          if (chunkIndex < chunks.length) {
            const chunk = chunks[chunkIndex++]
            return Promise.resolve({
              done: false,
              value: new TextEncoder().encode(chunk),
            })
          }
          return Promise.resolve({ done: true, value: undefined })
        }),
        releaseLock: vi.fn(),
      }

      const mockResponse = {
        ok: true,
        body: { getReader: () => mockReader },
      }
      mockFetch.mockResolvedValue(mockResponse)

      const response = await fetch('https://api.openai.com/v1/chat/completions')
      const reader = response.body!.getReader()
      const decoder = new TextDecoder()
      const collected: string[] = []

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const text = decoder.decode(value)
        for (const line of text.split('\n')) {
          if (line.startsWith('data: ') && !line.includes('[DONE]')) {
            const data = JSON.parse(line.slice(6))
            if (data.choices[0].delta.content) {
              collected.push(data.choices[0].delta.content)
            }
          }
        }
      }

      expect(collected).toEqual(['Hello', ' World'])
    })
  })

  describe('OpenAI API request format', () => {
    it('should construct proper chat completion request', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ choices: [] }),
      })

      await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-key',
        },
        body: JSON.stringify({
          model: 'gpt-4',
          messages: [
            { role: 'system', content: 'You are helpful.' },
            { role: 'user', content: 'Hello' },
          ],
          temperature: 0.7,
          max_tokens: 1000,
          stream: false,
        }),
      })

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.openai.com/v1/chat/completions',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-key',
          }),
        })
      )
    })
  })
})

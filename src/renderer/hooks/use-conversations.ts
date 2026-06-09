import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useAppStore, type Conversation, type Message } from '../stores/app-store'
import { useEchora } from './use-echora'
import type { ConvData, ConvListResult } from '../../shared/ipc-types'

const AUTO_SAVE_DEBOUNCE_MS = 1500

function generateId(): string {
  return `conv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function generateTitle(firstMessage?: string): string {
  if (firstMessage) {
    const trimmed = firstMessage.trim().replace(/\n/g, ' ')
    return trimmed.length > 40 ? trimmed.slice(0, 40) + '...' : trimmed
  }
  const now = new Date()
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  const hh = String(now.getHours()).padStart(2, '0')
  const mi = String(now.getMinutes()).padStart(2, '0')
  return `新会话 ${mm}-${dd} ${hh}:${mi}`
}

function convToStore(data: ConvData): Conversation {
  return {
    id: data.id,
    title: data.title,
    messages: data.messages.map((m, i) => ({
      id: `${data.id}_msg_${i}`,
      role: m.role as Message['role'],
      content: m.content,
      timestamp: m.timestamp ?? 0,
      model: m.model,
      usage: m.usage,
      toolCalls: m.toolCalls
    })),
    createdAt: data.createdAt ?? 0,
    updatedAt: data.updatedAt ?? 0
  }
}

function storeToConv(conv: Conversation): ConvData {
  return {
    id: conv.id,
    title: conv.title,
    messages: conv.messages.map((m) => ({
      role: m.role,
      content: m.content,
      timestamp: m.timestamp,
      model: m.model,
      usage: m.usage,
      toolCalls: m.toolCalls
    })),
    createdAt: conv.createdAt,
    updatedAt: conv.updatedAt
  }
}

function conversationsToConvListResult(
  conversations: Record<string, Record<string, Conversation>>
): ConvListResult {
  const result: ConvListResult = {}
  for (const agentKey of Object.keys(conversations)) {
    result[agentKey] = {}
    for (const convId of Object.keys(conversations[agentKey])) {
      result[agentKey][convId] = storeToConv(conversations[agentKey][convId])
    }
  }
  return result
}

/**
 * Load all conversations from disk into the store.
 * Called on app startup to restore previously saved state.
 */
export async function loadAllConversationsFromDisk(): Promise<void> {
  try {
    const api = window.echora
    if (!api?.conversations?.load) return
    const result = await api.conversations.load() as ConvListResult
    const { addConversation } = useAppStore.getState()
    for (const [agentKey, agentData] of Object.entries(result)) {
      for (const [, convData] of Object.entries(agentData)) {
        addConversation(agentKey, convToStore(convData))
      }
    }
  } catch (err) {
    console.error('Failed to load all conversations from disk:', err)
  }
}

export function useConversations(agentKey: string | null) {
  const api = useEchora()
  const conversations = useAppStore((s) => s.conversations)
  const activeConversationId = useAppStore((s) => s.activeConversationId)
  const addConversation = useAppStore((s) => s.addConversation)
  const removeConversation = useAppStore((s) => s.removeConversation)
  const setActiveConversation = useAppStore((s) => s.setActiveConversation)
  const updateConversation = useAppStore((s) => s.updateConversation)

  const agentConversations = useMemo(() => {
    if (!agentKey) return []
    const agentConvs = conversations[agentKey]
    if (!agentConvs) return []
    return Object.values(agentConvs).sort((a, b) => b.updatedAt - a.updatedAt)
  }, [conversations, agentKey])

  const currentConversationId = useMemo(() => {
    if (!agentKey) return null
    return activeConversationId[agentKey] ?? null
  }, [activeConversationId, agentKey])

  const currentConversation = useMemo(() => {
    if (!agentKey || !currentConversationId) return null
    return conversations[agentKey]?.[currentConversationId] ?? null
  }, [conversations, agentKey, currentConversationId])

  const loadConversations = useCallback(async () => {
    if (!agentKey) return
    // Skip loading from disk if this agent already has conversations in memory
    // (in-memory data is always newer than disk due to auto-save debounce)
    const existing = useAppStore.getState().conversations[agentKey]
    if (existing && Object.keys(existing).length > 0) return
    try {
      const result = await api.conv.list(agentKey) as ConvListResult
      const agentData = result[agentKey]
      if (agentData) {
        for (const [, convData] of Object.entries(agentData)) {
          addConversation(agentKey, convToStore(convData))
        }
      }
    } catch (err) {
      console.error('Failed to load conversations:', err)
    }
  }, [agentKey, api, addConversation])

  const createConversation = useCallback(
    async (firstMessage?: string): Promise<Conversation | null> => {
      if (!agentKey) return null
      const id = generateId()
      const title = generateTitle(firstMessage)
      const now = Date.now()
      const conv: Conversation = {
        id,
        title,
        messages: [],
        createdAt: now,
        updatedAt: now
      }
      addConversation(agentKey, conv)
      setActiveConversation(agentKey, id)
      try {
        await api.conv.save(agentKey, id, storeToConv(conv))
      } catch (err) {
        console.error('Failed to save new conversation:', err)
      }
      return conv
    },
    [agentKey, api, addConversation, setActiveConversation]
  )

  const deleteConversation = useCallback(
    async (convId: string) => {
      if (!agentKey) return
      removeConversation(agentKey, convId)
      try {
        await api.conv.delete(agentKey, convId)
      } catch (err) {
        console.error('Failed to delete conversation:', err)
      }
    },
    [agentKey, api, removeConversation]
  )

  const deleteAllConversations = useCallback(async () => {
    if (!agentKey) return
    const agentConvs = conversations[agentKey]
    if (agentConvs) {
      for (const convId of Object.keys(agentConvs)) {
        removeConversation(agentKey, convId)
      }
    }
    try {
      await api.conv.deleteAll(agentKey)
    } catch (err) {
      console.error('Failed to delete all conversations:', err)
    }
  }, [agentKey, api, conversations, removeConversation])

  const switchConversation = useCallback(
    (convId: string) => {
      if (!agentKey) return
      setActiveConversation(agentKey, convId)
    },
    [agentKey, setActiveConversation]
  )

  const saveConversation = useCallback(
    async (convId: string) => {
      if (!agentKey) return
      const conv = useAppStore.getState().conversations[agentKey]?.[convId]
      if (!conv) return
      try {
        await api.conv.save(agentKey, convId, storeToConv(conv))
      } catch (err) {
        console.error('Failed to save conversation:', err)
      }
    },
    [agentKey, api, conversations]
  )

  const renameConversation = useCallback(
    (convId: string, newTitle: string) => {
      if (!agentKey) return
      updateConversation(agentKey, convId, { title: newTitle, updatedAt: Date.now() })
    },
    [agentKey, updateConversation]
  )

  // Auto-save: subscribe to store changes and debounce save to disk
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSavedRef = useRef<string>('')
  const isInitializedRef = useRef(false) // 防止初始加载前的 auto-save

  // 标记初始化完成（首次渲染后）
  useEffect(() => {
    // 延迟设置，确保 loadAllConversationsFromDisk 已完成
    const timer = setTimeout(() => {
      isInitializedRef.current = true
    }, 3000) // 3秒后允许 auto-save
    return () => clearTimeout(timer)
  }, [])

  // Force save immediately (used before unmount or agent switch)
  const forceSave = useCallback(async () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }

    const state = useAppStore.getState()
    const converted = conversationsToConvListResult(state.conversations)
    const serialized = JSON.stringify(converted)
    if (serialized !== lastSavedRef.current) {
      lastSavedRef.current = serialized
      await api.conversations.save(converted)
        .catch((err: unknown) => console.error('Force save conversations failed:', err))
    }
  }, [api])

  useEffect(() => {
    const unsub = useAppStore.subscribe((state) => {
      // 初始加载完成前不触发 auto-save，防止空数据覆盖
      if (!isInitializedRef.current) return
      
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current)
      }
      saveTimerRef.current = setTimeout(() => {
        const converted = conversationsToConvListResult(state.conversations)
        const serialized = JSON.stringify(converted)
        if (serialized === lastSavedRef.current) return
        lastSavedRef.current = serialized
        api.conversations.save(converted)
          .catch((err: unknown) => console.error('Auto-save conversations failed:', err))
      }, AUTO_SAVE_DEBOUNCE_MS)
    })

    return () => {
      unsub()
      // Force save before cleanup to prevent losing unsaved messages
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current)
        const state = useAppStore.getState()
        const converted = conversationsToConvListResult(state.conversations)
        const serialized = JSON.stringify(converted)
        if (serialized !== lastSavedRef.current) {
          lastSavedRef.current = serialized
          api.conversations.save(converted)
            .catch((err: unknown) => console.error('Cleanup save conversations failed:', err))
        }
      }
    }
  }, [api])

  useEffect(() => {
    loadConversations()
  }, [loadConversations])

  return {
    conversations: agentConversations,
    currentConversationId,
    currentConversation,
    loadConversations,
    createConversation,
    deleteConversation,
    deleteAllConversations,
    switchConversation,
    saveConversation,
    renameConversation
  }
}

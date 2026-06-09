/**
 * SQLite 存储层单元测试
 * 
 * 测试 SQLiteDatabase, SqliteSessionStore, SqliteMemoryStore
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { SQLiteDatabase, createSchema, SqliteSessionStore, SqliteMemoryStore } from '../../src/main/store'

describe('SQLiteDatabase', () => {
  let db: SQLiteDatabase

  beforeAll(() => {
    db = new SQLiteDatabase({ path: ':memory:', enableWAL: false })
  })

  afterAll(() => {
    db.close()
  })

  it('should create database successfully', () => {
    expect(db).toBeDefined()
    expect(db.closed).toBe(false)
  })

  it('should execute SQL statements', () => {
    db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)')
    db.exec("INSERT INTO test VALUES (1, 'hello')")
    const row = db.get<{ id: number; name: string }>('SELECT * FROM test WHERE id = 1')
    expect(row).toBeDefined()
    expect(row?.name).toBe('hello')
  })

  it('should support transactions', () => {
    db.exec('CREATE TABLE test2 (id INTEGER PRIMARY KEY, value TEXT)')
    
    db.transaction(() => {
      db.exec("INSERT INTO test2 VALUES (1, 'a')")
      db.exec("INSERT INTO test2 VALUES (2, 'b')")
    })
    
    const rows = db.all<{ id: number; value: string }>('SELECT * FROM test2')
    expect(rows).toHaveLength(2)
  })

  it('should rollback on transaction error', () => {
    db.exec('CREATE TABLE test3 (id INTEGER PRIMARY KEY, value TEXT)')
    
    try {
      db.transaction(() => {
        db.exec("INSERT INTO test3 VALUES (1, 'a')")
        throw new Error('Test error')
      })
    } catch (e) {
      // Expected
    }
    
    const rows = db.all<{ id: number; value: string }>('SELECT * FROM test3')
    expect(rows).toHaveLength(0)
  })

  it('should close database', () => {
    const testDb = new SQLiteDatabase({ path: ':memory:', enableWAL: false })
    testDb.close()
    expect(testDb.closed).toBe(true)
  })
})

describe('Schema', () => {
  let db: SQLiteDatabase

  beforeAll(() => {
    db = new SQLiteDatabase({ path: ':memory:', enableWAL: false })
    createSchema(db)
  })

  afterAll(() => {
    db.close()
  })

  it('should create sessions table', () => {
    const tables = db.all<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='sessions'"
    )
    expect(tables).toHaveLength(1)
  })

  it('should create messages table', () => {
    const tables = db.all<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='messages'"
    )
    expect(tables).toHaveLength(1)
  })

  it('should create memories table', () => {
    const tables = db.all<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='memories'"
    )
    expect(tables).toHaveLength(1)
  })

  it('should create FTS5 virtual tables', () => {
    const tables = db.all<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='messages_fts'"
    )
    expect(tables).toHaveLength(1)
  })
})

describe('SqliteSessionStore', () => {
  let db: SQLiteDatabase
  let store: SqliteSessionStore

  beforeAll(() => {
    db = new SQLiteDatabase({ path: ':memory:', enableWAL: false })
    createSchema(db)
    store = new SqliteSessionStore(db)
  })

  afterAll(() => {
    db.close()
  })

  it('should create session', async () => {
    const session = await store.createSession('echora', 'Test Session')
    expect(session).toBeDefined()
    expect(session.agentKey).toBe('echora')
    expect(session.title).toBe('Test Session')
    expect(session.messageCount).toBe(0)
  })

  it('should get session', async () => {
    const session = await store.createSession('echora', 'Get Test')
    const retrieved = await store.getSession(session.id)
    expect(retrieved).toBeDefined()
    expect(retrieved?.id).toBe(session.id)
  })

  it('should list sessions', async () => {
    await store.createSession('echora', 'List Test 1')
    await store.createSession('echora', 'List Test 2')
    const sessions = await store.listSessions('echora')
    expect(sessions.length).toBeGreaterThanOrEqual(2)
  })

  it('should add message', async () => {
    const session = await store.createSession('echora', 'Message Test')
    const msg = await store.addMessage(session.id, {
      role: 'user',
      content: 'Hello'
    })
    expect(msg).toBeDefined()
    expect(msg.role).toBe('user')
    expect(msg.content).toBe('Hello')
  })

  it('should get messages', async () => {
    const session = await store.createSession('echora', 'Get Messages Test')
    await store.addMessage(session.id, { role: 'user', content: 'Msg 1' })
    await store.addMessage(session.id, { role: 'assistant', content: 'Msg 2' })
    
    const messages = await store.getMessages(session.id)
    expect(messages).toHaveLength(2)
  })

  it('should delete session', async () => {
    const session = await store.createSession('echora', 'Delete Test')
    const deleted = await store.deleteSession(session.id)
    expect(deleted).toBe(true)
    
    const retrieved = await store.getSession(session.id)
    expect(retrieved).toBeNull()
  })
})

describe('SqliteMemoryStore', () => {
  let db: SQLiteDatabase
  let store: SqliteMemoryStore

  beforeAll(() => {
    db = new SQLiteDatabase({ path: ':memory:', enableWAL: false })
    createSchema(db)
    store = new SqliteMemoryStore(db)
  })

  afterAll(() => {
    db.close()
  })

  it('should save memory', async () => {
    const memory = await store.save({
      category: 'preference',
      content: 'User likes concise code',
      keywords: ['code', 'style'],
      source: 'test'
    })
    expect(memory).toBeDefined()
    expect(memory.category).toBe('preference')
    expect(memory.content).toBe('User likes concise code')
  })

  it('should get memory by id', async () => {
    const memory = await store.save({
      category: 'fact',
      content: 'Test fact',
      keywords: ['test'],
      source: 'test'
    })
    const retrieved = await store.get(memory.id)
    expect(retrieved).toBeDefined()
    expect(retrieved?.content).toBe('Test fact')
  })

  it('should get memories by category', async () => {
    await store.save({ category: 'preference', content: 'Pref 1', keywords: [], source: 'test' })
    await store.save({ category: 'preference', content: 'Pref 2', keywords: [], source: 'test' })
    await store.save({ category: 'fact', content: 'Fact 1', keywords: [], source: 'test' })
    
    const preferences = await store.getByCategory('preference')
    expect(preferences).toHaveLength(2)
  })

  it('should delete memory', async () => {
    const memory = await store.save({
      category: 'decision',
      content: 'Delete me',
      keywords: [],
      source: 'test'
    })
    const deleted = await store.delete(memory.id)
    expect(deleted).toBe(true)
    
    const retrieved = await store.get(memory.id)
    expect(retrieved).toBeNull()
  })

  it('should update access count', async () => {
    const memory = await store.save({
      category: 'fact',
      content: 'Touch me',
      keywords: [],
      source: 'test'
    })
    
    await store.touch(memory.id)
    await store.touch(memory.id)
    
    const retrieved = await store.get(memory.id)
    expect(retrieved?.accessCount).toBe(2)
  })
})

# Sprint 11 Phase 1：存储层迁移 SQLite

> **状态**: 📅 待确认
> **创建时间**: 2026-06-08 19:35
> **目标**: 会话持久化 + 记忆系统从 JSON/JSONL 迁移到 SQLite
> **架构原则**: 可插拔设计，支持后期替换记忆和压缩策略

---

## 一、架构设计原则

### 🎯 核心理念：接口驱动，策略可替换

```
┌─────────────────────────────────────────────────────────┐
│                    AgentManager                         │
│                        │                                │
│         ┌──────────────┼──────────────┐                │
│         ▼              ▼              ▼                │
│  ┌─────────────┐ ┌──────────┐ ┌──────────────┐        │
│  │ SessionStore│ │ Memory   │ │ Compressor   │        │
│  │ (接口)      │ │ (接口)   │ │ (接口)       │        │
│  └──────┬──────┘ └────┬─────┘ └──────┬───────┘        │
│         │              │              │                 │
│    ┌────┴────┐    ┌────┴────┐    ┌────┴────┐           │
│    │ SQLite  │    │ SQLite  │    │ Summary │           │
│    │ 实现    │    │ 实现    │    │ 实现    │           │
│    └─────────┘    └─────────┘    └─────────┘           │
│         │              │              │                 │
│    ┌────┴────┐    ┌────┴────┐    ┌────┴────┐           │
│    │ JSON    │    │ Vector  │    │ Sliding │           │
│    │ (备用)  │    │ (未来)  │    │ Window  │           │
│    └─────────┘    └─────────┘    └─────────┘           │
└─────────────────────────────────────────────────────────┘
```

### 为什么这样设计？

| 场景 | 好处 |
|------|------|
| 后期想换记忆系统 | 只需实现新接口，不改 Agent 代码 |
| 后期想试向量搜索 | 插入 VectorMemory，旧代码不动 |
| 后期想试不同压缩 | 插入新 Compressor，旧代码不动 |
| 测试时用 Mock | 注入 Mock 实现，方便单元测试 |

---

## 二、技术选型

### SQLite 方案

| 方案 | 说明 | 推荐 |
|------|------|------|
| **node:sqlite** | Node.js 22+ 内置，零依赖 | ✅ 推荐 |
| better-sqlite3 | 最流行的 Node SQLite 库 | 备选 |
| sql.js | WASM 版本，跨平台 | 不推荐（性能差） |

**选择 node:sqlite**：Node 24 自带，Electron 42 基于 Node 24，零依赖，性能优秀。

### 存储结构

```
~/.echora/
├── echora.db          # 主数据库（SQLite）
│   ├── sessions       # 会话表
│   ├── messages       # 消息表（FTS5 全文搜索）
│   ├── memories       # 记忆表
│   └── metadata       # 元数据表
├── echora-config.json # 配置文件（保持 JSON）
└── echora-agent.json  # Agent 配置（保持 JSON）
```

---

## 三、接口定义（可插拔核心）

### SessionStore 接口

```typescript
// src/main/store/interfaces.ts

/** 会话存储接口 */
export interface SessionStore {
  /** 创建会话 */
  createSession(agentKey: string, title?: string): Promise<Session>
  /** 获取会话 */
  getSession(sessionId: string): Promise<Session | null>
  /** 列出会话 */
  listSessions(agentKey: string, limit?: number): Promise<Session[]>
  /** 删除会话 */
  deleteSession(sessionId: string): Promise<boolean>
  
  /** 添加消息 */
  addMessage(sessionId: string, message: Message): Promise<void>
  /** 获取消息历史 */
  getMessages(sessionId: string, limit?: number): Promise<Message[]>
  /** 搜索消息（全文搜索） */
  searchMessages(query: string, sessionId?: string): Promise<MessageSearchResult[]>
  
  /** 关闭存储 */
  close(): Promise<void>
}
```

### MemoryStore 接口

```typescript
/** 记忆存储接口 */
export interface MemoryStore {
  /** 保存记忆 */
  save(entry: MemoryEntry): Promise<void>
  /** 搜索记忆 */
  search(query: string, limit?: number): Promise<MemorySearchResult[]>
  /** 获取分类记忆 */
  getByCategory(category: MemoryCategory): Promise<MemoryEntry[]>
  /** 删除记忆 */
  delete(id: string): Promise<boolean>
  /** 更新访问计数 */
  touch(id: string): Promise<void>
  
  /** 关闭存储 */
  close(): Promise<void>
}

/** 记忆条目 */
export interface MemoryEntry {
  id: string
  category: MemoryCategory
  content: string
  keywords: string[]
  source: string
  createdAt: number
  updatedAt: number
  accessCount: number
  metadata?: Record<string, unknown>
}

/** 记忆分类 */
export type MemoryCategory = 'fact' | 'preference' | 'decision' | 'skill' | 'context'
```

### ContextCompressor 接口

```typescript
/** 上下文压缩器接口 */
export interface ContextCompressor {
  /** 压缩名称 */
  readonly name: string
  
  /** 检查是否需要压缩 */
  shouldCompress(messages: Message[], tokenCount: number): boolean
  
  /** 执行压缩 */
  compress(messages: Message[]): Promise<CompressedContext>
  
  /** 获取压缩后的 token 数 */
  estimateTokens(compressed: CompressedContext): number
}

/** 压缩后的上下文 */
export interface CompressedContext {
  /** 保留的消息 */
  kept: Message[]
  /** 摘要（如果有） */
  summary?: string
  /** 压缩比 */
  ratio: number
  /** 压缩策略 */
  strategy: string
}
```

---

## 四、当前实现（基础版）

### Phase 1 实现

| 接口 | 实现类 | 说明 |
|------|--------|------|
| SessionStore | SqliteSessionStore | SQLite + FTS5 |
| MemoryStore | SqliteMemoryStore | SQLite + FTS5 |
| ContextCompressor | SummaryCompressor | 摘要压缩（基础版） |

### 未来可扩展方向

| 接口 | 可能的实现 | 说明 |
|------|-----------|------|
| MemoryStore | VectorMemoryStore | 向量相似度搜索 |
| MemoryStore | GraphMemoryStore | 图数据库记忆网络 |
| MemoryStore | HierarchicalMemory | 分层记忆（短期/中期/长期） |
| ContextCompressor | SlidingWindowCompressor | 滑动窗口压缩 |
| ContextCompressor | ImportanceCompressor | 基于重要性选择保留 |
| ContextCompressor | TreeCompressor | 树状压缩（保留关键分支） |
| ContextCompressor | SemanticCompressor | 语义相似度压缩 |

---

## 五、数据库 Schema

### 会话表 (sessions)

```sql
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  agent_key TEXT NOT NULL,
  title TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  message_count INTEGER DEFAULT 0,
  metadata TEXT  -- JSON 扩展字段
);

CREATE INDEX idx_sessions_agent ON sessions(agent_key);
CREATE INDEX idx_sessions_updated ON sessions(updated_at DESC);
```

### 消息表 (messages)

```sql
CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  role TEXT NOT NULL,  -- 'user' | 'assistant' | 'system'
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  metadata TEXT,  -- JSON 扩展字段（tool_calls, usage 等）
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE INDEX idx_messages_session ON messages(session_id, created_at);

-- FTS5 全文搜索
CREATE VIRTUAL TABLE messages_fts USING fts5(
  content,
  content='messages',
  content_rowid='rowid'
);
```

### 记忆表 (memories)

```sql
CREATE TABLE memories (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,  -- 'fact' | 'preference' | 'decision' | 'skill' | 'context'
  content TEXT NOT NULL,
  keywords TEXT,  -- JSON 数组
  source TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  access_count INTEGER DEFAULT 0,
  metadata TEXT  -- JSON 扩展字段
);

CREATE INDEX idx_memories_category ON memories(category);
CREATE INDEX idx_memories_access ON memories(access_count DESC);

-- FTS5 全文搜索
CREATE VIRTUAL TABLE memories_fts USING fts5(
  content,
  keywords,
  content='memories',
  content_rowid='rowid'
);
```

---

## 六、迁移方案

### 迁移策略

```
1. 新建 SQLite SQLiteDatabase 类（封装 node:sqlite）
2. 新建 SqliteSessionStore（实现 SessionStore 接口）
3. 新建 SqliteMemoryStore（实现 MemoryStore 接口）
4. 自动迁移：首次启动时检测旧 JSON/JSONL 文件 → 导入 SQLite
5. 迁移完成后保留旧文件作为备份（.bak）
```

### 向后兼容

- 保留旧 JSON/JSONL 文件（不删除）
- 迁移完成后在配置中标记 `storageMigrated: true`
- 如果 SQLite 损坏，可以回退到 JSON/JSONL

---

## 七、文件变更清单

### 新增文件

| 文件 | 说明 |
|------|------|
| `src/main/store/interfaces.ts` | 接口定义（SessionStore, MemoryStore, ContextCompressor） |
| `src/main/store/sqlite.ts` | SQLite 数据库封装（node:sqlite） |
| `src/main/store/schema.ts` | 数据库 Schema 定义 |
| `src/main/store/migrate.ts` | JSON/JSONL → SQLite 迁移脚本 |
| `src/main/store/sqlite-session-store.ts` | SQLite 版会话存储 |
| `src/main/store/sqlite-memory-store.ts` | SQLite 版记忆存储 |
| `src/main/store/compressors/summary.ts` | 摘要压缩器（基础版） |

### 修改文件

| 文件 | 变更 |
|------|------|
| `src/main/agent/agent-manager.ts` | 使用新接口，注入存储实现 |
| `src/main/index.ts` | 初始化时运行迁移检查 |

---

## 八、实现步骤

### Step 1：接口定义
```
新建 src/main/store/interfaces.ts
- SessionStore 接口
- MemoryStore 接口
- ContextCompressor 接口
- 相关类型定义
```

### Step 2：SQLite 封装层
```
新建 src/main/store/sqlite.ts
- 打开/关闭数据库
- 执行 SQL 查询
- 事务支持
- 错误处理
```

### Step 3：Schema 定义
```
新建 src/main/store/schema.ts
- 创建表结构
- 创建索引
- 创建 FTS5 虚拟表
```

### Step 4：迁移脚本
```
新建 src/main/store/migrate.ts
- 检测旧 JSON/JSONL 文件
- 读取并解析数据
- 写入 SQLite
- 标记迁移完成
```

### Step 5：SQLite SessionStore
```
新建 src/main/store/sqlite-session-store.ts
- 实现 SessionStore 接口
- 使用 SQLite 存储
- 支持 FTS5 搜索
```

### Step 6：SQLite MemoryStore
```
新建 src/main/store/sqlite-memory-store.ts
- 实现 MemoryStore 接口
- 使用 SQLite 存储
- 支持 FTS5 搜索
```

### Step 7：摘要压缩器
```
新建 src/main/store/compressors/summary.ts
- 实现 ContextCompressor 接口
- 基础版：保留最近 N 轮 + 摘要
- 支持后期替换为更高级策略
```

### Step 8：集成
```
修改 agent-manager.ts
- 注入 SessionStore 和 MemoryStore
- 使用 ContextCompressor
- 保持接口兼容
```

### Step 9：测试验证
```
- 创建会话 → 写入消息 → 读取验证
- 创建记忆 → 搜索验证
- 迁移旧数据 → 验证完整性
- 压缩功能 → 验证压缩比
```

---

## 九、风险评估

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|---------|
| node:sqlite API 不稳定 | 低 | 高 | 保留旧代码作为回退 |
| 迁移数据丢失 | 低 | 高 | 保留旧文件备份 |
| 接口设计不合理 | 中 | 中 | 先实现再调整，保持灵活 |
| 性能下降 | 极低 | 中 | SQLite 比 JSON 更快 |

---

## 十、验收标准

- [ ] `node:sqlite` 在 Electron 42 中正常工作
- [ ] SessionStore 接口定义清晰
- [ ] MemoryStore 接口定义清晰
- [ ] ContextCompressor 接口定义清晰
- [ ] 会话创建/读取/删除正常
- [ ] 消息写入/读取正常
- [ ] FTS5 全文搜索正常
- [ ] 记忆创建/搜索正常
- [ ] 旧数据自动迁移到 SQLite
- [ ] 迁移后保留旧文件备份
- [ ] 压缩器可配置可替换
- [ ] 性能不低于 JSON/JSONL 方案

---

## 十一、后期扩展路线图

### 记忆系统探索方向

| 方向 | 说明 | 参考 |
|------|------|------|
| 向量记忆 | Embedding + 相似度搜索 | Mem0, MemGPT |
| 图记忆 | 知识图谱 + 关系推理 | GraphRAG, Neo4j |
| 分层记忆 | 短期/中期/长期 + 自动迁移 | LangMem |
| 情景记忆 | 记住具体事件和上下文 | cognitive architecture |
| 程序记忆 | 记住怎么做某事 | skill learning |

### 压缩系统探索方向

| 方向 | 说明 | 参考 |
|------|------|------|
| 重要性压缩 | 基于信息重要性选择保留 | LongMem |
| 语义压缩 | 语义相似消息合并 | LLMLingua |
| 树状压缩 | 保留关键决策分支 | Tree of Thoughts |
| 自适应压缩 | 根据任务类型动态调整 | - |

---

## 十二、参考资源

### Hermes 的 SQLite 使用
- 路径：C:\Users\ohfen\AppData\Local\hermes\hermes-agent\hermes_state.py
- 使用 SQLite + FTS5 存储会话
- 支持全文搜索和时间范围查询

### 记忆系统参考
- Mem0：https://github.com/mem0ai/mem0
- MemGPT：https://github.com/cpacker/MemGPT
- LangMem：https://github.com/langchain-ai/langmem

### 压缩系统参考
- LLMLingua：https://github.com/microsoft/LLMLingua
- LongMem：https://arxiv.org/abs/2306.07174

### node:sqlite 文档
- https://nodejs.org/docs/latest-v24.x/api/sqlite.html

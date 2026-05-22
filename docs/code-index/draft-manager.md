# DraftManager 模块文档

> **文件**: `src/manager/draft-manager.js`  
> **最后更新**: 2026-05-23  
> **版本**: v1.0  
> **状态**: ✅ 完成

---

## 一、模块职责

DraftManager 管理 AI 配置的**草稿文件系统**，实现「编辑预览 → 确认保存」的工作流：

- 启动时：原配置 → normalize → 草稿文件（供 UI 读取）
- 编辑时：UI 只读写草稿文件
- 保存时：草稿 → denormalize → 原配置文件
- 重置时：原配置 → normalize → 覆盖草稿

## 二、核心设计思路

### 为什么需要草稿文件？

原配置文件（如 `~/.openclaw/openclaw.json`）由外部 AI 软件管理，Echora 不应直接修改。草稿文件实现：

1. **安全隔离** — 用户在 UI 的编辑不会立即影响原配置
2. **实时预览** — 编辑即时反映到 UI，无需重启
3. **可回滚** — 重置按钮可随时恢复原配置
4. **备份机制** — 保存时自动备份原配置到 `backups/`

### 为什么需要 normalize / denormalize？

原配置文件的结构与 UI 渲染器期望的格式**不一致**：

| 原始配置结构 | UI 渲染器期望 |
|-------------|-------------|
| `gateway.auth.mode` | `gateway.authMode` |
| `agents.list` (对象) | `agents` (数组) |
| `models.providers` (对象) | `models` (数组) |
| `gateway.controlUi.allowInsecureAuth` | `gateway.controlUiAllowInsecure` |
| `model.max_tokens` (snake_case) | `model.maxTokens` (camelCase) |

**normalize**: 原始配置 → 扁平化/标准化 → 草稿文件（UI 友好）  
**denormalize**: 草稿文件 → 还原嵌套结构 → 原始配置（写回时用）

> ⚠️ **踩坑记录 (2026-05-23)**: 最初 DraftManager 直接复制原配置到草稿，未经过 normalize。导致 UI 渲染器读到嵌套结构，字段名全部对不上，设置页参数"丢失"。

## 三、文件结构

```
Echora/
├── drafts/                    ← 草稿文件目录
│   ├── qclaw.json            ← QClaw 配置草稿（normalized）
│   ├── openclaw.json         ← OpenClaw 配置草稿（normalized）
│   └── hermes.json           ← Hermes 配置草稿（normalized）
├── backups/                   ← 原配置备份目录
│   ├── qclaw_2026-05-23T...json
│   └── openclaw_2026-05-23T...json
└── src/manager/draft-manager.js  ← 模块本体
```

## 四、API 清单

### 4.1 初始化

| 方法 | 参数 | 返回值 | 说明 |
|------|------|--------|------|
| `init(aiType)` | `aiType: string` | `{ success, error? }` | 读原配置 → normalize → 写草稿 |
| `initAll()` | — | `{ qclaw: result, openclaw: result, hermes: result }` | 初始化所有类型 |

### 4.2 读写草稿

| 方法 | 参数 | 返回值 | 说明 |
|------|------|--------|------|
| `readDraft(aiType)` | `aiType: string` | `{ success, data }` | 读取草稿（如不存在则自动 init） |
| `writeDraft(aiType, data)` | `aiType, data: object` | `{ success }` | 写入草稿（UI 编辑后调用） |

### 4.3 保存与重置

| 方法 | 参数 | 返回值 | 说明 |
|------|------|--------|------|
| `saveToOriginal(aiType)` | `aiType: string` | `{ success, error? }` | 草稿 → denormalize → 备份 → 写入原配置 |
| `resetDraft(aiType)` | `aiType: string` | `{ success, error? }` | 原配置 → normalize → 覆盖草稿 |

### 4.4 辅助

| 方法 | 参数 | 返回值 | 说明 |
|------|------|--------|------|
| `readRaw(aiType)` | `aiType: string` | `object \| null` | 读取原配置 raw 数据（未 normalize） |
| `denormalize(aiType, draftData)` | `aiType, draftData` | `object` | normalize 后的数据 → 原始格式 |
| `listBackups(aiType)` | `aiType: string` | `string[]` | 列出备份文件名 |
| `getOriginalPath(aiType)` | `aiType: string` | `string \| null` | 原配置文件路径 |
| `getDraftPath(aiType)` | `aiType: string` | `string` | 草稿文件路径 |

## 五、数据流

```
┌──────────────────────────────────────────────────────────┐
│                     启动阶段                              │
│  原配置文件 ──read──→ rawData ──normalize──→ 草稿文件     │
│  (~/.openclaw/       (嵌套结构)    (扁平化)    (drafts/)   │
│   openclaw.json)                                         │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│                     编辑阶段                              │
│  UI 渲染器 ←──readDraft──→ 草稿文件 ←──writeDraft──→ UI  │
│  (renderer.js)         (normalized JSON)                  │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│                     保存阶段                              │
│  草稿文件 ──read──→ draftData ──denormalize──→ 原配置     │
│  (drafts/)          (normalized)   (还原嵌套)   (~/.openclaw/) │
│                      ↓                                   │
│                  备份原配置 → backups/                     │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│                     重置阶段                              │
│  原配置文件 ──readRaw──→ rawData ──normalize──→ 覆盖草稿  │
└──────────────────────────────────────────────────────────┘
```

## 六、关键实现细节

### 6.1 normalize（原始 → 草稿）

委托给 `ConfigReader.normalize(aiType, rawData)`，将嵌套结构转为扁平化格式。

**QClaw/OpenClaw 转换示例**:
```js
// 输入: rawData.gateway.auth.mode = "token"
// 输出: result.gateway.authMode = "token"

// 输入: rawData.agents.list = [{id:"xue", name:"小雪", ...}]
// 输出: result.agents = [{id:"xue", name:"小雪", ...}]

// 输入: rawData.models.providers = {qclaw: {baseUrl:"...", models:[...]}}
// 输出: result.models = [{provider:"qclaw", baseUrl:"...", models:[...]}]
```

**Hermes 转换示例**:
```js
// 输入: rawData.model.max_tokens = 32768
// 输出: result.model.maxTokens = 32768

// 输入: rawData.agent.max_turns = 90
// 输出: result.agent.maxTurns = 90
```

### 6.2 denormalize（草稿 → 原始）

**策略**: 以原配置为「底板」（深拷贝），只覆盖草稿中有变化的字段。

```js
// 1. 读取原配置作为基础
const raw = this.readRaw(aiType);
const result = JSON.parse(JSON.stringify(raw)); // 深拷贝

// 2. 只覆盖 normalize 后的字段
if (d.gateway.authMode) result.gateway.auth.mode = d.gateway.authMode;
if (d.agents) result.agents.list = d.agents.map(/*还原*/);
```

**为什么用深拷贝？**  
原配置可能有草稿未涉及的字段（如自定义插件配置、内部状态），denormalize 只修改已知字段，保留其他一切。

### 6.3 备份机制

每次保存前自动备份原配置到 `backups/{aiType}_{ISO时间戳}.json`。

## 七、IPC 通道

| 通道 | 方向 | 输入 | 输出 | 说明 |
|------|------|------|------|------|
| `draft:read` | renderer→main | `aiType` | `{ success, data }` | 读取草稿 |
| `draft:write` | renderer→main | `aiType, data` | `{ success }` | 写入草稿 |
| `draft:save` | renderer→main | `aiType` | `{ success, error? }` | 草稿→原配置 |
| `draft:reset` | renderer→main | `aiType` | `{ success, error? }` | 原配置→覆盖草稿 |
| `draft:backups` | renderer→main | `aiType` | `string[]` | 备份文件列表 |
| `draft:paths` | renderer→main | — | `{ qclaw: {original, draft}, ... }` | 路径信息 |

## 八、依赖关系

```
draft-manager.js
├── fs (Node.js)
├── path (Node.js)
├── yaml (js-yaml)
├── os (Node.js)
└── config-reader.js ← normalize() / normalizeHermes()
```

## 九、已知限制

1. **不追踪外部修改** — 用户在 Echora 外部修改原配置后，草稿不会自动更新。需点击「重置」按钮刷新。
2. **单窗口** — 两个 Echora 窗口同时编辑同一草稿文件会冲突（当前不支持多窗口）。
3. **Hermes YAML 格式** — 保存时 `yaml.dump()` 可能与原 YAML 格式不完全一致（缩进/顺序），但语义等价。
4. **denormalize 覆盖范围** — 只覆盖 normalize 已知的字段，新增的原配置字段不会被草稿覆盖。

---

*最后更新: 2026-05-23 | 作者: 小雪*

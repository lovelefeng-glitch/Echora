# config-manager.js — 配置管理器

> **文件**: `src/manager/config-manager.js`  
> **职责**: 读写持久化配置 `echora-config.json`  
> **最后更新**: 2026-05-17

---

## 配置存储位置

```
%APPDATA%/echora/echora-config.json
(C:\Users\<用户名>\AppData\Roaming\echora\echora-config.json)
```

---

## 配置数据结构（Schema）

```ts
type Config = {
  firstRun: boolean,                    // 是否首次运行
  aiPaths: Record<string, string>,     // aiType → exe绝对路径
  gatewayConfigs: Record<string, {     // aiType → 网关启动参数
    port?: number,
    // 扩展字段...
  }>,
  lastActive: string | null,           // 上次使用的 AI 类型
  settings: {
    autoStartOnBoot: boolean,
    minimizeToTray: boolean,
    checkUpdates: boolean,
  },
}
```

---

## API

### `ConfigManager.init(filePath) → void`

初始化，参数为配置文件完整路径（由 Electron `app.getPath('userData')` 提供）。

**行为**:
- 自动创建父目录
- 如果配置文件存在 → 合并读取
- 如果不存在 → 使用默认值

### `ConfigManager.get(key: string) → any`

取单个配置值。key 是顶层属性名。

```js
configManager.get('aiPaths')     // → { qclaw: 'C:\\...' }
configManager.get('firstRun')    // → false
```

### `ConfigManager.set(key: string, value: any) → true`

设置单个配置值，自动保存。

### `ConfigManager.getAll() → Config`

返回配置的**浅拷贝**（修改返回值不影响内部状态）。

### `ConfigManager.save() → boolean`

手动触发保存。通常 `set()` 会自调 `save()`。

### `ConfigManager.reset() → void`

恢复默认配置后保存。

---

## 默认值

```js
{
  firstRun: true,
  aiPaths: {},
  gatewayConfigs: {},
  lastActive: null,
  settings: { autoStartOnBoot: false, minimizeToTray: true, checkUpdates: true }
}
```

---

## 修改注意事项

- `getAll()` 返回的是浅拷贝 — 修改嵌套对象 (如 `settings`) 会污染内部状态，但顶层属性不会被影响
- `init()` 里 `JSON.parse` 失败不会崩溃，会打 warn 用默认值
- 不要直接修改 `configData` — 用 `set()` 确保触发 `save()`
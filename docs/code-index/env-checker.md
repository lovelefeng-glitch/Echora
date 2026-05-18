# env-checker.js — 环境检查器

> **文件**: `src/detectors/env-checker.js`  
> **职责**: 检测 Node.js/Python/Git/npm 是否安装及版本  
> **最后更新**: 2026-05-17

---

## 导出对象: EnvChecker

---

## API

### `EnvChecker.checkAll() → Promise<EnvResults>`

检查所有四项环境依赖。

```ts
EnvResults = {
  node: EnvDetail,
  python: EnvDetail,
  git: EnvDetail,
  npm: EnvDetail,
}
```

### `EnvChecker.check(toolKey) → Promise<EnvDetail>`

检查单个工具。

```ts
EnvDetail = {
  name: string,           // 工具名称
  installed: boolean,     // 是否安装
  version: string | null, // 版本号（如 '22.21.1'）
  versionOk: boolean,     // 版本是否满足最低要求
  output: string | null,  // 命令行输出原文
  // 仅未安装时有以下字段:
  error?: string,         // 错误信息
  installUrl?: string,    // 手动下载地址
  canAutoInstall?: boolean,
}
```

### `EnvChecker.install(toolKey) → Promise<InstallResult>`

自动安装环境工具。**注意**: Python 不支持自动安装（`autoInstall: null`）。

```ts
InstallResult = {
  success: boolean,
  message: string,
  installUrl?: string,    // 失败时提供手动下载地址
}
```

---

## 所需环境版本要求

| 工具 | 最低版本 | 类别 | 检测命令 |
|------|----------|------|----------|
| Node.js | 18.0.0 | required | `node --version` |
| python | 3.8.0 | recommended | `py --version` (备用) |
| Git | 2.30.0 | recommended | `git --version` |
| npm | 8.0.0 | required | `npm --version` |

---

## 版本比较逻辑 (`compareVersion`)

```
v1 < v2 → -1
v1 = v2 →  0
v1 > v2 →  1

比较规则: 逐位数字比较 major.minor.patch
```

---

## 自动安装方式

| 平台 | Node.js | Python | Git |
|------|---------|--------|-----|
| Windows | `winget install OpenJS.NodeJS.LTS` | `winget install Python.Python.3.12` | `winget install Git.Git` |
| macOS | `brew install node` | `brew install python@3.12` | `brew install git` |
| Linux | `curl ... setup_20.x ... apt install nodejs` | `apt install python3` | `apt install git` |

---

## 修改注意事项

- 新增环境依赖：在 `REQUIRED_ENV` 中注册
- Python 有三个检测命令: `python --version || python3 --version || py --version`
- 自动安装超时 300 秒
- `compareVersion` 只比较前三位 (`major.minor.patch`)
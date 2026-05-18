#!/usr/bin/env node
/**
 * verify-closure.js — 闭合验证脚本（B-5.5 自动化）
 *
 * 用途：在交付前运行，自动检查代码与文档是否一致。
 * 用法：node verify-closure.js [PROJECT_ROOT]
 * 默认 PROJECT_ROOT = 当前目录
 *
 * 检查项：
 *   1. IPC 表一致性 — main.js 中的 ipcMain.handle/on 是否在 MASTER.md 中有记录
 *   2. 模块文档覆盖 — src目录 JS 文件是否在 docs/code-index/ 中有对应文档
 *   3. 语法检查 — node -c 所有 .js 文件
 *   4. EVOLUTION.md 时效 — 是否今天有更新
 *   5. KANBAN.md 状态 — 是否有标记开发中但未完成的任务
 */


const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ============================================================
// 配置
// ============================================================

const ROOT = process.argv[2] || process.cwd();

const DOCS_DIR = path.join(ROOT, 'docs');
const SRC_DIR = path.join(ROOT, 'src');
const PRELOAD_FILE = path.join(ROOT, 'preload.js');

// 需要检查的 JS 文件目录
const JS_DIRS = [ROOT, SRC_DIR];

// 排除的文件（非代码/无对应模块文档需求）
const EXCLUDE_FILES = new Set([
  'verify-closure.js',
  'node_modules',
]);

// ============================================================
// 工具函数
// ============================================================

const checks = { pass: 0, fail: 0, warn: 0, results: [] };

function pass(msg) { checks.pass++; checks.results.push({ status: 'PASS', msg }); }
function fail(msg) { checks.fail++; checks.results.push({ status: 'FAIL', msg }); }
function warn(msg) { checks.warn++; checks.results.push({ status: 'WARN', msg }); }

function safeRead(filePath) {
  try { return fs.readFileSync(filePath, 'utf8'); }
  catch { return null; }
}

function exists(filePath) {
  return fs.existsSync(filePath);
}

function findJsFiles(dir, list = []) {
  if (!exists(dir)) return list;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    if (e.name.startsWith('.') || e.name === 'node_modules') continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) { findJsFiles(full, list); }
    else if (e.name.endsWith('.js') && !EXCLUDE_FILES.has(e.name)) { list.push(full); }
  }
  return list;
}

// ============================================================
// 检查 1：IPC 表一致性
// ============================================================

function checkIPCTable() {
  console.log('\n📋 检查 1：IPC 表一致性');
  console.log('─'.repeat(50));

  const masterPath = path.join(ROOT, 'docs', 'code-index', 'MASTER.md');
  if (!exists(masterPath)) { fail('MASTER.md 不存在'); return; }

  const masterContent = safeRead(masterPath);
  const mainContent = safeRead(path.join(ROOT, 'main.js'));
  const preloadContent = safeRead(PRELOAD_FILE);

  if (!mainContent) { fail('main.js 不存在'); return; }
  if (!preloadContent) { warn('preload.js 不存在，跳过 preload 侧检查'); }

  // 从 main.js 提取所有 ipcMain.handle() 和 ipcMain.on()
  const mainIPC = [];
  const handleRe = /ipcMain\.handle\s*\(\s*['"]([^'"]+)['"]/g;
  const onRe = /ipcMain\.on\s*\(\s*['"]([^'"]+)['"]/g;
  let m;
  while ((m = handleRe.exec(mainContent))) mainIPC.push({ type: 'handle', channel: m[1] });
  while ((m = onRe.exec(mainContent))) mainIPC.push({ type: 'on', channel: m[1] });

  // 从 main.js 提取所有 webContents.send() 推送事件
  const pushEvents = [];
  const pushRe = /\.webContents\.send\s*\(\s*['"]([^'"]+)['"]/g;
  while ((m = pushRe.exec(mainContent))) pushEvents.push(m[1]);

  // 从 preload.js 提取所有暴露的 API
  const preloadAPIs = [];
  if (preloadContent) {
    const apiRe = /ipcRenderer\.(?:invoke|on)\s*\(\s*['"]([^'"]+)['"]/g;
    while ((m = apiRe.exec(preloadContent))) preloadAPIs.push(m[1]);
  }

  console.log(`  main.js 找到 ${mainIPC.length} 个 IPC 通道`);
  console.log(`  main.js 找到 ${pushEvents.length} 个推送事件`);
  console.log(`  preload.js 找到 ${preloadAPIs.length} 个 API 引用`);

  // 检查 MASTER.md 是否记录了所有 IPC 通道
  let ipcDocumented = 0;
  let ipcMissing = [];

  for (const ipc of mainIPC) {
    if (masterContent.includes(ipc.channel)) {
      ipcDocumented++;
    } else {
      ipcMissing.push(ipc.channel);
    }
  }

  for (const evt of pushEvents) {
    // 跳过 Electron 内部事件
    if (evt.startsWith('startup:') || evt.startsWith('gateway:')) {
      if (!masterContent.includes(evt)) {
        ipcMissing.push(`[推送] ${evt}`);
      } else {
        ipcDocumented++;
      }
    }
  }

  if (ipcMissing.length > 0) {
    fail(`MASTER.md 缺少 ${ipcMissing.length} 个通道/事件记录：\n    ${ipcMissing.join('\n    ')}`);
  } else {
    pass(`所有 ${ipcDocumented} 个 IPC 通道已在 MASTER.md 中记录`);
  }

  // 交叉检查：preload 是否能找到对应的 main handler
  if (preloadContent) {
    const mainChannels = new Set(mainIPC.map(x => x.channel));
    let orphanAPIs = [];
    for (const api of preloadAPIs) {
      if (!mainChannels.has(api)) orphanAPIs.push(api);
    }
    if (orphanAPIs.length > 0) {
      warn(`preload.js 引用了 main.js 中不存在的 IPC 通道：\n    ${orphanAPIs.join('\n    ')}`);
    } else {
      pass('preload.js 与 main.js IPC 通道一一对应');
    }
  }
}

// ============================================================
// 检查 2：模块文档覆盖
// ============================================================

function checkModuleDocs() {
  console.log('\n📄 检查 2：模块文档覆盖');
  console.log('─'.repeat(50));

  const codeIndexDir = path.join(ROOT, 'docs', 'code-index');
  if (!exists(codeIndexDir)) { fail('docs/code-index/ 不存在'); return; }

  // 收集 src/ 下的所有 JS 模块
  const allJs = findJsFiles(SRC_DIR).concat(
    [PRELOAD_FILE].filter(f => exists(f) && f.endsWith('.js'))
  );

  // 过滤出模块文件（排除子目录里的非模块文件）
  const rootJs = [path.join(ROOT, 'main.js')].filter(f => exists(f));
  const moduleFiles = allJs.concat(rootJs).filter(f => {
    const rel = path.relative(ROOT, f);
    // 只检查有对应职责的模块文件
    return rel.startsWith('src' + path.sep + 'adapters' + path.sep) ||
           rel.startsWith('src' + path.sep + 'detectors' + path.sep) ||
           rel.startsWith('src' + path.sep + 'manager' + path.sep) ||
           rel === 'preload.js' ||
           rel === 'main.js';
  });

  // 检查每个模块是否有对应文档
  const docFiles = fs.readdirSync(codeIndexDir).filter(f => f.endsWith('.md')).map(f => f.replace('.md', ''));
  let undocumented = [];

  for (const modFile of moduleFiles) {
    const modName = path.basename(modFile, '.js'); // e.g. 'openclaw-adapter', 'ai-detector'
    // 尝试匹配：完全匹配、去掉后缀匹配
    const matched = docFiles.some(doc => {
      return doc === modName ||
             doc === modName.replace('-adapter', 's') ||  // 'openclaw-adapter' → 'adapters'
             modName.includes(doc) ||
             doc.includes(modName);
    });

    if (!matched) {
      undocumented.push(path.relative(ROOT, modFile));
    }
  }

  if (undocumented.length > 0) {
    warn(`${undocumented.length} 个模块缺少对应文档：\n    ${undocumented.join('\n    ')}`);
  } else {
    pass(`所有 ${moduleFiles.length} 个模块在 docs/code-index/ 中有对应文档`);
  }
}

// ============================================================
// 检查 3：语法检查
// ============================================================

function checkSyntax() {
  console.log('\n🔬 检查 3：语法检查');
  console.log('─'.repeat(50));

  const allJs = findJsFiles(ROOT);

  let passed = 0;
  let failed = 0;

  for (const file of allJs) {
    const rel = path.relative(ROOT, file);
    try {
      execSync(`node -c "${file}"`, { encoding: 'utf8', stdio: 'pipe' });
      passed++;
    } catch (e) {
      failed++;
      fail(`语法错误: ${rel}\n    ${e.stderr ? e.stderr.trim() : e.message}`);
    }
  }

  if (failed === 0) {
    pass(`所有 ${passed} 个 .js 文件语法检查通过`);
  }
}

// ============================================================
// 检查 4：EVOLUTION.md 时效
// ============================================================

function checkEvolution() {
  console.log('\n📖 检查 4：EVOLUTION.md 时效');
  console.log('─'.repeat(50));

  // 在 project-dev skill 目录找
  const skillDir = path.join(
    process.env.USERPROFILE || process.env.HOME || '~',
    '.qclaw', 'skills', 'project-dev'
  );
  const evoPath = path.join(skillDir, 'EVOLUTION.md');

  if (!exists(evoPath)) {
    fail('EVOLUTION.md 不存在（project-dev skill 目录）');
    return;
  }

  const content = safeRead(evoPath);
  const today = new Date().toISOString().slice(0, 10); // '2026-05-18'

  if (content.includes(today)) {
    pass(`EVOLUTION.md 今天有更新`);
  } else {
    warn(`EVOLUTION.md 今天未更新（最新日期：${today} 不存在于文件中）`);
  }

  // 检查是否有 ≥3 条验证的条目 → 提醒升格
  const entries = (content.match(/## \[\d{4}-\d{2}-\d{2}\]/g) || []);
  const promotedEntries = (content.match(/已升格|promoted|→ SKILL\.md/g) || []);

  if (entries.length >= 3 && promotedEntries.length === 0) {
    warn(`⚠️  EVOLUTION.md 已有 ${entries.length} 条经验，建议审查并升格为 SKILL.md 正式规则`);
  }
}

// ============================================================
// 检查 5：KANBAN 任务状态
// ============================================================

function checkKanban() {
  console.log('\n📊 检查 5：KANBAN 任务状态');
  console.log('─'.repeat(50));

  const kanbanPath = path.join(ROOT, 'docs', 'taskboard', 'KANBAN.md');
  if (!exists(kanbanPath)) { fail('KANBAN.md 不存在'); return; }

  const content = safeRead(kanbanPath);

  // 检查是否有 🔧（开发中）的任务没有同时存在 ✅（已完成）
  const inProgress = (content.match(/🔧/g) || []).length;
  const done = (content.match(/✅/g) || []).length;

  console.log(`  开发中: ${inProgress} 个, 已完成: ${done} 个`);

  if (inProgress > 0) {
    warn(`还有 ${inProgress} 个任务标记为"开发中"，未标记为完成`);
  } else if (done > 0) {
    pass('KANBAN 中没有遗留的"开发中"任务');
  } else {
    pass('KANBAN.md 存在且格式正确');
  }
}

// ============================================================
// 主入口
// ============================================================

function main() {
  console.log('╔══════════════════════════════════════════╗');
  console.log('║   🔒 B-5.5 闭合验证 · 自动检查          ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log(`项目目录: ${ROOT}`);
  console.log(`时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`);

  if (!exists(DOCS_DIR)) {
    fail('docs/ 目录不存在 — 项目未初始化或结构不完整');
    printSummary();
    return;
  }

  checkIPCTable();
  checkModuleDocs();
  checkSyntax();
  checkEvolution();
  checkKanban();

  printSummary();
}

function printSummary() {
  console.log('\n' + '═'.repeat(50));
  console.log('📊 验证结果汇总');
  console.log('═'.repeat(50));

  for (const r of checks.results) {
    const icon = r.status === 'PASS' ? '✅' : r.status === 'WARN' ? '⚠️ ' : '❌';
    console.log(`${icon} ${r.msg}`);
  }

  console.log(`\n  ✅ ${checks.pass} 通过  ⚠️  ${checks.warn} 警告  ❌ ${checks.fail} 失败`);

  if (checks.fail > 0) {
    console.log('\n⚠️  存在失败项，建议修复后再交付。');
    process.exit(1);
  } else if (checks.warn > 0) {
    console.log('\n⚠️  存在警告项，建议确认是否需要在交付前处理。');
    process.exit(0);
  } else {
    console.log('\n🎉 全部检查通过，可以交付！');
    process.exit(0);
  }
}

main();
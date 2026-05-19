// Echora - Renderer Process v0.3.3
// Agent 联系人 + 会话管理 + 抽屉菜单(九宫格) + 右侧多视图切换
// v0.3.3: 自动检测改手动挑选 / loading 修复 / model 格式修正

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// ========== 全局状态 ==========
const STATE = {
  currentAgentKey: null,
  currentConvId: null,
  currentView: 'chat',
  aiList: [],
  allAgents: [],
  conversations: {},
  envResult: {},
};

const MAX_HISTORY = 200;
const COLORS = ['#4A90D9','#E85D75','#7C5CBF','#F5A623','#50C878','#FF6B6B','#45B7D1','#FFD93D','#6C5B7B','#00B4D8'];
const AI_ICONS = { qclaw:'🐉',openclaw:'🦞',cursor:'⚡',windsurf:'🌊',trae:'🚀',vscode:'💙' };

// ========== 头像 ==========
function getInitialChar(agent) {
  if (agent.agentEmoji) return agent.agentEmoji;
  const name = agent.agentName || 'AI';
  return name.charAt(0);
}
function getAvatarColor(agentKey) {
  let hash = 0;
  for (let i = 0; i < agentKey.length; i++) { hash = ((hash << 5) - hash) + agentKey.charCodeAt(i); hash |= 0; }
  return COLORS[Math.abs(hash) % COLORS.length];
}
function buildAvatarHTML(agent) {
  const color = getAvatarColor(agent.agentKey);
  const initial = getInitialChar(agent);
  if (agent.agentAvatar) return `<div class="agent-avatar has-avatar" style="background-image:url('${agent.agentAvatar}')"></div>`;
  return `<div class="agent-avatar agent-avatar-initial" style="background:${color}" data-initial="${initial}">${initial}</div>`;
}

// ========== 初始化 ==========
async function init() {
  window.echora.onStartup.envCheck(handleEnvCheck);
  window.echora.onStartup.aiDetected(handleAIDetected);
  if (window.echora.gateway.onStatusAll) {
    window.echora.gateway.onStatusAll(handleGatewayStatusAll);
  }
  window.echora.gateway.onStatusChange(handleGatewayChange);
  window.echora.gateway.onMessage(handleGatewayMessage);

  await loadConversations();
  const config = await window.echora.config.getAll();
  const aiPaths = config.aiPaths || {};

  if (!config.firstRun && Object.keys(aiPaths).length > 0) {
    document.getElementById('welcome-overlay').classList.add('hidden');
    await loadMainUI();
    await doScan();
  } else {
    // 首次运行或无 AI → 显示引导页，主动建议自动检测
    setTimeout(async () => {
      if (document.getElementById('welcome-overlay').classList.contains('hidden')) return;
      document.getElementById('env-check-list').innerHTML = '<div class="empty-tips"><span>⏳ 检查环境...</span></div>';
      document.getElementById('ai-detect-list').innerHTML = `
        <div class="detect-prompt">
          <p style="font-size:14px;color:var(--text-secondary);text-align:center;">🖥️ 尚未配置任何 AI 软件</p>
          <p style="font-size:12px;color:var(--text-hint);text-align:center;margin-top:8px;">点击下方按钮一键发现，或手动添加</p>
          <div style="display:flex;gap:12px;justify-content:center;margin-top:16px;">
            <button class="btn btn-primary" id="btn-auto-detect-welcome">🔍 自动检测</button>
            <button class="btn btn-secondary" id="btn-manual-add-welcome">✚ 手动添加</button>
          </div>
        </div>`;
      // 绑定欢迎页按钮
      setTimeout(() => {
        const ad = document.getElementById('btn-auto-detect-welcome');
        const ma = document.getElementById('btn-manual-add-welcome');
        if (ad) ad.addEventListener('click', () => { document.getElementById('welcome-overlay').classList.add('hidden'); loadMainUI().then(() => doAutoDetect()); });
        if (ma) ma.addEventListener('click', () => showAddAIModal());
      }, 0);

      const envResult = await window.echora.env.check();
      STATE.envResult = envResult;
      renderEnvCheck(envResult);
    }, 800);
  }

  bindEvents();
}

// ========== 会话持久化 ==========
async function loadConversations() {
  try { const saved = await window.echora.config.get('conversations'); if (saved && typeof saved === 'object') STATE.conversations = saved; }
  catch (e) { STATE.conversations = {}; }
  // 迁移：旧会话补 userId
  for (const [, convs] of Object.entries(STATE.conversations)) {
    for (const [, conv] of Object.entries(convs)) {
      if (!conv.userId) conv.userId = 'echora-' + (conv.id || 'legacy_' + Date.now());
    }
  }
}
async function saveConversations() {
  for (const [agentKey, convs] of Object.entries(STATE.conversations)) {
    for (const [, conv] of Object.entries(convs)) {
      if (conv.messages.length > MAX_HISTORY) conv.messages = conv.messages.slice(-MAX_HISTORY);
    }
  }
  try { await window.echora.config.set('conversations', STATE.conversations); } catch (e) {}
}
function getOrCreateConv(agentKey) {
  if (!STATE.conversations[agentKey]) STATE.conversations[agentKey] = {};
  const convs = STATE.conversations[agentKey];
  let conv;
  if (STATE.currentConvId && convs[STATE.currentConvId]) {
    conv = convs[STATE.currentConvId];
  } else {
    let latest = null;
    for (const [, c] of Object.entries(convs)) { if (!latest || c.updatedAt > latest.updatedAt) latest = c; }
    conv = latest;
  }
  if (!conv) {
    const id = 'conv_' + Date.now();
    conv = { id, name: '新会话', messages: [], createdAt: Date.now(), updatedAt: Date.now(), userId: 'echora-' + id };
    convs[id] = conv;
  }
  STATE.currentConvId = conv.id;
  return conv;
}
function createNewConv(agentKey) {
  if (!STATE.conversations[agentKey]) STATE.conversations[agentKey] = {};
  const id = 'conv_' + Date.now();
  const name = `会话 ${Object.keys(STATE.conversations[agentKey]).length + 1}`;
  const conv = { id, name, messages: [], createdAt: Date.now(), updatedAt: Date.now(), userId: 'echora-' + id };
  STATE.conversations[agentKey][id] = conv;
  STATE.currentConvId = id;
  return conv;
}

// ========== 启动事件 ==========
function handleEnvCheck(data) { STATE.envResult = data; renderEnvCheck(data); }
function handleAIDetected(data) { STATE.aiList = objectToList(data); renderAIDetect(data); }

function handleGatewayStatusAll(statuses) {
  for (const ai of STATE.aiList) {
    if (statuses[ai.id]) { ai.status = statuses[ai.id].status; ai.gatewayPort = statuses[ai.id].port; ai.gatewayOwned = statuses[ai.id].owned !== false; }
  }
  for (const agent of STATE.allAgents) {
    const aiStatus = statuses[agent.aiType];
    if (aiStatus) { agent.status = aiStatus.status; agent.gatewayPort = aiStatus.port; }
  }
  updateAgentStatusUI();
}
function handleGatewayChange(data) {
  const ai = STATE.aiList.find(a => a.id === data.aiType);
  if (ai) ai.status = data.status;
  for (const agent of STATE.allAgents) { if (agent.aiType === data.aiType) agent.status = data.status; }
  updateAgentStatusUI();
}
function handleGatewayMessage(data) {
  const candidateKey = `${data.aiType}:${data.agentId || 'main'}`;
  if (STATE.currentAgentKey !== candidateKey) return;
  if (data.role === 'assistant' && data.content) {
    // 清除加载动画（如果有）
    document.querySelectorAll('.loading-dots').forEach(el => el.closest('.message')?.remove());
    addMessage('assistant', data.content);
    saveConversations();
  }
}

// ========== 启动向导 ==========
function renderEnvCheck(envResult) {
  const c = document.getElementById('env-check-list'); if (!c) return;
  c.innerHTML = '';
  for (const [key, info] of Object.entries(envResult)) {
    const item = document.createElement('div'); item.className = 'env-list-item';
    const cls = info.installed && info.versionOk ? 'ok' : info.installed ? 'warn' : 'fail';
    item.innerHTML = `<span class="env-name">${info.name}</span><span class="env-badge ${cls}">${info.installed ? 'v'+info.version : '未安装'}</span>${!info.installed ? `<button class="btn btn-secondary" data-install="${key}" style="font-size:11px;padding:2px 8px;">安装</button>` : ''}`;
    c.appendChild(item);
  }
  c.querySelectorAll('[data-install]').forEach(btn => btn.addEventListener('click', async () => {
    btn.textContent = '安装中...'; btn.disabled = true;
    const r = await window.echora.env.install(btn.dataset.install);
    btn.textContent = r.success ? '已安装' : '失败'; btn.disabled = false;
  }));
}
function renderAIDetect(detected) {
  const c = document.getElementById('ai-detect-list'); if (!c) return;
  c.innerHTML = ''; let running = 0;
  for (const [aiType, info] of Object.entries(detected)) {
    if (!info.found && !info.gateway?.running) continue;
    const item = document.createElement('div'); item.className = 'ai-detect-item';
    const icon = AI_ICONS[aiType] || '💻';
    const gwAlive = info.gateway && info.gateway.alive;
    let st = gwAlive ? `<span style="color:#3fb950;font-size:12px;">● 运行中 | 端口 ${info.gateway.port}</span>` : info.found ? `<span style="color:#8b949e;font-size:12px;">○ 未启动</span>` : `<span style="color:#f85149;font-size:12px;">✗ 未检测到</span>`;
    if (gwAlive) running++;
    item.innerHTML = `<span style="font-size:20px;">${icon}</span><div class="ai-detect-info"><strong>${info.name}</strong><div class="ai-detect-path">${info.path || '未找到'}</div><div class="ai-detect-status">${st}</div></div>`;
    c.appendChild(item);
  }
  if (running > 0) {
    const tip = document.createElement('div');
    tip.style.cssText = 'margin-top:12px;padding:10px;background:#3fb95022;border-radius:6px;font-size:13px;color:#3fb950;';
    tip.textContent = '✅ 检测到运行中的 AI 网关';
    c.appendChild(tip);
  }
}

// ========== 主界面加载 ==========
async function loadMainUI() {
  document.getElementById('app').classList.remove('hidden');
  document.getElementById('welcome-overlay').classList.add('hidden');
  // 预加载 settings
  try {
    const config = await window.echora.config.getAll();
    STATE.settings = config.settings || { timeout: 120000, timeoutPerAI: {}, pollInterval: 10000 };
  } catch (e) { STATE.settings = { timeout: 120000, timeoutPerAI: {}, pollInterval: 10000 }; }
}

async function doScan() {
  try {
    const btn = document.getElementById('btn-refresh'); if (btn) btn.textContent = '⏳';
    const result = await window.echora.gateway.refresh();
    if (result) {
      const detected = result.detected;
      if (detected) {
        STATE.aiList = objectToList(detected);
        const gateways = result.gateways || {};
        for (const ai of STATE.aiList) {
          if (gateways[ai.id]) { ai.status = gateways[ai.id].status; ai.gatewayPort = gateways[ai.id].port; ai.gatewayOwned = gateways[ai.id].owned !== false; }
        }
      }
    }
    await loadAllAgents();
    setTimeout(() => { const b = document.getElementById('btn-refresh'); if (b) b.textContent = '🔄'; }, 1000);
  } catch (e) { console.error('doScan:', e); const b = document.getElementById('btn-refresh'); if (b) b.textContent = '🔄'; }
}

// ========== 自动检测（用户手动触发，展示挑选列表） ==========
async function doAutoDetect() {
  const btn = document.getElementById('btn-mgmt-detect');
  if (btn) { btn.textContent = '⏳ 扫描中...'; btn.disabled = true; }

  try {
    const detected = await window.echora.ai.scan();
    // 打开视图
    switchView('ai-mgmt');
    // 填充挑选列表
    renderScanResults(detected);
  } catch (e) {
    alert('扫描失败: ' + e.message);
  }
  if (btn) { btn.textContent = '🔍 自动检测'; btn.disabled = false; }
}

function renderScanResults(detected) {
  const c = document.getElementById('mgmt-ai-list'); if (!c) return;
  // 检查是否有新发现的 AI（不在现有配置中）
  const existingIds = new Set(STATE.aiList.map(a => a.id));
  const newItems = [];
  for (const [aiType, info] of Object.entries(detected)) {
    if (existingIds.has(aiType)) continue;
    if (!info.found && !info.gateway?.running) continue;
    newItems.push({ aiType, info });
  }

  c.innerHTML = '';

  // 先显示已配置的 AI
  renderConfiguredAIList(c);

  if (newItems.length === 0) {
    // 没有新发现
    const tip = document.createElement('div');
    tip.className = 'empty-view';
    tip.innerHTML = '<p>✅ 当前 AI 已全部配置</p><p style="font-size:12px;color:var(--text-hint);">未发现新 AI 软件</p>';
    c.appendChild(tip);
    return;
  }

  // 新发现的 AI 选择列表
  const section = document.createElement('div');
  section.innerHTML = `<div style="padding:12px 0;color:var(--text-secondary);font-size:13px;font-weight:600;">🔍 发现 ${newItems.length} 个新 AI</div>`;
  for (const { aiType, info } of newItems) {
    const row = document.createElement('div');
    row.className = 'mgmt-ai-item scan-result';
    const icon = AI_ICONS[aiType] || '💻';
    const gwPort = info.gateway?.running ? `· 端口 ${info.gateway.port}` : '';
    const gwStatus = info.gateway?.running ? '<span class="scan-status-ok">● 运行中</span>' : '<span class="scan-status-off">○ 未启动</span>';
    row.innerHTML = `
      <span class="mgmt-ai-icon">${icon}</span>
      <div class="mgmt-ai-info">
        <div class="mgmt-ai-name">${info.name}</div>
        <div class="mgmt-ai-path">${info.path || '仅进程检测'} ${gwPort}</div>
      </div>
      <span style="font-size:11px;margin-left:auto;">${gwStatus}</span>
      <div class="mgmt-ai-actions">
        <button class="btn btn-primary scan-btn-add" data-scan-add="${aiType}" data-scan-path="${info.path || ''}" style="font-size:11px;padding:3px 10px;">✚ 添加</button>
      </div>`;
    section.appendChild(row);
  }
  c.appendChild(section);

  // 批量添加按钮
  const batch = document.createElement('div');
  batch.innerHTML = `<button class="btn btn-primary" id="btn-scan-add-all" style="margin-top:12px;">➕ 一键添加所有</button>`;
  c.appendChild(batch);

  // 绑定事件
  c.querySelectorAll('[data-scan-add]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const aiType = btn.dataset.scanAdd;
      const aiPath = btn.dataset.scanPath;
      await window.echora.ai.setPath(aiType, aiPath);
      btn.textContent = '✓'; btn.disabled = true;
      setTimeout(async () => {
        const re = await window.echora.gateway.refresh();
        if (re?.detected) { STATE.aiList = objectToList(re.detected); }
        await loadAllAgents();
        renderScanResults(detected);
      }, 300);
    });
  });

  const addAllBtn = document.getElementById('btn-scan-add-all');
  if (addAllBtn) addAllBtn.addEventListener('click', async () => {
    for (const { aiType, info } of newItems) {
      await window.echora.ai.setPath(aiType, info.path || '');
    }
    addAllBtn.textContent = '✓ 已全部添加'; addAllBtn.disabled = true;
    setTimeout(async () => {
      const re = await window.echora.gateway.refresh();
      if (re?.detected) { STATE.aiList = objectToList(re.detected); }
      await loadAllAgents();
      renderScanResults(detected);
    }, 300);
  });
}

// ========== 三层完整扫描（端口反推 + 状态文件） ==========
async function doScanFull() {
  const btn = document.getElementById('btn-mgmt-detect');
  if (btn) { btn.textContent = '?? 深度扫描中...'; btn.disabled = true; }

  try {
    const { results, unknownGateways } = await window.echora.ai.scanFull();
    switchView('ai-mgmt');
    renderScanResults(results);

    // 如果发现未知网关，弹出提示
    if (unknownGateways && unknownGateways.length > 0) {
      renderUnknownGateways(unknownGateways);
    }
  } catch (e) {
    alert('深度扫描失败: ' + e.message);
  }
  if (btn) { btn.textContent = '?? 自动检测'; btn.disabled = false; }
}

function renderUnknownGateways(unknowns) {
  const c = document.getElementById('mgmt-ai-list'); if (!c) return;

  const section = document.createElement('div');
  section.className = 'unknown-gateways-section';
  section.innerHTML = `<div style="padding:12px 0;color:var(--accent);font-size:13px;font-weight:600;">?? 发现 ${unknowns.length} 个未知网关</div>`;

  for (const gw of unknowns) {
    const row = document.createElement('div');
    row.className = 'mgmt-ai-item scan-result unknown-gw';
    row.innerHTML = `
      <span class="mgmt-ai-icon">??</span>
      <div class="mgmt-ai-info">
        <div class="mgmt-ai-name">未知网关 · 端口 ${gw.port}</div>
        <div class="mgmt-ai-path">进程: ${gw.processName} (PID: ${gw.pid}) · 匹配: ${gw.confidence}</div>
        <div class="mgmt-ai-path" style="font-size:11px;color:var(--text-hint);">响应: HTTP ${gw.probeStatus} · ${gw.probeBodySnippet.substring(0, 80)}...</div>
      </div>
      <div class="mgmt-ai-actions" style="display:flex;gap:6px;">
        <button class="btn btn-secondary btn-gw-detail" data-gw-port="${gw.port}" style="font-size:11px;padding:3px 8px;">?? 详情</button>
        <button class="btn btn-primary btn-gw-add" data-gw-port="${gw.port}" data-gw-name="${gw.name}" data-gw-type="${gw.aiType}" style="font-size:11px;padding:3px 10px;">+ 添加</button>
      </div>`;
    section.appendChild(row);
  }
  c.appendChild(section);

  // 绑定事件
  section.querySelectorAll('.btn-gw-detail').forEach(btn => {
    btn.addEventListener('click', async () => {
      const port = parseInt(btn.dataset.gwPort);
      const detail = await window.echora.ai.probePort(port);
      const info = detail.processes.map(p => `${p.name} (PID: ${p.pid})`).join(', ');
      const httpInfo = detail.httpResponses.map(r => `  ${r.path}: HTTP ${r.status} (${r.contentType})`).join('\n');
      alert(`端口 ${port} 详情:\n\n进程: ${info}\n\nHTTP 响应:\n${httpInfo}`);
    });
  });

  section.querySelectorAll('.btn-gw-add').forEach(btn => {
    btn.addEventListener('click', async () => {
      const port = parseInt(btn.dataset.gwPort);
      const name = btn.dataset.gwName;
      const aiType = btn.dataset.gwType || `custom-${port}`;
      const confirmed = confirm(`确认添加 "${name}" (端口 ${port}) 为新的 AI 软件？`);
      if (confirmed) {
        await window.echora.ai.addDiscovered({ aiType, name, port });
        btn.textContent = '? 已添加'; btn.disabled = true;
        setTimeout(async () => {
          const re = await window.echora.gateway.refresh();
          if (re?.detected) { STATE.aiList = objectToList(re.detected); }
          await loadAllAgents();
          renderAIDetect(STATE.aiList);
        }, 300);
      }
    });
  });
}

// ========== Agent 管理 ==========
async function loadAllAgents() {
  const allAgents = [];
  const seenKey = new Set();
  const seenName = new Set();
  for (const ai of STATE.aiList) {
    if (!ai.found && !ai.path && !ai.gatewayPort) continue;
    try {
      const agents = await window.echora.agent.list(ai.id);
      for (const agent of agents) {
        const key = `${ai.id}:${agent.id}`;
        const nameKey = `${agent.name}|${ai.id}`;
        if (seenKey.has(key) || seenName.has(nameKey)) continue;
        seenKey.add(key); seenName.add(nameKey);
        allAgents.push({
          agentKey: key, aiType: ai.id, aiName: ai.name,
          agentId: agent.id, agentName: agent.name, agentEmoji: agent.emoji || null,
          agentAvatar: agent.avatar || null,
          status: ai.status || 'offline', gatewayPort: ai.gatewayPort,
        });
      }
    } catch (e) {}
  }
  STATE.allAgents = allAgents;
  renderAgentList();
}

function renderAgentList() {
  const c = document.getElementById('agent-list'); if (!c) return;
  c.innerHTML = '';
  if (STATE.allAgents.length === 0) {
    c.innerHTML = `<div style="padding:24px 16px;text-align:center;"><p style="color:var(--text-hint);font-size:13px;">暂无 Agent</p><p style="color:var(--text-hint);font-size:11px;margin-top:4px;">点击 🖥️ AI管理 → 🔍自动检测</p></div>`;
    return;
  }
  const sorted = [...STATE.allAgents].sort((a, b) => (a.status === 'running' ? 0 : 1) - (b.status === 'running' ? 0 : 1));
  for (const agent of sorted) {
    const item = document.createElement('div');
    item.className = `agent-item${STATE.currentAgentKey === agent.agentKey ? ' active' : ''}`;
    item.dataset.agentKey = agent.agentKey;
    const avatarHTML = buildAvatarHTML(agent);
    item.innerHTML = `${avatarHTML}<div class="agent-info"><div class="agent-name">${agent.agentName}</div><span class="agent-ai-badge">${agent.aiName}</span></div><span class="status-dot ${agent.status || 'offline'}"></span>`;
    item.addEventListener('click', () => { switchView('chat'); selectAgent(agent); });
    c.appendChild(item);
  }
}

function updateAgentStatusUI() {
  const c = document.getElementById('agent-list'); if (!c) return;
  for (const agent of STATE.allAgents) {
    const item = c.querySelector(`[data-agent-key="${agent.agentKey}"]`);
    if (!item) continue;
    const dot = item.querySelector('.status-dot');
    if (dot) dot.className = `status-dot ${agent.status || 'offline'}`;
  }
}

// ========== 选中 Agent + 会话管理 ==========
async function selectAgent(agent) {
  STATE.currentAgentKey = agent.agentKey;
  STATE.currentConvId = null;

  const nameEl = document.getElementById('current-ai-name');
  nameEl.textContent = agent.agentName;
  document.getElementById('btn-back-chat').classList.add('hidden');

  const running = agent.status === 'running';
  const input = document.getElementById('chat-input');
  const btn = document.getElementById('btn-send');
  const hint = document.getElementById('input-hint');

  if (running) {
    input.disabled = false;
    input.placeholder = `与 ${agent.agentName} 对话...`;
    hint.textContent = `✅ ${agent.aiName} · 端口 ${agent.gatewayPort || '?'}`;
    btn.disabled = false;
  } else {
    input.disabled = true;
    input.placeholder = `${agent.aiName} 未运行...`;
    hint.textContent = agent.aiType === 'cursor' ? '⚠️ Cursor 不支持外部 API' : '⚠️ 网关未启动';
    btn.disabled = true;
  }

  refreshConvSelector(agent.agentKey);
  const conv = getOrCreateConv(agent.agentKey);
  loadConvMessages(conv);

  document.getElementById('agent-list').querySelectorAll('.agent-item').forEach(el => el.classList.remove('active'));
  const active = document.getElementById('agent-list').querySelector(`[data-agent-key="${agent.agentKey}"]`);
  if (active) active.classList.add('active');

  if (!running && agent.aiType === 'cursor') {
    document.getElementById('chat-messages').innerHTML = `<div class="empty-state" style="height:auto;padding-top:60px;"><div class="empty-icon">⚡</div><h3>${agent.agentName}</h3><p>Cursor 不支持外部 API，请在 Cursor 内对话</p></div>`;
  } else if (!running && agent.aiType !== 'cursor') {
    document.getElementById('chat-messages').innerHTML = `<div class="empty-state" style="height:auto;padding-top:60px;"><div class="empty-icon">💻</div><h3>${agent.agentName} 未启动</h3><button class="btn btn-primary mgmt-btn-start" data-action="start" data-ai="${agent.aiType}" style="margin-top:12px;">▶️ 启动 ${agent.aiName}</button></div>`;
  }
}

function refreshConvSelector(agentKey) {
  const sel = document.getElementById('conv-selector');
  const btnNew = document.getElementById('btn-new-conv');
  if (!sel || !btnNew) return;
  sel.classList.remove('hidden'); btnNew.classList.remove('hidden'); sel.innerHTML = '';
  const convs = STATE.conversations[agentKey] || {};
  const list = Object.values(convs).sort((a, b) => b.updatedAt - a.updatedAt);
  for (const conv of list) {
    const opt = document.createElement('option'); opt.value = conv.id;
    const d = new Date(conv.createdAt);
    const ts = `${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
    opt.textContent = `${conv.name} (${ts})`;
    if (STATE.currentConvId === conv.id) opt.selected = true;
    sel.appendChild(opt);
  }
  const newOpt = document.createElement('option'); newOpt.value = '__new__'; newOpt.textContent = '+ 新建会话'; sel.appendChild(newOpt);
}

function loadConvMessages(conv) {
  const c = document.getElementById('chat-messages'); c.innerHTML = '';
  if (!conv || conv.messages.length === 0) {
    c.innerHTML = `<div class="empty-state" style="height:auto;padding-top:40px;"><div class="empty-icon">💬</div><h3>新会话已就绪</h3><p>输入消息开始对话</p></div>`;
    return;
  }
  for (const msg of conv.messages) addMessage(msg.role, msg.content, null, false);
}

// ========== 视图切换 ==========
function switchView(viewName) {
  if (STATE.currentView === viewName) return;
  STATE.currentView = viewName;
  $$('.main-view').forEach(v => v.classList.remove('active'));
  const target = document.getElementById(`view-${viewName}`);
  if (target) target.classList.add('active');
  $$('.drawer-menu-item').forEach(m => m.classList.remove('active'));
  const menuItem = document.querySelector(`.drawer-menu-item[data-view="${viewName}"]`);
  if (menuItem) menuItem.classList.add('active');
  const nameEl = document.getElementById('current-ai-name');
  const backBtn = document.getElementById('btn-back-chat');
  const convSel = document.getElementById('conv-selector');
  const convNew = document.getElementById('btn-new-conv');

  if (viewName === 'chat') {
    backBtn.classList.add('hidden');
    if (convSel) convSel.classList.remove('hidden');
    if (convNew) convNew.classList.remove('hidden');
    const agent = STATE.allAgents.find(a => a.agentKey === STATE.currentAgentKey);
    nameEl.textContent = agent ? agent.agentName : '选择一个 Agent 开始对话';
  } else {
    backBtn.classList.remove('hidden');
    if (convSel) convSel.classList.add('hidden');
    if (convNew) convNew.classList.add('hidden');
    const titles = { 'ai-mgmt':'🖥️ AI 管理', 'conv-mgmt':'💬 会话管理', skills:'🧩 Skill 管理', cron:'⏰ 定时任务', env:'💻 运行环境', settings:'⚙️ 系统设置' };
    nameEl.textContent = titles[viewName] || viewName;
    if (viewName === 'ai-mgmt') renderAIMgmtView();
    if (viewName === 'conv-mgmt') renderConvMgmt();
    if (viewName === 'env') renderEnvView();
    if (viewName === 'settings') renderSettingsView();
  }
}

// ========== AI 管理视图 ==========
function renderAIMgmtView() {
  const c = document.getElementById('mgmt-ai-list'); if (!c) return;
  renderConfiguredAIList(c);
}

function renderConfiguredAIList(c) {
  // 清除旧的扫描结果区域
  const scanResults = c.querySelectorAll('.scan-result, .empty-view');
  scanResults.forEach(r => r.closest('.mgmt-ai-item')?.remove());
  // 保留旧结构，新增已配置 AI 列表
  const configured = STATE.aiList.filter(ai => ai.found || ai.path);
  if (configured.length === 0) {
    // 检查是否有旧内容可清
    const empty = c.querySelector('.empty-view');
    if (!empty) {
      c.innerHTML = '<div class="empty-view"><div class="empty-icon">📦</div><p>尚未添加任何 AI 软件</p><p style="font-size:12px;color:var(--text-hint);">点击下方按钮添加或检测</p></div>';
    }
    return;
  }
  // 重建列表
  c.innerHTML = '<div class="mgmt-configured-label" style="padding:12px 0;color:var(--text-secondary);font-size:13px;font-weight:600;">📋 已配置的 AI</div>';
  for (const ai of configured) {
    const item = document.createElement('div'); item.className = 'mgmt-ai-item';
    const dotColor = ai.status === 'running' ? 'var(--success)' : 'var(--inactive)';
    const statusText = ai.status === 'running' ? `● 运行中${ai.gatewayPort ? ' :'+ai.gatewayPort : ''}` : '○ 未启动';
    const actions = ai.status === 'running'
      ? `<button data-action="stop" data-ai="${ai.id}">⏹ 停止</button><button data-action="restart" data-ai="${ai.id}">↻ 重启</button><button class="danger" data-action="remove" data-ai="${ai.id}">✕</button>`
      : `<button data-action="start" data-ai="${ai.id}">▶ 启动</button><button class="danger" data-action="remove" data-ai="${ai.id}">✕</button>`;
    item.innerHTML = `<span class="mgmt-ai-icon">${AI_ICONS[ai.id] || '💻'}</span><div class="mgmt-ai-info"><div class="mgmt-ai-name">${ai.name}</div><div class="mgmt-ai-path">${ai.path || '路径未配置'}</div></div><span class="mgmt-ai-status" style="color:${dotColor}">${statusText}</span><div class="mgmt-ai-actions">${actions}</div>`;
    c.appendChild(item);
  }
}

async function handleMgmtAction(action, aiType) {
  const ai = STATE.aiList.find(a => a.id === aiType);
  switch (action) {
    case 'start': {
      if (!ai?.path) return alert('未配置启动路径');
      const r = await window.echora.gateway.start(aiType, ai.path);
      if (r.success) { updateAIStatus(aiType, 'running'); renderAIMgmtView(); } else alert(r.message);
      break;
    }
    case 'stop':
      await window.echora.gateway.stop(aiType);
      updateAIStatus(aiType, 'offline');
      renderAIMgmtView();
      break;
    case 'restart': {
      if (!ai?.path) return alert('未配置启动路径');
      await window.echora.gateway.stop(aiType);
      await new Promise(r => setTimeout(r, 2000));
      const r2 = await window.echora.gateway.start(aiType, ai.path);
      if (r2.success) { updateAIStatus(aiType, 'running'); renderAIMgmtView(); }
      else { updateAIStatus(aiType, 'offline'); alert('重启失败: ' + (r2.message || '未知错误')); renderAIMgmtView(); }
      break;
    }
    case 'remove': {
      if (!confirm(`确定移除 ${aiType}？`)) return;
      await window.echora.ai.removePath(aiType);
      STATE.aiList = STATE.aiList.filter(a => a.id !== aiType);
      STATE.allAgents = STATE.allAgents.filter(a => a.aiType !== aiType);
      if (STATE.currentAgentKey && STATE.currentAgentKey.startsWith(`${aiType}:`)) {
        STATE.currentAgentKey = null; STATE.currentConvId = null;
        document.getElementById('chat-messages').innerHTML = `<div class="empty-state" style="height:auto;padding-top:40px;"><div class="empty-icon">💬</div><p>请选择一个 Agent</p></div>`;
        document.getElementById('current-ai-name').textContent = '选择一个 Agent 开始对话';
        document.getElementById('chat-input').disabled = true; document.getElementById('btn-send').disabled = true;
        document.getElementById('conv-selector').classList.add('hidden');
        document.getElementById('btn-new-conv').classList.add('hidden');
      }
      renderAgentList();
      renderAIMgmtView();
      break;
    }
  }
}

// ========== 环境视图 ==========
function renderEnvView() {
  const c = document.getElementById('env-detail-panel'); if (!c) return;
  const r = STATE.envResult;
  if (!r || Object.keys(r).length === 0) {
    c.innerHTML = '<div class="empty-view"><p>⏳ 正在检查环境...</p></div>';
    window.echora.env.check().then(data => { STATE.envResult = data; renderEnvView(); }).catch(() => { c.innerHTML = '<div class="empty-view"><p>❌ 环境检查失败，请重试</p></div>'; });
    return;
  }
  c.innerHTML = Object.entries(r).map(([key, info]) => {
    const cls = info.installed && info.versionOk ? 'ok' : info.installed ? 'warn' : 'fail';
    const colors = { ok:'var(--success)', warn:'var(--warning)', fail:'var(--error)' };
    return `<div class="env-detail-item"><span class="env-detail-name">${info.name}</span><span class="env-detail-ver">${info.installed ? 'v'+info.version : '—'}</span><span class="env-detail-status" style="color:${colors[cls]}">${cls === 'ok' ? '✓' : cls === 'warn' ? '⚠' : '✗'}</span></div>`;
  }).join('');
}

function toggleDrawer() {
  const content = document.getElementById('drawer-content'); const arrow = document.getElementById('drawer-arrow');
  if (!content || !arrow) return;
  const isOpen = content.classList.contains('open');
  if (isOpen) { content.classList.remove('open'); content.classList.add('collapsed'); arrow.classList.remove('open'); }
  else { content.classList.add('open'); content.classList.remove('collapsed'); arrow.classList.add('open'); }
}

function updateAIStatus(aiType, status) {
  const ai = STATE.aiList.find(a => a.id === aiType); if (ai) ai.status = status;
  for (const agent of STATE.allAgents) { if (agent.aiType === aiType) agent.status = status; }
  updateAgentStatusUI();
}

// ========== 聊天 ==========
async function sendMessage() {
  const text = document.getElementById('chat-input').value.trim();
  if (!text || !STATE.currentAgentKey) return;
  const agent = STATE.allAgents.find(a => a.agentKey === STATE.currentAgentKey);
  if (!agent) return;

  addMessage('user', text);
  document.getElementById('chat-input').value = '';
  document.getElementById('chat-input').style.height = 'auto';

  const loadingId = 'msg-loading-' + Date.now() + '-' + Math.random().toString(36).slice(2,6);
  addMessage('assistant', '<span class="loading-dots">⏳ 思考中...</span>', loadingId, false);

  // 安全网超时：优先从 settings 读取（AI 独立覆盖 > 全局 > 默认 120s）
  const timeout = (STATE.settings?.timeoutPerAI?.[agent.aiType]) || (STATE.settings?.timeout) || 120000;
  const safetyTimer = setTimeout(() => {
    const el = document.getElementById(loadingId);
    if (el) el.remove();
    addMessage('assistant', `⏱️ 请求超时 (${Math.round(timeout/1000)}s)，请检查网关是否正常运行`);
  }, timeout);

  try {
    const conv = getOrCreateConv(STATE.currentAgentKey);
    const result = await window.echora.message.send(agent.aiType, agent.agentId, text, conv.userId);
    clearTimeout(safetyTimer);
    // 移除 loading 元素（如果还在）
    const loadingEl = document.getElementById(loadingId);
    if (loadingEl) loadingEl.remove();
    // 清除所有可能的加载残留
    document.querySelectorAll('.loading-dots').forEach(el => el.closest('.message')?.remove());
    if (result.success && result.content) {
      addMessage('assistant', result.content);
    } else {
      // 错误时给出更友好的提示
      const errMsg = result.message || '请求失败';
      // 如果是"不支持 REST 聊天 API"，提示替代方案
      if (errMsg.includes('不支持')) {
        addMessage('assistant', `⚠️ ${errMsg}`);
      } else {
        addMessage('assistant', `⚠️ ${errMsg}`);
      }
    }
  } catch (e) {
    clearTimeout(safetyTimer);
    const loadingEl = document.getElementById(loadingId);
    if (loadingEl) loadingEl.remove();
    document.querySelectorAll('.loading-dots').forEach(el => el.closest('.message')?.remove());
    addMessage('assistant', `⚠️ 发送失败: ${e.message}`);
  }
}

function addMessage(role, text, msgId, save = true) {
  const container = document.getElementById('chat-messages');
  const empty = container.querySelector('.empty-state');
  if (empty) empty.remove();

  const msg = document.createElement('div');
  msg.className = `message ${role}`;
  if (msgId) msg.id = msgId;
  const avatarIcon = role === 'user' ? '👤' : '🤖';
  msg.innerHTML = `<div class="msg-avatar">${avatarIcon}</div><div class="msg-body">${text}</div>`;
  container.appendChild(msg);
  container.parentElement.scrollTop = container.parentElement.scrollHeight;

  if (save && STATE.currentAgentKey) {
    const conv = getOrCreateConv(STATE.currentAgentKey);
    conv.messages.push({ role, content: text, time: Date.now() });
    conv.updatedAt = Date.now();
    if (conv.name === '新会话' && role === 'user' && text.length > 0) {
      conv.name = text.length > 15 ? text.slice(0, 15) + '...' : text;
      refreshConvSelector(STATE.currentAgentKey);
    }
    saveConversations();
  }
}

// ========== 添加 AI 弹窗 ==========
function showAddAIModal(presetType) {
  const known = [{id:'qclaw',name:'QClaw'},{id:'openclaw',name:'OpenClaw'},{id:'cursor',name:'Cursor'},{id:'windsurf',name:'Windsurf'},{id:'trae',name:'Trae'},{id:'vscode',name:'VS Code'},{id:'hermes',name:'Hermes'}];
  document.getElementById('select-ai-type').innerHTML = '<option value="">选择 AI...</option>' + known.map(k => `<option value="${k.id}" ${presetType===k.id?'selected':''}>${k.name}</option>`).join('');
  document.getElementById('input-ai-path').value = presetType && STATE.aiList.find(a => a.id === presetType)?.path || '';
  document.getElementById('input-ai-port').value = '';
  document.getElementById('add-ai-modal').classList.remove('hidden');
}

async function saveAI() {
  const aiType = document.getElementById('select-ai-type').value;
  const exePath = document.getElementById('input-ai-path').value.trim();
  const port = document.getElementById('input-ai-port').value.trim();
  if (!aiType || !exePath) { alert('请选择 AI 并填写路径'); return; }
  await window.echora.ai.setPath(aiType, exePath);
  if (port) await window.echora.config.set(`gatewayConfigs.${aiType}`, { port: parseInt(port) });
  const existing = STATE.aiList.find(a => a.id === aiType);
  const names = { qclaw:'QClaw',openclaw:'OpenClaw',cursor:'Cursor',windsurf:'Windsurf',trae:'Trae',vscode:'VS Code',hermes:'Hermes' };
  if (existing) { existing.found = true; existing.path = exePath; }
  else { STATE.aiList.push({ id:aiType, name:names[aiType]||aiType, category:'unknown', found:true, path:exePath, status:'offline' }); }
  document.getElementById('add-ai-modal').classList.add('hidden');
  await loadAllAgents();
}

// ========== 辅助 ==========
function objectToList(obj) {
  return Object.entries(obj).map(([id, info]) => ({
    id, name: info.name, category: info.category, found: info.found,
    path: info.path, source: info.source, verified: info.verified,
    gatewayPort: info.gateway?.port || null,
    status: info.gateway?.running ? 'running' : 'offline', gatewayOwned: false,
  }));
}

// ========== 会话管理 ==========
function renderConvMgmt() {
  const list = document.getElementById('conv-mgmt-list');
  if (!list) return;
  const allConvs = [];
  for (const [agentKey, convs] of Object.entries(STATE.conversations)) {
    for (const [id, conv] of Object.entries(convs)) {
      allConvs.push({ agentKey, id, ...conv });
    }
  }
  allConvs.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

  if (allConvs.length === 0) {
    list.innerHTML = '<div class="empty-view"><div class="empty-icon">💬</div><p>暂无会话</p></div>';
    return;
  }

  list.innerHTML = allConvs.map(c => {
    const [agentName, aiType] = (c.agentKey || '').split('|');
    const agentLabel = aiType ? `${aiType.toUpperCase()}/${agentName}` : c.agentKey;
    const msgCount = (c.messages || []).length;
    const timeStr = c.updatedAt ? new Date(c.updatedAt).toLocaleString('zh-CN') : '-';
    return `
      <div class="conv-mgmt-item">
        <span class="conv-mgmt-badge">${escHtml(agentLabel)}</span>
        <div class="conv-mgmt-info">
          <div class="conv-mgmt-name">${escHtml(c.name || '未命名')}</div>
          <div class="conv-mgmt-meta">
            <span class="conv-mgmt-id">${escHtml(c.id)}</span>
          </div>
        </div>
        <span class="conv-mgmt-count">${msgCount} 条</span>
        <span class="conv-mgmt-time">${timeStr}</span>
        <button class="btn btn-danger-outline btn-sm" data-action="delete-conv" data-agent-key="${escHtml(c.agentKey)}" data-conv-id="${escHtml(c.id)}">删除</button>
      </div>`;
  }).join('');
}

function handleDeleteConv(agentKey, convId) {
  if (!STATE.conversations[agentKey]) return;
  delete STATE.conversations[agentKey][convId];
  if (Object.keys(STATE.conversations[agentKey]).length === 0) delete STATE.conversations[agentKey];
  // 如果正在删除的是当前会话，切回空白
  if (STATE.currentConvId === convId && STATE.currentAgentKey === agentKey) {
    STATE.currentConvId = null;
    document.getElementById('chat-messages').innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">💬</div>
        <p>会话已删除，请选择或新建会话</p>
      </div>`;
  }
  saveConversations();
  renderConvMgmt();
  if (STATE.currentAgentKey) refreshConvSelector(STATE.currentAgentKey);
}

function handleDeleteAllConvs() {
  STATE.conversations = {};
  STATE.currentConvId = null;
  STATE.currentAgentKey = null;
  document.getElementById('chat-messages').innerHTML = `
    <div class="empty-state">
      <div class="empty-icon">🌊</div>
      <h2>欢迎使用 Echora</h2>
      <p>左侧选择 Agent，开启跨 AI 对话体验</p>
    </div>`;
  saveConversations();
  renderConvMgmt();
  // 隐藏会话选择器
  document.getElementById('conv-selector').classList.add('hidden');
  document.getElementById('btn-new-conv').classList.add('hidden');
}

function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ========== 设置面板 ==========

async function renderSettingsView() {
  // 确保 settings 已加载
  if (!STATE.settings) {
    const config = await window.echora.config.getAll();
    STATE.settings = config.settings || { timeout: 120000, timeoutPerAI: {}, pollInterval: 10000 };
  }
  const s = STATE.settings;

  // --- 超时滑块 ---
  const sliderTimeout = document.getElementById('slider-timeout');
  const timeoutVal = document.getElementById('timeout-val');
  if (sliderTimeout && timeoutVal) {
    sliderTimeout.value = s.timeout || 120000;
    timeoutVal.textContent = Math.round((s.timeout || 120000) / 1000) + ' 秒';
  }

  // --- 按 AI 类型超时 ---
  const perAIGroup = document.getElementById('timeout-per-ai-group');
  const perAIList = document.getElementById('timeout-per-ai-list');
  if (perAIGroup && perAIList) {
    const aiTypes = [...new Set(STATE.allAgents.map(a => a.aiType).filter(Boolean))];
    if (aiTypes.length > 0) {
      perAIGroup.style.display = '';
      perAIList.innerHTML = aiTypes.map(aiType => {
        const val = s.timeoutPerAI?.[aiType] || '';
        return `<div class="timeout-per-ai-item">
          <span class="ai-label">${aiType}</span>
          <input type="number" id="timeout-${aiType}" value="${val}" placeholder="${Math.round((s.timeout||120000)/1000)}" min="30" max="600" step="5" data-ai="${aiType}">
          <span style="font-size:11px;color:var(--text-hint);">秒</span>
          ${val ? `<button class="btn-sm" data-action="reset-timeout" data-ai="${aiType}" style="background:transparent;border:1px solid var(--border);color:var(--text-hint);border-radius:var(--radius-sm);cursor:pointer;">重置</button>` : ''}
        </div>`;
      }).join('');
    } else {
      perAIGroup.style.display = 'none';
    }
  }

  // --- 轮询滑块 ---
  const sliderPoll = document.getElementById('slider-poll');
  const pollVal = document.getElementById('poll-val');
  if (sliderPoll && pollVal) {
    sliderPoll.value = Math.round((s.pollInterval || 10000) / 1000);
    pollVal.textContent = Math.round((s.pollInterval || 10000) / 1000) + ' 秒';
  }

  // --- AI 配置文件列表 ---
  renderAIConfigList();

  // --- 滑块实时更新数值 ---
  if (sliderTimeout && timeoutVal) {
    sliderTimeout.oninput = () => { timeoutVal.textContent = sliderTimeout.value + ' 秒'; };
  }
  if (sliderPoll && pollVal) {
    sliderPoll.oninput = () => { pollVal.textContent = sliderPoll.value + ' 秒'; };
  }

  // --- Hermes 配置 ---
  renderHermesSection();
}

async function renderAIConfigList() {
  const container = document.getElementById('ai-config-list');
  if (!container) return;

  // 读取已注册的配置路径
  let list = {};
  try { list = await window.echora.aiConfig.list(); } catch (e) { /* ignore */ }

  const aiTypes = ['qclaw', 'openclaw'];
  // 追加 STATE.allAgents 中其他 aiType
  const extraTypes = [...new Set(STATE.allAgents.map(a => a.aiType).filter(t => !aiTypes.includes(t)))];
  aiTypes.push(...extraTypes);

  container.innerHTML = aiTypes.map(aiType => {
    const info = list[aiType] || {};
    const path = info.path || '';
    const status = info.status || 'unknown';
    const statusLabel = status === 'ok' ? '✅ 已读取' : status === 'error' ? '❌ 读取失败' : '未注册';
    const statusClass = status === 'ok' ? 'ok' : status === 'error' ? 'error' : '';

    let previewHTML = '';
    if (info.preview) {
      const p = info.preview;
      const agentNames = (p.agents || []).map(a => `${a.name || a.id}`).join(', ') || '无';
      const modelCount = (p.models || []).length;
      previewHTML = `<div class="ai-config-preview">
        <strong>Agents:</strong> ${agentNames} &nbsp;|&nbsp;
        <strong>Models:</strong> ${modelCount} 个 provider &nbsp;|&nbsp;
        <strong>Port:</strong> ${p.port || '未知'}
        ${info.error ? `<br><span style="color:var(--error);">⚠️ ${escHtml(info.error)}</span>` : ''}
      </div>`;
    }

    return `<div class="ai-config-item" data-ai="${aiType}">
      <div class="ai-config-header">
        <span class="ai-config-label">${aiType}</span>
        <span class="ai-config-status ${statusClass}">${statusLabel}</span>
      </div>
      <div class="ai-config-path-row">
        <input type="text" class="ai-config-path-input" id="config-path-${aiType}" value="${escHtml(path)}" placeholder="点击下方自动发现或手动输入路径..." data-ai="${aiType}">
        <button class="btn btn-secondary btn-sm" data-action="browse-config" data-ai="${aiType}" style="white-space:nowrap;">浏览</button>
      </div>
      ${previewHTML}
    </div>`;
  }).join('');
}

/** 渲染 Hermes 配置专区 */
async function renderHermesSection() {
  const statusDot = document.getElementById('hermes-indicator');
  const statusText = document.getElementById('hermes-status-text');
  const configPath = document.getElementById('hermes-config-path');
  const apiStatus = document.getElementById('hermes-api-status');
  const portEl = document.getElementById('hermes-port');
  const authEl = document.getElementById('hermes-auth');
  const profilesSection = document.getElementById('hermes-profiles-section');
  const profilesList = document.getElementById('hermes-profiles-list');

  // 默认状态
  if (statusDot) statusDot.className = 'status-dot';
  if (statusText) statusText.textContent = '检测中...';

  try {
    // 1. 读取 Hermes 配置
    const configResult = await window.echora.hermes.config();
    if (!configResult || !configResult.success) {
      if (statusDot) statusDot.className = 'status-dot offline';
      if (statusText) statusText.textContent = '未检测到 Hermes 配置';
      if (configPath) configPath.textContent = '—';
      if (apiStatus) apiStatus.textContent = '—';
      if (profilesSection) profilesSection.style.display = 'none';
      console.warn('[Hermes] config read failed:', configResult?.error);
      return;
    }

    const config = configResult.data;

    // 2. 发现路径
    const discovered = await window.echora.aiConfig.discover();
    const hermesCfgPath = discovered?.hermes || '—';
    if (configPath) configPath.textContent = hermesCfgPath;

    // 3. API Server 状态
    const enabled = config.apiServerEnabled;
    if (statusDot) statusDot.className = enabled ? 'status-dot online' : 'status-dot offline';
    if (statusText) statusText.textContent = enabled ? 'API Server 已启用' : 'API Server 未启用';
    if (apiStatus) apiStatus.textContent = enabled ? '✅ 已启用' : '⚠️ 未启用';

    // 4. 端口
    if (portEl) portEl.textContent = config.port || '8642';

    // 5. 认证
    const hasAuth = (config.apiServerEnabled && process.env); // 简化
    if (authEl) authEl.textContent = '详见配置文件 (API_SERVER_KEY)';

    // 6. Agents
    if (config.agents && config.agents.length > 0) {
      // agents 信息不单独展示，融入 profiles 或 overview
    }

    // 7. Profiles
    const profiles = await window.echora.hermes.profiles();
    if (profiles && profiles.length > 0) {
      if (profilesSection) profilesSection.style.display = '';
      if (profilesList) {
        profilesList.innerHTML = profiles.map(p => {
          const hasCfg = !!p.configPath;
          return `<div class="hermes-profile-item">
            <span class="profile-name">${escHtml(p.name)}</span>
            <span class="profile-status">${hasCfg ? '✅ 可用' : '⚠️ 无配置'}</span>
          </div>`;
        }).join('');
      }
    } else {
      if (profilesSection) profilesSection.style.display = 'none';
    }
  } catch (e) {
    if (statusDot) statusDot.className = 'status-dot offline';
    if (statusText) statusText.textContent = '读取失败';
    console.warn('[Hermes] renderHermesSection error:', e);
  }
}

async function handleSettingsAction(action, aiType) {
  if (action === 'browse-config') {
    const r = await window.echora.dialog.openFile({ title: `选择 ${aiType} 配置文件`, filters: [{ name: 'JSON 文件 (*.json)', extensions: ['json'] }, { name: '所有文件', extensions: ['*'] }] });
    if (!r.canceled && r.filePaths.length > 0) {
      const input = document.getElementById(`config-path-${aiType}`);
      if (input) input.value = r.filePaths[0];
    }
  }
  if (action === 'reset-timeout') {
    const input = document.getElementById(`timeout-${aiType}`);
    if (input) input.value = '';
  }
}

async function saveSettings() {
  const statusEl = document.getElementById('settings-status');
  const showStatus = (cls, msg) => { statusEl.className = 'settings-status ' + cls; statusEl.textContent = msg; setTimeout(() => { statusEl.textContent = ''; }, 3000); };

  try {
    // 收集超时
    const timeout = parseInt(document.getElementById('slider-timeout')?.value) * 1000 || 120000;
    const timeoutPerAI = {};
    const perAIInputs = document.querySelectorAll('#timeout-per-ai-list input[type="number"]');
    perAIInputs.forEach(input => {
      const ai = input.dataset.ai;
      const val = parseInt(input.value);
      if (ai && !isNaN(val) && val > 0) timeoutPerAI[ai] = val * 1000;
    });

    // 收集轮询
    const pollInterval = parseInt(document.getElementById('slider-poll')?.value) * 1000 || 10000;

    // 保存 settings
    const newSettings = { ...(STATE.settings || {}), timeout, timeoutPerAI, pollInterval };
    await window.echora.config.set('settings', newSettings);
    STATE.settings = newSettings;

    // 保存 AI 配置路径
    const configInputs = document.querySelectorAll('.ai-config-path-input');
    for (const input of configInputs) {
      const aiType = input.dataset.ai;
      const path = input.value.trim();
      if (aiType && path) {
        await window.echora.aiConfig.setPath(aiType, path);
      }
    }

    // 刷新配置预览
    await renderAIConfigList();

    showStatus('success', '✅ 设置已保存');
  } catch (e) {
    showStatus('error', '❌ 保存失败: ' + e.message);
  }
}

async function discoverConfigs() {
  try {
    const discovered = await window.echora.aiConfig.discover();
    for (const [aiType, filePath] of Object.entries(discovered)) {
      if (filePath) {
        const input = document.getElementById(`config-path-${aiType}`);
        if (input) input.value = filePath;
        await window.echora.aiConfig.setPath(aiType, filePath);
      }
    }
    await renderAIConfigList();
    document.getElementById('settings-status').className = 'settings-status success';
    document.getElementById('settings-status').textContent = '✅ 已发现 ' + Object.values(discovered).filter(Boolean).length + ' 个配置文件';
    setTimeout(() => { document.getElementById('settings-status').textContent = ''; }, 3000);
  } catch (e) {
    document.getElementById('settings-status').className = 'settings-status error';
    document.getElementById('settings-status').textContent = '❌ 发现失败: ' + e.message;
  }
}

// ========== 事件绑定 ==========
function bindEvents() {
  document.getElementById('btn-done').addEventListener('click', loadMainUI);
  document.getElementById('btn-rescan').addEventListener('click', async () => {
    const c1 = document.getElementById('env-check-list'); const c2 = document.getElementById('ai-detect-list');
    if (c1) c1.innerHTML = '<div class="empty-tips">⏳ 重新检查...</div>';
    if (c2) c2.innerHTML = '<div class="empty-tips">🔍 重新扫描...</div>';
    const envResult = await window.echora.env.check(); STATE.envResult = envResult; renderEnvCheck(envResult);
    const detected = await window.echora.ai.scan(); renderAIDetect(detected);
  });
  document.getElementById('btn-refresh').addEventListener('click', () => doScan());
  document.getElementById('btn-toggle-drawer').addEventListener('click', toggleDrawer);
  $$('.drawer-menu-item').forEach(item => item.addEventListener('click', () => { const view = item.dataset.view; if (view) switchView(view); }));
  document.getElementById('btn-back-chat').addEventListener('click', () => switchView('chat'));

  // 会话选择器
  const convSel = document.getElementById('conv-selector');
  convSel.addEventListener('change', () => {
    const val = convSel.value;
    if (val === '__new__') {
      const conv = createNewConv(STATE.currentAgentKey);
      refreshConvSelector(STATE.currentAgentKey);
      loadConvMessages(conv);
    } else if (val) {
      STATE.currentConvId = val;
      loadConvMessages(STATE.conversations[STATE.currentAgentKey]?.[val]);
    }
  });
  document.getElementById('btn-new-conv').addEventListener('click', () => {
    if (!STATE.currentAgentKey) return;
    const conv = createNewConv(STATE.currentAgentKey);
    refreshConvSelector(STATE.currentAgentKey);
    loadConvMessages(conv);
  });

  // 自动检测按钮
  document.getElementById('btn-mgmt-add').addEventListener('click', () => showAddAIModal());
  document.getElementById('btn-mgmt-detect').addEventListener('click', () => doScanFull());

  // 事件委托：AI管理列表按钮 + 聊天区启动按钮
  const mgmtList = document.getElementById('mgmt-ai-list');
  if (mgmtList) mgmtList.addEventListener('click', e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    handleMgmtAction(btn.dataset.action, btn.dataset.ai);
  });
  const chatMsgs = document.getElementById('chat-messages');
  if (chatMsgs) chatMsgs.addEventListener('click', e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    handleMgmtAction(btn.dataset.action, btn.dataset.ai);
  });

  // 会话管理视图：删除按钮
  const convMgmtList = document.getElementById('conv-mgmt-list');
  if (convMgmtList) convMgmtList.addEventListener('click', e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    if (btn.dataset.action === 'delete-conv') {
      handleDeleteConv(btn.dataset.agentKey, btn.dataset.convId);
    }
  });
  const btnDeleteAll = document.getElementById('btn-delete-all-convs');
  if (btnDeleteAll) btnDeleteAll.addEventListener('click', () => {
    if (confirm('确定要清空全部会话记录吗？此操作不可撤销。')) handleDeleteAllConvs();
  });

  document.getElementById('btn-save-ai').addEventListener('click', saveAI);
  document.getElementById('btn-cancel-add').addEventListener('click', () => document.getElementById('add-ai-modal').classList.add('hidden'));
  document.getElementById('btn-browse').addEventListener('click', async () => {
    const r = await window.echora.dialog.openFile({ title:'选择 AI 程序 (exe/cmd/bat)' });
    if (!r.canceled && r.filePaths.length > 0) document.getElementById('input-ai-path').value = r.filePaths[0];
  });
  // 目录浏览按钮（自动识别内部 AI 程序）
  const btnBrowseDir = document.getElementById('btn-browse-dir');
  if (btnBrowseDir) btnBrowseDir.addEventListener('click', async () => {
    const r = await window.echora.dialog.openDir({ title:'选择 AI 安装目录' });
    if (!r.canceled && r.filePaths.length > 0) document.getElementById('input-ai-path').value = r.filePaths[0];
  });

  document.getElementById('btn-send').addEventListener('click', sendMessage);
  document.getElementById('chat-input').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } });
  document.getElementById('chat-input').addEventListener('input', () => {
    const el = document.getElementById('chat-input'); el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  });

  document.getElementById('agent-search').addEventListener('input', e => {
    const q = e.target.value.toLowerCase();
    document.getElementById('agent-list')?.querySelectorAll('.agent-item').forEach(item => {
      const n = item.querySelector('.agent-name')?.textContent?.toLowerCase() || '';
      const badge = item.querySelector('.agent-ai-badge')?.textContent?.toLowerCase() || '';
      item.style.display = n.includes(q) || badge.includes(q) ? '' : 'none';
    });
  });

  // === 设置面板事件 ===
  const btnSaveSettings = document.getElementById('btn-save-settings');
  if (btnSaveSettings) btnSaveSettings.addEventListener('click', saveSettings);
  const btnDiscoverConfigs = document.getElementById('btn-discover-configs');
  if (btnDiscoverConfigs) btnDiscoverConfigs.addEventListener('click', discoverConfigs);
  const btnRefreshConfigs = document.getElementById('btn-refresh-configs');
  if (btnRefreshConfigs) btnRefreshConfigs.addEventListener('click', async () => { await renderAIConfigList(); });

  // Hermes 专区事件
  const btnHermesDetect = document.getElementById('btn-hermes-detect');
  if (btnHermesDetect) btnHermesDetect.addEventListener('click', renderHermesSection);
  const btnHermesRefresh = document.getElementById('btn-hermes-refresh');
  if (btnHermesRefresh) btnHermesRefresh.addEventListener('click', renderHermesSection);

  // 事件委托：AI 配置列表 + 超时重置
  const aiConfigList = document.getElementById('ai-config-list');
  if (aiConfigList) aiConfigList.addEventListener('click', e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    handleSettingsAction(btn.dataset.action, btn.dataset.ai);
  });
  const timeoutPerAIList = document.getElementById('timeout-per-ai-list');
  if (timeoutPerAIList) timeoutPerAIList.addEventListener('click', e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    handleSettingsAction(btn.dataset.action, btn.dataset.ai);
  });

  document.querySelectorAll('.modal, .overlay').forEach(el => el.addEventListener('click', e => { if (e.target === el) el.classList.add('hidden'); }));
}

// ========== 启动 ==========
document.addEventListener('DOMContentLoaded', init);


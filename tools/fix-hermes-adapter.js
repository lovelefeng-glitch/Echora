// Fix hermes-adapter.js: listModels, fallback model, getModelInfo
const fs = require('fs');
const path = 'E:/AI/Echora/src/adapters/hermes-adapter.js';
let c = fs.readFileSync(path, 'utf8');

const changes = [];

// 1. Fix sendMessage fallback (first occurrence)
const old1 = `    const model = this._currentModel
      || (agentId && agentId !== 'main' && agentId !== 'hermes-agent'
        ? agentId.replace('hermes-', '')
        : 'hermes-agent');`;

const new1 = `    let model = this._currentModel;
    if (!model) {
      if (agentId && agentId !== 'main' && agentId !== 'hermes-agent') {
        model = agentId.replace('hermes-', '');
      } else {
        this._loadHermesConfig();
        const m = this._hermesConfig?.model;
        model = (m?.default || m?.main) || 'deepseek-ai/deepseek-v4-pro';
      }
    }`;

if (c.includes(old1)) {
  c = c.replace(old1, new1);
  changes.push('sendMessage fallback');
} else {
  console.log('WARN: sendMessage fallback pattern not found');
  // Show what's actually there
  const idx = c.indexOf('const model = this._currentModel');
  if (idx >= 0) console.log('  Found at pos', idx, ':', JSON.stringify(c.substring(idx, idx + 150)));
}

// 2. Fix sendMessageStream fallback (second occurrence - same pattern, will match second time)
if (c.includes(old1)) {
  c = c.replace(old1, new1);
  changes.push('sendMessageStream fallback');
} else {
  console.log('WARN: sendMessageStream fallback pattern not found');
}

// 3. Fix getModelInfo modelName init
const old3 = '    let modelName = null;';
const new3 = '    let modelName = this._currentModel || null;';
if (c.includes(old3)) {
  c = c.replace(old3, new3);
  changes.push('getModelInfo modelName');
} else {
  console.log('WARN: let modelName = null not found');
}

// 4. Fix getModelInfo config parsing + context window
const old4 = `    // 1) 从 config.yaml 解析模型信息
    if (this._hermesConfig) {
      const provider = this._hermesConfig.model?.provider || this._hermesConfig.provider;
      const modelId = this._hermesConfig.model?.id || this._hermesConfig.model;
      if (typeof modelId === 'string') {
        modelName = modelId;
      } else if (provider) {
        modelName = provider;
      }

      // 上下文窗口：从 config 或已知模型列表推断
      contextWindow = this._hermesConfig.model?.context_window
        || this._hermesConfig.model?.max_tokens
        || 1000000; // Hermes 默认 1M (deepseek-v4-pro)
    }`;

const new4 = `    // 1) 从 config.yaml 解析模型信息
    if (this._hermesConfig) {
      // 模型名：优先 _currentModel，其次 config.model.default/main
      if (!modelName) {
        const m = this._hermesConfig.model;
        modelName = (m && typeof m === 'object') ? (m.default || m.main) : (typeof m === 'string' ? m : null);
      }

      // 上下文窗口：从 custom_providers 匹配当前模型
      if (!contextWindow) {
        const targetModel = modelName || this._hermesConfig.model?.default || this._hermesConfig.model?.main;
        contextWindow = this._findContextLength(targetModel)
          || this._hermesConfig.model?.context_window
          || this._hermesConfig.model?.max_tokens;
      }
    }`;

if (c.includes(old4)) {
  c = c.replace(old4, new4);
  changes.push('getModelInfo config parsing');
} else {
  console.log('WARN: getModelInfo config block not found');
  const idx = c.indexOf('// 1) 从 config.yaml 解析模型信息');
  if (idx >= 0) console.log('  Found at pos', idx, ':', JSON.stringify(c.substring(idx, idx + 300)));
}

// 5. Add _findContextLength helper
const old5 = '  // ========== 模型信息 ==========';
const new5 = `  /**
   * 从 custom_providers 查找指定模型的上下文长度
   */
  _findContextLength(modelId) {
    if (!modelId) return null;
    try {
      const providers = this._hermesConfig?.custom_providers;
      if (!Array.isArray(providers)) return null;
      for (const p of providers) {
        if (p.models && p.models[modelId]) {
          return p.models[modelId].context_length || null;
        }
      }
    } catch (e) {}
    return null;
  }

  // ========== 模型信息 ==========`;

if (c.includes(old5)) {
  c = c.replace(old5, new5);
  changes.push('_findContextLength helper');
} else {
  console.log('WARN: model info comment not found');
}

// 6. Fix listModels step 1
const old6 = '      const defaultModel = this._hermesConfig.model?.id || this._hermesConfig.model;';
const new6 = '      const m = this._hermesConfig.model;\n      const defaultModel = (m && typeof m === \'object\') ? (m.default || m.main) : m;';
if (c.includes(old6)) {
  c = c.replace(old6, new6);
  changes.push('listModels step 1');
} else {
  console.log('WARN: listModels default model not found');
}

// 7. Add custom_providers parsing
const old7 = '    // 2) 从 profiles 解析';
const new7 = `    // 1.5) 从 custom_providers 解析所有可用模型
    try {
      const providers = this._hermesConfig?.custom_providers;
      if (Array.isArray(providers)) {
        for (const p of providers) {
          const pModels = p.models;
          if (pModels && typeof pModels === 'object') {
            for (const modelId of Object.keys(pModels)) {
              if (!seen.has(modelId)) {
                seen.add(modelId);
                models.push({
                  id: modelId,
                  name: modelId.split('/').pop(),
                  isDefault: false,
                  source: 'custom_provider',
                  provider: p.name || '',
                });
              }
            }
          }
          const pSingle = p.model;
          if (typeof pSingle === 'string' && !seen.has(pSingle)) {
            seen.add(pSingle);
            models.push({
              id: pSingle,
              name: pSingle,
              isDefault: false,
              source: 'custom_provider',
              provider: p.name || '',
            });
          }
        }
      }
    } catch (e) {}

    // 2) 从 profiles 解析`;

if (c.includes(old7)) {
  c = c.replace(old7, new7);
  changes.push('custom_providers parsing');
} else {
  console.log('WARN: profiles comment not found');
}

fs.writeFileSync(path, c, 'utf8');
console.log('Applied', changes.length, 'changes:', changes.join(', '));

// Verify
require('child_process').execSync('node --check "' + path + '"', { encoding: 'utf8' });
console.log('Syntax check: PASSED');
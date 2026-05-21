const fs = require('fs');
const path = 'E:/AI/Echora/src/adapters/hermes-adapter.js';
let c = fs.readFileSync(path, 'utf8');
const changes = [];

// 1+2. Fix both sendMessage and sendMessageStream fallback (same pattern, replace all)
const oldModel = `    const model = this._currentModel\r\n      || (agentId && agentId !== 'main' && agentId !== 'hermes-agent'\r\n        ? agentId.replace('hermes-', '')\r\n        : 'hermes-agent');`;

const newModel = `    let model = this._currentModel;
    if (!model) {
      if (agentId && agentId !== 'main' && agentId !== 'hermes-agent') {
        model = agentId.replace('hermes-', '');
      } else {
        this._loadHermesConfig();
        const m = this._hermesConfig?.model;
        model = (m?.default || m?.main) || 'deepseek-ai/deepseek-v4-pro';
      }
    }`;

let count = 0;
c = c.replace(new RegExp(oldModel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), () => { count++; return newModel; });
changes.push(`sendMessage(Stream) fallback x${count}`);

// 4. Fix getModelInfo config parsing block
const oldGM = `    // 1) 从 config.yaml 解析模型信息\r\n    if (this._hermesConfig) {\r\n      const provider = this._hermesConfig.model?.provider || this._hermesConfig.provider;\r\n      const modelId = this._hermesConfig.model?.id || this._hermesConfig.model;\r\n      if (typeof modelId === 'string') {\r\n        modelName = modelId;\r\n      } else if (provider) {\r\n        modelName = provider;\r\n      }\r\n\r\n      // 上下文窗口：从 config 或已知模型列表推断\r\n      contextWindow = this._hermesConfig.model?.context_window\r\n        || this._hermesConfig.model?.max_tokens\r\n        || 1000000; // Hermes 默认 1M (deepseek-v4-pro)\r\n    }`;

const newGM = `    // 1) 从 config.yaml 解析模型信息\r\n    if (this._hermesConfig) {\r\n      // 模型名：优先 _currentModel，其次 config.model.default/main\r\n      if (!modelName) {\r\n        const m = this._hermesConfig.model;\r\n        modelName = (m && typeof m === 'object') ? (m.default || m.main) : (typeof m === 'string' ? m : null);\r\n      }\r\n\r\n      // 上下文窗口：从 custom_providers 匹配当前模型\r\n      if (!contextWindow) {\r\n        const targetModel = modelName || this._hermesConfig.model?.default || this._hermesConfig.model?.main;\r\n        contextWindow = this._findContextLength(targetModel)\r\n          || this._hermesConfig.model?.context_window\r\n          || this._hermesConfig.model?.max_tokens;\r\n      }\r\n    }`;

if (c.includes(oldGM)) {
  c = c.replace(oldGM, newGM);
  changes.push('getModelInfo config parsing');
} else {
  console.log('WARN: getModelInfo config block still not found');
}

fs.writeFileSync(path, c, 'utf8');
console.log('Applied:', changes.join(', '));
require('child_process').execSync('node --check "' + path + '"', { encoding: 'utf8' });
console.log('Syntax: PASSED');
// 适配器基类 - 所有 AI 软件适配器的接口规范

class BaseAdapter {
  /**
   * @param {object} config - { exePath, port, token, ... }
   */
  constructor(config = {}) {
    this.config = config;
    this.name = 'base';
    this.status = 'offline';  // offline | starting | running | error
  }

  /**
   * 启动网关进程
   * @returns {Promise<{success: boolean, message: string}>}
   */
  async start() {
    throw new Error('start() 需由子类实现');
  }

  /**
   * 停止网关进程
   * @returns {Promise<{success: boolean}>}
   */
  async stop() {
    throw new Error('stop() 需由子类实现');
  }

  /**
   * 获取当前状态
   * @returns {{ status: string, pid?: number, uptime?: number }}
   */
  async getStatus() {
    throw new Error('getStatus() 需由子类实现');
  }

  /**
   * 枚举该 AI 的所有 agent
   * @returns {Promise<Array<{id: string, name: string, description?: string}>>}
   */
  async listAgents() {
    throw new Error('listAgents() 需由子类实现');
  }

  /**
   * 向指定 agent 发送消息
   * @param {string} agentId
   * @param {string} message
   * @returns {Promise<{success: boolean, messageId?: string}>}
   */
  async sendMessage(agentId, message) {
    throw new Error('sendMessage() 需由子类实现');
  }

  /**
   * 获取模型信息（模型名、上下文窗口、当前占用）
   * @returns {{ model: string|null, contextWindow: number|null, contextUsed: number|null, usagePct: number|null }}
   */
  async getModelInfo() {
    return { model: null, contextWindow: null, contextUsed: null, usagePct: null };
  }

  /**
   * 列出可用模型
   * @returns {Promise<Array<{id: string, name: string, isDefault: boolean, source: string}>>}
   */
  async listModels() {
    return [];
  }

  /**
   * 设置当前使用的模型
   * @param {string|null} modelId - 模型 ID，null 恢复默认
   * @returns {{ success: boolean, model: string|null }}
   */
  setModel(modelId) {
    return { success: false, model: null };
  }

  /**
   * 获取当前选中的模型 ID
   * @returns {string|null}
   */
  getCurrentModel() {
    return null;
  }

  /**
   * 注册接收消息的回调
   * @param {function} callback - (message) => void
   */
  onMessage(callback) {
    this._onMessageCallback = callback;
  }

  /**
   * 内部：触发消息回调（子类应调用此方法）
   */
  _emitMessage(msg) {
    if (this._onMessageCallback) {
      this._onMessageCallback(msg);
    }
  }
}

module.exports = BaseAdapter;
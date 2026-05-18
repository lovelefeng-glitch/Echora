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
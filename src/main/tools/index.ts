/**
 * 工具模块入口
 * 导出所有工具相关的类型和实现
 */

// 类型定义
export type {
  DangerLevel,
  ParameterType,
  ParameterDefinition,
  ToolDefinition,
  ToolContext,
  ToolResult,
  ToolHandler,
  ToolRegistration,
  OpenAIFunction,
  ToolCallRequest,
  ToolConfirmCallback
} from './types'

// 实现
export { ToolRegistry, getToolRegistry } from './tool-registry'

// 内置工具
export {
  builtinTools,
  webSearchDefinition,
  webSearchHandler,
  webFetchDefinition,
  webFetchHandler,
  fileReadDefinition,
  fileReadHandler,
  fileWriteDefinition,
  fileWriteHandler,
  setAllowedDirs,
  getAllowedDirs,
  calcDefinition,
  calcHandler,
  codeExecuteDefinition,
  codeExecuteHandler,
  kbSearchDefinition,
  kbSearchHandler,
  systemInfoDefinition,
  systemInfoHandler,
  collectSystemInfo
} from './builtin'

/**
 * 内置工具入口
 * 导出所有内置工具的定义和处理器
 */

// web_search
export { webSearchDefinition, webSearchHandler } from './web-search'

// web_fetch
export { webFetchDefinition, webFetchHandler } from './web-fetch'

// file_read / file_write
export { fileReadDefinition, fileReadHandler, fileWriteDefinition, fileWriteHandler, setAllowedDirs, getAllowedDirs } from './file-ops'

// calc
export { calcDefinition, calcHandler } from './calc'

// code_execute
export { codeExecuteDefinition, codeExecuteHandler } from './code-execute'

// powershell_execute
export { powershellExecuteDefinition, powershellExecuteHandler } from './powershell'

// kb_search (P3 占位)
export { kbSearchDefinition, kbSearchHandler } from './kb-search'

// system_info
export { systemInfoDefinition, systemInfoHandler, collectSystemInfo } from './system-info'

// file_list (Sprint 11 Phase 2)
export { fileListDefinition, fileListHandler } from './file-list'

// file_edit (Sprint 11 Phase 2)
export { fileEditDefinition, fileEditHandler } from './file-edit'

// terminal (Sprint 11 Phase 2)
export { terminalDefinition, terminalHandler } from './terminal'

import type { ToolDefinition, ToolHandler } from '../types'
import { webSearchDefinition, webSearchHandler } from './web-search'
import { webFetchDefinition, webFetchHandler } from './web-fetch'
import { fileReadDefinition, fileReadHandler, fileWriteDefinition, fileWriteHandler } from './file-ops'
import { calcDefinition, calcHandler } from './calc'
import { codeExecuteDefinition, codeExecuteHandler } from './code-execute'
import { powershellExecuteDefinition, powershellExecuteHandler } from './powershell'
import { kbSearchDefinition, kbSearchHandler } from './kb-search'
import { systemInfoDefinition, systemInfoHandler } from './system-info'
import { fileListDefinition, fileListHandler } from './file-list'
import { fileEditDefinition, fileEditHandler } from './file-edit'
import { terminalDefinition, terminalHandler } from './terminal'

/** 所有内置工具 */
export const builtinTools: Array<{ definition: ToolDefinition; handler: ToolHandler }> = [
  { definition: webSearchDefinition, handler: webSearchHandler },
  { definition: webFetchDefinition, handler: webFetchHandler },
  { definition: fileReadDefinition, handler: fileReadHandler },
  { definition: fileWriteDefinition, handler: fileWriteHandler },
  { definition: calcDefinition, handler: calcHandler },
  { definition: codeExecuteDefinition, handler: codeExecuteHandler },
  { definition: powershellExecuteDefinition, handler: powershellExecuteHandler },
  { definition: kbSearchDefinition, handler: kbSearchHandler },
  { definition: systemInfoDefinition, handler: systemInfoHandler },
  { definition: fileListDefinition, handler: fileListHandler },
  { definition: fileEditDefinition, handler: fileEditHandler },
  { definition: terminalDefinition, handler: terminalHandler }
]

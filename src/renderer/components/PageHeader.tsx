import type { ReactNode } from 'react'

interface PageHeaderProps {
  title: string
  rightContent?: ReactNode
}

export function PageHeader({ title, rightContent }: PageHeaderProps) {
  return (
    <div className="h-[var(--topbar-height)] px-3 flex items-center justify-between bg-white rounded-[20px] flex-shrink-0 mb-2 [-webkit-app-region:drag] select-none dark:bg-[var(--bg-secondary)] dark:border-none [&_button]:[-webkit-app-region:no-drag] [&_select]:[-webkit-app-region:no-drag] [&_input]:[-webkit-app-region:no-drag] [&_a]:[-webkit-app-region:no-drag]">
      <div className="flex items-center min-w-0 gap-1.5">
        <span className="text-sm text-[var(--text-hint)] mr-1 dark:text-white">&gt;&gt;</span>
        <div className="inline-flex items-center py-[5px] px-3.5 rounded-[var(--radius-xl)] text-[13px] font-medium whitespace-nowrap cursor-pointer transition-all duration-150 select-none bg-[var(--bg-tag)] text-[var(--bg-tag-text)] [-webkit-app-region:no-drag] dark:bg-[var(--bg-tag)] dark:text-[var(--bg-tag-text)]">
          <span className="overflow-hidden text-ellipsis">{title}</span>
        </div>
      </div>
      {rightContent && (
        <div className="flex items-center gap-2">
          {rightContent}
        </div>
      )}
    </div>
  )
}

'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

interface TooltipProps {
  /** conteúdo do balão */
  content: React.ReactNode
  children: React.ReactNode
  side?: 'top' | 'bottom'
  className?: string
}

/**
 * Tooltip leve, CSS-only (sem dependência de Radix). Aparece no hover/focus do
 * elemento-âncora. Para conteúdo curto (resumo de um agendamento, ajuda de KPI).
 */
export function Tooltip({ content, children, side = 'top', className }: TooltipProps) {
  if (content == null || content === '') return <>{children}</>
  return (
    <span className={cn('group/tt relative inline-flex', className)}>
      {children}
      <span
        role="tooltip"
        className={cn(
          'pointer-events-none absolute left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded-lg bg-foreground px-2.5 py-1.5 text-xs font-medium text-background opacity-0 shadow-popover transition-opacity duration-150 group-hover/tt:opacity-100 group-focus-within/tt:opacity-100',
          side === 'top' ? 'bottom-full mb-1.5' : 'top-full mt-1.5',
        )}
      >
        {content}
      </span>
    </span>
  )
}

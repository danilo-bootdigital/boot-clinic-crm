'use client'

import * as React from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface DrawerProps {
  open: boolean
  onClose: () => void
  title?: React.ReactNode
  description?: React.ReactNode
  children: React.ReactNode
  /** largura do painel */
  width?: string
}

/**
 * Drawer lateral (sheet) do Design System. Overlay + painel deslizante à direita.
 * Sem dependência de Radix — fecha no ESC, no clique do overlay e trava o scroll.
 */
export function Drawer({
  open,
  onClose,
  title,
  description,
  children,
  width = 'max-w-md',
}: DrawerProps) {
  React.useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex justify-end" aria-modal="true" role="dialog">
      <div
        className="absolute inset-0 bg-foreground/20 backdrop-blur-[1px] animate-in fade-in"
        onClick={onClose}
      />
      <div
        className={cn(
          'relative flex h-full w-full flex-col bg-card shadow-popover',
          'animate-in slide-in-from-right duration-200',
          width,
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div className="min-w-0">
            {title && <h3 className="truncate text-base font-semibold text-foreground">{title}</h3>}
            {description && (
              <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto scrollbar-thin px-5 py-4">{children}</div>
      </div>
    </div>
  )
}

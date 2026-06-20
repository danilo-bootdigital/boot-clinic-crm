import { cn } from '@/lib/utils'
import { statusMeta } from './appointment-meta'

/** Badge de status do agendamento — usa a paleta única de appointment-meta. */
export function StatusPill({ status, className }: { status?: string | null; className?: string }) {
  const meta = statusMeta(status)
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset',
        meta.badge,
        className,
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', meta.dot)} />
      {meta.label}
    </span>
  )
}

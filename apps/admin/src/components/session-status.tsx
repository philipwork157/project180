import type { SessionStatus } from '@project180/shared'
import { cn } from '@project180/ui'

/** After a workout's name in coach lists: how it ended, when it didn't end as finished. */
export function SessionStatusTag({
  status,
  className,
}: {
  status: SessionStatus
  className?: string
}) {
  if (status !== 'abandoned' && status !== 'cancelled') return null
  return (
    <span
      className={cn(
        'ml-2 inline-flex rounded-pill px-2 py-0.5 align-middle font-bold text-[11px]',
        status === 'abandoned' ? 'bg-sand/25 text-sand-text' : 'bg-surface-raised text-ink-muted',
        className,
      )}
    >
      {status === 'abandoned' ? 'Stopped early' : 'Cancelled'}
    </span>
  )
}

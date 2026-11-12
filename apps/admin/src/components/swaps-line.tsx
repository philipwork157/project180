import { type ExerciseSwap, swapsLabel } from '@project180/shared'
import { cn } from '@project180/ui'
import { ArrowLeftRight } from 'lucide-react'

/** "Swapped Squat → Leg Press" under a workout in history; nothing when nothing was swapped. */
export function SwapsLine({ swaps, className }: { swaps: ExerciseSwap[]; className?: string }) {
  if (swaps.length === 0) return null
  const label = swapsLabel(swaps)
  return (
    <span
      title={`Swapped ${label}`}
      className={cn(
        'flex min-w-0 items-center gap-1.5 font-semibold text-[13px] text-ink-muted',
        className,
      )}
    >
      <ArrowLeftRight className="size-3.5 shrink-0 text-brand-text" aria-hidden />
      <span className="truncate">
        <span className="sr-only">Swapped </span>
        {label}
      </span>
    </span>
  )
}

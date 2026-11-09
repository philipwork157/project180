import type { PlanDay } from '@project180/shared'
import { cn } from '@project180/ui'
import { Check } from 'lucide-react'

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function dayName(date: string) {
  return DAY_NAMES[(new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7]
}

/** Seven days of the program: done (lime), planned (violet ring), rest (dash), missed (clay ring). */
export function WeekStrip({
  days,
  onSelect,
}: {
  days: PlanDay[]
  onSelect?: (day: PlanDay) => void
}) {
  return (
    <ol className="grid grid-cols-7 gap-1.5 rounded-lg bg-surface p-2 shadow-card">
      {days.map((d) => (
        <li key={d.date}>
          <button
            type="button"
            onClick={() => onSelect?.(d)}
            aria-label={`${dayName(d.date)} ${d.date}: ${d.workoutName ?? 'rest'}, ${d.state}`}
            className={cn(
              'flex w-full flex-col items-center gap-1.5 rounded-pill py-2.5 transition',
              d.isToday ? 'bg-brand text-on-brand' : 'text-ink',
            )}
          >
            <span
              className={cn(
                'font-extrabold text-[11px] uppercase tracking-wide',
                d.isToday ? 'opacity-80' : 'text-ink-muted',
              )}
            >
              {dayName(d.date)}
            </span>
            <span className="metric text-[18px] leading-6">{Number(d.date.slice(8))}</span>
            <DayMark day={d} />
          </button>
        </li>
      ))}
    </ol>
  )
}

export function DayMark({ day, size = 22 }: { day: PlanDay; size?: number }) {
  const style = { width: size, height: size }
  if (day.state === 'done') {
    return (
      <span
        style={style}
        className={cn(
          'grid place-items-center rounded-full bg-lime text-on-lime',
          day.isToday && 'ring-2 ring-on-brand',
        )}
      >
        <Check className="size-3.5" strokeWidth={3.5} aria-hidden />
      </span>
    )
  }
  if (day.state === 'rest') {
    return (
      <span style={style} className="grid place-items-center rounded-full bg-surface-raised">
        <span className="h-0.5 w-2 rounded-full bg-ink-muted" />
      </span>
    )
  }
  return (
    <span
      style={style}
      className={cn(
        'rounded-full ring-2 ring-inset',
        day.state === 'missed' ? 'ring-clay' : day.isToday ? 'ring-on-brand' : 'ring-brand',
      )}
    />
  )
}

import type { WorkoutSummary } from '@project180/shared'
import { Button, cn, Input } from '@project180/ui'
import { Check, MoonStar, Search } from 'lucide-react'
import { type ReactNode, useEffect, useState } from 'react'

export type Brush = number | 'rest' | null

/** Search only earns its place once the list is longer than a glance. */
const SEARCH_FROM = 8

function meta(w: WorkoutSummary) {
  const parts = [`${w.exerciseCount} exercise${w.exerciseCount === 1 ? '' : 's'}`]
  if (w.estimatedMinutes) parts.push(`${w.estimatedMinutes} min`)
  return parts.join(' · ')
}

/**
 * Pick a workout (or rest), then click days in the schedule to fill them. A calm list rather
 * than a wall of coloured chips: names stay readable, and the one you're filling with stands out.
 */
export function WorkoutPalette({
  workouts,
  brush,
  onBrush,
}: {
  workouts: WorkoutSummary[]
  brush: Brush
  onBrush: (brush: Brush) => void
}) {
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const shown = q ? workouts.filter((w) => w.name.toLowerCase().includes(q)) : workouts
  const picked = typeof brush === 'number' ? workouts.find((w) => w.id === brush) : null

  // Esc puts the brush down, wherever focus is.
  useEffect(() => {
    if (brush === null) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onBrush(null)
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [brush, onBrush])

  return (
    <section
      aria-label="Fill days"
      className="flex flex-col gap-3 rounded-lg bg-surface p-4 shadow-card"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="font-bold text-[15px]">Fill days</h2>
          <p aria-live="polite" className="text-[13px] text-ink-muted">
            {brush === null
              ? 'Pick a workout, then click days in the schedule.'
              : brush === 'rest'
                ? 'Click days to make them rest days.'
                : `Click days to add ${picked?.name ?? 'this workout'}.`}
          </p>
        </div>
        {brush !== null && (
          <Button variant="secondary" size="sm" onClick={() => onBrush(null)}>
            Done
          </Button>
        )}
      </div>

      {workouts.length >= SEARCH_FROM && (
        <div className="relative">
          <Search
            className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-3 size-4 text-ink-muted"
            aria-hidden
          />
          <Input
            type="search"
            aria-label="Find a workout"
            placeholder="Find a workout"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      )}

      <ul className="-mx-1 grid max-h-72 grid-cols-1 gap-1 overflow-y-auto px-1 sm:grid-cols-2 lg:grid-cols-3 xl:max-h-[min(60vh,32rem)] xl:grid-cols-1">
        <li>
          <PaletteRow
            on={brush === 'rest'}
            onClick={() => onBrush(brush === 'rest' ? null : 'rest')}
            title="Rest day"
            sub="Clears the days you click"
            icon={<MoonStar className="size-4 text-ink-muted" aria-hidden />}
          />
        </li>
        {shown.map((w) => (
          <li key={w.id}>
            <PaletteRow
              on={brush === w.id}
              onClick={() => onBrush(brush === w.id ? null : w.id)}
              title={w.name}
              sub={meta(w)}
            />
          </li>
        ))}
        {shown.length === 0 && (
          <li className="px-3 py-2 text-[13px] text-ink-muted">No workout called “{query}”.</li>
        )}
      </ul>
    </section>
  )
}

function PaletteRow({
  on,
  onClick,
  title,
  sub,
  icon,
}: {
  on: boolean
  onClick: () => void
  title: string
  sub: string
  icon?: ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        'flex min-h-11 w-full items-center gap-3 rounded-md px-3 py-2 text-left transition active:scale-[0.99]',
        on ? 'bg-brand-soft' : 'hover:bg-surface-raised',
      )}
    >
      {icon}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate font-semibold text-[14px] text-ink">{title}</span>
        <span className="truncate text-[12px] text-ink-muted">{sub}</span>
      </span>
      {on && <Check className="size-4 shrink-0 text-brand-text" strokeWidth={3} aria-hidden />}
    </button>
  )
}

import type { ProgramCell, WorkoutSummary } from '@project180/shared'
import { buttonClasses, cn, Drawer, Input } from '@project180/ui'
import { Link } from '@tanstack/react-router'
import { Check, MoonStar, Pencil, Scale, Search } from 'lucide-react'
import { type ReactNode, useState } from 'react'

/** Search only earns its place once the list is longer than a glance. */
const SEARCH_FROM = 8

/**
 * One day of a program, opened by clicking it in the schedule: pick its workout (or rest),
 * make it a weigh-in day, or open the workout itself. Picking a workout closes the panel.
 */
export function ProgramDayDrawer({
  day,
  cell,
  workouts,
  onPick,
  onToggleWeighIn,
  onClose,
}: {
  /** The day being edited; null = closed. */
  day: { week: number; day: number } | null
  cell: ProgramCell
  workouts: WorkoutSummary[]
  onPick: (workoutId: number | null) => void
  onToggleWeighIn: () => void
  onClose: () => void
}) {
  return (
    <Drawer
      open={day !== null}
      onClose={onClose}
      title={day ? `Week ${day.week} · Day ${day.day}` : 'Day'}
      description="Pick what happens on this day. Drag days in the schedule to swap them."
    >
      {day && (
        <DayForm
          key={`${day.week}:${day.day}`}
          cell={cell}
          workouts={workouts}
          onPick={(id) => {
            onPick(id)
            onClose()
          }}
          onToggleWeighIn={onToggleWeighIn}
        />
      )}
    </Drawer>
  )
}

function DayForm({
  cell,
  workouts,
  onPick,
  onToggleWeighIn,
}: {
  cell: ProgramCell
  workouts: WorkoutSummary[]
  onPick: (workoutId: number | null) => void
  onToggleWeighIn: () => void
}) {
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const shown = q ? workouts.filter((w) => w.name.toLowerCase().includes(q)) : workouts
  const current = workouts.find((w) => w.id === cell.workoutId) ?? null
  const archived = cell.workoutId !== null && current === null

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 rounded-md bg-surface-raised p-4">
        <p className="font-extrabold text-[11px] text-ink-muted uppercase tracking-[0.08em]">Now</p>
        <div className="flex flex-wrap items-center gap-3">
          <span className="min-w-0 flex-1 font-bold text-[17px]">
            {current?.name ?? (archived ? 'Archived workout' : 'Rest day')}
          </span>
          {current && (
            <Link
              to="/workouts/$workoutId"
              params={{ workoutId: String(current.id) }}
              className={buttonClasses('secondary', 'sm')}
            >
              <Pencil className="size-4" aria-hidden />
              Edit workout
            </Link>
          )}
        </div>
        <button
          type="button"
          aria-pressed={cell.checkinRequired}
          onClick={onToggleWeighIn}
          className={cn(
            'flex min-h-11 items-center gap-3 rounded-md px-3 text-left font-semibold text-[14px] transition active:scale-[0.99]',
            cell.checkinRequired
              ? 'bg-sand/20 text-sand-text'
              : 'bg-surface text-ink-muted hover:text-ink',
          )}
        >
          <Scale className="size-4 shrink-0" aria-hidden />
          <span className="flex-1">
            {cell.checkinRequired ? 'Weigh-in day' : 'Make this a weigh-in day'}
          </span>
          {cell.checkinRequired && <Check className="size-4" strokeWidth={3} aria-hidden />}
        </button>
      </div>

      <div className="flex flex-col gap-3">
        <p className="font-extrabold text-[11px] text-ink-muted uppercase tracking-[0.08em]">
          Change to
        </p>
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
        <ul className="-mx-1 flex flex-col gap-1 px-1">
          <li>
            <Choice
              on={cell.workoutId === null}
              onClick={() => onPick(null)}
              title="Rest day"
              sub="No workout"
              icon={<MoonStar className="size-4 text-ink-muted" aria-hidden />}
            />
          </li>
          {shown.map((w) => (
            <li key={w.id}>
              <Choice
                on={cell.workoutId === w.id}
                onClick={() => onPick(w.id)}
                title={w.name}
                sub={[
                  `${w.exerciseCount} exercise${w.exerciseCount === 1 ? '' : 's'}`,
                  w.estimatedMinutes ? `${w.estimatedMinutes} min` : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              />
            </li>
          ))}
          {shown.length === 0 && (
            <li className="px-3 py-2 text-[13px] text-ink-muted">No workout called “{query}”.</li>
          )}
        </ul>
      </div>
    </div>
  )
}

function Choice({
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
        'flex min-h-12 w-full items-center gap-3 rounded-md px-3 py-2 text-left transition active:scale-[0.99]',
        on ? 'bg-brand-soft' : 'hover:bg-surface-raised',
      )}
    >
      {icon}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate font-semibold text-[15px] text-ink">{title}</span>
        <span className="truncate text-[12px] text-ink-muted">{sub}</span>
      </span>
      {on && <Check className="size-4 shrink-0 text-brand-text" strokeWidth={3} aria-hidden />}
    </button>
  )
}

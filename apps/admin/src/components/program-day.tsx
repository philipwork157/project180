import type { ProgramCell, WorkoutSummary } from '@project180/shared'
import { buttonClasses, cn, Drawer, Input } from '@project180/ui'
import { Link } from '@tanstack/react-router'
import {
  ArrowLeftRight,
  Check,
  CopyCheck,
  Eraser,
  MoonStar,
  Pencil,
  Scale,
  Search,
} from 'lucide-react'
import { type ReactNode, useState } from 'react'

/** Search only earns its place once the list is longer than a glance. */
const SEARCH_FROM = 8

/**
 * One day of a program, opened by clicking it in the schedule: pick its workout (or rest),
 * make it a weigh-in day, or open the workout itself. Picking a workout closes the panel.
 * "Swap with another day" and "every week" work on phones and by keyboard too, where dragging
 * days doesn't.
 */
export function ProgramDayDrawer({
  day,
  cell,
  workouts,
  onPick,
  onToggleWeighIn,
  weeks,
  onSwap,
  onCopyToAllWeeks,
  onClose,
}: {
  /** The day being edited; null = closed. */
  day: { week: number; day: number } | null
  cell: ProgramCell
  workouts: WorkoutSummary[]
  onPick: (workoutId: number | null) => void
  onToggleWeighIn: () => void
  /** How many weeks the program has. */
  weeks: number
  /** Start picking the day to swap this one with (the panel closes). */
  onSwap: () => void
  /** Put this day on the same day of every week. */
  onCopyToAllWeeks: () => void
  onClose: () => void
}) {
  return (
    <Drawer
      open={day !== null}
      onClose={onClose}
      title={day ? `Week ${day.week} · Day ${day.day}` : 'Day'}
      description="Pick what happens on this day."
    >
      {day && (
        <div className="flex flex-col gap-6">
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
          <div className="flex flex-col gap-2 border-border border-t pt-5">
            <p className="font-extrabold text-[11px] text-ink-muted uppercase tracking-[0.08em]">
              Move or repeat
            </p>
            <ActionRow
              icon={<ArrowLeftRight className="size-4" aria-hidden />}
              title="Swap with another day"
              sub="Then click the day it should swap with."
              onClick={() => {
                onClose()
                onSwap()
              }}
            />
            <ActionRow
              icon={<CopyCheck className="size-4" aria-hidden />}
              title={`Put this on day ${day.day} of every week`}
              sub={
                weeks > 1
                  ? `Same workout and weigh-in in all ${weeks} weeks.`
                  : 'Add more weeks first.'
              }
              disabled={weeks <= 1}
              onClick={() => {
                onClose()
                onCopyToAllWeeks()
              }}
            />
          </div>
        </div>
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

/** A whole week, opened by clicking its name in the schedule: copy, swap or clear it. */
export function ProgramWeekDrawer({
  week,
  weeks,
  filled,
  onCopy,
  onSwap,
  onClear,
  onClose,
}: {
  /** The week; null = closed. */
  week: number | null
  weeks: number
  /** Days in this week with a workout or a weigh-in. */
  filled: number
  onCopy: () => void
  onSwap: () => void
  onClear: () => void
  onClose: () => void
}) {
  const run = (action: () => void) => () => {
    onClose()
    action()
  }
  return (
    <Drawer
      open={week !== null}
      onClose={onClose}
      title={week ? `Week ${week}` : 'Week'}
      description={`${filled} of 7 days have a workout or a weigh-in.`}
    >
      <div className="flex flex-col gap-2">
        <ActionRow
          icon={<CopyCheck className="size-4" aria-hidden />}
          title="Copy to every week"
          sub={
            weeks > 1 ? `All ${weeks} weeks become the same as this one.` : 'Add more weeks first.'
          }
          disabled={weeks <= 1}
          onClick={run(onCopy)}
        />
        <ActionRow
          icon={<ArrowLeftRight className="size-4" aria-hidden />}
          title="Swap with another week"
          sub={
            weeks > 1
              ? 'Then click any day in the week it should swap with.'
              : 'Add more weeks first.'
          }
          disabled={weeks <= 1}
          onClick={run(onSwap)}
        />
        <ActionRow
          icon={<Eraser className="size-4" aria-hidden />}
          title="Clear this week"
          sub={
            filled > 0
              ? 'Every day becomes a rest day, weigh-ins off.'
              : 'It’s already all rest days.'
          }
          disabled={filled === 0}
          onClick={run(onClear)}
        />
        <p className="mt-2 text-[13px] text-ink-muted">
          Undo is in the message that pops up, and nothing changes for clients until you save.
        </p>
      </div>
    </Drawer>
  )
}

function ActionRow({
  icon,
  title,
  sub,
  disabled = false,
  onClick,
}: {
  icon: ReactNode
  title: string
  sub: string
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex min-h-14 w-full items-center gap-3 rounded-md bg-surface-raised px-4 py-3 text-left transition hover:ring-[1.5px] hover:ring-border-strong hover:ring-inset active:scale-[0.99] disabled:pointer-events-none disabled:opacity-50"
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-surface text-ink">
        {icon}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="font-semibold text-[15px] text-ink">{title}</span>
        <span className="text-[13px] text-ink-muted">{sub}</span>
      </span>
    </button>
  )
}

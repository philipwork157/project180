import { myCheckInQuery, planQuery } from '@project180/client'
import { formatDay, type PlanDay } from '@project180/shared'
import { Button, cn, EmptyState } from '@project180/ui'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { CalendarClock, CalendarDays, Check, ClipboardCheck, Moon, Play, Scale } from 'lucide-react'
import { useState } from 'react'
import { ScreenHeader } from '../../components/screen-header'
import { SessionDetails } from '../../components/session-details'
import { Sheet } from '../../components/sheet'
import { useStartWorkout } from '../../lib/use-start-workout'

export const Route = createFileRoute('/_app/calendar')({
  component: CalendarPage,
})

function label(date: string, opts: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat('en-ZA', { ...opts, timeZone: 'UTC' }).format(
    new Date(`${date}T00:00:00Z`),
  )
}

function CalendarPage() {
  const { me } = Route.useRouteContext()
  const plan = useQuery(planQuery)
  const checkIn = useQuery(myCheckInQuery).data
  const start = useStartWorkout()
  const [selected, setSelected] = useState<PlanDay | null>(null)
  const p = plan.data?.plan

  if (plan.isPending) return <div className="mt-24 h-96 animate-pulse rounded-xl bg-surface" />
  if (!p) {
    return (
      <>
        <ScreenHeader overline="Your program" title="Calendar" />
        <EmptyState icon={<CalendarDays className="size-7" aria-hidden />} title="No program yet">
          When your coach assigns your program, every workout, rest day and weigh-in fills this
          calendar.
        </EmptyState>
      </>
    )
  }

  const weeks = Array.from({ length: p.enrollment.durationWeeks }, (_, i) =>
    p.days.filter((d) => d.weekNumber === i + 1),
  )
  const done = p.days.filter((d) => d.state === 'done').length
  const total = p.days.filter((d) => d.workoutId !== null).length

  return (
    <div className="flex flex-col gap-5">
      <ScreenHeader overline={p.enrollment.programName} title="Calendar" />

      <div className="rounded-lg bg-surface p-4 shadow-card">
        <div className="flex items-baseline justify-between">
          <span className="font-bold">Progress</span>
          <span className="tabular font-bold font-display text-[20px]">
            {done}
            <span className="text-[15px] text-ink-muted"> / {total} workouts</span>
          </span>
        </div>
        <div className="mt-3 h-3 overflow-hidden rounded-pill bg-surface-raised">
          <div
            className="h-full rounded-pill bg-lime transition-all"
            style={{ width: `${total ? (done / total) * 100 : 0}%` }}
          />
        </div>
      </div>

      <ul
        className="flex flex-wrap gap-x-5 gap-y-2 font-semibold text-[13px] text-ink-muted"
        aria-label="Legend"
      >
        <li className="flex items-center gap-2">
          <span className="grid size-4 place-items-center rounded-full bg-lime text-on-lime">
            <Check className="size-3" strokeWidth={3.5} aria-hidden />
          </span>
          Done
        </li>
        <li className="flex items-center gap-2">
          <span className="size-4 rounded-full ring-2 ring-brand ring-inset" />
          To do
        </li>
        <li className="flex items-center gap-2">
          <span className="size-4 rounded-full ring-2 ring-clay ring-inset" />
          Missed
        </li>
        <li className="flex items-center gap-2">
          <Moon className="size-4" aria-hidden />
          Rest
        </li>
      </ul>

      <div className="flex flex-col gap-6">
        {weeks.map((days, i) => {
          const workouts = days.filter((d) => d.workoutId !== null)
          const doneCount = workouts.filter((d) => d.state === 'done').length
          const first = days[0]
          const last = days.at(-1)
          const current = days.some((d) => d.isToday)
          return (
            <section key={first?.date ?? i} aria-label={`Week ${i + 1}`}>
              <div className="mb-2 flex items-baseline gap-3">
                <h2
                  className={cn('font-bold text-[15px]', current ? 'text-brand-text' : 'text-ink')}
                >
                  Week {i + 1}
                </h2>
                <span className="font-semibold text-[13px] text-ink-muted">
                  {first && label(first.date, { day: 'numeric', month: 'short' })} –{' '}
                  {last && label(last.date, { day: 'numeric', month: 'short' })}
                </span>
                <span
                  className={cn(
                    'tabular ml-auto rounded-pill px-2.5 py-0.5 font-bold text-[12px]',
                    workouts.length > 0 && doneCount === workouts.length
                      ? 'bg-lime text-on-lime'
                      : 'bg-surface-raised text-ink-muted',
                  )}
                >
                  {doneCount}/{workouts.length} done
                </span>
              </div>
              <ol className="grid grid-cols-7 gap-1.5 md:gap-2">
                {days.map((d) => (
                  <li key={d.date}>
                    <DayCell
                      day={d}
                      checkIn={checkIn?.dueDate === d.date}
                      onSelect={() => setSelected(d)}
                    />
                  </li>
                ))}
              </ol>
            </section>
          )
        })}
      </div>

      {p.next && (
        <section
          aria-label="Up next"
          className="flex w-full items-center gap-3 rounded-lg border-[1.5px] border-brand/40 border-dashed bg-surface p-4"
        >
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-brand-soft text-brand-text">
            <CalendarClock className="size-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-extrabold text-[11px] text-ink-muted uppercase tracking-[0.08em]">
              Up next
            </p>
            <p className="mt-1 truncate font-bold text-[15px]">{p.next.programName}</p>
            <p className="font-semibold text-[13px] text-ink-muted">
              Starts {formatDay(p.next.startDate)} · {p.next.durationWeeks}{' '}
              {p.next.durationWeeks === 1 ? 'week' : 'weeks'}. Your calendar switches over by
              itself.
            </p>
          </div>
        </section>
      )}

      <Sheet open={selected !== null} onClose={() => setSelected(null)} label="Day details">
        {selected && (
          <div className="flex flex-col gap-4 pb-4">
            <div>
              <p className="font-extrabold text-[11px] text-ink-muted uppercase tracking-[0.08em]">
                Week {selected.weekNumber}, day {selected.dayNumber} ·{' '}
                {label(selected.date, { weekday: 'long', day: 'numeric', month: 'long' })}
              </p>
              <h2 className="mt-1 font-display font-extrabold text-[26px]">
                {selected.workoutName ?? 'Rest day'}
              </h2>
              {checkIn?.dueDate === selected.date && (
                <p className="mt-2 inline-flex items-center gap-2 font-bold text-[13px] text-sand-text">
                  <ClipboardCheck className="size-4" aria-hidden />
                  Check-in with {checkIn.coachName?.split(' ')[0] || 'your coach'}
                </p>
              )}
              {selected.checkinRequired && (
                <p className="mt-2 inline-flex items-center gap-2 font-bold text-[13px] text-sand-text">
                  <Scale className="size-4" aria-hidden />
                  Weigh-in day
                </p>
              )}
            </div>
            {selected.workoutId && selected.state !== 'done' && (
              <Button
                variant="primary"
                size="lg"
                block
                loading={start.isPending}
                icon={<Play className="size-5 fill-current" aria-hidden />}
                onClick={() =>
                  selected.workoutId &&
                  start.mutate({
                    workoutId: selected.workoutId,
                    enrollmentId: p.enrollment.id,
                    programDayId: selected.programDayId,
                    scheduledDate: selected.date,
                  })
                }
              >
                {selected.date > p.today
                  ? 'Do it now'
                  : selected.state === 'missed'
                    ? 'Catch up now'
                    : 'Start workout'}
              </Button>
            )}
            {selected.state === 'done' &&
              (selected.sessionId ? (
                <SessionDetails sessionId={selected.sessionId} timezone={me.timezone} hideTitle />
              ) : (
                <p className="rounded-md bg-lime p-3 font-bold text-on-lime">Done.</p>
              ))}
            {!selected.workoutId && (
              <Link to="/" className="font-bold text-brand-text" onClick={() => setSelected(null)}>
                Back to today
              </Link>
            )}
          </div>
        )}
      </Sheet>
    </div>
  )
}

/** One calendar day. Done = solid lime, to do = card with violet ring, missed = clay, rest = quiet dashed. */
function DayCell({
  day: d,
  checkIn,
  onSelect,
}: {
  day: PlanDay
  /** Their check-in with their coach is on this day: a sand dot in the corner. */
  checkIn: boolean
  onSelect: () => void
}) {
  const dot = checkIn && (
    <span
      aria-hidden
      className="absolute top-1.5 right-1.5 size-2.5 rounded-full bg-sand ring-2 ring-surface"
    />
  )
  const weekday = label(d.date, { weekday: 'short' })
  const dayNumber = Number(d.date.slice(8))
  const base =
    'relative flex h-24 w-full flex-col items-center justify-between rounded-md px-1 py-2 transition active:scale-95 md:h-28'
  const todayRing = d.isToday && 'ring-2 ring-brand ring-offset-2 ring-offset-bg'

  if (d.state === 'rest') {
    return (
      <button
        type="button"
        onClick={onSelect}
        aria-label={`${weekday} ${dayNumber}: rest day${checkIn ? ', check-in with your coach' : ''}`}
        className={cn(base, 'border border-border border-dashed text-ink-muted', todayRing)}
      >
        <span className="font-extrabold text-[10px] uppercase tracking-wide">{weekday}</span>
        <span className="tabular font-bold font-display text-[16px]">{dayNumber}</span>
        <Moon className="size-4 opacity-70" aria-hidden />
        <span className="hidden font-bold text-[10px] md:block">Rest</span>
        {d.isToday && <TodayTag />}
        {dot}
      </button>
    )
  }

  const done = d.state === 'done'
  const missed = d.state === 'missed'
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-label={`${weekday} ${dayNumber}: ${d.workoutName ?? 'workout'}, ${done ? 'done' : missed ? 'missed' : 'to do'}${checkIn ? ', check-in with your coach' : ''}`}
      className={cn(
        base,
        done ? 'bg-lime text-on-lime' : 'bg-surface text-ink shadow-card',
        missed && 'ring-2 ring-clay ring-inset',
        todayRing,
      )}
    >
      <span
        className={cn(
          'font-extrabold text-[10px] uppercase tracking-wide',
          !done && 'text-ink-muted',
        )}
      >
        {weekday}
      </span>
      <span className="tabular font-bold font-display text-[16px]">{dayNumber}</span>
      {done ? (
        <span className="grid size-5 place-items-center rounded-full bg-on-lime text-lime">
          <Check className="size-3.5" strokeWidth={3.5} aria-hidden />
        </span>
      ) : (
        <span
          className={cn(
            'size-5 rounded-full ring-2 ring-inset',
            missed ? 'ring-clay' : 'ring-brand',
          )}
        />
      )}
      <span className="hidden w-full truncate text-center font-bold text-[10px] md:block">
        {d.workoutName}
      </span>
      {d.isToday && <TodayTag />}
      {dot}
    </button>
  )
}

function TodayTag() {
  return (
    <span className="-top-2 -translate-x-1/2 absolute left-1/2 rounded-pill bg-brand px-1.5 py-px font-extrabold text-[9px] text-on-brand uppercase tracking-wide">
      Today
    </span>
  )
}

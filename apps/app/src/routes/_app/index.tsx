import { planQuery, statsQuery } from '@project180/client'
import { formatNumber, isClient, type MyPlan, type PlanDay } from '@project180/shared'
import { Button, cn, StatCard, TurnArc } from '@project180/ui'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { CalendarCheck, Check, Clock, Moon, Play, Timer } from 'lucide-react'
import { motion } from 'motion/react'
import { useState } from 'react'
import { Elapsed } from '../../components/elapsed'
import { NotificationsButton } from '../../components/notifications'
import { QuickWorkoutEntry } from '../../components/quick-workout'
import { ScreenHeader } from '../../components/screen-header'
import { StarterPrograms } from '../../components/starter-programs'
import { WeekStrip } from '../../components/week-strip'
import { useWeighInStatus, WeighInCard, WeighInSheet } from '../../components/weigh-in-card'
import { useStartWorkout } from '../../lib/use-start-workout'

export const Route = createFileRoute('/_app/')({
  component: TodayPage,
})

function greeting(hour: number) {
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

function TodayPage() {
  const { me } = Route.useRouteContext()
  const plan = useQuery(planQuery)
  const stats = useQuery(statsQuery(1))
  const start = useStartWorkout()
  const dateLabel = new Intl.DateTimeFormat('en-ZA', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: me.timezone,
  }).format(new Date())
  const firstName = me.name.split(' ')[0]
  const p = plan.data?.plan
  const activeSession = plan.data?.activeSession
  const today = p?.days.find((d) => d.isToday)
  const week = p ? weekAround(p.days, p.today) : []
  const next = p?.days.find(
    (d) => d.date > p.today && d.workoutId !== null && d.state === 'planned',
  )
  const thisWeek = stats.data?.weeks.at(-1)
  // Quick workout (when allowed): a full card when there's nothing else to do today,
  // a quieter row under today's workout otherwise, and hidden while one is in progress.
  const planned = today?.workoutId != null && today.state !== 'done'
  const showQuick = plan.data?.quickWorkouts === true && !activeSession
  const weighIn = useWeighInStatus()
  const [weighing, setWeighing] = useState(false)

  return (
    <div className="flex flex-col gap-6">
      <ScreenHeader
        overline={dateLabel}
        title={`${greeting(new Date().getHours())}, ${firstName}`}
        action={<NotificationsButton />}
      />

      {activeSession && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
          <Link
            to="/workout/$sessionId"
            params={{ sessionId: String(activeSession.id) }}
            className="group flex items-center gap-4 rounded-xl bg-clay p-4 text-on-clay shadow-float transition active:scale-[0.98] md:p-5"
          >
            <span className="relative grid size-12 shrink-0 place-items-center rounded-pill bg-on-clay/15">
              <span className="absolute inset-0 animate-ping rounded-pill bg-on-clay/20" />
              <Timer className="relative size-6" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5 font-extrabold text-[11px] uppercase tracking-[0.08em]">
                <span className="size-2 animate-pulse rounded-pill bg-on-clay" />
                Workout in progress
              </span>
              <span className="mt-0.5 block truncate font-bold text-[17px]">
                {activeSession.workoutName ?? 'Workout'}
              </span>
            </span>
            <Elapsed
              since={activeSession.startedAt}
              className="tabular font-display font-extrabold text-[28px] leading-none max-sm:hidden"
            />
            <span className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-pill bg-on-clay px-4 font-bold text-[15px] text-clay transition group-hover:gap-2.5">
              <Play className="size-4 fill-current" aria-hidden />
              <span className="sm:hidden">
                <Elapsed since={activeSession.startedAt} />
              </span>
              <span className="max-sm:hidden">Resume</span>
            </span>
          </Link>
        </motion.div>
      )}

      {weighIn.status && <WeighInCard status={weighIn.status} onOpen={() => setWeighing(true)} />}
      {weighIn.today && (
        <WeighInSheet
          open={weighing}
          date={weighIn.today}
          status={weighIn.status}
          onClose={() => setWeighing(false)}
        />
      )}

      {plan.isPending ? (
        <div className="h-56 animate-pulse rounded-xl bg-surface" />
      ) : p ? (
        <>
          <section className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between">
              <h2 className="font-bold text-[17px]">{p.enrollment.programName}</h2>
              {today && (
                <span className="font-semibold text-[13px] text-ink-muted">
                  Week {today.weekNumber} of {p.enrollment.durationWeeks}
                </span>
              )}
            </div>
            <WeekStrip days={week} />
          </section>

          <div id="today-workout" className="scroll-mt-6">
            <TodayCard
              day={today}
              plan={p}
              next={next}
              starting={start.isPending}
              onStart={(d) =>
                d.workoutId &&
                start.mutate({
                  workoutId: d.workoutId,
                  enrollmentId: p.enrollment.id,
                  programDayId: d.programDayId,
                  scheduledDate: d.date,
                })
              }
            />
          </div>
        </>
      ) : (
        <>
          <NoPlan />
          {isClient(me.role) && me.coachId === null && <StarterPrograms timezone={me.timezone} />}
        </>
      )}

      {showQuick && <QuickWorkoutEntry prominent={!planned} />}

      <section>
        <h2 className="mb-3 font-bold text-[17px]">This week</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard
            tone="clay"
            label="Volume"
            value={formatNumber(thisWeek?.volumeKg ?? 0)}
            unit="kg"
          />
          <StatCard tone="steel" label="Gym time" value={thisWeek?.minutes ?? 0} unit="min" />
          <StatCard
            tone="sand"
            label="Felt"
            value={stats.data?.avgFeeling ? stats.data.avgFeeling.toFixed(1) : '–'}
            unit="/ 5"
          />
          <StatCard label="Workouts" value={thisWeek?.workouts ?? 0} />
        </div>
      </section>
    </div>
  )
}

/** The program week that contains today (or the first week before it starts). */
/** The charcoal brand card: the same in light and dark. */
const HERO = 'bg-[#202321] text-[#f5f3ed] ring-1 ring-[#f5f3ed]/[0.06] shadow-float'

function weekAround(days: PlanDay[], today: string): PlanDay[] {
  const current = days.find((d) => d.date === today)
  const week =
    current?.weekNumber ?? (today < (days[0]?.date ?? '') ? 1 : (days.at(-1)?.weekNumber ?? 1))
  return days.filter((d) => d.weekNumber === week)
}

function TodayCard({
  day,
  plan,
  next,
  starting,
  onStart,
}: {
  day: PlanDay | undefined
  plan: MyPlan
  next: PlanDay | undefined
  starting: boolean
  onStart: (day: PlanDay) => void
}) {
  const workout = day?.workoutId ? plan.workouts[day.workoutId] : undefined
  // clip-path: the animated arc must never leak past the rounded card (a Chrome/Safari quirk).
  const shell =
    'relative overflow-hidden rounded-xl p-6 [clip-path:inset(0_round_var(--radius-xl))]'

  if (!day) {
    const first = plan.days.find((d) => d.workoutId !== null)
    return (
      <div className={cn(shell, 'bg-surface shadow-card')}>
        <CalendarCheck className="size-8 text-brand-text" aria-hidden />
        <h2 className="mt-4 font-display font-extrabold text-[24px] leading-7">
          {plan.today < plan.enrollment.startDate ? 'Starts soon' : 'Program finished'}
        </h2>
        <p className="mt-2 text-[15px] text-ink-muted">
          {plan.today < plan.enrollment.startDate
            ? `Day 1 is ${plan.enrollment.startDate}${first?.workoutName ? `: ${first.workoutName}` : ''}.`
            : 'Nice work. Pick a new program to keep going.'}
        </p>
      </div>
    )
  }

  if (day.state === 'done') {
    return (
      <motion.div
        initial={{ scale: 0.97, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className={cn(shell, 'flex items-center gap-5 bg-surface shadow-card')}
      >
        <span aria-hidden className="absolute inset-y-0 left-0 w-1.5 bg-lime" />
        <motion.span
          initial={{ scale: 0.5 }}
          animate={{ scale: [0.5, 1.12, 1] }}
          transition={{ duration: 0.45 }}
          className="grid size-14 shrink-0 place-items-center rounded-full bg-lime text-on-lime"
        >
          <Check className="size-7" strokeWidth={3} aria-hidden />
        </motion.span>
        <div className="min-w-0">
          <h2 className="font-display font-extrabold text-[24px] leading-[28px]">Done for today</h2>
          <p className="mt-1 font-semibold text-[15px] text-ink-muted">
            {day.workoutName} is in the books.{next ? ` Next up: ${next.workoutName}.` : ''}
          </p>
        </div>
      </motion.div>
    )
  }

  if (!workout) {
    return (
      <div className={cn(shell, 'flex items-center gap-5 bg-surface shadow-card')}>
        <span aria-hidden className="absolute inset-y-0 left-0 w-1.5 bg-steel" />
        <span className="grid size-14 shrink-0 place-items-center rounded-full bg-steel/20 text-steel-text">
          <Moon className="size-7" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 className="font-display font-extrabold text-[24px] leading-[28px]">Rest day</h2>
          <p className="mt-1 font-semibold text-[15px] text-ink-muted">
            Recovery is part of the plan.
            {next ? ` Next up: ${next.workoutName} on ${shortDate(next.date)}.` : ''}
          </p>
        </div>
      </div>
    )
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(shell, HERO, 'md:p-8')}
    >
      <TurnArc className="-top-24 -right-24 pointer-events-none absolute size-72 md:size-96" />
      <p className="relative font-extrabold text-[11px] text-lime uppercase tracking-[0.2em]">
        Today’s workout
      </p>
      <h2 className="relative mt-2 max-w-[18ch] font-display font-extrabold text-[34px] leading-[38px] tracking-tight md:text-[42px] md:leading-[46px]">
        {workout.name}
      </h2>
      <p className="relative mt-3 flex items-center gap-3 font-semibold text-[15px] text-[#f5f3ed]/75">
        <span>
          {workout.exerciseCount} {workout.exerciseCount === 1 ? 'exercise' : 'exercises'}
        </span>
        {workout.estimatedMinutes && (
          <span className="inline-flex items-center gap-1">
            <Clock className="size-4" aria-hidden />~{workout.estimatedMinutes} min
          </span>
        )}
      </p>
      <Button
        variant="lime"
        size="lg"
        block
        className="relative mt-7 md:w-auto md:px-10"
        loading={starting}
        icon={<Play className="size-5 fill-current" aria-hidden />}
        onClick={() => onStart(day)}
      >
        Start workout
      </Button>
    </motion.section>
  )
}

function shortDate(date: string) {
  return new Intl.DateTimeFormat('en-ZA', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`))
}

/**
 * No program yet. With a coach: it's on its way. On your own: pick a ready-made program below,
 * or build a quick workout.
 */
function NoPlan() {
  const { me } = Route.useRouteContext()
  const onOwn = isClient(me.role) && me.coachId === null
  return (
    <section
      className={cn(
        'relative overflow-hidden rounded-xl p-6 [clip-path:inset(0_round_var(--radius-xl))] md:p-8',
        HERO,
      )}
    >
      <TurnArc className="-top-24 -right-24 pointer-events-none absolute size-72" />
      <p className="relative font-extrabold text-[11px] text-lime uppercase tracking-[0.2em]">
        Your 180 starts here
      </p>
      <h2 className="relative mt-2 font-display font-extrabold text-[30px] leading-[34px] tracking-tight">
        {onOwn ? 'Pick your first program' : 'Your program is on its way'}
      </h2>
      <p className="relative mt-2 max-w-[34ch] font-semibold text-[15px] text-[#f5f3ed]/75">
        {onOwn
          ? `${me.name.split(' ')[0]}, choose a ready-made plan below, or build a quick workout and start now.`
          : `${me.name.split(' ')[0]}, your coach is putting it together. It shows up here and in your calendar as soon as it’s ready.`}
      </p>
    </section>
  )
}

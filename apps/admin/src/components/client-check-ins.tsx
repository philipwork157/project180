// The client page's Check-ins tab: the next check-in (set, move, mark done), the client's body
// goal, and the report for the period: a verdict against the goal first, then weight, food,
// meals, water, movement, training and the client's own answers. Past check-ins open their
// own period. The coach edits the plan here (goal, dates, notes; targets on the Food tab), never
// the client's logs.
import {
  ApiError,
  api,
  checkInReportQuery,
  checkInsQuery,
  clientProfileQuery,
} from '@project180/client'
import {
  BODY_GOAL_LABELS,
  BODY_GOALS,
  type BodyGoal,
  CHECK_IN_QUESTIONS,
  CHECK_IN_REPEATS,
  type CheckIn,
  type CheckInList,
  type CheckInReport,
  DEFAULT_CHECK_IN_WEEKS,
  daysBetween,
  formatWater,
  todayIn,
} from '@project180/shared'
import {
  Button,
  Card,
  Chip,
  cn,
  DatePicker,
  Drawer,
  EmptyState,
  Field,
  Select,
  Textarea,
  toast,
} from '@project180/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  CalendarClock,
  Check,
  CheckCircle2,
  ClipboardCheck,
  HelpCircle,
} from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { draftToInput, profileToDraft } from './client-profile'

const TZ = 'Africa/Johannesburg'

const longDay = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString('en-ZA', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  })
const shortDay = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString('en-ZA', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  })
const repeatLabel = (w: number | null) =>
  w === null ? 'Just this once' : w === 1 ? 'Every week' : `Every ${w} weeks`

function usePutList(userId: number) {
  const qc = useQueryClient()
  return (list: CheckInList) => {
    qc.setQueryData(checkInsQuery(userId).queryKey, list)
    void qc.invalidateQueries({ queryKey: ['admin', 'user', userId, 'check-in-report'] })
  }
}

export function ClientCheckIns({
  userId,
  name,
  onOpenFood,
}: {
  userId: number
  name: string
  onOpenFood: () => void
}) {
  const first = name.split(' ')[0] || name
  const list = useQuery(checkInsQuery(userId))
  const [period, setPeriod] = useState<number | null>(null)
  const [scheduling, setScheduling] = useState(false)
  const [finishing, setFinishing] = useState<CheckIn | null>(null)
  const next = list.data?.next ?? null
  const past = list.data?.past ?? []

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 items-stretch gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <NextCheckIn
          first={first}
          next={next}
          loading={list.isPending}
          onSchedule={() => setScheduling(true)}
          onFinish={() => next && setFinishing(next)}
        />
        <BodyGoalCard userId={userId} first={first} />
      </div>

      {(next || past.length > 0) && (
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:px-0">
          <PeriodChip active={period === null} onClick={() => setPeriod(null)}>
            {next ? `Now → ${shortDay(next.dueDate)}` : 'Since the last check-in'}
          </PeriodChip>
          {past.map((c) => (
            <PeriodChip key={c.id} active={period === c.id} onClick={() => setPeriod(c.id)}>
              {shortDay(c.dueDate)}
            </PeriodChip>
          ))}
        </div>
      )}

      <Report
        userId={userId}
        first={first}
        checkIn={period === null ? next : (past.find((c) => c.id === period) ?? null)}
        onOpenFood={onOpenFood}
      />

      <Drawer
        open={scheduling}
        onClose={() => setScheduling(false)}
        title={next ? 'Change the check-in' : 'Set a check-in'}
        description={`${first} gets a reminder the evening before and on the day, and fills in a short form first.`}
      >
        {scheduling && (
          <ScheduleForm userId={userId} next={next} onDone={() => setScheduling(false)} />
        )}
      </Drawer>
      <Drawer
        open={finishing !== null}
        onClose={() => setFinishing(null)}
        title="Mark the check-in done"
        description="Your notes stay with this check-in. The next one is set from how often it repeats."
      >
        {finishing && (
          <FinishForm userId={userId} checkIn={finishing} onDone={() => setFinishing(null)} />
        )}
      </Drawer>
    </div>
  )
}

function PeriodChip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'h-11 shrink-0 whitespace-nowrap rounded-pill px-4 font-bold text-[14px] transition active:scale-[0.97]',
        active ? 'bg-brand text-on-brand' : 'bg-surface-raised text-ink hover:bg-border',
      )}
    >
      {children}
    </button>
  )
}

function NextCheckIn({
  first,
  next,
  loading,
  onSchedule,
  onFinish,
}: {
  first: string
  next: CheckIn | null
  loading: boolean
  onSchedule: () => void
  onFinish: () => void
}) {
  if (loading) return <Card className="h-40 animate-pulse" />
  if (!next)
    return (
      <EmptyState
        icon={<CalendarClock className="size-7" aria-hidden />}
        title="No check-in set"
        action={<Button onClick={onSchedule}>Set a check-in</Button>}
      >
        Pick a date (and how often) to look at {first}’s progress together. They’re reminded and
        fill in a short form first.
      </EmptyState>
    )
  const today = todayIn(TZ)
  const days = daysBetween(today, next.dueDate)
  return (
    <Card className="flex flex-col gap-5">
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-sand/25 text-sand-text">
          <ClipboardCheck className="size-5" aria-hidden />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="font-extrabold text-[11px] text-ink-muted uppercase tracking-[0.08em]">
            Next check-in
          </span>
          <h2 className="font-display font-extrabold text-[22px] leading-7">
            {longDay(next.dueDate)}
          </h2>
          <p className="text-[14px] text-ink-muted">
            {days === 0
              ? 'Today'
              : days > 0
                ? `In ${days} day${days === 1 ? '' : 's'}`
                : `${-days} day${days === -1 ? '' : 's'} overdue`}
            {' · '}
            {repeatLabel(next.repeatWeeks)}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {next.answers ? (
          <Chip tone="brand" dot>
            {first} filled in the form
          </Chip>
        ) : (
          <Chip dot>Form not filled in yet</Chip>
        )}
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Button icon={<Check className="size-4" aria-hidden />} onClick={onFinish}>
          Mark as done
        </Button>
        <Button variant="secondary" onClick={onSchedule}>
          Change date or repeat
        </Button>
      </div>
    </Card>
  )
}

function ScheduleForm({
  userId,
  next,
  onDone,
}: {
  userId: number
  next: CheckIn | null
  onDone: () => void
}) {
  const put = usePutList(userId)
  const [dueDate, setDueDate] = useState<string | null>(next?.dueDate ?? null)
  const [repeat, setRepeat] = useState<string>(
    next ? String(next.repeatWeeks ?? 'once') : String(DEFAULT_CHECK_IN_WEEKS),
  )
  const save = useMutation({
    mutationFn: () =>
      api<{ checkIns: CheckInList }>(`/admin/users/${userId}/check-ins/next`, {
        method: 'PUT',
        body: { dueDate, repeatWeeks: repeat === 'once' ? null : Number(repeat) },
      }),
    onSuccess: ({ checkIns }) => {
      put(checkIns)
      toast({
        title: next ? 'Check-in moved' : 'Check-in set',
        description: longDay(dueDate ?? ''),
      })
      onDone()
    },
  })
  const remove = useMutation({
    mutationFn: () =>
      api<{ checkIns: CheckInList }>(`/admin/users/${userId}/check-ins/next`, { method: 'DELETE' }),
    onSuccess: ({ checkIns }) => {
      put(checkIns)
      toast({ title: 'Check-in removed' })
      onDone()
    },
  })
  return (
    <div className="flex flex-col gap-5">
      <Field label="Date">
        {(id) => <DatePicker id={id} value={dueDate} onChange={setDueDate} />}
      </Field>
      <Field label="How often" hint="Marking it done sets the next one.">
        {(id) => (
          <Select id={id} value={repeat} onChange={(e) => setRepeat(e.target.value)}>
            {CHECK_IN_REPEATS.map((w) => (
              <option key={w} value={w}>
                {repeatLabel(w)}
              </option>
            ))}
            <option value="once">Just this once</option>
          </Select>
        )}
      </Field>
      {(save.isError || remove.isError) && (
        <p role="alert" className="font-semibold text-[14px] text-danger">
          {(save.error ?? remove.error) instanceof ApiError
            ? (save.error ?? remove.error)?.message
            : 'Couldn’t save. Try again.'}
        </p>
      )}
      <Button
        size="lg"
        block
        disabled={!dueDate}
        loading={save.isPending}
        onClick={() => save.mutate()}
      >
        Save
      </Button>
      {next && (
        <Button
          variant="ghost"
          className="self-center text-danger"
          loading={remove.isPending}
          onClick={() => remove.mutate()}
        >
          Remove the next check-in
        </Button>
      )}
    </div>
  )
}

function FinishForm({
  userId,
  checkIn,
  onDone,
}: {
  userId: number
  checkIn: CheckIn
  onDone: () => void
}) {
  const put = usePutList(userId)
  const [notes, setNotes] = useState(checkIn.coachNotes ?? '')
  const done = useMutation({
    mutationFn: () =>
      api<{ checkIns: CheckInList }>(`/admin/users/${userId}/check-ins/${checkIn.id}/done`, {
        method: 'POST',
        body: { coachNotes: notes.trim() || null },
      }),
    onSuccess: ({ checkIns }) => {
      put(checkIns)
      toast({
        title: 'Check-in done',
        description: checkIns.next ? `Next one: ${longDay(checkIns.next.dueDate)}` : undefined,
      })
      onDone()
    },
  })
  return (
    <div className="flex flex-col gap-5">
      <Field label="Your notes" hint="What you discussed and what changes. Only you see these.">
        {(id) => (
          <Textarea
            id={id}
            rows={6}
            maxLength={4000}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        )}
      </Field>
      <p className="text-[14px] text-ink-muted">
        {checkIn.repeatWeeks
          ? `The next one is set ${repeatLabel(checkIn.repeatWeeks).toLowerCase()} after ${longDay(checkIn.dueDate)}.`
          : 'It doesn’t repeat, so no next check-in is set.'}
      </p>
      {done.isError && (
        <p role="alert" className="font-semibold text-[14px] text-danger">
          Couldn’t save. Try again.
        </p>
      )}
      <Button size="lg" block loading={done.isPending} onClick={() => done.mutate()}>
        Mark as done
      </Button>
    </div>
  )
}

/** The body goal, changed right here (saved with the rest of their profile). */
function BodyGoalCard({ userId, first }: { userId: number; first: string }) {
  const qc = useQueryClient()
  const profile = useQuery(clientProfileQuery(userId)).data
  const save = useMutation({
    mutationFn: (bodyGoal: BodyGoal | null) => {
      if (!profile) throw new Error('No profile')
      return api(`/admin/users/${userId}/profile`, {
        method: 'PUT',
        body: { ...draftToInput(profileToDraft(profile)), bodyGoal },
      })
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: clientProfileQuery(userId).queryKey })
      void qc.invalidateQueries({ queryKey: ['admin', 'user', userId, 'check-in-report'] })
      toast({ title: 'Body goal saved' })
    },
  })
  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="font-bold text-[17px]">Body goal</h2>
        <p className="text-[14px] text-ink-muted">What the report checks {first} against.</p>
      </div>
      <Field label="Goal">
        {(id) => (
          <Select
            id={id}
            value={profile?.bodyGoal ?? ''}
            disabled={!profile || save.isPending}
            onChange={(e) => save.mutate((e.target.value || null) as BodyGoal | null)}
          >
            <option value="">Not set</option>
            {BODY_GOALS.map((g) => (
              <option key={g} value={g}>
                {BODY_GOAL_LABELS[g]}
              </option>
            ))}
          </Select>
        )}
      </Field>
    </Card>
  )
}

function Report({
  userId,
  first,
  checkIn,
  onOpenFood,
}: {
  userId: number
  first: string
  checkIn: CheckIn | null
  onOpenFood: () => void
}) {
  const pastId = checkIn?.status === 'done' ? checkIn.id : null
  const report = useQuery(checkInReportQuery(userId, pastId))
  const r = report.data
  if (report.isPending)
    return (
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <Card key={i} className="h-44 animate-pulse" />
        ))}
      </div>
    )
  if (!r)
    return (
      <Card>
        <p className="text-[14px] text-ink-muted">Couldn’t load the report. Try again.</p>
      </Card>
    )
  return (
    <div className="flex flex-col gap-5">
      <Verdict report={r} />
      <div className="grid grid-cols-1 items-start gap-5 md:grid-cols-2 xl:grid-cols-3">
        <FoodCard report={r} onOpenFood={onOpenFood} />
        <WeightCard report={r} />
        <MealsCard report={r} />
        <WaterMovementCard report={r} />
        <TrainingCard report={r} />
        <AnswersCard report={r} first={first} />
      </div>
      {checkIn && <NotesCard key={checkIn.id} userId={userId} checkIn={checkIn} />}
    </div>
  )
}

const VERDICT_LOOK = {
  on_track: { icon: CheckCircle2, edge: 'border-l-lime', tint: 'bg-lime/25 text-lime-text' },
  off_track: { icon: AlertTriangle, edge: 'border-l-clay', tint: 'bg-clay/20 text-clay-text' },
  unclear: {
    icon: HelpCircle,
    edge: 'border-l-border-strong',
    tint: 'bg-surface-raised text-ink-muted',
  },
} as const

function Verdict({ report: r }: { report: CheckInReport }) {
  const look = VERDICT_LOOK[r.verdict.status]
  const Icon = look.icon
  return (
    <Card className={cn('flex flex-col gap-4 border-l-4', look.edge)}>
      <div className="flex items-start gap-3">
        <span className={cn('grid size-11 shrink-0 place-items-center rounded-full', look.tint)}>
          <Icon className="size-5" aria-hidden />
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <span className="font-extrabold text-[11px] text-ink-muted uppercase tracking-[0.08em]">
            {r.goal ? BODY_GOAL_LABELS[r.goal] : 'Body goal'} · {shortDay(r.from)} –{' '}
            {shortDay(r.to)} ({r.days} day{r.days === 1 ? '' : 's'})
          </span>
          <h2 className="font-display font-extrabold text-[22px] leading-7">
            {r.verdict.headline}
          </h2>
          <p className="text-[15px]">{r.verdict.detail}</p>
        </div>
      </div>
      {r.flags.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {r.flags.map((f) => (
            <li key={f}>
              <Chip tone="sand">{f}</Chip>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 rounded-md bg-surface-raised p-4">
      <span className="font-extrabold text-[11px] text-ink-muted uppercase tracking-[0.08em]">
        {label}
      </span>
      <span className="metric text-[24px] leading-none">{value}</span>
      {sub && <span className="text-[13px] text-ink-muted">{sub}</span>}
    </div>
  )
}

const kcal = (n: number | null) => (n === null ? '–' : new Intl.NumberFormat('en-ZA').format(n))

function FoodCard({ report: r, onOpenFood }: { report: CheckInReport; onOpenFood: () => void }) {
  const f = r.food
  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-bold text-[17px]">Calories and macros</h3>
        <Button variant="ghost" size="sm" className="h-11" onClick={onOpenFood}>
          Edit targets
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Stat
          label="Average a day"
          value={kcal(f.avgKcal)}
          sub={f.targetKcal ? `Target ${kcal(f.targetKcal)} kcal` : 'No target set'}
        />
        <Stat label="Maintenance" value={kcal(f.maintenance)} sub="kcal, estimated" />
        <Stat
          label="Protein a day"
          value={f.avgProteinG === null ? '–' : `${Math.round(f.avgProteinG)} g`}
          sub={
            f.targetProteinG
              ? `Hit on ${f.proteinDaysHit} of ${f.daysLogged} days`
              : 'No protein target'
          }
        />
        <Stat
          label="Logged"
          value={`${f.daysLogged}/${r.days}`}
          sub={f.targetKcal ? `On target ${f.daysOnTarget} days` : 'days'}
        />
      </div>
      <p className="tabular text-[13px] text-ink-muted">
        Carbs {f.avgCarbsG ?? '–'} g · Fat {f.avgFatG ?? '–'} g · Fibre {f.avgFibreG ?? '–'} g a day
      </p>
      {f.perDay.length > 0 && f.targetKcal && (
        <div className="flex h-20 items-end gap-1" aria-hidden>
          {f.perDay.map((d) => {
            const share = Math.min(1.4, d.kcal / (f.targetKcal as number))
            return (
              <div
                key={d.date}
                title={`${shortDay(d.date)}: ${d.kcal} kcal`}
                className={cn(
                  'min-w-1 flex-1 rounded-t-sm',
                  share > 1.1 ? 'bg-clay' : share >= 0.9 ? 'bg-lime' : 'bg-steel',
                )}
                style={{ height: `${Math.max(6, (share / 1.4) * 100)}%` }}
              />
            )
          })}
        </div>
      )}
    </Card>
  )
}

function WeightCard({ report: r }: { report: CheckInReport }) {
  const w = r.weight
  return (
    <Card className="flex flex-col gap-4">
      <h3 className="font-bold text-[17px]">Weight and body</h3>
      <div className="grid grid-cols-2 gap-3">
        <Stat
          label="Weight"
          value={w.endKg === null ? '–' : `${w.endKg} kg`}
          sub={w.startKg === null ? 'No earlier weigh-in' : `From ${w.startKg} kg`}
        />
        <Stat
          label="Change"
          value={
            w.changeKg === null
              ? '–'
              : `${w.changeKg > 0 ? '+' : w.changeKg < 0 ? '−' : ''}${Math.abs(w.changeKg)} kg`
          }
          sub={`${w.points.length} weigh-in${w.points.length === 1 ? '' : 's'}`}
        />
      </div>
      {w.measurements.length > 0 ? (
        <ul className="flex w-full flex-col divide-y divide-border">
          {w.measurements.map((m) => {
            const d = Math.round((m.endCm - m.startCm) * 10) / 10
            return (
              <li key={m.key} className="flex items-center justify-between gap-3 py-2 text-[14px]">
                <span>{m.label}</span>
                <span className="tabular font-semibold">
                  {m.startCm} → {m.endCm} cm{' '}
                  <span className="text-ink-muted">
                    ({d > 0 ? '+' : ''}
                    {d})
                  </span>
                </span>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="text-[13px] text-ink-muted">No measurements logged twice this period.</p>
      )}
    </Card>
  )
}

function MealsCard({ report: r }: { report: CheckInReport }) {
  const f = r.food
  return (
    <Card className="flex flex-col gap-4">
      <h3 className="font-bold text-[17px]">Meals</h3>
      {f.byMeal.length === 0 ? (
        <p className="text-[14px] text-ink-muted">No food logged this period.</p>
      ) : (
        <ul className="flex w-full flex-col divide-y divide-border">
          {f.byMeal.map((m) => (
            <li key={m.meal} className="flex items-center justify-between gap-3 py-2 text-[14px]">
              <span>{m.meal}</span>
              <span className="tabular text-ink-muted">
                <b className="text-ink">{kcal(m.avgKcal)} kcal</b> · {m.days} of {r.days} days
              </span>
            </li>
          ))}
        </ul>
      )}
      {f.topFoods.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="font-extrabold text-[11px] text-ink-muted uppercase tracking-[0.08em]">
            Most logged
          </span>
          <ul className="flex flex-wrap gap-2">
            {f.topFoods.map((t) => (
              <li key={t.name}>
                <Chip>
                  {t.name} ×{t.times}
                </Chip>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  )
}

function WaterMovementCard({ report: r }: { report: CheckInReport }) {
  return (
    <Card className="flex flex-col gap-4">
      <h3 className="font-bold text-[17px]">Water and movement</h3>
      <div className="grid grid-cols-2 gap-3">
        <Stat
          label="Water a day"
          value={r.water.avgMl === null ? '–' : formatWater(r.water.avgMl)}
          sub={
            r.water.goalMl === null
              ? 'No goal set'
              : `Goal ${formatWater(r.water.goalMl)}, reached ${r.water.daysReached} days`
          }
        />
        <Stat
          label="Steps a day"
          value={r.movement.avgSteps === null ? '–' : kcal(r.movement.avgSteps)}
          sub={`${r.movement.activities} activit${r.movement.activities === 1 ? 'y' : 'ies'}`}
        />
      </div>
      <p className="text-[13px] text-ink-muted">
        About {kcal(r.movement.avgBurned)} kcal a day burned on top (workouts, activities, steps).
      </p>
    </Card>
  )
}

function TrainingCard({ report: r }: { report: CheckInReport }) {
  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-bold text-[17px]">Training</h3>
        <span className="tabular text-[14px] text-ink-muted">
          {r.training.done} workout{r.training.done === 1 ? '' : 's'}
        </span>
      </div>
      {r.training.workouts.length === 0 ? (
        <p className="text-[14px] text-ink-muted">No workouts done this period.</p>
      ) : (
        <ul className="flex max-h-72 w-full flex-col divide-y divide-border overflow-y-auto">
          {r.training.workouts.map((w) => (
            <li
              key={w.startedAt}
              className="flex items-center justify-between gap-3 py-2 text-[14px]"
            >
              <span className="min-w-0 truncate">
                <span className="tabular text-ink-muted">{shortDay(w.date)}</span> · {w.name}
              </span>
              <span className="tabular shrink-0 text-ink-muted">
                {w.minutes ? `${w.minutes} min` : ''}
                {w.feeling ? ` · felt ${w.feeling}/5` : ''}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

function AnswersCard({ report: r, first }: { report: CheckInReport; first: string }) {
  const a = r.answers
  return (
    <Card className="flex flex-col gap-4">
      <h3 className="font-bold text-[17px]">{first}’s answers</h3>
      {!a ? (
        <p className="text-[14px] text-ink-muted">
          {first} hasn’t filled in the check-in form for this period.
        </p>
      ) : (
        <>
          <ul className="grid grid-cols-2 gap-3">
            {(Object.keys(CHECK_IN_QUESTIONS) as Array<keyof typeof CHECK_IN_QUESTIONS>).map(
              (k) => (
                <li key={k} className="flex flex-col gap-1 rounded-md bg-surface-raised p-3">
                  <span className="text-[12px] text-ink-muted">{CHECK_IN_QUESTIONS[k].label}</span>
                  <span className="metric text-[20px]">{a[k]}/5</span>
                </li>
              ),
            )}
          </ul>
          {[
            ['Went well', a.wins],
            ['Was hard', a.struggles],
            ['Also said', a.notes],
          ]
            .filter(([, v]) => v)
            .map(([label, v]) => (
              <div key={label} className="flex flex-col gap-1">
                <span className="font-extrabold text-[11px] text-ink-muted uppercase tracking-[0.08em]">
                  {label}
                </span>
                <p className="whitespace-pre-wrap text-[14px]">{v}</p>
              </div>
            ))}
        </>
      )}
    </Card>
  )
}

/** The coach's notes on this check-in, saved as they go (Save button). */
function NotesCard({ userId, checkIn }: { userId: number; checkIn: CheckIn }) {
  const put = usePutList(userId)
  const [notes, setNotes] = useState(checkIn.coachNotes ?? '')
  const save = useMutation({
    mutationFn: () =>
      api<{ checkIns: CheckInList }>(`/admin/users/${userId}/check-ins/${checkIn.id}`, {
        method: 'PATCH',
        body: { coachNotes: notes.trim() || null },
      }),
    onSuccess: ({ checkIns }) => {
      put(checkIns)
      toast({ title: 'Notes saved' })
    },
  })
  return (
    <Card className="flex flex-col gap-4">
      <h3 className="font-bold text-[17px]">
        Your notes for {shortDay(checkIn.dueDate)}
        {checkIn.status === 'done' && <span className="font-normal text-ink-muted"> (done)</span>}
      </h3>
      <Field label="Notes" hint="Only you see these.">
        {(id) => (
          <Textarea
            id={id}
            key={checkIn.id}
            rows={4}
            maxLength={4000}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        )}
      </Field>
      <Button
        variant="secondary"
        className="self-start"
        disabled={notes === (checkIn.coachNotes ?? '')}
        loading={save.isPending}
        onClick={() => save.mutate()}
      >
        Save notes
      </Button>
    </Card>
  )
}

import { ApiError, api, personProgressQuery } from '@project180/client'
import {
  formatDay,
  formatNumber,
  type PastProgram,
  type PersonProgress,
  type PlanDay,
  programEndDate,
  type UpcomingProgram,
} from '@project180/shared'
import {
  Button,
  buttonClasses,
  ConfirmDialog,
  cn,
  DatePicker,
  Drawer,
  Field,
  IconButton,
  Input,
  toast,
} from '@project180/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  Archive,
  ArchiveRestore,
  CalendarClock,
  Check,
  ChevronDown,
  ChevronRight,
  Dumbbell,
  History,
  ListPlus,
  Moon,
  Pencil,
  RotateCcw,
  Scale,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react'
import { motion } from 'motion/react'
import { type ReactNode, useState } from 'react'
import { SessionStatusTag } from './session-status'
import { SwapsLine } from './swaps-line'
import { type OpenWorkout, WorkoutReviewDrawer } from './workout-review'

const DAY_STYLE: Record<PlanDay['state'], { cell: string; icon: typeof Check; label: string }> = {
  done: { cell: 'bg-lime text-on-lime', icon: Check, label: 'Done' },
  missed: { cell: 'bg-clay text-on-clay', icon: X, label: 'Missed' },
  planned: {
    cell: 'bg-brand-soft text-brand-text ring-[1.5px] ring-inset ring-brand/60',
    icon: Dumbbell,
    label: 'To do',
  },
  rest: { cell: 'bg-steel/15 text-steel-text', icon: Moon, label: 'Rest' },
}

/** The program block on a person's card: their current program, then past (archived) ones. */
export function PersonProgressPanel({
  userId,
  name,
  onAssign,
}: {
  userId: number
  name: string
  onAssign: () => void
}) {
  const query = useQuery(personProgressQuery(userId))
  const [review, setReview] = useState<OpenWorkout | null>(null)
  const openWorkout = (sessionId: number) => setReview({ userId, sessionId, name })

  if (query.isPending) return <div className="h-48 animate-pulse rounded-md bg-surface-raised" />
  if (query.isError)
    return (
      <p className="rounded-md bg-danger/10 p-4 font-semibold text-[14px] text-danger">
        Couldn’t load progress.
      </p>
    )

  const { progress, upcoming, past } = query.data
  return (
    <div className="flex flex-col gap-6">
      {progress ? (
        <CurrentProgram
          p={progress}
          userId={userId}
          name={name}
          onAssign={onAssign}
          onOpenWorkout={openWorkout}
        />
      ) : (
        <div className="flex flex-col items-start gap-3 rounded-md border-[1.5px] border-border-strong border-dashed p-5">
          <p className="font-bold text-[15px]">No current program</p>
          <p className="text-[14px] text-ink-muted">
            {past.length > 0
              ? `Assign a new one, or re-enable a past program below.`
              : `Assign one and it shows up in ${firstNameOf(name)}’s calendar straight away.`}
          </p>
          <Button size="sm" icon={<UserPlus className="size-4" aria-hidden />} onClick={onAssign}>
            Assign program
          </Button>
        </div>
      )}
      {(progress || upcoming.length > 0) && (
        <UpNext
          upcoming={upcoming}
          userId={userId}
          name={name}
          after={progress?.plan.enrollment.programName ?? null}
          onAssign={onAssign}
        />
      )}
      {past.length > 0 && (
        <PastPrograms
          past={past}
          userId={userId}
          name={name}
          hasCurrent={progress !== null}
          onOpenWorkout={openWorkout}
        />
      )}
      <WorkoutReviewDrawer workout={review} onClose={() => setReview(null)} />
    </div>
  )
}

const firstNameOf = (name: string) => name.split(' ')[0] ?? name

function invalidatePerson(queryClient: ReturnType<typeof useQueryClient>, userId: number) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: personProgressQuery(userId).queryKey }),
    queryClient.invalidateQueries({ queryKey: ['enrollments'] }),
  ])
}

/** Their current program: where they are, how it's going, and archive / remove / reset. */
function CurrentProgram({
  p,
  userId,
  name,
  onAssign,
  onOpenWorkout,
}: {
  p: PersonProgress
  userId: number
  name: string
  onAssign: () => void
  onOpenWorkout: (sessionId: number) => void
}) {
  const [resetting, setResetting] = useState(false)
  const [moving, setMoving] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [archiving, setArchiving] = useState(false)

  const { plan } = p
  const pct = p.workoutDays ? Math.round((p.done / p.workoutDays) * 100) : 0
  const weeks = Array.from({ length: plan.enrollment.durationWeeks }, (_, i) =>
    plan.days.filter((d) => d.weekNumber === i + 1),
  )
  const status =
    p.currentWeek === 0
      ? `Starts ${shortDate(plan.enrollment.startDate)}`
      : p.currentWeek >= plan.enrollment.durationWeeks && !plan.days.some((d) => d.isToday)
        ? 'Program finished'
        : `Week ${p.currentWeek} of ${plan.enrollment.durationWeeks}`

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-display font-extrabold text-[20px] leading-tight">
            {plan.enrollment.programName}
          </p>
          <p className="mt-0.5 font-semibold text-[13px] text-ink-muted">
            {status} · started {shortDate(plan.enrollment.startDate)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {plan.enrollment.sourceProgramId !== null && (
            <Link
              to="/programs/$programId"
              params={{ programId: String(plan.enrollment.programId) }}
              className={buttonClasses('secondary', 'sm')}
            >
              <Pencil className="size-4" aria-hidden />
              Edit {firstNameOf(name)}’s version
            </Link>
          )}
          <Button
            variant="secondary"
            size="sm"
            icon={<CalendarClock className="size-4" aria-hidden />}
            onClick={() => setMoving(true)}
          >
            Change start date
          </Button>
          <Button
            variant="secondary"
            size="sm"
            icon={<UserPlus className="size-4" aria-hidden />}
            onClick={onAssign}
          >
            Change program
          </Button>
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-baseline justify-between">
          <p className="font-semibold text-[14px] text-ink-muted">
            <b className="font-display text-[22px] text-ink tabular">{p.done}</b> of {p.workoutDays}{' '}
            workouts done
            {p.missed > 0 && <span className="text-clay-text"> · {p.missed} missed</span>}
          </p>
          <span className="font-display font-extrabold text-[18px] tabular">{pct}%</span>
        </div>
        <div className="h-2.5 overflow-hidden rounded-pill bg-surface-raised">
          <motion.div
            className="h-full rounded-pill bg-lime"
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ type: 'spring', stiffness: 120, damping: 22 }}
          />
        </div>
      </div>

      <fieldset className="flex flex-col gap-1.5" aria-label="Program calendar">
        {weeks.map((days, i) => (
          <div key={days[0]?.date ?? i} className="flex items-center gap-2">
            <span
              className={cn(
                'w-8 shrink-0 font-bold text-[11px] text-ink-muted uppercase tracking-wide',
                i + 1 === p.currentWeek && 'text-brand-text',
              )}
            >
              W{i + 1}
            </span>
            <div className="grid flex-1 grid-cols-7 gap-1.5">
              {days.map((d) => {
                const style = DAY_STYLE[d.state]
                const Icon = style.icon
                return (
                  <span
                    key={d.date}
                    title={`${shortDate(d.date)}: ${d.workoutName ?? 'Rest day'} · ${style.label}`}
                    className={cn(
                      'flex h-8 min-w-0 items-center justify-center gap-1 rounded-sm px-1 font-bold text-[11px]',
                      style.cell,
                      d.isToday && 'outline-2 outline-ink outline-offset-2',
                    )}
                  >
                    <Icon className="size-3.5 shrink-0" strokeWidth={2.6} aria-hidden />
                    <span className="truncate max-md:hidden">
                      {d.state === 'rest' ? 'Rest' : (d.workoutName ?? 'Workout')}
                    </span>
                  </span>
                )
              })}
            </div>
          </div>
        ))}
        <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 pl-10 font-semibold text-[12px] text-ink-muted">
          {(['done', 'missed', 'planned', 'rest'] as const).map((state) => (
            <Legend key={state} state={state} />
          ))}
          <span className="inline-flex items-center gap-1.5">
            <span className="size-3 rounded-[4px] outline-2 outline-ink outline-offset-1" />
            Today
          </span>
        </div>
      </fieldset>

      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat
          label="Volume"
          value={formatNumber(p.volumeKg)}
          unit="kg"
          className="text-clay-text"
        />
        <Stat label="Gym time" value={formatHours(p.minutes)} className="text-steel-text" />
        <Stat
          label="Felt"
          value={p.avgFeeling ? p.avgFeeling.toFixed(1) : '–'}
          unit={p.avgFeeling ? '/ 5' : undefined}
          className="text-sand-text"
        />
        <Stat
          label="Last workout"
          value={p.lastWorkoutAt ? relativeDay(p.lastWorkoutAt) : 'Not yet'}
        />
      </dl>

      {p.recent.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="font-extrabold text-[11px] text-ink-muted uppercase tracking-[0.08em]">
            Latest workouts
          </p>
          <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-md bg-surface-raised">
            {p.recent.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => onOpenWorkout(s.id)}
                  className="flex min-h-11 w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-border/40 active:scale-[0.99]"
                >
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <span className="min-w-0 flex-1 truncate font-bold text-[14px]">
                        {s.workoutName ?? 'Workout'}
                        <SessionStatusTag status={s.status} />
                      </span>
                      <span className="tabular font-semibold text-[13px] text-ink-muted">
                        {relativeDay(s.startedAt)} · {s.setCount}{' '}
                        {s.setCount === 1 ? 'set' : 'sets'}
                        {s.volumeKg ? ` · ${formatNumber(Math.round(s.volumeKg))} kg` : ''}
                        {s.feeling ? ` · felt ${s.feeling}/5` : ''}
                      </span>
                    </span>
                    <SwapsLine swaps={s.swaps} />
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-ink-muted" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap justify-end gap-2 border-border border-t pt-4">
        <Button
          variant="ghost"
          size="sm"
          className="mr-auto text-ink-muted hover:text-ink"
          icon={<Archive className="size-4" aria-hidden />}
          onClick={() => setArchiving(true)}
        >
          Archive program
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="text-danger hover:bg-danger/10 hover:text-danger"
          icon={<Trash2 className="size-4" aria-hidden />}
          onClick={() => setRemoving(true)}
        >
          Remove program
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="text-danger hover:bg-danger/10 hover:text-danger"
          icon={<RotateCcw className="size-4" aria-hidden />}
          onClick={() => setResetting(true)}
        >
          Reset progress
        </Button>
      </div>

      <Drawer
        open={moving}
        onClose={() => setMoving(false)}
        title="Change start date"
        description={`${plan.enrollment.programName} for ${name}`}
      >
        {moving && (
          <StartDateForm userId={userId} name={name} progress={p} onDone={() => setMoving(false)} />
        )}
      </Drawer>
      <ResetProgramDialog
        open={resetting}
        onClose={() => setResetting(false)}
        userId={userId}
        name={name}
        progress={p}
      />
      <ArchiveProgramDialog
        open={archiving}
        onClose={() => setArchiving(false)}
        userId={userId}
        name={name}
        progress={p}
      />
      <RemoveProgramDialog
        open={removing}
        onClose={() => setRemoving(false)}
        userId={userId}
        name={name}
        progress={p}
      />
    </div>
  )
}

/**
 * Move the program's start date (day 1). Nothing logged is deleted: the calendar shifts, and
 * workouts already done stay done. To start over from nothing, use Reset progress.
 */
function StartDateForm({
  userId,
  name,
  progress,
  onDone,
}: {
  userId: number
  name: string
  progress: PersonProgress
  onDone: () => void
}) {
  const queryClient = useQueryClient()
  const [startDate, setStartDate] = useState(progress.plan.today)
  const firstName = name.split(' ')[0] ?? name
  const move = useMutation({
    mutationFn: () =>
      api(`/admin/users/${userId}/program/start-date`, { method: 'POST', body: { startDate } }),
    onSuccess: () => {
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: personProgressQuery(userId).queryKey }),
        queryClient.invalidateQueries({ queryKey: ['enrollments'] }),
      ])
      toast({
        title: 'Start date changed',
        description: `${progress.plan.enrollment.programName} now starts ${shortDate(startDate)}.`,
      })
      onDone()
    },
  })
  const unchanged = startDate === progress.plan.enrollment.startDate
  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault()
        move.mutate()
      }}
    >
      <p className="text-[15px] text-ink-muted">
        Day 1 of the program moves to this date and the rest of the calendar follows. Workouts{' '}
        {firstName} already logged are kept.
      </p>
      <Field
        label="Day 1 of the program"
        hint={`Now ${shortDate(progress.plan.enrollment.startDate)}`}
      >
        {(id) => <DatePicker id={id} value={startDate} onChange={setStartDate} />}
      </Field>
      {move.isError && (
        <p role="alert" className="font-semibold text-danger">
          {move.error instanceof ApiError ? move.error.message : 'Could not save. Try again.'}
        </p>
      )}
      <Button type="submit" size="lg" loading={move.isPending} disabled={unchanged}>
        Save start date
      </Button>
    </form>
  )
}

function ResetProgramDialog({
  open,
  onClose,
  userId,
  name,
  progress,
}: {
  open: boolean
  onClose: () => void
  userId: number
  name: string
  progress: PersonProgress
}) {
  const queryClient = useQueryClient()
  const [startDate, setStartDate] = useState(progress.plan.today)
  const [typed, setTyped] = useState('')
  const reset = useMutation({
    mutationFn: () =>
      api(`/admin/users/${userId}/reset-program`, { method: 'POST', body: { startDate } }),
    onSuccess: () => {
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: personProgressQuery(userId).queryKey }),
        queryClient.invalidateQueries({ queryKey: ['enrollments'] }),
      ])
      toast({
        title: 'Program reset',
        description: `${firstName} starts again on ${shortDate(startDate)}.`,
      })
      close()
    },
  })
  const firstName = name.split(' ')[0] ?? name
  const { impact } = progress

  function close() {
    setTyped('')
    reset.reset()
    onClose()
  }

  return (
    <ConfirmDialog
      open={open}
      title={`Reset ${firstName}’s program?`}
      confirmLabel="Reset everything"
      loading={reset.isPending}
      confirmDisabled={typed.trim().toUpperCase() !== 'RESET'}
      onConfirm={() => reset.mutate()}
      onClose={close}
    >
      <p>
        <b className="text-ink">{progress.plan.enrollment.programName}</b> starts again from day
        one. Everything {firstName} logged on it is deleted for good:
      </p>
      <ul className="mt-3 flex flex-col gap-2 rounded-md bg-danger/10 p-4 font-semibold text-[15px] text-ink">
        <Impact
          icon={<CalendarClock aria-hidden />}
          n={impact.sessions}
          one="workout"
          many="workouts"
        />
        <Impact
          icon={<Dumbbell aria-hidden />}
          n={impact.loggedSets}
          one="logged set"
          many="logged sets"
        />
        <Impact icon={<Scale aria-hidden />} n={impact.checkins} one="weigh-in" many="weigh-ins" />
      </ul>
      <div className="mt-4 flex flex-col gap-4">
        <Field label="Start again on">
          {(id) => <DatePicker id={id} value={startDate} onChange={setStartDate} />}
        </Field>
        <Field label="Type RESET to confirm" hint="This can’t be undone.">
          {(id) => (
            <Input
              id={id}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder="RESET"
              autoComplete="off"
              className="font-bold tracking-wider uppercase"
            />
          )}
        </Field>
      </div>
      {reset.isError && (
        <p role="alert" className="mt-3 font-semibold text-danger">
          {reset.error instanceof ApiError ? reset.error.message : 'Could not reset. Try again.'}
        </p>
      )}
    </ConfirmDialog>
  )
}

function ArchiveProgramDialog({
  open,
  onClose,
  userId,
  name,
  progress,
}: {
  open: boolean
  onClose: () => void
  userId: number
  name: string
  progress: PersonProgress
}) {
  const queryClient = useQueryClient()
  const firstName = firstNameOf(name)
  const programName = progress.plan.enrollment.programName
  const archive = useMutation({
    mutationFn: () => api(`/admin/users/${userId}/program/archive`, { method: 'POST' }),
    onSuccess: () => {
      void invalidatePerson(queryClient, userId)
      toast({
        title: 'Program archived',
        description: `${programName} and its history are under Past programs.`,
      })
      onClose()
    },
  })
  return (
    <ConfirmDialog
      open={open}
      title={`Archive ${programName}?`}
      tone="primary"
      confirmLabel="Archive program"
      loading={archive.isPending}
      onConfirm={() => archive.mutate()}
      onClose={() => {
        archive.reset()
        onClose()
      }}
    >
      <p>
        It comes off {firstName}’s calendar, but nothing is deleted: {progress.impact.sessions}{' '}
        {progress.impact.sessions === 1 ? 'workout' : 'workouts'} and every set stay in {firstName}
        ’s history and under Past programs here.
      </p>
      <p className="mt-2">
        You can re-enable it later, as long as {firstName} has no other current program.
      </p>
      {archive.isError && (
        <p role="alert" className="mt-3 font-semibold text-danger">
          {archive.error instanceof ApiError
            ? archive.error.message
            : 'Could not archive it. Try again.'}
        </p>
      )}
    </ConfirmDialog>
  )
}

/**
 * Programs lined up after the current one. Each takes over by itself on its start date; the
 * current program and everything logged on it move to Past programs.
 */
function UpNext({
  upcoming,
  userId,
  name,
  after,
  onAssign,
}: {
  upcoming: UpcomingProgram[]
  userId: number
  name: string
  /** The current program's name, when there is one. */
  after: string | null
  onAssign: () => void
}) {
  const queryClient = useQueryClient()
  const [removing, setRemoving] = useState<UpcomingProgram | null>(null)
  const firstName = firstNameOf(name)
  const remove = useMutation({
    mutationFn: (enrollmentId: number) =>
      api(`/admin/users/${userId}/enrollments/${enrollmentId}`, { method: 'DELETE' }),
    onSuccess: () => {
      void invalidatePerson(queryClient, userId)
      toast({
        title: 'Taken off the list',
        description: `${removing?.programName ?? 'It'} won’t start for ${firstName}.`,
      })
      setRemoving(null)
    },
  })

  return (
    <section className="flex flex-col gap-3">
      <h3 className="flex items-center gap-2 font-extrabold text-[11px] text-ink-muted uppercase tracking-[0.1em]">
        <CalendarClock className="size-3.5" aria-hidden />
        Up next
      </h3>
      {upcoming.length === 0 ? (
        <div className="flex flex-col items-start gap-3 rounded-md border-[1.5px] border-border-strong border-dashed p-4 sm:flex-row sm:items-center">
          <p className="min-w-0 flex-1 text-[14px] text-ink-muted">
            Nothing lined up after {after ?? 'this'}. Plan the next program now and it takes over by
            itself on its start date; {firstName}’s history is kept.
          </p>
          <Button
            variant="secondary"
            size="sm"
            icon={<ListPlus className="size-4" aria-hidden />}
            onClick={onAssign}
          >
            Plan next program
          </Button>
        </div>
      ) : (
        <ul className="flex w-full flex-col gap-2">
          {upcoming.map((x, i) => (
            <li
              key={x.enrollmentId}
              className="flex flex-wrap items-center gap-3 rounded-md border-[1.5px] border-brand/40 border-dashed bg-surface-raised p-4"
            >
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-soft font-display font-extrabold text-[15px] text-brand-text tabular">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold text-[15px]">{x.programName}</p>
                <p className="mt-0.5 font-semibold text-[13px] text-ink-muted">
                  {formatDay(x.startDate)} –{' '}
                  {formatDay(programEndDate(x.startDate, x.durationWeeks))} · {x.durationWeeks}{' '}
                  {x.durationWeeks === 1 ? 'week' : 'weeks'}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <Link
                  to="/programs/$programId"
                  params={{ programId: String(x.programId) }}
                  className={buttonClasses('secondary', 'sm')}
                >
                  <Pencil className="size-4" aria-hidden />
                  Edit
                </Link>
                <IconButton
                  label="Take it off the list"
                  tone="danger"
                  size="sm"
                  icon={<Trash2 aria-hidden />}
                  onClick={() => setRemoving(x)}
                />
              </div>
            </li>
          ))}
          <li>
            <Button
              variant="ghost"
              size="sm"
              icon={<ListPlus className="size-4" aria-hidden />}
              onClick={onAssign}
            >
              Line up another
            </Button>
          </li>
        </ul>
      )}
      <ConfirmDialog
        open={removing !== null}
        title={`Take ${removing?.programName ?? 'it'} off ${firstName}’s list?`}
        confirmLabel="Take it off"
        loading={remove.isPending}
        onConfirm={() => removing && remove.mutate(removing.enrollmentId)}
        onClose={() => {
          remove.reset()
          setRemoving(null)
        }}
      >
        <p>
          It won’t start on {removing ? formatDay(removing.startDate) : 'its start date'}.{' '}
          {firstName} hasn’t logged anything on it yet, and the program stays in your library.
        </p>
        {remove.isError && (
          <p role="alert" className="mt-3 font-semibold text-danger">
            {remove.error instanceof ApiError
              ? remove.error.message
              : 'Could not take it off. Try again.'}
          </p>
        )}
      </ConfirmDialog>
    </section>
  )
}

/** How many of a past program's workouts show before "Show all". */
const PAST_PREVIEW = 5

/** Finished, archived or replaced programs, each with its history; re-enable or delete. */
function PastPrograms({
  past,
  userId,
  name,
  hasCurrent,
  onOpenWorkout,
}: {
  past: PastProgram[]
  userId: number
  name: string
  hasCurrent: boolean
  onOpenWorkout: (sessionId: number) => void
}) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState<number | null>(null)
  const [showAll, setShowAll] = useState(false)
  const [deleting, setDeleting] = useState<PastProgram | null>(null)
  const firstName = firstNameOf(name)
  const restore = useMutation({
    mutationFn: (enrollmentId: number) =>
      api(`/admin/users/${userId}/enrollments/${enrollmentId}/restore`, { method: 'POST' }),
    onSuccess: (_, enrollmentId) => {
      void invalidatePerson(queryClient, userId)
      const item = past.find((x) => x.enrollmentId === enrollmentId)
      toast({
        title: 'Program re-enabled',
        description: `${item?.programName ?? 'It'} is back on ${firstName}’s calendar with its original dates.`,
      })
    },
    onError: (err) =>
      toast({
        tone: 'error',
        title: 'Couldn’t re-enable it',
        description: err instanceof ApiError ? err.message : undefined,
      }),
  })

  return (
    <section className="flex flex-col gap-3">
      <h3 className="flex items-center gap-2 font-extrabold text-[11px] text-ink-muted uppercase tracking-[0.1em]">
        <History className="size-3.5" aria-hidden />
        Past programs
      </h3>
      <ul className="flex flex-col gap-2">
        {past.map((x) => {
          const expanded = open === x.enrollmentId
          return (
            <li key={x.enrollmentId} className="rounded-md bg-surface-raised p-4">
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 font-bold text-[15px]">
                    <span className="truncate">{x.programName}</span>
                    <span
                      className={cn(
                        'shrink-0 rounded-pill px-2 py-0.5 font-extrabold text-[10px] uppercase tracking-[0.12em]',
                        x.status === 'completed'
                          ? 'bg-brand-soft text-brand-text'
                          : 'bg-surface text-ink-muted',
                      )}
                    >
                      {x.status === 'completed' ? 'Finished' : 'Archived'}
                    </span>
                  </p>
                  <p className="mt-0.5 font-semibold text-[13px] text-ink-muted">
                    Started {shortDate(x.startDate)} ·{' '}
                    {x.status === 'completed' ? 'finished' : 'archived'}{' '}
                    {shortDate(x.endedAt.slice(0, 10))}
                  </p>
                  <p className="mt-1.5 font-semibold text-[13px]">
                    <span className="tabular">{x.workouts}</span>{' '}
                    {x.workouts === 1 ? 'workout' : 'workouts'}
                    {x.volumeKg > 0 && (
                      <>
                        {' '}
                        · <span className="tabular">{formatNumber(x.volumeKg)}</span> kg
                      </>
                    )}
                    {x.lastWorkoutAt && <> · last {relativeDay(x.lastWorkoutAt).toLowerCase()}</>}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={<ArchiveRestore className="size-4" aria-hidden />}
                    disabled={hasCurrent}
                    loading={restore.isPending && restore.variables === x.enrollmentId}
                    title={hasCurrent ? `Archive ${firstName}’s current program first` : undefined}
                    onClick={() => restore.mutate(x.enrollmentId)}
                  >
                    Re-enable
                  </Button>
                  <IconButton
                    label="Delete it and its history for good"
                    tone="danger"
                    size="sm"
                    icon={<Trash2 aria-hidden />}
                    onClick={() => setDeleting(x)}
                  />
                </div>
              </div>
              {x.recent.length > 0 && (
                <>
                  <button
                    type="button"
                    aria-expanded={expanded}
                    onClick={() => {
                      setOpen(expanded ? null : x.enrollmentId)
                      setShowAll(false)
                    }}
                    className="mt-2 inline-flex items-center gap-1 font-bold text-[13px] text-brand-text hover:underline"
                  >
                    <ChevronDown
                      className={cn('size-4 transition', expanded && 'rotate-180')}
                      aria-hidden
                    />
                    {expanded ? 'Hide history' : 'Show history'}
                  </button>
                  {expanded && (
                    <ul className="mt-2 divide-y divide-border overflow-hidden rounded-sm bg-surface">
                      {(showAll ? x.recent : x.recent.slice(0, PAST_PREVIEW)).map((s) => (
                        <li key={s.id}>
                          <button
                            type="button"
                            onClick={() => onOpenWorkout(s.id)}
                            className="flex min-h-11 w-full flex-wrap items-center gap-x-3 gap-y-0.5 px-3 py-2 text-left text-[13px] transition hover:bg-surface-raised"
                          >
                            <span className="w-16 shrink-0 font-semibold text-ink-muted">
                              {shortDate(s.startedAt.slice(0, 10))}
                            </span>
                            <span className="min-w-0 flex-1 truncate font-bold">
                              {s.workoutName ?? 'Workout'}
                              <SessionStatusTag status={s.status} />
                            </span>
                            <span className="tabular text-ink-muted">
                              {s.setCount} {s.setCount === 1 ? 'set' : 'sets'} ·{' '}
                              {formatNumber(Math.round(s.volumeKg))} kg
                              {s.feeling ? ` · felt ${s.feeling}/5` : ''}
                            </span>
                            <SwapsLine swaps={s.swaps} className="basis-full pl-[76px]" />
                          </button>
                        </li>
                      ))}
                      {!showAll && x.recent.length > PAST_PREVIEW && (
                        <li>
                          <button
                            type="button"
                            onClick={() => setShowAll(true)}
                            className="flex min-h-11 w-full items-center px-3 py-2 font-bold text-[13px] text-brand-text hover:bg-surface-raised"
                          >
                            Show all {x.recent.length} workouts
                          </button>
                        </li>
                      )}
                      {(showAll || x.recent.length <= PAST_PREVIEW) &&
                        x.workouts > x.recent.length && (
                          <li className="px-3 py-2 font-semibold text-[12px] text-ink-muted">
                            The last {x.recent.length} of {x.workouts} workouts.
                          </li>
                        )}
                    </ul>
                  )}
                </>
              )}
            </li>
          )
        })}
      </ul>
      {hasCurrent && (
        <p className="font-semibold text-[12px] text-ink-muted">
          To re-enable one, archive {firstName}’s current program first.
        </p>
      )}
      <DeletePastDialog
        item={deleting}
        onClose={() => setDeleting(null)}
        userId={userId}
        name={name}
      />
    </section>
  )
}

function DeletePastDialog({
  item,
  onClose,
  userId,
  name,
}: {
  item: PastProgram | null
  onClose: () => void
  userId: number
  name: string
}) {
  const queryClient = useQueryClient()
  const [typed, setTyped] = useState('')
  const firstName = firstNameOf(name)
  const remove = useMutation({
    mutationFn: (enrollmentId: number) =>
      api(`/admin/users/${userId}/enrollments/${enrollmentId}`, { method: 'DELETE' }),
    onSuccess: () => {
      void invalidatePerson(queryClient, userId)
      toast({
        title: 'Deleted for good',
        description: `${item?.programName} and its history are gone.`,
      })
      close()
    },
  })
  function close() {
    setTyped('')
    remove.reset()
    onClose()
  }
  return (
    <ConfirmDialog
      open={item !== null}
      title={`Delete ${item?.programName ?? 'this program'} from ${firstName}’s history?`}
      confirmLabel="Delete for good"
      loading={remove.isPending}
      confirmDisabled={typed.trim().toUpperCase() !== 'DELETE'}
      onConfirm={() => item && remove.mutate(item.enrollmentId)}
      onClose={close}
    >
      {item && (
        <>
          <p>Everything {firstName} logged on it is deleted for good:</p>
          <ul className="mt-3 flex flex-col gap-2 rounded-md bg-danger/10 p-4 font-semibold text-[15px] text-ink">
            <Impact
              icon={<CalendarClock aria-hidden />}
              n={item.impact.sessions}
              one="workout"
              many="workouts"
            />
            <Impact
              icon={<Dumbbell aria-hidden />}
              n={item.impact.loggedSets}
              one="logged set"
              many="logged sets"
            />
            <Impact
              icon={<Scale aria-hidden />}
              n={item.impact.checkins}
              one="weigh-in"
              many="weigh-ins"
            />
          </ul>
          <p className="mt-3 text-[14px]">The program itself stays in your library.</p>
          <div className="mt-4">
            <Field label="Type DELETE to confirm" hint="This can’t be undone.">
              {(id) => (
                <Input
                  id={id}
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  placeholder="DELETE"
                  autoComplete="off"
                  className="font-bold tracking-wider uppercase"
                />
              )}
            </Field>
          </div>
        </>
      )}
      {remove.isError && (
        <p role="alert" className="mt-3 font-semibold text-danger">
          {remove.error instanceof ApiError
            ? remove.error.message
            : 'Could not delete it. Try again.'}
        </p>
      )}
    </ConfirmDialog>
  )
}

function RemoveProgramDialog({
  open,
  onClose,
  userId,
  name,
  progress,
}: {
  open: boolean
  onClose: () => void
  userId: number
  name: string
  progress: PersonProgress
}) {
  const queryClient = useQueryClient()
  const [typed, setTyped] = useState('')
  const firstName = name.split(' ')[0] ?? name
  const programName = progress.plan.enrollment.programName
  const remove = useMutation({
    mutationFn: () => api(`/admin/users/${userId}/program`, { method: 'DELETE' }),
    onSuccess: () => {
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: personProgressQuery(userId).queryKey }),
        queryClient.invalidateQueries({ queryKey: ['enrollments'] }),
      ])
      toast({ title: 'Program removed', description: `${firstName} no longer has ${programName}.` })
      close()
    },
  })
  const { impact } = progress

  function close() {
    setTyped('')
    remove.reset()
    onClose()
  }

  return (
    <ConfirmDialog
      open={open}
      title={`Remove ${programName} from ${firstName}?`}
      confirmLabel="Remove program and data"
      loading={remove.isPending}
      confirmDisabled={typed.trim().toUpperCase() !== 'REMOVE'}
      onConfirm={() => remove.mutate()}
      onClose={close}
    >
      <p>
        {firstName}’s calendar is cleared and everything {firstName} logged on this program is
        deleted for good:
      </p>
      <ul className="mt-3 flex flex-col gap-2 rounded-md bg-danger/10 p-4 font-semibold text-[15px] text-ink">
        <Impact
          icon={<CalendarClock aria-hidden />}
          n={impact.sessions}
          one="workout"
          many="workouts"
        />
        <Impact
          icon={<Dumbbell aria-hidden />}
          n={impact.loggedSets}
          one="logged set"
          many="logged sets"
        />
        <Impact icon={<Scale aria-hidden />} n={impact.checkins} one="weigh-in" many="weigh-ins" />
      </ul>
      <p className="mt-3 text-[14px]">
        The program itself stays in your library, and you can assign {firstName} a new one
        afterwards.
      </p>
      <div className="mt-4">
        <Field label="Type REMOVE to confirm" hint="This can’t be undone.">
          {(id) => (
            <Input
              id={id}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder="REMOVE"
              autoComplete="off"
              className="font-bold tracking-wider uppercase"
            />
          )}
        </Field>
      </div>
      {remove.isError && (
        <p role="alert" className="mt-3 font-semibold text-danger">
          {remove.error instanceof ApiError
            ? remove.error.message
            : 'Could not remove it. Try again.'}
        </p>
      )}
    </ConfirmDialog>
  )
}

function Impact({ icon, n, one, many }: { icon: ReactNode; n: number; one: string; many: string }) {
  return (
    <li className="flex items-center gap-2.5 [&_svg]:size-4 [&_svg]:text-danger">
      {icon}
      <span>
        <b className="tabular">{n}</b> {n === 1 ? one : many}
      </span>
    </li>
  )
}

function Stat({
  label,
  value,
  unit,
  className,
}: {
  label: string
  value: string
  unit?: string
  className?: string
}) {
  return (
    <div className="rounded-md bg-surface-raised px-3 py-2.5">
      <dt className="font-bold text-[11px] text-ink-muted uppercase tracking-wide">{label}</dt>
      <dd
        className={cn('mt-0.5 truncate font-display font-extrabold text-[18px] tabular', className)}
      >
        {value}
        {unit && (
          <span className="ml-1 font-sans font-semibold text-[12px] text-ink-muted">{unit}</span>
        )}
      </dd>
    </div>
  )
}

function Legend({ state }: { state: PlanDay['state'] }) {
  const { cell, icon: Icon, label } = DAY_STYLE[state]
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn('grid size-4 place-items-center rounded-[4px]', cell)}>
        <Icon className="size-2.5" strokeWidth={3} aria-hidden />
      </span>
      {label}
    </span>
  )
}

function shortDate(iso: string) {
  return new Intl.DateTimeFormat('en-ZA', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(`${iso}T00:00:00Z`))
}

function formatHours(minutes: number) {
  if (minutes < 60) return `${minutes} min`
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}

function relativeDay(iso: string) {
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000)
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days} days ago`
  return new Intl.DateTimeFormat('en-ZA', { day: 'numeric', month: 'short' }).format(new Date(iso))
}

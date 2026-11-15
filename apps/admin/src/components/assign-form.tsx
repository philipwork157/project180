import {
  ApiError,
  api,
  enrollmentsQuery,
  meQuery,
  programsQuery,
  queuedEnrollmentsQuery,
  usersQuery,
} from '@project180/client'
import {
  addDays,
  type EnrollmentSummary,
  formatDay,
  isStaff,
  nextProgramStart,
  queuesBehind,
  todayIn,
  weekdayIndex,
} from '@project180/shared'
import { Button, ChoiceChips, DatePicker, Field, Select, toast } from '@project180/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarCheck, CalendarClock, ListPlus, RefreshCw, UserPlus } from 'lucide-react'
import { useState } from 'react'

const UPDATE_NOTE =
  'Brings in your changes. Their start date, calendar and finished workouts stay. ' +
  'Anything changed just for them is replaced.'
const RESTART_NOTE =
  'A fresh copy from the start date below. Finished workouts stay in their history, ' +
  'but their calendar starts again at week 1.'

/** The coming Monday in the user's time zone, or today if it is Monday. */
export function nextMonday(timezone: string) {
  const today = todayIn(timezone)
  const offset = weekdayIndex(today)
  return offset === 0 ? today : addDays(today, 7 - offset)
}

/**
 * Assign a program to a person from a start date. Pass `programId` or `userId`
 * to fix one side; the form asks for whatever is missing.
 */
export function AssignForm({
  programId,
  userId,
  onDone,
}: {
  programId?: number
  userId?: number
  onDone?: () => void
}) {
  const queryClient = useQueryClient()
  const { data: me } = useQuery(meQuery)
  const isAdmin = isStaff(me?.role)
  const programs = useQuery({ ...programsQuery(), enabled: programId === undefined })
  const users = useQuery({ ...usersQuery, enabled: isAdmin && userId === undefined })
  const enrollments = useQuery(enrollmentsQuery())
  const queued = useQuery({ ...queuedEnrollmentsQuery, enabled: isAdmin })
  const [pid, setPid] = useState<number | undefined>(programId)
  const [uid, setUid] = useState<number | undefined>(userId ?? me?.id)
  // Picked by hand; until then it follows the person (the day after their current program).
  const [pickedDate, setPickedDate] = useState<string>()
  const [error, setError] = useState<string>()
  const [done, setDone] = useState<'assigned' | 'updated' | 'queued' | null>(null)
  const [mode, setMode] = useState<'update' | 'restart'>('update')
  const timezone = me?.timezone ?? 'Africa/Johannesburg'
  const today = todayIn(timezone)

  // You and the clients you coach yourself (owners too), like the People list.
  const people = isAdmin
    ? (users.data ?? []).filter((u) => u.id === me?.id || u.coachId === me?.id)
    : me
      ? [{ id: me.id, name: me.name }]
      : []
  const current = enrollments.data?.find((e) => e.userId === uid && e.status === 'active')
  const lined = (queued.data ?? []).filter((e) => e.userId === uid)
  const startDate =
    pickedDate ??
    nextProgramStart(today, [...(current ? [current] : []), ...lined]) ??
    nextMonday(timezone)
  const setStartDate = setPickedDate
  // Already on this program (their own copy of it): update it or start over.
  const already = Boolean(current && pid && current.sourceProgramId === pid)
  const updating = already && mode === 'update'
  // Starts after today while they're on a program: it waits and takes over on its start date.
  const queues = !updating && queuesBehind(current, startDate, today)
  const name = people.find((p) => p.id === uid)?.name ?? 'They'
  const who = uid === me?.id ? 'You' : name

  const assign = useMutation({
    mutationFn: () =>
      api('/enrollments', {
        method: 'POST',
        body: { userId: uid, programId: pid, startDate, mode: updating ? 'update' : 'restart' },
      }),
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: ['enrollments'] })
      void queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
      void queryClient.invalidateQueries({ queryKey: ['programs'] })
      const lineUp = (res as { enrollment?: EnrollmentSummary }).enrollment?.status === 'scheduled'
      toast(
        updating
          ? { title: 'Program updated', description: 'Start date and finished workouts are kept.' }
          : lineUp
            ? {
                title: 'Program lined up',
                description: `It takes over on ${formatDay(startDate)}.`,
              }
            : { title: 'Program assigned', description: 'It’s on their calendar now.' },
      )
      setDone(updating ? 'updated' : lineUp ? 'queued' : 'assigned')
      onDone?.()
    },
  })

  if (done === 'updated') {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg bg-brand-soft p-6 text-center">
        <span className="grid size-14 place-items-center rounded-full bg-lime text-on-lime">
          <RefreshCw className="size-7" aria-hidden />
        </span>
        <p className="font-bold text-[17px]">Up to date</p>
        <p className="text-[14px] text-ink-muted">
          Their program has your latest changes. Their start date and finished workouts are kept.
        </p>
        <Button variant="secondary" size="sm" onClick={() => setDone(null)}>
          Assign another
        </Button>
      </div>
    )
  }

  if (done === 'queued') {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg bg-brand-soft p-6 text-center">
        <span className="grid size-14 place-items-center rounded-full bg-lime text-on-lime">
          <CalendarClock className="size-7" aria-hidden />
        </span>
        <p className="font-bold text-[17px]">Lined up</p>
        <p className="text-[14px] text-ink-muted">
          It takes over on {formatDay(startDate)}.{' '}
          {current &&
            `Until then ${uid === me?.id ? 'you keep' : 'they keep'} ${current.programName}. `}
          Everything logged stays in the history.
        </p>
        <Button variant="secondary" size="sm" onClick={() => setDone(null)}>
          Assign another
        </Button>
      </div>
    )
  }

  if (done) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg bg-brand-soft p-6 text-center">
        <span className="grid size-14 place-items-center rounded-full bg-lime text-on-lime">
          <CalendarCheck className="size-7" aria-hidden />
        </span>
        <p className="font-bold text-[17px]">Assigned</p>
        <p className="text-[14px] text-ink-muted">
          Their calendar is filled in from {startDate}. They’ll see it on the Today screen.
        </p>
        <Button variant="secondary" size="sm" onClick={() => setDone(null)}>
          Assign another
        </Button>
      </div>
    )
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={async (e) => {
        e.preventDefault()
        if (!pid) return setError('Pick a program')
        if (!uid) return setError('Pick a person')
        setError(undefined)
        try {
          await assign.mutateAsync()
        } catch (err) {
          setError(err instanceof ApiError ? err.message : 'Could not assign the program.')
        }
      }}
    >
      {programId === undefined && (
        <Field label="Program">
          {(id) => (
            <Select
              id={id}
              value={pid ?? ''}
              onChange={(e) => setPid(Number(e.target.value) || undefined)}
            >
              <option value="">Choose a program…</option>
              {programs.data?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {p.durationWeeks} weeks
                </option>
              ))}
            </Select>
          )}
        </Field>
      )}
      {userId === undefined && isAdmin && (
        <Field label="Person">
          {(id) => (
            <Select
              id={id}
              value={uid ?? ''}
              onChange={(e) => setUid(Number(e.target.value) || undefined)}
            >
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.id === me?.id ? `${p.name} (you)` : p.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
      )}
      {already && current && (
        <div className="flex flex-col gap-3 rounded-md bg-surface-raised p-4">
          <p className="font-semibold text-[14px]">
            {who} {uid === me?.id ? 'are' : 'is'} already on <b>{current.programName}</b>
            {`, started ${current.startDate}.`}
          </p>
          <ChoiceChips
            label="What to do"
            value={mode}
            onChange={(v) => v && setMode(v)}
            options={[
              { value: 'update', label: 'Update to latest version' },
              { value: 'restart', label: 'Start over' },
            ]}
          />
          <p className="text-[13px] text-ink-muted">{updating ? UPDATE_NOTE : RESTART_NOTE}</p>
        </div>
      )}
      {updating ? (
        error && (
          <p role="alert" className="font-semibold text-[14px] text-danger">
            {error}
          </p>
        )
      ) : (
        <Field
          label="Start date"
          hint="Day 1 of week 1. Their calendar counts from here."
          error={error}
        >
          {(id) => <DatePicker id={id} value={startDate} onChange={setStartDate} />}
        </Field>
      )}
      {current && !already && current.programId !== pid && (
        <div className="flex flex-col gap-2 rounded-md bg-surface-raised p-4 text-[14px]">
          {queues ? (
            <p className="font-semibold">
              {who} {uid === me?.id ? 'keep' : 'keeps'} <b>{current.programName}</b> until{' '}
              {formatDay(addDays(startDate, -1))}. On {formatDay(startDate)} this program takes over
              by itself.
            </p>
          ) : (
            <p className="font-semibold">
              {who} {uid === me?.id ? 'are' : 'is'} on <b>{current.programName}</b> now. Starting
              today or earlier replaces it straight away.
            </p>
          )}
          <p className="text-[13px] text-ink-muted">
            Finished workouts stay in their history either way. Pick a later start date to line it
            up instead.
          </p>
          {lined.length > 0 && (
            <p className="text-[13px] text-ink-muted">
              Already lined up:{' '}
              {lined.map((e) => `${e.programName} (${formatDay(e.startDate)})`).join(', ')}
            </p>
          )}
        </div>
      )}
      <Button
        type="submit"
        size="lg"
        block
        loading={assign.isPending}
        icon={
          updating ? (
            <RefreshCw className="size-5" aria-hidden />
          ) : queues ? (
            <ListPlus className="size-5" aria-hidden />
          ) : (
            <UserPlus className="size-5" aria-hidden />
          )
        }
      >
        {updating
          ? 'Update their program'
          : queues
            ? `Line up for ${formatDay(startDate)}`
            : isAdmin
              ? 'Assign program'
              : 'Start this program'}
      </Button>
    </form>
  )
}

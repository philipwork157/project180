import {
  ApiError,
  api,
  enrollmentsQuery,
  meQuery,
  programsQuery,
  usersQuery,
} from '@project180/client'
import { addDays, isStaff, todayIn, weekdayIndex } from '@project180/shared'
import { Button, DatePicker, Field, Select, toast } from '@project180/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarCheck, UserPlus } from 'lucide-react'
import { useState } from 'react'

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
  const [pid, setPid] = useState<number | undefined>(programId)
  const [uid, setUid] = useState<number | undefined>(userId ?? me?.id)
  const [startDate, setStartDate] = useState(() =>
    nextMonday(me?.timezone ?? 'Africa/Johannesburg'),
  )
  const [error, setError] = useState<string>()
  const [done, setDone] = useState(false)

  const people = isAdmin ? (users.data ?? []) : me ? [{ id: me.id, name: me.name }] : []
  const current = enrollments.data?.find((e) => e.userId === uid && e.status === 'active')

  const assign = useMutation({
    mutationFn: () =>
      api('/enrollments', { method: 'POST', body: { userId: uid, programId: pid, startDate } }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['enrollments'] }),
        queryClient.invalidateQueries({ queryKey: ['admin', 'users'] }),
      ])
      toast({ title: 'Program assigned', description: 'It’s on their calendar now.' })
      setDone(true)
      onDone?.()
    },
  })

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
        <Button variant="secondary" size="sm" onClick={() => setDone(false)}>
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
      <Field
        label="Start date"
        hint="Day 1 of week 1. Their calendar counts from here."
        error={error}
      >
        {(id) => <DatePicker id={id} value={startDate} onChange={setStartDate} />}
      </Field>
      {current && current.programId !== pid && (
        <p className="rounded-md bg-sand/20 p-3 font-semibold text-[14px]">
          {people.find((p) => p.id === uid)?.name ?? 'They'} {uid === me?.id ? 'are' : 'is'} on{' '}
          <b>{current.programName}</b> now. Assigning replaces it; finished workouts stay in their
          history.
        </p>
      )}
      <Button
        type="submit"
        size="lg"
        block
        loading={assign.isPending}
        icon={<UserPlus className="size-5" aria-hidden />}
      >
        {isAdmin ? 'Assign program' : 'Start this program'}
      </Button>
    </form>
  )
}

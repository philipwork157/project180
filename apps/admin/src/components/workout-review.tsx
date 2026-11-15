import { ApiError, api, clientWorkoutQuery } from '@project180/client'
import { durationShort, type ExerciseReview, reviewSession } from '@project180/shared'
import { Button, Chip, ConfirmDialog, cn, Drawer, toast } from '@project180/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeftRight, Ban, Check, Square, TrendingUp } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { FeedbackBar } from './workout-feedback'

const LABEL = 'font-extrabold text-[11px] text-ink-muted uppercase tracking-[0.08em]'
const FEELINGS = ['', 'Rough', 'Meh', 'Okay', 'Good', 'Great']
const ZONE = 'Africa/Johannesburg'

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-ZA', {
    timeZone: ZONE,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })

export interface OpenWorkout {
  userId: number
  sessionId: number
  /** The client's name, for the title. */
  name: string
}

/**
 * A client's workout, exercise by exercise: what was planned next to what they did.
 * While they're still training it refreshes every few seconds.
 */
export function WorkoutReviewDrawer({
  workout,
  onClose,
}: {
  workout: OpenWorkout | null
  onClose: () => void
}) {
  const first = workout?.name.split(' ')[0] ?? ''
  return (
    <Drawer
      open={workout !== null}
      onClose={onClose}
      title={first ? `${first}’s workout` : 'Workout'}
    >
      {workout && (
        <WorkoutReview
          userId={workout.userId}
          sessionId={workout.sessionId}
          clientName={workout.name}
        />
      )}
    </Drawer>
  )
}

function WorkoutReview({
  userId,
  sessionId,
  clientName,
}: {
  userId: number
  sessionId: number
  clientName: string
}) {
  const query = useQuery(clientWorkoutQuery(userId, sessionId))
  const s = query.data?.session
  const feedback = query.data?.feedback ?? []
  if (!s) {
    if (query.isError)
      return (
        <p className="rounded-md bg-surface-raised p-4 text-[14px] text-ink-muted">
          This workout couldn’t be loaded.
        </p>
      )
    return (
      <div className="flex flex-col gap-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-32 animate-pulse rounded-md bg-surface-raised" />
        ))}
      </div>
    )
  }
  const reviews = reviewSession(s)
  const live = s.status === 'in_progress'
  const planned = reviews.reduce((n, r) => n + r.item.targetSets, 0)
  const done = reviews.reduce((n, r) => n + r.doneSets, 0)
  const volume = s.sets
    .filter((x) => !x.isWarmup)
    .reduce((n, x) => n + (x.weightKg ?? 0) * (x.reps ?? 0), 0)
  const improved = reviews.filter((r) => r.improved).length

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {live ? (
            <Chip tone="clay" className="gap-2">
              <span className="relative flex size-2" aria-hidden>
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-current opacity-50" />
                <span className="relative inline-flex size-2 rounded-full bg-current" />
              </span>
              Training now
            </Chip>
          ) : s.status === 'abandoned' ? (
            <Chip tone="sand">
              <Square className="size-3" aria-hidden />
              Stopped early
            </Chip>
          ) : s.status === 'cancelled' ? (
            <Chip>
              <Ban className="size-3.5" aria-hidden />
              Cancelled
            </Chip>
          ) : (
            <Chip tone="brand">
              <Check className="size-3.5" aria-hidden />
              Finished
            </Chip>
          )}
          {improved > 0 && (
            <Chip tone="lime">
              <TrendingUp className="size-3.5" aria-hidden />
              Up on last time × {improved}
            </Chip>
          )}
        </div>
        <div>
          <p className="font-display font-extrabold text-[20px] leading-6 tracking-tight">
            {s.workoutName ?? 'Workout'}
          </p>
          <p className="mt-1 text-[14px] text-ink-muted">{when(s.startedAt)}</p>
        </div>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Sets" value={planned ? `${done}/${planned}` : String(done)} />
          <Stat
            label="Time"
            value={s.durationSeconds ? durationShort(s.durationSeconds) : live ? 'Going' : '–'}
          />
          <Stat
            label="Volume"
            value={volume ? `${Math.round(volume).toLocaleString('en-ZA')} kg` : '–'}
          />
          <Stat label="Felt" value={s.feeling ? (FEELINGS[s.feeling] ?? '–') : '–'} />
        </dl>
        {s.notes && (
          <div className="rounded-md bg-surface-raised p-4">
            <p className={LABEL}>Their note</p>
            <p className="mt-1 whitespace-pre-line text-[14px]">{s.notes}</p>
          </div>
        )}
        {live && <CancelWorkout userId={userId} sessionId={s.id} clientName={clientName} />}
        <div className="border-border border-t pt-3">
          <FeedbackBar
            userId={userId}
            sessionId={s.id}
            exerciseId={null}
            items={feedback}
            clientName={clientName}
          />
        </div>
      </div>

      {reviews.length === 0 ? (
        <p className="rounded-md bg-surface-raised p-4 text-[14px] text-ink-muted">
          {live ? 'No sets logged yet. They’ll show up here as they go.' : 'No sets logged.'}
        </p>
      ) : (
        <ol className="flex flex-col gap-4">
          {reviews.map((r) => (
            <ExerciseBlock
              key={r.item.exerciseId}
              review={r}
              feedback={
                <FeedbackBar
                  userId={userId}
                  sessionId={s.id}
                  exerciseId={r.item.exerciseId}
                  items={feedback}
                  clientName={clientName}
                />
              }
            />
          ))}
        </ol>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md bg-surface-raised px-3 py-2.5">
      <dt className={LABEL}>{label}</dt>
      <dd className="metric mt-1 truncate text-[18px]">{value}</dd>
    </div>
  )
}

function ExerciseBlock({ review: r, feedback }: { review: ExerciseReview; feedback: ReactNode }) {
  const complete = r.item.targetSets > 0 && r.doneSets >= r.item.targetSets
  return (
    <li
      className={cn(
        'flex flex-col gap-3 rounded-md border border-border bg-surface p-4',
        r.improved && 'border-l-4 border-l-lime',
      )}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-bold text-[15px] leading-5">{r.item.exerciseName}</p>
          {r.item.swappedFrom && (
            <p className="mt-1 flex min-w-0 items-center gap-1.5 font-semibold text-[13px] text-ink-muted">
              <ArrowLeftRight className="size-3.5 shrink-0 text-brand-text" aria-hidden />
              <span className="truncate">Swapped from {r.item.swappedFrom.exerciseName}</span>
            </p>
          )}
        </div>
        <span
          className={cn(
            'inline-flex shrink-0 items-center gap-1 font-bold text-[13px] tabular',
            complete ? 'text-brand-text' : 'text-ink-muted',
          )}
        >
          {complete && <Check className="size-4" aria-hidden />}
          {r.item.targetSets ? `${r.doneSets}/${r.item.targetSets}` : r.doneSets} sets
        </span>
      </div>

      {r.rows.length > 0 && (
        <table className="w-full text-[14px]">
          <thead>
            <tr className="text-left">
              <th className={cn(LABEL, 'w-12 pb-1 font-extrabold')}>Set</th>
              <th className={cn(LABEL, 'pb-1 font-extrabold')}>Planned</th>
              <th className={cn(LABEL, 'pb-1 font-extrabold')}>Done</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {r.rows.map((row) => (
              <tr key={row.setNumber}>
                <td className="py-2 font-semibold text-ink-muted tabular">{row.setNumber}</td>
                <td className="py-2 pr-3 text-ink-muted tabular">{row.target ?? 'Extra set'}</td>
                <td className="py-2 font-bold tabular">
                  {row.done ?? <span className="font-semibold text-ink-muted">Not done</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {(r.warmups.length > 0 || r.lastTime || r.improved) && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-ink-muted">
          {r.warmups.length > 0 && <span>Warm-up: {r.warmups.join(', ')}</span>}
          {r.lastTime && <span>Last time best: {r.lastTime}</span>}
          {r.improved && (
            <span className="inline-flex items-center gap-1 font-bold text-lime-text">
              <TrendingUp className="size-3.5" aria-hidden />
              Up on last time
            </span>
          )}
        </div>
      )}

      <div className="border-border border-t pt-3">{feedback}</div>
    </li>
  )
}

/** Cancel a client's workout that was started by accident or left open. */
function CancelWorkout({
  userId,
  sessionId,
  clientName,
}: {
  userId: number
  sessionId: number
  clientName: string
}) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const first = clientName.split(' ')[0] ?? clientName
  const cancel = useMutation({
    mutationFn: () =>
      api(`/admin/users/${userId}/workouts/${sessionId}/cancel`, { method: 'POST' }),
    onSuccess: () => {
      setOpen(false)
      void queryClient.invalidateQueries({ queryKey: ['admin'] })
      toast({ title: 'Workout cancelled', description: `It no longer counts for ${first}.` })
    },
    onError: (err) =>
      toast({
        tone: 'error',
        title: 'Couldn’t cancel the workout',
        description: err instanceof ApiError ? err.message : undefined,
      }),
  })
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="h-11 self-start text-danger hover:bg-danger/10 hover:text-danger sm:h-9"
        icon={<Ban className="size-4" aria-hidden />}
        onClick={() => setOpen(true)}
      >
        Cancel this workout
      </Button>
      <ConfirmDialog
        open={open}
        title={`Cancel ${first}’s workout?`}
        confirmLabel="Cancel workout"
        loading={cancel.isPending}
        onConfirm={() => cancel.mutate()}
        onClose={() => setOpen(false)}
      >
        For a workout started by accident or left open. It won’t count or show in {first}’s history;
        you’ll still see it here as cancelled.
      </ConfirmDialog>
    </>
  )
}

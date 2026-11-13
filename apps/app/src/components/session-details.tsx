import { api, myFeedbackQuery, sessionFeedbackQuery, sessionQuery } from '@project180/client'
import {
  formatDuration,
  formatNumber,
  formatWeight,
  type FeedbackNews,
  type LoggedSet,
  type SessionFeedback,
  totalVolume,
} from '@project180/shared'
import { Chip, cn, MUSCLE_GROUP_TONE } from '@project180/ui'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeftRight, Heart, MessageCircle, Trophy } from 'lucide-react'
import { motion } from 'motion/react'
import { useEffect } from 'react'
import { FeelingBadge } from './feeling'

function setSummary(set: LoggedSet) {
  if (set.durationSeconds && !set.reps) return formatDuration(set.durationSeconds)
  if (set.weightKg) return `${formatWeight(set.weightKg)} kg × ${set.reps ?? '–'}`
  return `${set.reps ?? '–'} reps`
}

const coachName = (f: SessionFeedback) => f.authorName?.split(' ')[0] || 'Your coach'

/** Your coach's likes and comments on the workout or one exercise: hearts, then each comment. */
function CoachNotes({ items, className }: { items: SessionFeedback[]; className?: string }) {
  if (items.length === 0) return null
  const likes = items.filter((f) => f.kind === 'like')
  const comments = items.filter((f) => f.kind === 'comment')
  const likers = [...new Set(likes.map(coachName))]
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {likers.length > 0 && (
        <motion.p
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 420, damping: 22 }}
          className="flex items-center gap-2 font-bold text-[14px] text-brand-text"
        >
          <Heart className="size-4 shrink-0 fill-current" aria-hidden />
          {likers.join(' & ')} liked this
          {likes.some((f) => !f.readAt) && <NewTag />}
        </motion.p>
      )}
      {comments.map((f) => (
        <div key={f.id} className="flex items-start gap-3 rounded-md bg-surface p-3">
          <MessageCircle className="mt-0.5 size-4 shrink-0 text-brand-text" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 font-bold text-[13px]">
              {coachName(f)}
              {!f.readAt && <NewTag />}
            </p>
            <p className="mt-0.5 whitespace-pre-line break-words text-[15px]">{f.body}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

function NewTag() {
  return (
    <span className="shrink-0 rounded-pill bg-clay/20 px-2 py-0.5 font-extrabold text-[11px] text-clay-text">
      New
    </span>
  )
}

/** Opening a workout marks your coach's new likes and comments on it as read. */
function useMarkFeedbackRead(items: SessionFeedback[]) {
  const queryClient = useQueryClient()
  const unread = items
    .filter((f) => !f.readAt)
    .map((f) => f.id)
    .join(',')
  useEffect(() => {
    if (!unread) return
    const ids = unread.split(',').map(Number)
    // The bell clears straight away; the server catches up in the background.
    queryClient.setQueryData<FeedbackNews[]>(myFeedbackQuery.queryKey, (list) =>
      list?.filter((f) => !ids.includes(f.id)),
    )
    void api('/me/feedback/read', { method: 'POST', body: { ids } }).catch(() => {
      void queryClient.invalidateQueries({ queryKey: myFeedbackQuery.queryKey })
    })
  }, [unread, queryClient])
}

/** What was lifted in one finished workout: totals, then every set per exercise. */
export function SessionDetails({
  sessionId,
  timezone,
  hideTitle = false,
}: {
  sessionId: number
  timezone: string
  hideTitle?: boolean
}) {
  const session = useQuery(sessionQuery(sessionId))
  const feedback = useQuery(sessionFeedbackQuery(sessionId)).data ?? []
  useMarkFeedbackRead(feedback)
  if (session.isPending) return <div className="h-48 animate-pulse rounded-lg bg-surface-raised" />
  if (!session.data) return <p className="text-ink-muted">That workout couldn’t be loaded.</p>
  const s = session.data
  const working = s.sets.filter((x) => !x.isWarmup)

  // Exercises in workout order, then anything logged that isn't in the workout any more.
  const order = [
    ...s.exercises.map((e) => e.exerciseId),
    ...working
      .map((x) => x.exerciseId)
      .filter((id) => !s.exercises.some((e) => e.exerciseId === id)),
  ].filter((id, i, all) => all.indexOf(id) === i)
  const groups = order
    .map((id) => ({
      id,
      name:
        s.exercises.find((e) => e.exerciseId === id)?.exerciseName ??
        working.find((x) => x.exerciseId === id)?.exerciseName ??
        'Exercise',
      muscle: s.exercises.find((e) => e.exerciseId === id)?.muscleGroup,
      swappedFrom: s.exercises.find((e) => e.exerciseId === id)?.swappedFrom?.exerciseName,
      sets: working.filter((x) => x.exerciseId === id).sort((a, b) => a.setNumber - b.setNumber),
    }))
    .filter((g) => g.sets.length > 0)

  const when = new Intl.DateTimeFormat('en-ZA', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: timezone,
  }).format(new Date(s.startedAt))

  // On the whole workout, or on an exercise that isn't listed below (no sets logged).
  const shown = new Set(groups.map((g) => g.id))
  const general = feedback.filter((f) => f.exerciseId === null || !shown.has(f.exerciseId))

  const stats = [
    { label: 'Time', value: formatDuration(s.durationSeconds ?? 0) },
    { label: 'Volume', value: `${formatNumber(totalVolume(working))} kg` },
    { label: 'Sets', value: String(working.length) },
    { label: 'Felt', value: <FeelingBadge value={s.feeling} /> },
  ]

  return (
    <div className="flex flex-col gap-5">
      <div>
        {!hideTitle && (
          <h2 className="font-display font-extrabold text-[26px] leading-8">
            {s.workoutName ?? 'Workout'}
          </h2>
        )}
        <p className="font-semibold text-[14px] text-ink-muted">{when}</p>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {stats.map((x) => (
          <div key={x.label} className="rounded-md bg-surface-raised px-2 py-3 text-center">
            <b className="tabular flex h-7 items-center justify-center font-display text-[18px]">
              {x.value}
            </b>
            <span className="font-extrabold text-[11px] text-ink-muted uppercase tracking-wide">
              {x.label}
            </span>
          </div>
        ))}
      </div>

      {general.length > 0 && (
        <section className="rounded-lg border-l-4 border-l-lime bg-surface-raised p-4">
          <h3 className="font-extrabold text-[11px] text-ink-muted uppercase tracking-[0.08em]">
            From your coach
          </h3>
          <CoachNotes items={general} className="mt-2" />
        </section>
      )}

      {groups.length === 0 ? (
        <p className="text-ink-muted">No sets were logged in this workout.</p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {groups.map((g) => {
            const best = Math.max(0, ...g.sets.map((x) => x.weightKg ?? 0))
            return (
              <li key={g.id} className="rounded-lg bg-surface-raised p-4">
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-bold text-[16px]">{g.name}</span>
                    {g.swappedFrom && (
                      <span className="mt-0.5 flex items-center gap-1.5 font-semibold text-[13px] text-ink-muted">
                        <ArrowLeftRight className="size-3.5 shrink-0" aria-hidden />
                        <span className="truncate">Swapped from {g.swappedFrom}</span>
                      </span>
                    )}
                  </span>
                  {g.muscle && (
                    <Chip tone={MUSCLE_GROUP_TONE[g.muscle]} className="h-6 text-[12px]">
                      {g.sets.length} {g.sets.length === 1 ? 'set' : 'sets'}
                    </Chip>
                  )}
                </div>
                <ol className="mt-3 flex flex-col gap-1.5">
                  {g.sets.map((x) => (
                    <li key={x.clientUuid} className="flex items-center gap-3 text-[15px]">
                      <span className="tabular w-6 font-bold text-ink-muted">{x.setNumber}</span>
                      <span className="tabular flex-1 font-bold font-display">{setSummary(x)}</span>
                      {best > 0 && x.weightKg === best && (
                        <Trophy className="size-4 text-sand-text" aria-label="Heaviest set" />
                      )}
                    </li>
                  ))}
                </ol>
                <CoachNotes
                  items={feedback.filter((f) => f.exerciseId === g.id)}
                  className="mt-3 border-border border-t pt-3"
                />
              </li>
            )
          })}
        </ul>
      )}

      {s.notes && (
        <div className="rounded-md bg-sand/15 p-3 text-[14px]">
          <b className="block text-[13px]">Notes</b>
          {s.notes}
        </div>
      )}
    </div>
  )
}

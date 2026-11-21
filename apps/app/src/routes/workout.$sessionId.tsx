import {
  ApiError,
  api,
  meQuery,
  myProfileQuery,
  planQuery,
  rememberLocalOwner,
  sessionQuery,
  swapOptionsQuery,
} from '@project180/client'
import {
  type Board,
  buildBoard,
  enduranceTargets,
  type FinishResult,
  failedSets,
  formatDuration,
  GROUP_KIND_LABELS,
  hrZone,
  hrZoneLabel,
  MUSCLE_GROUP_LABELS,
  type PreviousSet,
  repsLabel,
  reviveBoard,
  type SessionDetail,
  type SetState,
  setPayload,
  toNumber,
  uniqueExercises,
  WORKOUT_SECTION_LABELS,
  type WorkoutExerciseItem,
  type WorkoutGroup,
} from '@project180/shared'
import {
  Button,
  Chip,
  ConfirmDialog,
  cn,
  IconButton,
  Input,
  MUSCLE_GROUP_TONE,
  Textarea,
} from '@project180/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link, Navigate, redirect, useNavigate } from '@tanstack/react-router'
import {
  ArrowLeftRight,
  ArrowUp,
  Check,
  ChevronDown,
  CloudOff,
  HeartPulse,
  Plus,
  RotateCcw,
  Square,
  StickyNote,
  Timer,
  TrendingUp,
} from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import { Celebration } from '../components/celebration'
import { Elapsed } from '../components/elapsed'
import { useExerciseHowTo } from '../components/exercise-how-to'
import { FeelingPicker } from '../components/feeling'
import { IntervalTimer } from '../components/interval-timer'
import { RestTimer } from '../components/rest-timer'
import { Sheet } from '../components/sheet'
import { SwapSheet } from '../components/swap-sheet'
import { useHeartbeat } from '../lib/use-heartbeat'

export const Route = createFileRoute('/workout/$sessionId')({
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData(meQuery)
    if (!me) throw redirect({ to: '/login' })
    if (me.mustChangePassword) throw redirect({ to: '/choose-password' })
    // The sets typed here are kept on this phone for this person only.
    rememberLocalOwner(me.id)
    return { me }
  },
  component: WorkoutPage,
})

const storageKey = (id: number) => `project180-workout-${id}`

function loadBoard(session: SessionDetail): Board {
  try {
    const raw = localStorage.getItem(storageKey(session.id))
    // A save that was on its way when the app closed never finished: send it again.
    if (raw) return reviveBoard(JSON.parse(raw) as Board)
  } catch {
    // Storage unavailable: start from the server's copy.
  }
  return buildBoard(session)
}

function WorkoutPage() {
  const { sessionId } = Route.useParams()
  useHeartbeat()
  const session = useQuery(sessionQuery(Number(sessionId)))
  if (session.isError) {
    return (
      <div className="mx-auto max-w-md p-6 pt-safe">
        <p className="font-bold">That workout couldn’t be loaded.</p>
        <Link to="/" className="mt-3 inline-block font-bold text-brand-text">
          Back to today
        </Link>
      </div>
    )
  }
  if (!session.data) return <div className="min-h-dvh animate-pulse bg-bg" />
  // Finished or discarded (e.g. reopened with Back): it can't be logged any more.
  if (session.data.status !== 'in_progress') return <Navigate to="/" replace />
  return <ActiveWorkout key={session.data.id} session={session.data} />
}

function ActiveWorkout({ session }: { session: SessionDetail }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const exercises = uniqueExercises(session.exercises)
  const [board, setBoard] = useState<Board>(() => loadBoard(session))
  const [rest, setRest] = useState<{ endsAt: number; total: number } | null>(null)
  const [finishing, setFinishing] = useState(false)
  const [result, setResult] = useState<FinishResult | null>(null)
  const [intervals, setIntervals] = useState<number | null>(null)
  const [confirmRestart, setConfirmRestart] = useState(false)
  const [stopping, setStopping] = useState(false)
  const restart = useMutation({
    mutationFn: () =>
      api<{ session: SessionDetail }>(`/sessions/${session.id}/restart`, { method: 'POST' }),
    onSuccess: ({ session: fresh }) => {
      try {
        localStorage.removeItem(storageKey(session.id))
      } catch {
        // ignore
      }
      setRest(null)
      setBoard(buildBoard(fresh))
      queryClient.setQueryData(sessionQuery(session.id).queryKey, fresh)
      void queryClient.invalidateQueries({ queryKey: ['plan'] })
      setConfirmRestart(false)
      navigator.vibrate?.([20, 40, 20])
      window.scrollTo({ top: 0, behavior: 'smooth' })
    },
  })
  const boardRef = useRef(board)
  boardRef.current = board

  // Keep typed-in numbers if the app is closed mid-workout.
  useEffect(() => {
    try {
      localStorage.setItem(storageKey(session.id), JSON.stringify(board))
    } catch {
      // Private mode: nothing to do.
    }
  }, [board, session.id])

  useWakeLock()

  const patchSet = useCallback(
    (exerciseId: number, clientUuid: string, patch: Partial<SetState>) => {
      setBoard((b) => ({
        ...b,
        [exerciseId]: (b[exerciseId] ?? []).map((s) =>
          s.clientUuid === clientUuid ? { ...s, ...patch } : s,
        ),
      }))
    },
    [],
  )

  // Follows the session: a swap can bring in a new warm-up exercise.
  const warmUps = useRef(new Set<number>())
  warmUps.current = new Set(
    session.exercises.filter((e) => e.section === 'warm_up').map((e) => e.exerciseId),
  )
  const sendSet = useCallback(
    async (exerciseId: number, set: SetState) => {
      patchSet(exerciseId, set.clientUuid, { sync: 'saving' })
      try {
        await api(`/sessions/${session.id}/sets`, {
          method: 'PUT',
          // Warm-ups don't count towards volume or records.
          body: setPayload(exerciseId, set, warmUps.current.has(exerciseId)),
        })
        patchSet(exerciseId, set.clientUuid, { sync: 'idle' })
      } catch (err) {
        // 409: the workout was finished elsewhere, so retrying can never succeed. Stop.
        const final = err instanceof ApiError && err.status === 409
        patchSet(exerciseId, set.clientUuid, { sync: final ? 'idle' : 'failed' })
      }
    },
    [patchSet, session.id],
  )
  // Saves still on their way, so finishing can wait for them.
  const inflight = useRef(new Set<Promise<void>>())
  const pushSet = useCallback(
    (exerciseId: number, set: SetState) => {
      const p = sendSet(exerciseId, set)
      inflight.current.add(p)
      void p.finally(() => inflight.current.delete(p))
      return p
    },
    [sendSet],
  )

  // Gym signal is patchy: retry anything that failed every few seconds and when back online.
  useEffect(() => {
    const retry = () => {
      for (const { exerciseId, set } of failedSets(boardRef.current)) void pushSet(exerciseId, set)
    }
    const id = setInterval(retry, 8000)
    window.addEventListener('online', retry)
    return () => {
      clearInterval(id)
      window.removeEventListener('online', retry)
    }
  }, [pushSet])

  const groupOf = (ex: WorkoutExerciseItem) =>
    ex.supersetGroup !== null
      ? session.groups.find((g) => g.groupNumber === ex.supersetGroup)
      : undefined

  function startRest(seconds: number) {
    if (seconds > 0) setRest({ endsAt: Date.now() + seconds * 1000, total: seconds })
  }

  function toggle(ex: WorkoutExerciseItem, set: SetState) {
    if (set.done) {
      patchSet(ex.exerciseId, set.clientUuid, { done: false, sync: 'idle' })
      // Let a save that's still on its way land first, or it would bring the set back.
      void Promise.all([...inflight.current])
        .then(() => api(`/sessions/${session.id}/sets/${set.clientUuid}`, { method: 'DELETE' }))
        .catch(() => undefined)
      return
    }
    navigator.vibrate?.(30)
    const done = { ...set, done: true }
    patchSet(ex.exerciseId, set.clientUuid, { done: true })
    void pushSet(ex.exerciseId, done)
    const group = groupOf(ex)
    if (!group) return startRest(ex.restSeconds)
    // In a superset or circuit, rest only once the whole round is done.
    if (group.kind === 'interval') return
    const roundDone = exercises
      .filter((e) => e.supersetGroup === group.groupNumber && e.exerciseId !== ex.exerciseId)
      .every((e) => {
        // An exercise with no set this round (swapped out partway) doesn't hold it up.
        const other = boardRef.current[e.exerciseId]?.find((s) => s.setNumber === set.setNumber)
        return !other || other.done
      })
    if (roundDone) startRest(group.restSeconds ?? 0)
  }

  /** The interval timer finished (or stopped): log every set of the rounds that were done. */
  function logIntervals(groupNumber: number, roundsDone: number, workSeconds: number) {
    for (const ex of exercises.filter((e) => e.supersetGroup === groupNumber)) {
      const timed = ex.trackingType === 'time' || ex.trackingType === 'distance_time'
      for (const s of boardRef.current[ex.exerciseId] ?? []) {
        if (s.done || s.setNumber > roundsDone) continue
        const patch = { done: true, ...(timed ? { seconds: String(workSeconds) } : {}) }
        patchSet(ex.exerciseId, s.clientUuid, patch)
        void pushSet(ex.exerciseId, { ...s, ...patch })
      }
    }
  }

  function addSet(ex: WorkoutExerciseItem) {
    setBoard((b) => {
      const sets = b[ex.exerciseId] ?? []
      const last = sets.at(-1)
      return {
        ...b,
        [ex.exerciseId]: [
          ...sets,
          {
            clientUuid: crypto.randomUUID(),
            setNumber: sets.length + 1,
            weight: last?.weight ?? '',
            reps: last?.reps ?? '',
            seconds: last?.seconds ?? '',
            done: false,
            sync: 'idle',
          },
        ],
      }
    })
  }

  /** Before finishing: retries sets that failed to save and waits for everything still sending. */
  async function flushSets() {
    for (const { exerciseId, set } of failedSets(boardRef.current)) void pushSet(exerciseId, set)
    await Promise.all([...inflight.current])
  }

  /** Ticks every untouched set that has numbers in it, and waits for them to save. */
  async function logAllSets() {
    const saves: Promise<void>[] = []
    for (const ex of exercises) {
      for (const s of boardRef.current[ex.exerciseId] ?? []) {
        if (s.done || !(s.weight || s.reps || s.seconds)) continue
        patchSet(ex.exerciseId, s.clientUuid, { done: true })
        saves.push(pushSet(ex.exerciseId, { ...s, done: true }))
      }
    }
    await Promise.all(saves)
  }

  // Swapping an exercise (machine taken, no equipment). The options load now, so the sheet
  // opens instantly even with poor signal.
  useEffect(() => {
    void queryClient.prefetchQuery(swapOptionsQuery)
  }, [queryClient])
  const [swapping, setSwapping] = useState<WorkoutExerciseItem | null>(null)
  const swap = useMutation({
    mutationFn: async ({ from, to }: { from: number; to: number }) => {
      // The server keeps logged sets with the exercise they were done on: send them first.
      await flushSets()
      return api<{ session: SessionDetail }>(`/sessions/${session.id}/swap`, {
        method: 'POST',
        body: { exerciseId: from, replacementId: to },
      })
    },
    onSuccess: ({ session: fresh }, { from, to }) => {
      // Both exercises get fresh rows (targets, last time); every other card keeps what's typed.
      const rebuilt = buildBoard(fresh)
      setBoard((b) => {
        const next: Board = {}
        for (const ex of uniqueExercises(fresh.exercises)) {
          const id = ex.exerciseId
          next[id] = (id === from || id === to ? rebuilt[id] : b[id]) ?? rebuilt[id] ?? []
        }
        return next
      })
      queryClient.setQueryData(sessionQuery(session.id).queryKey, fresh)
      // "You used before" changes: refresh it in the background.
      void queryClient.invalidateQueries({ queryKey: swapOptionsQuery.queryKey })
      navigator.vibrate?.(20)
      setSwapping(null)
    },
  })
  const loggedOn = (exerciseId: number) => (board[exerciseId] ?? []).filter((s) => s.done).length

  const allSets = Object.values(board).flat()
  const doneCount = allSets.filter((s) => s.done).length
  const unsynced = allSets.filter((s) => s.done && s.sync !== 'idle').length

  function done() {
    try {
      localStorage.removeItem(storageKey(session.id))
    } catch {
      // ignore
    }
    clearActive()
    // Leave straight away (replace: Back shouldn't reopen it); the rest refreshes in the background.
    void navigate({ to: '/', replace: true })
    void queryClient.invalidateQueries({ queryKey: ['plan'] })
    void queryClient.invalidateQueries({ queryKey: ['stats'] })
    void queryClient.invalidateQueries({ queryKey: ['sessions'] })
  }

  /**
   * The server has closed this session: drop the "workout in progress" bar from the cached plan
   * now, instead of waiting for the plan to download again.
   */
  function clearActive() {
    queryClient.setQueryData(planQuery.queryKey, (old) =>
      old && old.activeSession?.id === session.id ? { ...old, activeSession: null } : old,
    )
  }

  return (
    <div className="min-h-dvh bg-bg pb-40">
      <header className="sticky top-0 z-20 border-border border-b bg-surface/95 px-4 pt-safe pb-3 backdrop-blur md:px-8 lg:px-12">
        <div className="flex w-full items-center gap-2 pt-2">
          <Link
            to="/"
            className="inline-flex h-11 items-center gap-1.5 rounded-pill bg-surface-raised pr-4 pl-3 font-bold text-[15px] transition hover:text-brand-text active:scale-95"
          >
            <ChevronDown className="size-5" aria-hidden />
            Minimise
          </Link>
          <div className="flex-1" />
          <button
            type="button"
            onClick={() => setConfirmRestart(true)}
            className="inline-flex h-11 items-center gap-1.5 rounded-pill px-3 font-bold text-[15px] text-ink-muted transition hover:bg-danger/10 hover:text-danger active:scale-95 sm:px-4"
          >
            <RotateCcw className="size-[18px]" aria-hidden />
            <span className="max-sm:sr-only">Start over</span>
          </button>
          <button
            type="button"
            onClick={() => setStopping(true)}
            className="inline-flex h-11 items-center gap-1.5 rounded-pill px-3 font-bold text-[15px] text-ink-muted transition hover:bg-danger/10 hover:text-danger active:scale-95 sm:px-4"
          >
            <Square className="size-[16px]" aria-hidden />
            <span className="max-sm:sr-only">Stop</span>
          </button>
          <Button
            variant="lime"
            onClick={() => setFinishing(true)}
            icon={<Check className="size-[18px]" aria-hidden />}
          >
            Finish
          </Button>
        </div>
        <div className="mt-3 flex w-full flex-wrap items-end justify-between gap-x-4 gap-y-1">
          <h1 className="min-w-0 truncate font-display font-extrabold text-[24px] leading-tight md:text-[28px]">
            {session.workoutName ?? 'Workout'}
          </h1>
          <p className="flex items-center gap-3 font-semibold text-[14px] text-ink-muted">
            <span className="inline-flex items-center gap-1.5 text-steel-text">
              <Timer className="size-4" aria-hidden />
              <Elapsed
                since={session.startedAt}
                className="tabular font-bold font-display text-[17px]"
              />
            </span>
            <span className="tabular">
              <b className="text-ink">{doneCount}</b>/{allSets.length} sets
            </span>
            {unsynced > 0 && (
              <span className="inline-flex items-center gap-1 text-sand-text">
                <CloudOff className="size-3.5" aria-hidden />
                {unsynced} saving
              </span>
            )}
          </p>
        </div>
        <div className="mt-3 h-2 w-full overflow-hidden rounded-pill bg-surface-raised">
          <motion.div
            className="h-full rounded-pill bg-lime"
            initial={false}
            animate={{ width: `${allSets.length ? (doneCount / allSets.length) * 100 : 0}%` }}
            transition={{ type: 'spring', stiffness: 200, damping: 26 }}
          />
        </div>
      </header>

      <main className="grid w-full grid-cols-1 items-start gap-4 px-4 pt-4 md:px-8 lg:grid-cols-2 lg:px-12 2xl:grid-cols-3">
        {toBlocks(exercises, session.groups).map((block, bi, blocks) => {
          const sectionOf = (b: Block) =>
            b.type === 'single' ? b.exercise.section : (b.items[0]?.exercise.section ?? 'main')
          const hasParts = exercises.some((e) => e.section !== 'main')
          const heading =
            hasParts && (bi === 0 || sectionOf(blocks[bi - 1] as Block) !== sectionOf(block)) ? (
              <h2
                key={`h-${sectionOf(block)}`}
                className="col-span-full mt-2 flex items-baseline gap-3 font-extrabold text-[12px] uppercase tracking-[0.16em] first:mt-0"
              >
                {WORKOUT_SECTION_LABELS[sectionOf(block)]}
                {sectionOf(block) === 'warm_up' && (
                  <span className="font-semibold text-[12px] text-ink-muted normal-case tracking-normal">
                    Not counted in your volume or records
                  </span>
                )}
              </h2>
            ) : null
          const card = (ex: WorkoutExerciseItem, i: number, grouped = false) => (
            <ExerciseCard
              key={ex.exerciseId}
              index={i}
              exercise={ex}
              grouped={grouped}
              sets={board[ex.exerciseId] ?? []}
              previous={session.previous[ex.exerciseId] ?? []}
              onToggle={(set) => toggle(ex, set)}
              onEdit={(set, patch) => patchSet(ex.exerciseId, set.clientUuid, patch)}
              onCommit={(set) => set.done && void pushSet(ex.exerciseId, set)}
              onAddSet={() => addSet(ex)}
              onSwap={() => {
                swap.reset()
                setSwapping(ex)
              }}
            />
          )
          if (block.type === 'single')
            return heading
              ? [heading, card(block.exercise, block.index)]
              : card(block.exercise, block.index)
          const g = block.group
          return [
            heading,
            <section
              key={`g${g.groupNumber}`}
              className="col-span-full rounded-xl bg-brand-soft p-3 md:p-4"
            >
              <div className="mb-3 flex flex-wrap items-center gap-3 px-1">
                <span className="grid size-9 place-items-center rounded-full bg-brand font-display font-extrabold text-on-brand">
                  {block.letter}
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="font-bold text-[17px] text-brand-text">
                    {GROUP_KIND_LABELS[g.kind]} · {g.rounds} {g.rounds === 1 ? 'round' : 'rounds'}
                  </h2>
                  <p className="font-semibold text-[13px] text-ink-muted">
                    {g.kind === 'interval'
                      ? `${g.workSeconds ?? 20}s work, ${g.restSeconds ?? 10}s rest, each exercise in turn`
                      : `Do them back to back, then rest ${g.restSeconds ? formatDuration(g.restSeconds) : 'as needed'}`}
                  </p>
                </div>
                {g.kind === 'interval' && (
                  <Button
                    variant="primary"
                    icon={<Timer className="size-[18px]" aria-hidden />}
                    onClick={() => setIntervals(g.groupNumber)}
                  >
                    Start timer
                  </Button>
                )}
              </div>
              <div className="grid items-start gap-3 lg:grid-cols-2 2xl:grid-cols-3">
                {block.items.map(({ exercise, index }) => card(exercise, index, true))}
              </div>
            </section>,
          ]
        })}
        {exercises.length === 0 && (
          <p className="col-span-full rounded-lg bg-surface p-6 text-center text-ink-muted">
            This workout has no exercises yet.
          </p>
        )}
        <Button
          variant="lime"
          size="lg"
          block
          className="col-span-full mt-2"
          onClick={() => setFinishing(true)}
        >
          Finish workout
        </Button>
      </main>

      <AnimatePresence>
        {rest && (
          <RestTimer
            key="rest"
            endsAt={rest.endsAt}
            total={rest.total}
            onAdjust={(s) =>
              setRest((r) =>
                r ? { ...r, endsAt: r.endsAt + s * 1000, total: Math.max(1, r.total + s) } : r,
              )
            }
            onClose={() => setRest(null)}
          />
        )}
      </AnimatePresence>

      <ConfirmDialog
        open={confirmRestart}
        title="Start this workout over?"
        confirmLabel="Yes, start over"
        loading={restart.isPending}
        onConfirm={() => restart.mutate()}
        onClose={() => {
          setConfirmRestart(false)
          restart.reset()
        }}
      >
        <p>Everything from this session is wiped and you start fresh:</p>
        <ul className="mt-3 flex flex-col gap-2 rounded-md bg-danger/10 p-4 font-semibold text-[15px] text-ink">
          <li className="flex items-center gap-2">
            <RotateCcw className="size-4 text-danger" aria-hidden />
            {doneCount === 0
              ? 'No sets logged yet'
              : `${doneCount} logged ${doneCount === 1 ? 'set is' : 'sets are'} deleted`}
          </li>
          <li className="flex items-center gap-2">
            <Timer className="size-4 text-danger" aria-hidden />
            The timer goes back to 0:00 (now <Elapsed since={session.startedAt} />)
          </li>
        </ul>
        <p className="mt-3 font-bold text-danger">This can’t be undone.</p>
        {restart.isError && (
          <p role="alert" className="mt-2 font-semibold text-danger">
            {restart.error instanceof ApiError
              ? restart.error.message
              : 'No connection. Try again in a moment.'}
          </p>
        )}
      </ConfirmDialog>

      <AnimatePresence>
        {intervals !== null &&
          (() => {
            const g = session.groups.find((x) => x.groupNumber === intervals)
            if (!g) return null
            const members = exercises.filter((e) => e.supersetGroup === intervals)
            const work = g.workSeconds ?? 20
            return (
              <IntervalTimer
                key="intervals"
                title={`${session.workoutName ?? 'Workout'} · intervals`}
                exercises={members.map((m) => m.exerciseName)}
                rounds={g.rounds}
                workSeconds={work}
                restSeconds={g.restSeconds ?? 10}
                onFinish={(n) => logIntervals(intervals, n, work)}
                onClose={() => setIntervals(null)}
              />
            )
          })()}
      </AnimatePresence>

      <SwapSheet
        exercise={swapping}
        inWorkout={exercises.map((e) => e.exerciseId)}
        logged={swapping ? loggedOn(swapping.exerciseId) : 0}
        pendingId={swap.isPending ? (swap.variables?.to ?? null) : null}
        error={
          swap.isError
            ? swap.error instanceof ApiError
              ? swap.error.message
              : 'No connection. Try again when you have signal.'
            : null
        }
        onSwap={(to) => swapping && swap.mutate({ from: swapping.exerciseId, to })}
        onClose={() => !swap.isPending && setSwapping(null)}
      />

      <StopSheet
        open={stopping}
        onClose={() => setStopping(false)}
        sessionId={session.id}
        doneCount={doneCount}
        onFinish={() => {
          setStopping(false)
          setFinishing(true)
        }}
        onCancelled={done}
      />

      <FinishSheet
        open={finishing}
        onClose={() => setFinishing(false)}
        sessionId={session.id}
        doneCount={doneCount}
        totalCount={allSets.length}
        unsynced={unsynced}
        onLogAll={logAllSets}
        onFlush={flushSets}
        onFinished={(r) => {
          clearActive()
          setFinishing(false)
          setRest(null)
          setResult(r)
        }}
        onDiscarded={done}
      />

      {result && (
        <Celebration title={session.workoutName ?? 'Workout'} result={result} onDone={done} />
      )}
    </div>
  )
}

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

type Block =
  | { type: 'single'; exercise: WorkoutExerciseItem; index: number }
  | {
      type: 'group'
      group: WorkoutGroup
      letter: string
      items: Array<{ exercise: WorkoutExerciseItem; index: number }>
    }

/** Consecutive exercises in the same group become one block; the rest stay on their own. */
function toBlocks(exercises: WorkoutExerciseItem[], groups: WorkoutGroup[]): Block[] {
  const blocks: Block[] = []
  let letter = 0
  exercises.forEach((exercise, index) => {
    const group =
      exercise.supersetGroup !== null
        ? groups.find((g) => g.groupNumber === exercise.supersetGroup)
        : undefined
    const last = blocks.at(-1)
    if (group && last?.type === 'group' && last.group.groupNumber === group.groupNumber) {
      last.items.push({ exercise, index })
    } else if (group) {
      blocks.push({
        type: 'group',
        group,
        letter: LETTERS[letter++] ?? '?',
        items: [{ exercise, index }],
      })
    } else {
      blocks.push({ type: 'single', exercise, index })
    }
  })
  return blocks
}

function ExerciseCard({
  index,
  grouped = false,
  exercise: ex,
  sets,
  previous,
  onToggle,
  onEdit,
  onCommit,
  onAddSet,
  onSwap,
}: {
  index: number
  /** Inside a superset/circuit block: flatter card, no rest line. */
  grouped?: boolean
  exercise: WorkoutExerciseItem
  sets: SetState[]
  previous: SessionDetail['previous'][number]
  onToggle: (set: SetState) => void
  onEdit: (set: SetState, patch: Partial<SetState>) => void
  onCommit: (set: SetState) => void
  onAddSet: () => void
  /** Machine taken, no equipment: pick another exercise. */
  onSwap: () => void
}) {
  const [showNote, setShowNote] = useState(false)
  const distance = ex.trackingType === 'distance_time'
  const timed = ex.trackingType === 'time' || distance
  // Cardio time is logged in minutes (a 20-minute ride), everything else in seconds.
  const inMinutes = ex.muscleGroup === 'cardio'
  // Bodyweight in this workout: reps only, even if the exercise usually has a weight.
  const repsOnly = ex.trackingType === 'reps' || ex.bodyweight
  const complete = sets.length > 0 && sets.every((s) => s.done)
  // Their own heart rate and FTP turn "Zone 2" and "90% FTP" into beats and watts.
  const me = useQuery({ ...myProfileQuery, staleTime: 10 * 60_000 }).data ?? null
  const endurance = enduranceTargets(ex, me)
  const zoneBpm = hrZoneLabel(ex.targetHrZone, me?.maxHr, me?.restingHr)
  // Cardio can also log heart rate, watts and climb from a watch or bike computer.
  const [extras, setExtras] = useState(() => sets.some((s) => s.hr || s.watts || s.climb))
  const base =
    distance && ex.targetDistanceM != null
      ? `${ex.targetSets} × ${formatKm(ex.targetDistanceM)}`
      : timed
        ? ex.targetSeconds == null
          ? `${ex.targetSets} × –`
          : ex.targetSets === 1
            ? timeLabel(ex.targetSeconds)
            : `${ex.targetSets} × ${timeLabel(ex.targetSeconds)}`
        : ex.targetRepsPerSet?.length
          ? `${repsLabel(ex)} reps${ex.bodyweight ? ' · bodyweight' : ''}`
          : `${ex.targetSets} × ${repsLabel(ex)}${repsLabel(ex) === 'max' ? ' reps' : ''}${ex.bodyweight ? ' · bodyweight' : ''}`
  // Each target stays in one piece ("145–159 bpm"), the line only breaks between them.
  const target = [base, ...endurance].map((t, i) => (
    <span key={t} className="whitespace-nowrap">
      {i > 0 && ' · '}
      {t}
    </span>
  ))
  // Progressive overload: every set hit its target (or the top of the range) last time, so suggest going heavier.
  const topReps = ex.targetRepsMax ?? ex.targetRepsMin
  const targetFor = (i: number) => ex.targetRepsPerSet?.[i] ?? topReps ?? 0
  const heaviest = Math.max(0, ...previous.map((p) => p.weightKg ?? 0))
  const goHeavier =
    !timed &&
    !repsOnly &&
    topReps !== null &&
    heaviest > 0 &&
    previous.length >= ex.targetSets &&
    previous.every((p, i) => (p.reps ?? 0) >= targetFor(i))
  const suggestion = heaviest + (heaviest >= 20 ? 2.5 : 1)
  const howTo = useExerciseHowTo(ex)
  // Only the columns this exercise logs; "Previous" only once there's a last time to show.
  const hasPrevious = previous.some((p) => previousLabel(p, timed, repsOnly) !== null)
  const fields: string[] = distance
    ? ['km', inMinutes ? 'Minutes' : 'Seconds']
    : timed
      ? [inMinutes ? 'Minutes' : 'Seconds']
      : repsOnly
        ? ['Reps']
        : ['kg', 'Reps']
  // Last time stays narrow, right next to the set number; the inputs take the rest of the row,
  // so a wide card never has an empty gap in the middle. No last time: no column at all.
  const rowColumns = {
    gridTemplateColumns: [
      '28px',
      ...(hasPrevious ? ['minmax(4.5rem,7.5rem)'] : []),
      ...fields.map(() => 'minmax(0,1fr)'),
      '48px',
    ].join(' '),
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index, 6) * 0.04 }}
      className={cn(
        'rounded-lg bg-surface p-4 transition',
        !grouped && 'shadow-card',
        complete && 'ring-2 ring-lime',
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            'tabular grid size-8 shrink-0 place-items-center rounded-full font-extrabold text-[13px]',
            complete ? 'bg-lime text-on-lime' : 'bg-brand-soft text-brand-text',
          )}
        >
          {complete ? <Check className="size-4" strokeWidth={3} aria-hidden /> : index + 1}
        </span>
        {howTo.thumbnail}
        <div className="min-w-0 flex-1">
          <h2 className="font-bold text-[18px] leading-6">{ex.exerciseName}</h2>
          {ex.swappedFrom && (
            <p className="mt-0.5 flex items-center gap-1.5 font-semibold text-[13px] text-ink-muted">
              <ArrowLeftRight className="size-3.5 shrink-0" aria-hidden />
              <span className="min-w-0 truncate">Swapped from {ex.swappedFrom.exerciseName}</span>
            </p>
          )}
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <Chip tone={MUSCLE_GROUP_TONE[ex.muscleGroup]} className="h-6 text-[12px]">
              {MUSCLE_GROUP_LABELS[ex.muscleGroup]}
            </Chip>
            <span className="font-semibold text-[13px] text-ink-muted">
              {target}
              {!grouped && (
                <span className="whitespace-nowrap">
                  {' '}
                  · rest {ex.restSeconds ? formatDuration(ex.restSeconds) : 'none'}
                </span>
              )}
            </span>
            {howTo.watchButton}
          </div>
          {goHeavier && (
            <p className="mt-2 inline-flex items-center gap-1.5 rounded-pill bg-lime/15 px-3 py-1 font-bold text-[13px] text-lime-text">
              <TrendingUp className="size-4 shrink-0" aria-hidden />
              {ex.targetRepsPerSet?.length
                ? 'Every set hit its target'
                : `${topReps} reps on every set`}{' '}
              last time. Try {suggestion} kg
            </p>
          )}
        </div>
        {!complete && (
          <IconButton
            label="Swap exercise"
            icon={<ArrowLeftRight aria-hidden />}
            size="lg"
            className="-mt-1 -mr-1 bg-transparent"
            onClick={onSwap}
          />
        )}
        {ex.notes && (
          <button
            type="button"
            aria-label="Show note"
            aria-expanded={showNote}
            onClick={() => setShowNote(!showNote)}
            className="grid size-9 place-items-center rounded-sm text-sand-text"
          >
            <StickyNote className="size-5" aria-hidden />
          </button>
        )}
      </div>
      {hrZone(ex.targetHrZone) && (
        <p className="mt-3 rounded-md bg-steel/10 p-3 text-[14px]">
          <span className="font-bold">
            Zone {ex.targetHrZone}
            {zoneBpm && ` (${zoneBpm})`}:
          </span>{' '}
          {hrZone(ex.targetHrZone)?.feel}
        </p>
      )}
      {showNote && ex.notes && (
        <p className="mt-3 rounded-md bg-sand/15 p-3 text-[14px]">{ex.notes}</p>
      )}

      <div
        style={rowColumns}
        className={cn(
          ROW_GRID,
          'mt-4 px-1 font-extrabold text-[11px] text-ink-muted uppercase tracking-[0.08em]',
        )}
      >
        <span>Set</span>
        {hasPrevious && <span className="pl-1">Last time</span>}
        {fields.map((f) => (
          <span key={f} className="text-center">
            {f}
          </span>
        ))}
        <span />
      </div>
      <ul className="mt-1 flex flex-col gap-2">
        {sets.map((s, i) => {
          const prev = previous[i]
          const prevText = previousLabel(prev, timed, repsOnly)
          const gain =
            !timed && !repsOnly && prev?.weightKg ? (toNumber(s.weight) ?? 0) - prev.weightKg : 0
          return (
            <Fragment key={s.clientUuid}>
              <li
                style={rowColumns}
                className={cn(
                  ROW_GRID,
                  'rounded-md p-1 transition-colors',
                  s.done && 'bg-surface-raised',
                )}
              >
                <span className="tabular pl-1.5 font-bold font-display text-[18px] text-ink-muted">
                  {s.setNumber}
                </span>
                {prev && prevText ? (
                  <button
                    type="button"
                    aria-label={`Use last time's numbers for set ${s.setNumber}: ${prevText}`}
                    onClick={() => {
                      const patch = {
                        weight: prev.weightKg?.toString() ?? s.weight,
                        reps: prev.reps?.toString() ?? s.reps,
                        seconds: prev.durationSeconds?.toString() ?? s.seconds,
                        distance:
                          prev.distanceM != null
                            ? String(Math.round(prev.distanceM) / 1000)
                            : s.distance,
                      }
                      navigator.vibrate?.(10)
                      onEdit(s, patch)
                      onCommit({ ...s, ...patch })
                    }}
                    className="tabular h-12 min-w-0 truncate rounded-sm px-1 text-left font-semibold text-[14px] text-ink-muted transition hover:bg-surface-raised hover:text-ink active:scale-95"
                  >
                    {prevText}
                  </button>
                ) : hasPrevious ? (
                  <span />
                ) : null}
                {distance ? (
                  <NumberCell
                    label={`Set ${s.setNumber} distance in km`}
                    decimal
                    value={s.distance ?? ''}
                    onChange={(v) => onEdit(s, { distance: v })}
                    onBlur={() => onCommit(s)}
                  />
                ) : timed ? (
                  <TimeCell set={s} minutes={inMinutes} onEdit={onEdit} onCommit={onCommit} />
                ) : repsOnly ? null : (
                  <div className="relative min-w-0">
                    <NumberCell
                      label={`Set ${s.setNumber} weight in kg`}
                      decimal
                      value={s.weight}
                      onChange={(v) => onEdit(s, { weight: v })}
                      onBlur={() => onCommit(s)}
                    />
                    <AnimatePresence>
                      {gain > 0 && (
                        <motion.span
                          key="gain"
                          initial={{ opacity: 0, scale: 0.5, y: 4 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.5 }}
                          className="tabular -top-2 pointer-events-none absolute right-1 inline-flex items-center gap-0.5 rounded-pill bg-lime px-1.5 py-px font-extrabold text-[10px] text-on-lime shadow-card"
                        >
                          <ArrowUp className="size-2.5" strokeWidth={3.5} aria-hidden />
                          {+gain.toFixed(2)} kg
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </div>
                )}
                {distance ? (
                  <TimeCell set={s} minutes={inMinutes} onEdit={onEdit} onCommit={onCommit} />
                ) : timed ? null : (
                  <NumberCell
                    label={`Set ${s.setNumber} reps`}
                    value={s.reps}
                    onChange={(v) => onEdit(s, { reps: v })}
                    onBlur={() => onCommit(s)}
                  />
                )}
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.88 }}
                  aria-pressed={s.done}
                  aria-label={s.done ? `Undo set ${s.setNumber}` : `Complete set ${s.setNumber}`}
                  onClick={() => onToggle(s)}
                  className={cn(
                    'relative grid size-12 place-items-center rounded-sm transition-colors',
                    s.done
                      ? 'bg-lime text-on-lime'
                      : 'bg-surface-raised text-ink-muted ring-[1.5px] ring-border-strong ring-inset',
                  )}
                >
                  <motion.span
                    key={s.done ? 'done' : 'todo'}
                    initial={s.done ? { scale: 0.5 } : false}
                    animate={{ scale: [0.5, 1.2, 1] }}
                    transition={{ duration: 0.4 }}
                  >
                    <Check className="size-6" strokeWidth={3} aria-hidden />
                  </motion.span>
                  {s.sync === 'failed' && (
                    <span
                      className="-top-1 -right-1 absolute size-3 rounded-full bg-sand ring-2 ring-surface"
                      title="Not saved yet"
                    />
                  )}
                </motion.button>
              </li>
              {timed && extras && (
                <li className="grid grid-cols-3 gap-1.5 pb-1 pl-9 sm:gap-2">
                  <ExtraCell
                    label="Avg HR"
                    aria={`Set ${s.setNumber} average heart rate`}
                    value={s.hr ?? ''}
                    onChange={(hr) => onEdit(s, { hr })}
                    onBlur={() => onCommit(s)}
                  />
                  <ExtraCell
                    label="Watts"
                    aria={`Set ${s.setNumber} average watts`}
                    value={s.watts ?? ''}
                    onChange={(watts) => onEdit(s, { watts })}
                    onBlur={() => onCommit(s)}
                  />
                  <ExtraCell
                    label="Climb m"
                    aria={`Set ${s.setNumber} climb in metres`}
                    value={s.climb ?? ''}
                    onChange={(climb) => onEdit(s, { climb })}
                    onBlur={() => onCommit(s)}
                  />
                </li>
              )}
            </Fragment>
          )
        })}
      </ul>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          icon={<Plus className="size-4" aria-hidden />}
          onClick={onAddSet}
        >
          Add set
        </Button>
        {timed && (
          <Button
            variant="ghost"
            size="sm"
            aria-expanded={extras}
            icon={<HeartPulse className="size-4 text-steel-text" aria-hidden />}
            onClick={() => setExtras(!extras)}
          >
            {extras ? 'Hide heart rate & power' : 'Add heart rate & power'}
          </Button>
        )}
      </div>
      {howTo.sheet}
    </motion.section>
  )
}

/** Columns come from each card's `rowColumns` (only what that exercise logs). */
const ROW_GRID = 'grid items-center gap-1.5 sm:gap-2'

/** What you did on this set last time, e.g. "40 × 10". */
const formatKm = (m: number) => `${Math.round(m) / 1000} km`

function previousLabel(
  p: PreviousSet | undefined,
  timed: boolean,
  repsOnly: boolean,
): string | null {
  if (!p) return null
  if (p.distanceM != null)
    return `${formatKm(p.distanceM)}${p.durationSeconds ? ` · ${formatDuration(p.durationSeconds)}` : ''}`
  if (timed) return p.durationSeconds !== null ? timeLabel(p.durationSeconds) : null
  if (repsOnly || p.weightKg === null) return p.reps !== null ? `${p.reps} reps` : null
  return `${p.weightKg} × ${p.reps ?? '–'}`
}

/** "20 min", "1:30", "45s". */
function timeLabel(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  return seconds % 60 === 0 ? `${seconds / 60} min` : formatDuration(seconds)
}

/** A set's time, typed in minutes for cardio (kept as seconds underneath) or in seconds. */
function TimeCell({
  set,
  minutes,
  onEdit,
  onCommit,
}: {
  set: SetState
  minutes: boolean
  onEdit: (set: SetState, patch: Partial<SetState>) => void
  onCommit: (set: SetState) => void
}) {
  const [text, setText] = useState(() => {
    const n = toNumber(set.seconds)
    return n === null ? '' : String(+(n / 60).toFixed(2))
  })
  // Filled from elsewhere (last time's numbers): show the new value.
  // biome-ignore lint/correctness/useExhaustiveDependencies: only when the stored value changes
  useEffect(() => {
    const n = toNumber(set.seconds)
    const typed = toNumber(text)
    if (n === null ? typed !== null : typed === null || Math.round(typed * 60) !== n) {
      setText(n === null ? '' : String(+(n / 60).toFixed(2)))
    }
  }, [set.seconds])
  if (!minutes) {
    return (
      <NumberCell
        label={`Set ${set.setNumber} seconds`}
        value={set.seconds}
        onChange={(v) => onEdit(set, { seconds: v })}
        onBlur={() => onCommit(set)}
      />
    )
  }
  return (
    <NumberCell
      label={`Set ${set.setNumber} minutes`}
      decimal
      value={text}
      onChange={(v) => {
        setText(v)
        const n = toNumber(v)
        onEdit(set, { seconds: n === null ? '' : String(Math.round(n * 60)) })
      }}
      onBlur={() => onCommit(set)}
    />
  )
}

/** A small optional box under a cardio set (heart rate, watts, climb), with its label inside. */
function ExtraCell({
  label,
  aria,
  value,
  onChange,
  onBlur,
}: {
  label: string
  aria: string
  value: string
  onChange: (value: string) => void
  onBlur: () => void
}) {
  // The label sits inside the box on the left, so each small box says what it is.
  return (
    <span className="relative block min-w-0">
      <span
        aria-hidden
        className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-2.5 font-extrabold text-[10px] text-ink-muted uppercase tracking-[0.06em]"
      >
        {label}
      </span>
      <Input
        aria-label={aria}
        inputMode="numeric"
        value={value}
        placeholder="–"
        onFocus={(e) => e.target.select()}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, ''))}
        onBlur={onBlur}
        className="tabular pr-2.5 pl-16 text-right font-bold font-display text-[17px] ring-border"
      />
    </span>
  )
}

function NumberCell({
  label,
  value,
  decimal = false,
  onChange,
  onBlur,
}: {
  label: string
  value: string
  decimal?: boolean
  onChange: (value: string) => void
  onBlur: () => void
}) {
  return (
    <Input
      aria-label={label}
      inputMode={decimal ? 'decimal' : 'numeric'}
      value={value}
      placeholder="–"
      onFocus={(e) => e.target.select()}
      onChange={(e) => onChange(e.target.value.replace(',', '.').replace(/[^\d.]/g, ''))}
      onBlur={onBlur}
      className="tabular h-12 px-0 text-center font-bold font-display text-[22px] ring-border"
    />
  )
}

/**
 * Stop: finish with what's been logged, or cancel a workout started by accident. A cancelled
 * workout leaves the client's history and calendar alone; their coach still sees it.
 */
function StopSheet({
  open,
  onClose,
  sessionId,
  doneCount,
  onFinish,
  onCancelled,
}: {
  open: boolean
  onClose: () => void
  sessionId: number
  doneCount: number
  onFinish: () => void
  onCancelled: () => void
}) {
  const [sure, setSure] = useState(false)
  const cancel = useMutation({
    mutationFn: () => api(`/sessions/${sessionId}/cancel`, { method: 'POST' }),
    onSuccess: onCancelled,
  })
  const close = () => {
    setSure(false)
    cancel.reset()
    onClose()
  }
  return (
    <Sheet open={open} onClose={close} label="Stop workout">
      <div className="flex flex-col gap-4 pb-4">
        <h2 className="font-display font-extrabold text-[26px]">Stop this workout?</h2>
        {doneCount > 0 && (
          <Button variant="lime" size="lg" block onClick={onFinish}>
            Finish with what I did ({doneCount} {doneCount === 1 ? 'set' : 'sets'})
          </Button>
        )}
        {sure ? (
          <div className="flex flex-col gap-3 rounded-lg bg-danger/10 p-4">
            <p className="font-semibold text-[15px]">
              It won’t count and won’t show in your history.
              {doneCount > 0 &&
                ` The ${doneCount} ${doneCount === 1 ? 'set' : 'sets'} you logged won’t count either.`}{' '}
              Your coach can still see you started it.
            </p>
            {cancel.isError && (
              <p role="alert" className="font-semibold text-[14px] text-danger">
                {cancel.error instanceof ApiError
                  ? cancel.error.message
                  : 'No connection. Try again in a moment.'}
              </p>
            )}
            <Button
              variant="danger"
              size="lg"
              block
              loading={cancel.isPending}
              onClick={() => cancel.mutate()}
            >
              Yes, cancel it
            </Button>
          </div>
        ) : (
          <Button
            variant={doneCount > 0 ? 'ghost' : 'danger'}
            size="lg"
            block
            className={
              doneCount > 0 ? 'text-danger hover:bg-danger/10 hover:text-danger' : undefined
            }
            onClick={() => setSure(true)}
          >
            Cancel this workout
          </Button>
        )}
        <Button variant="ghost" block onClick={close}>
          Keep going
        </Button>
      </div>
    </Sheet>
  )
}

function FinishSheet({
  open,
  onClose,
  sessionId,
  doneCount,
  totalCount,
  unsynced,
  onLogAll,
  onFlush,
  onFinished,
  onDiscarded,
}: {
  open: boolean
  onClose: () => void
  sessionId: number
  doneCount: number
  totalCount: number
  unsynced: number
  onLogAll: () => Promise<void>
  onFlush: () => Promise<void>
  onFinished: (result: FinishResult) => void
  onDiscarded: () => void
}) {
  const [feeling, setFeeling] = useState<number | null>(null)
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string>()
  const finish = useMutation({
    mutationFn: (status: 'completed') =>
      api<FinishResult>(`/sessions/${sessionId}/finish`, {
        method: 'POST',
        body: { status, feeling, notes: notes.trim() || null },
      }),
  })
  const cancel = useMutation({
    mutationFn: () => api(`/sessions/${sessionId}/cancel`, { method: 'POST' }),
    onSuccess: onDiscarded,
    onError: (err) =>
      setError(err instanceof ApiError ? err.message : 'No connection. Try again in a moment.'),
  })

  const [loggingAll, setLoggingAll] = useState(false)

  async function submit(status: 'completed') {
    setError(undefined)
    try {
      // Nothing ticked yet: log the sets as filled in, then finish.
      if (status === 'completed' && doneCount === 0) {
        setLoggingAll(true)
        await onLogAll()
      }
      // Sets still saving (or that failed on bad signal) go up before the workout is closed.
      if (status === 'completed') {
        setLoggingAll(true)
        await onFlush()
      }
      setLoggingAll(false)
      onFinished(await finish.mutateAsync(status))
    } catch (err) {
      setLoggingAll(false)
      setError(err instanceof ApiError ? err.message : 'No connection. Try again in a moment.')
    }
  }

  return (
    <Sheet open={open} onClose={onClose} label="Finish workout">
      <div className="flex flex-col gap-5 pb-4">
        <h2 className="font-display font-extrabold text-[26px]">How did that feel?</h2>
        <FeelingPicker value={feeling} onChange={setFeeling} />
        <Textarea
          aria-label="Notes"
          placeholder="Notes (optional): energy, sleep, anything that hurt"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
        {unsynced > 0 && (
          <p className="rounded-md bg-sand/20 p-3 font-semibold text-[14px]">
            {unsynced} {unsynced === 1 ? 'set is' : 'sets are'} still saving. Finishing now may
            leave {unsynced === 1 ? 'it' : 'them'} out.
          </p>
        )}
        {error && (
          <p role="alert" className="font-semibold text-[14px] text-danger">
            {error}
          </p>
        )}
        <Button
          variant="lime"
          size="lg"
          block
          disabled={totalCount === 0}
          loading={loggingAll || finish.isPending}
          onClick={() => submit('completed')}
        >
          {doneCount === 0 ? 'Log all sets and finish' : 'Finish workout'}
        </Button>
        {doneCount === 0 && totalCount > 0 && (
          <p className="-mt-2 text-center font-semibold text-[13px] text-ink-muted">
            No sets ticked yet, so every set will be saved with the numbers shown.
          </p>
        )}
        {doneCount > 0 && doneCount < totalCount && (
          <p className="-mt-2 text-center font-semibold text-[13px] text-ink-muted">
            {totalCount - doneCount} unticked {totalCount - doneCount === 1 ? 'set' : 'sets'} won’t
            be saved.
          </p>
        )}
        <Button
          variant="ghost"
          block
          className="text-danger hover:bg-danger/10 hover:text-danger"
          loading={cancel.isPending}
          onClick={() => cancel.mutate()}
        >
          Cancel this workout
        </Button>
      </div>
    </Sheet>
  )
}

/** Keeps the screen on during a workout (where the browser supports it). */
function useWakeLock() {
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null
    const request = async () => {
      try {
        const nav = navigator as Navigator & {
          wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> }
        }
        lock = (await nav.wakeLock?.request('screen')) ?? null
      } catch {
        // Not supported or denied: the screen just follows normal sleep.
      }
    }
    void request()
    const onVisible = () => document.visibilityState === 'visible' && void request()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      void lock?.release()
    }
  }, [])
}

// The phone's workout "board": what's typed into every set, kept on the device while the
// workout runs and sent to the server set by set. Pure logic, so it can be tested.
import type { SessionDetail, WorkoutExerciseItem } from './types'

export interface SetState {
  clientUuid: string
  setNumber: number
  weight: string
  reps: string
  seconds: string
  /** Kilometres, for distance + time exercises. */
  distance?: string
  done: boolean
  sync: 'idle' | 'saving' | 'failed'
}

/** Every exercise's sets, by exercise id. */
export type Board = Record<number, SetState[]>

/** Each exercise once, in workout order (a workout may list one twice). */
export function uniqueExercises(items: WorkoutExerciseItem[]) {
  const seen = new Set<number>()
  return items.filter((e) => {
    if (seen.has(e.exerciseId)) return false
    seen.add(e.exerciseId)
    return true
  })
}

/** Pre-fill every set from what's logged, then last time, then the targets. */
export function buildBoard(session: SessionDetail): Board {
  const board: Board = {}
  for (const ex of uniqueExercises(session.exercises)) {
    // Warm-up exercises log warm-up sets; everything else logs working sets.
    const warmUp = ex.section === 'warm_up'
    const logged = session.sets.filter(
      (s) => s.exerciseId === ex.exerciseId && s.isWarmup === warmUp,
    )
    const prev = session.previous[ex.exerciseId] ?? []
    const count = Math.max(ex.targetSets, logged.length, 1)
    board[ex.exerciseId] = Array.from({ length: count }, (_, i) => {
      const n = i + 1
      const l = logged.find((s) => s.setNumber === n)
      const p = prev[i] ?? prev.at(-1)
      // Per-set targets (12, 10, 10, 8) beat last time's reps; a range doesn't.
      const reps =
        l?.reps ?? ex.targetRepsPerSet?.[i] ?? p?.reps ?? ex.targetRepsMax ?? ex.targetRepsMin
      const seconds = l?.durationSeconds ?? p?.durationSeconds ?? ex.targetSeconds
      const metres = l?.distanceM ?? p?.distanceM ?? ex.targetDistanceM
      return {
        clientUuid: l?.clientUuid ?? crypto.randomUUID(),
        setNumber: n,
        weight: ex.bodyweight ? '' : ((l?.weightKg ?? p?.weightKg)?.toString() ?? ''),
        reps: reps?.toString() ?? '',
        seconds: seconds?.toString() ?? '',
        distance: metres != null ? String(Math.round(metres) / 1000) : '',
        done: Boolean(l),
        sync: 'idle',
      }
    })
  }
  return board
}

/** "42.5" -> 42.5; anything that isn't a number -> null. */
export function toNumber(v: string): number | null {
  const n = Number.parseFloat(v)
  return Number.isFinite(n) ? n : null
}

export function toInt(v: string): number | null {
  const n = Number.parseInt(v, 10)
  return Number.isFinite(n) ? n : null
}

/** What `PUT /sessions/:id/sets` is sent for one ticked set. */
export function setPayload(exerciseId: number, set: SetState, isWarmup: boolean) {
  const km = toNumber(set.distance ?? '')
  return {
    clientUuid: set.clientUuid,
    exerciseId,
    setNumber: set.setNumber,
    // Warm-ups don't count towards volume or records.
    isWarmup,
    weightKg: toNumber(set.weight),
    reps: toInt(set.reps),
    durationSeconds: toInt(set.seconds),
    distanceM: km !== null ? Math.round(km * 1000) : null,
  }
}

/** Ticked sets whose save failed (poor signal): the ones to send again. */
export function failedSets(board: Board): Array<{ exerciseId: number; set: SetState }> {
  return Object.entries(board).flatMap(([exerciseId, sets]) =>
    sets
      .filter((s) => s.done && s.sync === 'failed')
      .map((set) => ({ exerciseId: Number(exerciseId), set })),
  )
}

/**
 * A board read back from the device after the app was closed: a save that was on its way when
 * it closed never finished, so it counts as failed and is sent again.
 */
export function reviveBoard(board: Board): Board {
  return Object.fromEntries(
    Object.entries(board).map(([exerciseId, sets]) => [
      exerciseId,
      sets.map((s) => (s.sync === 'saving' ? { ...s, sync: 'failed' as const } : s)),
    ]),
  )
}

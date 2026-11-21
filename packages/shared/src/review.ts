// A coach's read of one session: per exercise, what was planned next to what was done.
import { formatPacePerKm } from './endurance'
import type { TrackingType } from './enums'
import { formatDuration, formatWeight, repsLabel } from './format'
import type { LoggedSet, PreviousSet, SessionDetail, WorkoutExerciseItem } from './types'

type SetValues = Pick<LoggedSet, 'weightKg' | 'reps' | 'durationSeconds' | 'distanceM'> &
  Partial<Pick<LoggedSet, 'avgHr' | 'avgWatts' | 'elevationM'>>

const km = (m: number) => `${formatWeight(m / 1000)} km`

/**
 * What a logged set was: "60 kg × 8", "12 reps", "0:45", "5 km · 26:00 · 5:12 /km · 148 bpm".
 * Cardio adds the pace and whatever came from a watch or bike computer.
 */
export function setResultLabel(set: SetValues, trackingType: TrackingType): string {
  if (trackingType === 'time' || trackingType === 'distance_time') {
    const distance = trackingType === 'distance_time'
    const pace =
      distance && set.distanceM && set.durationSeconds
        ? formatPacePerKm(set.durationSeconds / (set.distanceM / 1000))
        : null
    const parts = [
      distance && set.distanceM ? km(set.distanceM) : null,
      set.durationSeconds ? formatDuration(set.durationSeconds) : null,
      pace,
      set.avgHr ? `${set.avgHr} bpm` : null,
      set.avgWatts ? `${set.avgWatts} W` : null,
      set.elevationM ? `↑ ${set.elevationM} m` : null,
    ].filter(Boolean)
    return parts.length ? parts.join(' · ') : '–'
  }
  const reps = set.reps ?? 0
  if (trackingType === 'weight_reps' && set.weightKg)
    return `${formatWeight(set.weightKg)} kg × ${reps}`
  return `${reps} ${reps === 1 ? 'rep' : 'reps'}`
}

/** What set `setNumber` asked for: "8–10 reps", "12 reps", "0:45", "2 km". */
export function setTargetLabel(item: WorkoutExerciseItem, setNumber: number): string {
  if (item.trackingType === 'time')
    return item.targetSeconds ? formatDuration(item.targetSeconds) : '–'
  if (item.trackingType === 'distance_time')
    return item.targetDistanceM ? km(item.targetDistanceM) : '–'
  const perSet = item.targetRepsPerSet?.[setNumber - 1]
  const reps = perSet != null ? String(perSet) : repsLabel(item)
  return reps === 'max' ? 'Max reps' : `${reps} reps`
}

export interface ReviewRow {
  setNumber: number
  /** Null for sets done beyond what was planned. */
  target: string | null
  /** Null for planned sets not done. */
  done: string | null
}

export interface ExerciseReview {
  item: WorkoutExerciseItem
  rows: ReviewRow[]
  warmups: string[]
  doneSets: number
  /** Heavier (or more reps at the same weight, or longer/further) than last time. */
  improved: boolean
  /** Last time's best working set, e.g. "57.5 kg × 8". */
  lastTime: string | null
}

/** Size of a set for "better than last time": weight first, then reps, time or distance. */
function score(set: SetValues, trackingType: TrackingType): [number, number] {
  if (trackingType === 'weight_reps') return [set.weightKg ?? 0, set.reps ?? 0]
  if (trackingType === 'reps') return [set.reps ?? 0, 0]
  if (trackingType === 'time') return [set.durationSeconds ?? 0, 0]
  return [set.distanceM ?? 0, -(set.durationSeconds ?? 0)]
}

function best<T extends SetValues>(sets: T[], trackingType: TrackingType): T | null {
  let top: T | null = null
  for (const s of sets) {
    if (!top) {
      top = s
      continue
    }
    const [a1, a2] = score(s, trackingType)
    const [b1, b2] = score(top, trackingType)
    if (a1 > b1 || (a1 === b1 && a2 > b2)) top = s
  }
  return top
}

/** Each prescribed exercise in order, its sets lined up against the plan, then anything extra. */
export function reviewSession(session: SessionDetail): ExerciseReview[] {
  const byExercise = new Map<number, LoggedSet[]>()
  for (const s of session.sets) {
    const list = byExercise.get(s.exerciseId) ?? []
    list.push(s)
    byExercise.set(s.exerciseId, list)
  }
  const reviews: ExerciseReview[] = session.exercises.map((item) =>
    review(item, byExercise.get(item.exerciseId) ?? [], session.previous[item.exerciseId] ?? []),
  )
  // Sets logged for exercises that weren't in the plan (older sessions, edited workouts).
  const planned = new Set(session.exercises.map((e) => e.exerciseId))
  for (const [exerciseId, sets] of byExercise) {
    if (planned.has(exerciseId)) continue
    const first = sets[0]
    if (!first) continue
    const trackingType: TrackingType =
      first.weightKg != null
        ? 'weight_reps'
        : first.distanceM != null
          ? 'distance_time'
          : first.durationSeconds != null
            ? 'time'
            : 'reps'
    reviews.push(
      review(
        {
          exerciseId,
          exerciseName: first.exerciseName,
          muscleGroup: 'full_body',
          trackingType,
          instructions: null,
          imageKey: null,
          videoUrl: null,
          targetSets: 0,
          targetRepsMin: null,
          targetRepsMax: null,
          targetRepsPerSet: null,
          bodyweight: false,
          targetSeconds: null,
          restSeconds: 0,
          section: 'main',
          targetDistanceM: null,
          targetPaceSeconds: null,
          targetHrZone: null,
          supersetGroup: null,
          notes: null,
        },
        sets,
        session.previous[exerciseId] ?? [],
      ),
    )
  }
  return reviews
}

function review(
  item: WorkoutExerciseItem,
  logged: LoggedSet[],
  previous: PreviousSet[],
): ExerciseReview {
  const type = item.trackingType
  const working = logged.filter((s) => !s.isWarmup).sort((a, b) => a.setNumber - b.setNumber)
  const doneBy = new Map(working.map((s) => [s.setNumber, s]))
  const count = Math.max(item.targetSets, ...working.map((s) => s.setNumber), 0)
  const rows: ReviewRow[] = []
  for (let n = 1; n <= count; n++) {
    const done = doneBy.get(n)
    rows.push({
      setNumber: n,
      target: n <= item.targetSets ? setTargetLabel(item, n) : null,
      done: done ? setResultLabel(done, type) : null,
    })
  }
  const now = best(working, type)
  const before = best(previous, type)
  let improved = false
  if (now && before) {
    const [a1, a2] = score(now, type)
    const [b1, b2] = score(before, type)
    improved = a1 > b1 || (a1 === b1 && a2 > b2)
  }
  return {
    item,
    rows,
    warmups: logged.filter((s) => s.isWarmup).map((s) => setResultLabel(s, type)),
    doneSets: working.length,
    improved,
    lastTime: before ? setResultLabel(before, type) : null,
  }
}

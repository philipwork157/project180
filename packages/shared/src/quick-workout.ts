// Quick workout: someone builds their own workout in the app and starts it straight away.
// These helpers keep the builder's targets sensible and name the result.
import { type GroupKind, MUSCLE_GROUP_LABELS, type MuscleGroup, type TrackingType } from './enums'
import type { WorkoutExerciseItem, WorkoutGroup } from './types'
import type { WorkoutExerciseInput, WorkoutGroupInput } from './validators'

/** One exercise's targets in the builder: what is sent to POST /sessions/quick. */
export type QuickTarget = WorkoutExerciseInput & { targetSets: number }

export const QUICK_MAX_EXERCISES = 40
export const QUICK_MAX_SETS = 20
export const QUICK_MAX_REPS = 200
export const QUICK_MIN_SECONDS = 5
export const QUICK_MAX_SECONDS = 7200
export const QUICK_MAX_MINUTES = QUICK_MAX_SECONDS / 60

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(n)))

/** Cardio (treadmill, bike, rower) is timed in minutes; holds like a plank in seconds. */
export function quickUsesMinutes(
  muscleGroup: MuscleGroup,
  trackingType: TrackingType,
  seconds?: number | null,
): boolean {
  if (trackingType === 'distance_time' || muscleGroup === 'cardio') return true
  return (seconds ?? 0) >= 300
}

/** Starting targets for a newly added exercise, by how it's logged. */
export function newQuickTarget(
  exerciseId: number,
  trackingType: TrackingType,
  muscleGroup?: MuscleGroup,
): QuickTarget {
  const cardio = muscleGroup === 'cardio'
  switch (trackingType) {
    case 'time':
      return cardio
        ? { exerciseId, targetSets: 1, targetSeconds: 20 * 60, restSeconds: 60 }
        : { exerciseId, targetSets: 3, targetSeconds: 30, restSeconds: 45 }
    case 'distance_time':
      return { exerciseId, targetSets: 1, targetSeconds: 20 * 60, restSeconds: 60 }
    case 'reps':
      return { exerciseId, targetSets: 3, targetRepsMin: 12, targetRepsMax: 12, restSeconds: 60 }
    default:
      return { exerciseId, targetSets: 3, targetRepsMin: 10, targetRepsMax: 10, restSeconds: 90 }
  }
}

/** A workout's exercise as builder targets: everything the coach set is kept. */
export function quickTargetFrom(item: WorkoutExerciseItem): QuickTarget {
  return {
    exerciseId: item.exerciseId,
    targetSets: item.targetSets,
    targetRepsMin: item.targetRepsMin,
    targetRepsMax: item.targetRepsMax,
    targetRepsPerSet: item.targetRepsPerSet,
    bodyweight: item.bodyweight,
    targetSeconds: item.targetSeconds,
    restSeconds: item.restSeconds,
    section: item.section,
    targetDistanceM: item.targetDistanceM,
    targetPaceSeconds: item.targetPaceSeconds,
    targetHrZone: item.targetHrZone,
    targetPowerPct: item.targetPowerPct ?? null,
    targetCadence: item.targetCadence ?? null,
    targetRpe: item.targetRpe ?? null,
    targetElevationM: item.targetElevationM ?? null,
    supersetGroup: item.supersetGroup,
    notes: item.notes,
  }
}

/** Change the number of sets. Per-set reps grow (repeating the last) or shrink with it. */
export function withQuickSets(t: QuickTarget, sets: number): QuickTarget {
  const n = clamp(sets, 1, QUICK_MAX_SETS)
  const perSet = t.targetRepsPerSet
  if (!perSet?.length) return { ...t, targetSets: n }
  const last = perSet.at(-1) ?? 10
  const next = Array.from({ length: n }, (_, i) => perSet[i] ?? last)
  return {
    ...t,
    targetSets: n,
    targetRepsPerSet: next,
    targetRepsMin: Math.min(...next),
    targetRepsMax: Math.max(...next),
  }
}

/** The reps the builder shows: the top of a range or per-set list, else 10. */
export function quickReps(t: QuickTarget): number {
  return t.targetRepsMax ?? t.targetRepsMin ?? t.targetRepsPerSet?.at(0) ?? 10
}

/** Set one number of reps for every set (a range or per-set list becomes that number). */
export function withQuickReps(t: QuickTarget, reps: number): QuickTarget {
  const n = clamp(reps, 1, QUICK_MAX_REPS)
  return { ...t, targetRepsMin: n, targetRepsMax: n, targetRepsPerSet: null }
}

/** Seconds per set for timed exercises. */
export function withQuickSeconds(t: QuickTarget, seconds: number): QuickTarget {
  return { ...t, targetSeconds: clamp(seconds, QUICK_MIN_SECONDS, QUICK_MAX_SECONDS) }
}

/** Kilometres for distance targets (0 = none). */
export function withQuickDistance(t: QuickTarget, km: number): QuickTarget {
  const m = Math.round(Math.min(1000, Math.max(0, km)) * 1000)
  return { ...t, targetDistanceM: m > 0 ? m : null }
}

/** Rest after each set (or, in a group, see QuickGroup.restSeconds). */
export function withQuickRest(t: QuickTarget, seconds: number): QuickTarget {
  return { ...t, restSeconds: clamp(seconds, 0, 900) }
}

/**
 * Roughly how long it takes: each set's work (40 s, or its target time) plus rest. Grouped
 * exercises count once per round, with the group's rest after each round (intervals: after
 * each exercise).
 */
export function estimateQuickMinutes(
  targets: Array<{
    targetSets: number
    targetSeconds?: number | null
    restSeconds?: number
    supersetGroup?: number | null
  }>,
  groups: Array<
    Pick<WorkoutGroupInput, 'groupNumber' | 'kind' | 'rounds'> & {
      workSeconds?: number | null
      restSeconds?: number | null
    }
  > = [],
): number {
  let seconds = 0
  const counted = new Set<number>()
  for (const t of targets) {
    const g = t.supersetGroup != null ? groups.find((x) => x.groupNumber === t.supersetGroup) : null
    if (!g || t.supersetGroup == null) {
      seconds += t.targetSets * ((t.targetSeconds ?? 40) + (t.restSeconds ?? 90))
      continue
    }
    if (counted.has(g.groupNumber)) continue
    counted.add(g.groupNumber)
    const members = targets.filter((x) => x.supersetGroup === g.groupNumber)
    const interval = g.kind === 'interval'
    const work = members.reduce(
      (a, x) => a + (interval ? (g.workSeconds ?? 20) : (x.targetSeconds ?? 40)),
      0,
    )
    const rest = interval ? members.length * (g.restSeconds ?? 10) : (g.restSeconds ?? 90)
    seconds += (g.rounds ?? 3) * (work + rest)
  }
  return Math.max(1, Math.round(seconds / 60))
}

// --- Order and groups (superset, circuit, intervals) ---

/** How a group of linked exercises is done. */
export interface QuickGroup {
  kind: GroupKind
  rounds: number
  /** Intervals: seconds of work per exercise. */
  workSeconds: number | null
  /** Superset/circuit: rest after each round. Intervals: rest after each exercise. */
  restSeconds: number | null
}
export type QuickGroups = Record<number, QuickGroup>

/** Anything in the builder's list: it carries its targets (supersetGroup marks its group). */
export interface QuickRowLike {
  target: QuickTarget
}

export interface QuickState<T extends QuickRowLike> {
  items: T[]
  groups: QuickGroups
}

const groupOf = (r: QuickRowLike) => r.target.supersetGroup ?? null
const withGroup = <T extends QuickRowLike>(r: T, g: number | null): T => ({
  ...r,
  target: { ...r.target, supersetGroup: g },
})

function defaultGroup(first: QuickTarget, size: number): QuickGroup {
  return {
    kind: size >= 3 ? 'circuit' : 'superset',
    rounds: first.targetSets || 3,
    workSeconds: null,
    restSeconds: 90,
  }
}

/**
 * Groups are runs of neighbours: after a move or removal, each unbroken run of two or more
 * keeps (a copy of) its settings and is numbered 1, 2, 3… from the top; a lone one is ungrouped.
 */
export function normalizeQuick<T extends QuickRowLike>(s: QuickState<T>): QuickState<T> {
  const runs: Array<{ from: number; to: number; old: number }> = []
  s.items.forEach((r, i) => {
    const g = groupOf(r)
    const last = runs.at(-1)
    if (g === null) return
    if (last && last.old === g && last.to === i - 1) last.to = i
    else runs.push({ from: i, to: i, old: g })
  })
  const groups: QuickGroups = {}
  const next = s.items.map((r) => withGroup(r, null))
  let n = 0
  for (const run of runs) {
    if (run.to === run.from) continue
    n += 1
    const first = s.items[run.from] as T
    const size = run.to - run.from + 1
    const settings = { ...(s.groups[run.old] ?? defaultGroup(first.target, size)) }
    // A superset is two exercises; three or more done in turn is a circuit.
    if (settings.kind === 'superset' && size >= 3) settings.kind = 'circuit'
    groups[n] = settings
    for (let i = run.from; i <= run.to; i++) next[i] = withGroup(next[i] as T, n)
  }
  return { items: next, groups }
}

/**
 * After an exercise lands at `index` (dragged or moved): it stays in its group if a neighbour
 * is in it, joins a group it was dropped into the middle of, and otherwise goes solo.
 */
export function settleQuick<T extends QuickRowLike>(
  s: QuickState<T>,
  index: number,
): QuickState<T> {
  const moved = s.items[index]
  if (!moved) return normalizeQuick(s)
  const above = s.items[index - 1]
  const below = s.items[index + 1]
  const own = groupOf(moved)
  const keep =
    own !== null && ((above && groupOf(above) === own) || (below && groupOf(below) === own))
  const join = above && below && groupOf(above) !== null && groupOf(above) === groupOf(below)
  const g = keep ? own : join ? groupOf(above as T) : null
  const items = s.items.map((r, i) => (i === index ? withGroup(r, g) : r))
  return normalizeQuick({ ...s, items })
}

/** Move one exercise to a new place (a group it leaves or lands inside is tidied up). */
export function moveQuick<T extends QuickRowLike>(
  s: QuickState<T>,
  from: number,
  to: number,
): QuickState<T> {
  const items = [...s.items]
  const [moved] = items.splice(from, 1)
  if (!moved) return s
  const at = Math.max(0, Math.min(items.length, to))
  items.splice(at, 0, moved)
  return settleQuick({ ...s, items }, at)
}

/** Do exercise i and the next back to back (joins a group either is in). */
export function linkQuickNext<T extends QuickRowLike>(s: QuickState<T>, i: number): QuickState<T> {
  const a = s.items[i]
  const b = s.items[i + 1]
  if (!a || !b) return s
  const used = Object.keys(s.groups).map(Number)
  const target = groupOf(a) ?? groupOf(b) ?? Math.max(0, ...used) + 1
  const groups = { ...s.groups }
  const merge = groupOf(b) !== null && groupOf(b) !== target ? groupOf(b) : null
  const items = s.items.map((r, j) =>
    j === i || j === i + 1 || (merge !== null && groupOf(r) === merge) ? withGroup(r, target) : r,
  )
  if (!groups[target]) {
    const size = items.filter((r) => groupOf(r) === target).length
    groups[target] = defaultGroup(a.target, size)
  }
  return normalizeQuick({ items, groups })
}

/** Split a group between exercise i and the one after it. */
export function unlinkQuickNext<T extends QuickRowLike>(
  s: QuickState<T>,
  i: number,
): QuickState<T> {
  const g = s.items[i] ? groupOf(s.items[i]) : null
  if (g === null) return s
  const fresh = Math.max(0, ...Object.keys(s.groups).map(Number)) + 1
  const items = s.items.map((r, j) => (j > i && groupOf(r) === g ? withGroup(r, fresh) : r))
  return normalizeQuick({
    items,
    groups: { ...s.groups, [fresh]: { ...(s.groups[g] as QuickGroup) } },
  })
}

export function ungroupQuick<T extends QuickRowLike>(s: QuickState<T>, n: number): QuickState<T> {
  return normalizeQuick({
    ...s,
    items: s.items.map((r) => (groupOf(r) === n ? withGroup(r, null) : r)),
  })
}

export function updateQuickGroup<T extends QuickRowLike>(
  s: QuickState<T>,
  n: number,
  patch: Partial<QuickGroup>,
): QuickState<T> {
  const g = s.groups[n]
  if (!g) return s
  const next: QuickGroup = { ...g, ...patch }
  // Switching to intervals: short rests (Tabata is 20 s on, 10 s off) and more rounds.
  if (patch.kind === 'interval' && g.kind !== 'interval') {
    next.workSeconds = patch.workSeconds ?? g.workSeconds ?? 20
    next.restSeconds = patch.restSeconds ?? ((g.restSeconds ?? 0) <= 60 ? g.restSeconds : 10)
    next.rounds = patch.rounds ?? Math.max(g.rounds, 8)
  }
  if (patch.kind && patch.kind !== 'interval' && g.kind === 'interval')
    next.restSeconds = patch.restSeconds ?? 90
  next.rounds = clamp(next.rounds, 1, QUICK_MAX_SETS)
  if (next.kind === 'interval') {
    next.workSeconds = clamp(next.workSeconds ?? 20, 5, 3600)
    next.restSeconds = clamp(next.restSeconds ?? 10, 0, 3600)
  } else {
    next.workSeconds = null
    next.restSeconds = clamp(next.restSeconds ?? 90, 0, 3600)
  }
  return { ...s, groups: { ...s.groups, [n]: next } }
}

/** A workout's groups, in the builder's shape. */
export function quickGroupsFrom(groups: WorkoutGroup[]): QuickGroups {
  return Object.fromEntries(
    groups.map((g) => [
      g.groupNumber,
      { kind: g.kind, rounds: g.rounds, workSeconds: g.workSeconds, restSeconds: g.restSeconds },
    ]),
  )
}

/**
 * What's sent to start it: in a group every exercise is done once per round (intervals also
 * use the group's work time), so sets follow the rounds.
 */
export function quickPayload<T extends QuickRowLike>(
  s: QuickState<T>,
): { exercises: QuickTarget[]; groups: WorkoutGroupInput[] } {
  const tidy = normalizeQuick(s)
  return {
    exercises: tidy.items.map(({ target: t }) => {
      const g = t.supersetGroup != null ? tidy.groups[t.supersetGroup] : undefined
      if (!g) return { ...t, supersetGroup: null }
      const sized = withQuickSets(t, g.rounds)
      return g.kind === 'interval' ? { ...sized, targetSeconds: g.workSeconds ?? 20 } : sized
    }),
    groups: Object.entries(tidy.groups).map(([n, g]) => ({
      groupNumber: Number(n),
      kind: g.kind,
      rounds: g.rounds,
      workSeconds: g.kind === 'interval' ? (g.workSeconds ?? 20) : null,
      restSeconds: g.restSeconds,
    })),
  }
}

/**
 * The name it's saved under, so the coach can tell it apart from programmed workouts:
 * "Quick · Leg Day A" when started from a workout, else the main muscle groups worked
 * ("Quick · Legs & Glutes"), or just "Quick workout".
 */
export function quickWorkoutName(muscleGroups: MuscleGroup[], sourceName?: string | null) {
  if (sourceName?.trim()) return `Quick · ${sourceName.trim()}`.slice(0, 80)
  const counts = new Map<MuscleGroup, number>()
  for (const g of muscleGroups) counts.set(g, (counts.get(g) ?? 0) + 1)
  const top = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([g]) => MUSCLE_GROUP_LABELS[g])
  return top.length ? `Quick · ${top.join(' & ')}` : 'Quick workout'
}

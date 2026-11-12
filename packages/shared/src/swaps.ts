// Swapping an exercise mid-workout: what to suggest first.
import type { MuscleGroup, TrackingType } from './enums'
import { matchesExercise } from './format'
import type { ExerciseSwap, SwapCandidate, SwapOptions } from './types'

/** Most alternatives a coach can set for one exercise. */
export const MAX_ALTERNATIVES = 10

export interface SwapSections {
  /** Picked by the coach, in their order. */
  coach: SwapCandidate[]
  /** What this person swapped it for before (and isn't already a coach pick). */
  mine: SwapCandidate[]
  /** Same muscle group, logged the same way first. */
  similar: SwapCandidate[]
}

/**
 * What the swap sheet shows before anything is typed. Never the exercise itself, nor one
 * that's already in the workout (`exclude`), nor the same exercise twice across sections.
 */
export function swapSuggestions(
  current: { exerciseId: number; muscleGroup: MuscleGroup; trackingType: TrackingType },
  options: SwapOptions,
  { exclude = [], forExerciseId = current.exerciseId, similarLimit = 6 } = {} as {
    exclude?: number[]
    /** Whose alternatives to show: the exercise the workout asked for, if it was swapped. */
    forExerciseId?: number
    similarLimit?: number
  },
): SwapSections {
  const byId = new Map(options.exercises.map((e) => [e.id, e]))
  const used = new Set([current.exerciseId, ...exclude])
  const take = (ids: number[] | undefined) => {
    const out: SwapCandidate[] = []
    for (const id of ids ?? []) {
      const e = byId.get(id)
      if (!e || used.has(id)) continue
      used.add(id)
      out.push(e)
    }
    return out
  }
  const coach = take(options.coach[forExerciseId])
  const mine = take(options.mine[forExerciseId])
  const score = (e: SwapCandidate) => (e.trackingType === current.trackingType ? 1 : 0)
  const similar = options.exercises
    .filter((e) => e.muscleGroup === current.muscleGroup && !used.has(e.id))
    .sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name))
    .slice(0, similarLimit)
  return { coach, mine, similar }
}

/** Search every exercise for a swap: name, other names and muscle group. Same muscle group first. */
export function searchSwaps(
  current: { exerciseId: number; muscleGroup: MuscleGroup },
  exercises: SwapCandidate[],
  query: string,
  { exclude = [], limit = 40 }: { exclude?: number[]; limit?: number } = {},
): SwapCandidate[] {
  const skip = new Set([current.exerciseId, ...exclude])
  return exercises
    .filter((e) => !skip.has(e.id) && matchesExercise(e, query))
    .sort(
      (a, b) =>
        Number(b.muscleGroup === current.muscleGroup) -
          Number(a.muscleGroup === current.muscleGroup) || a.name.localeCompare(b.name),
    )
    .slice(0, limit)
}

/** The rep targets of one exercise in a session. */
export interface SlotTargets {
  targetSets: number
  targetRepsMin: number | null
  targetRepsMax: number | null
  targetRepsPerSet: number[] | null
}

function withPerSet(t: SlotTargets, perSet: number[] | null, sets: number): SlotTargets {
  if (!perSet?.length) return { ...t, targetSets: sets, targetRepsPerSet: null }
  return {
    targetSets: sets,
    targetRepsPerSet: perSet,
    targetRepsMin: Math.min(...perSet),
    targetRepsMax: Math.max(...perSet),
  }
}

/**
 * Swapping after some sets are logged: those sets stay with the exercise they were done on,
 * and the sets still to do (with their reps, if set by set) move to the replacement.
 */
export function splitTargets(
  t: SlotTargets,
  logged: number,
): { done: SlotTargets; rest: SlotTargets } {
  const doneSets = Math.max(1, logged)
  const restSets = Math.max(1, t.targetSets - logged)
  const perSet = t.targetRepsPerSet?.length ? t.targetRepsPerSet : null
  const last = perSet?.at(-1)
  const pad = (list: number[], n: number) =>
    list.length >= n ? list.slice(0, n) : [...list, ...Array(n - list.length).fill(last)]
  return {
    done: withPerSet(t, perSet && pad(perSet.slice(0, doneSets), doneSets), doneSets),
    rest: withPerSet(t, perSet && pad(perSet.slice(logged), restSets), restSets),
  }
}

/** Undoing a mid-exercise swap: the replacement's sets go back to the original exercise. */
export function mergeTargets(kept: SlotTargets, back: SlotTargets): SlotTargets {
  const sets = kept.targetSets + back.targetSets
  const both = kept.targetRepsPerSet?.length && back.targetRepsPerSet?.length
  return both
    ? withPerSet(kept, [...(kept.targetRepsPerSet ?? []), ...(back.targetRepsPerSet ?? [])], sets)
    : { ...kept, targetSets: sets, targetRepsPerSet: null }
}

/** "Squat → Leg Press, Bench Press → Push-up" for history lists. */
export function swapsLabel(swaps: ExerciseSwap[]): string {
  return swaps.map((s) => `${s.from} → ${s.to}`).join(', ')
}

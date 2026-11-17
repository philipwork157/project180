import { describe, expect, it } from 'vitest'
import {
  estimateQuickMinutes,
  linkQuickNext,
  moveQuick,
  newQuickTarget,
  type QuickState,
  quickGroupsFrom,
  quickPayload,
  quickReps,
  quickTargetFrom,
  quickUsesMinutes,
  quickWorkoutName,
  ungroupQuick,
  unlinkQuickNext,
  updateQuickGroup,
  withQuickDistance,
  withQuickReps,
  withQuickSeconds,
  withQuickSets,
} from './quick-workout'
import type { WorkoutExerciseItem } from './types'
import { quickWorkoutInput } from './validators'

describe('newQuickTarget', () => {
  it('starts each kind of exercise with sensible targets', () => {
    expect(newQuickTarget(1, 'weight_reps')).toMatchObject({
      targetSets: 3,
      targetRepsMin: 10,
      targetRepsMax: 10,
      restSeconds: 90,
    })
    expect(newQuickTarget(2, 'reps')).toMatchObject({ targetSets: 3, targetRepsMax: 12 })
    expect(newQuickTarget(3, 'time')).toMatchObject({ targetSets: 3, targetSeconds: 30 })
    expect(newQuickTarget(4, 'distance_time')).toMatchObject({ targetSets: 1 })
  })
})

describe('changing targets', () => {
  it('keeps sets between 1 and 20', () => {
    const t = newQuickTarget(1, 'weight_reps')
    expect(withQuickSets(t, 0).targetSets).toBe(1)
    expect(withQuickSets(t, 25).targetSets).toBe(20)
    expect(withQuickSets(t, 5).targetSets).toBe(5)
  })

  it('grows and shrinks per-set reps with the number of sets', () => {
    const t = { exerciseId: 1, targetSets: 3, targetRepsPerSet: [12, 10, 8] }
    expect(withQuickSets(t, 5)).toMatchObject({
      targetSets: 5,
      targetRepsPerSet: [12, 10, 8, 8, 8],
      targetRepsMin: 8,
      targetRepsMax: 12,
    })
    expect(withQuickSets(t, 2)).toMatchObject({
      targetRepsPerSet: [12, 10],
      targetRepsMin: 10,
      targetRepsMax: 12,
    })
  })

  it('sets one number of reps for every set', () => {
    const t = { exerciseId: 1, targetSets: 3, targetRepsPerSet: [12, 10, 8] }
    expect(quickReps(t)).toBe(12)
    expect(withQuickReps(t, 6)).toMatchObject({
      targetRepsMin: 6,
      targetRepsMax: 6,
      targetRepsPerSet: null,
    })
    expect(withQuickReps(t, 0).targetRepsMin).toBe(1)
    expect(quickReps({ exerciseId: 1, targetSets: 3 })).toBe(10)
  })

  it('keeps timed sets at 5 seconds or more', () => {
    expect(withQuickSeconds(newQuickTarget(1, 'time'), 0).targetSeconds).toBe(5)
    expect(withQuickSeconds(newQuickTarget(1, 'time'), 45).targetSeconds).toBe(45)
  })
})

describe('quickTargetFrom', () => {
  it('keeps everything the coach set on a workout exercise', () => {
    const item: WorkoutExerciseItem = {
      exerciseId: 7,
      exerciseName: 'Squat',
      muscleGroup: 'legs',
      trackingType: 'weight_reps',
      instructions: null,
      imageKey: null,
      videoUrl: null,
      targetSets: 4,
      targetRepsMin: 8,
      targetRepsMax: 12,
      targetRepsPerSet: [12, 10, 10, 8],
      bodyweight: false,
      targetSeconds: null,
      restSeconds: 120,
      section: 'main',
      targetDistanceM: null,
      targetPaceSeconds: null,
      targetHrZone: null,
      supersetGroup: 1,
      notes: 'Pause at the bottom',
    }
    expect(quickTargetFrom(item)).toMatchObject({
      exerciseId: 7,
      targetSets: 4,
      targetRepsPerSet: [12, 10, 10, 8],
      restSeconds: 120,
      supersetGroup: 1,
      notes: 'Pause at the bottom',
    })
  })
})

describe('estimateQuickMinutes', () => {
  it('adds up work and rest for every set', () => {
    // 3 × (40 s + 90 s) + 3 × (30 s + 30 s) = 570 s ≈ 10 min
    expect(
      estimateQuickMinutes([
        { targetSets: 3, restSeconds: 90 },
        { targetSets: 3, targetSeconds: 30, restSeconds: 30 },
      ]),
    ).toBe(10)
    expect(estimateQuickMinutes([])).toBe(1)
  })
})

describe('quickWorkoutName', () => {
  it('names it after the workout it came from', () => {
    expect(quickWorkoutName(['legs'], 'Leg Day A')).toBe('Quick · Leg Day A')
  })

  it('otherwise names it after the muscles worked most', () => {
    expect(quickWorkoutName(['glutes', 'legs', 'legs', 'core'])).toBe('Quick · Legs & Glutes')
    expect(quickWorkoutName(['chest'])).toBe('Quick · Chest')
    expect(quickWorkoutName([])).toBe('Quick workout')
  })
})

describe('quickWorkoutInput', () => {
  it('needs at least one exercise and drops unused groups', () => {
    const clientUuid = crypto.randomUUID()
    expect(quickWorkoutInput.safeParse({ clientUuid, name: 'Quick', exercises: [] }).success).toBe(
      false,
    )
    const parsed = quickWorkoutInput.parse({
      clientUuid,
      name: 'Quick',
      exercises: [{ exerciseId: 1, supersetGroup: 2 }],
      groups: [{ groupNumber: 1 }, { groupNumber: 2 }],
    })
    expect(parsed.groups.map((g) => g.groupNumber)).toEqual([2])
  })
})

describe('time in minutes', () => {
  it('times cardio in minutes and holds in seconds', () => {
    expect(quickUsesMinutes('cardio', 'time')).toBe(true)
    expect(quickUsesMinutes('core', 'time', 30)).toBe(false)
    expect(quickUsesMinutes('core', 'time', 600)).toBe(true)
    expect(quickUsesMinutes('legs', 'distance_time')).toBe(true)
    expect(newQuickTarget(1, 'time', 'cardio')).toMatchObject({
      targetSets: 1,
      targetSeconds: 1200,
    })
    expect(newQuickTarget(1, 'time', 'core')).toMatchObject({ targetSets: 3, targetSeconds: 30 })
  })

  it('sets a distance in km, or none', () => {
    const t = newQuickTarget(1, 'distance_time')
    expect(withQuickDistance(t, 5).targetDistanceM).toBe(5000)
    expect(withQuickDistance(t, 0).targetDistanceM).toBeNull()
  })
})

const row = (id: number, g: number | null = null) => ({
  key: String(id),
  target: { ...newQuickTarget(id, 'weight_reps'), supersetGroup: g },
})
const ids = (s: { items: Array<{ key: string }> }) => s.items.map((r) => r.key).join('')
const groupsOf = (s: { items: Array<{ target: { supersetGroup?: number | null } }> }) =>
  s.items.map((r) => r.target.supersetGroup ?? '-').join('')

describe('groups and order', () => {
  it('links neighbours into a superset, then a circuit, and splits them again', () => {
    let s: QuickState<ReturnType<typeof row>> = {
      items: [row(1), row(2), row(3), row(4)],
      groups: {},
    }
    s = linkQuickNext(s, 0)
    expect(groupsOf(s)).toBe('11--')
    expect(s.groups[1]).toMatchObject({ kind: 'superset', rounds: 3, restSeconds: 90 })
    s = linkQuickNext(s, 1)
    expect(groupsOf(s)).toBe('111-')
    expect(s.groups[1]?.kind).toBe('circuit')
    s = unlinkQuickNext(s, 0)
    expect(groupsOf(s)).toBe('-11-')
    s = ungroupQuick(s, 1)
    expect(groupsOf(s)).toBe('----')
    expect(s.groups).toEqual({})
  })

  it('keeps groups together when moving, and numbers them from the top', () => {
    let s = linkQuickNext({ items: [row(1), row(2), row(3), row(4)], groups: {} }, 2)
    expect(groupsOf(s)).toBe('--11')
    // Moving the first one to the end: the group is now on top.
    s = moveQuick(s, 0, 3)
    expect(ids(s)).toBe('2341')
    expect(groupsOf(s)).toBe('-11-')
    // Dropped between the two of a group, it joins it.
    s = moveQuick(s, 3, 2)
    expect(ids(s)).toBe('2314')
    expect(groupsOf(s)).toBe('-111')
    expect(s.groups[1]?.kind).toBe('circuit')
    // Moving one out leaves the rest grouped; a lone one is ungrouped.
    s = moveQuick(s, 3, 0)
    expect(ids(s)).toBe('4231')
    expect(groupsOf(s)).toBe('--11')
    s = moveQuick(s, 3, 0)
    expect(groupsOf(s)).toBe('----')
  })

  it('sends sets per round, and interval work time', () => {
    let s = linkQuickNext({ items: [row(1), row(2), row(3)], groups: {} }, 0)
    s = updateQuickGroup(s, 1, { rounds: 4, restSeconds: 60 })
    const p = quickPayload(s)
    expect(p.exercises.map((e) => [e.targetSets, e.supersetGroup])).toEqual([
      [4, 1],
      [4, 1],
      [3, null],
    ])
    expect(p.groups).toEqual([
      { groupNumber: 1, kind: 'superset', rounds: 4, workSeconds: null, restSeconds: 60 },
    ])
    const fresh = linkQuickNext({ items: [row(1), row(2)], groups: {} }, 0)
    const iv = quickPayload(updateQuickGroup(fresh, 1, { kind: 'interval' }))
    expect(iv.exercises[0]).toMatchObject({ targetSets: 8, targetSeconds: 20 })
    expect(iv.groups[0]).toMatchObject({ kind: 'interval', workSeconds: 20, restSeconds: 10 })
    // The group: 4 rounds × (40 s + 40 s + 60 s rest); the other: 3 × (40 s + 90 s) ≈ 16 min
    expect(estimateQuickMinutes(p.exercises, p.groups)).toBe(16)
  })

  it('reads a workout’s groups', () => {
    expect(
      quickGroupsFrom([
        { groupNumber: 1, kind: 'circuit', rounds: 3, workSeconds: null, restSeconds: 120 },
      ]),
    ).toEqual({ 1: { kind: 'circuit', rounds: 3, workSeconds: null, restSeconds: 120 } })
  })
})

import { describe, expect, it } from 'vitest'
import {
  type Board,
  buildBoard,
  failedSets,
  reviveBoard,
  type SetState,
  setPayload,
  toInt,
  toNumber,
  uniqueExercises,
} from './board'
import type { LoggedSet, SessionDetail, WorkoutExerciseItem } from './types'

const exercise = (over: Partial<WorkoutExerciseItem> = {}): WorkoutExerciseItem => ({
  exerciseId: 1,
  exerciseName: 'Squat',
  muscleGroup: 'legs',
  trackingType: 'weight_reps',
  instructions: null,
  imageKey: null,
  videoUrl: null,
  targetSets: 3,
  targetRepsMin: 8,
  targetRepsMax: 10,
  targetRepsPerSet: null,
  bodyweight: false,
  targetSeconds: null,
  restSeconds: 90,
  section: 'main',
  targetDistanceM: null,
  targetPaceSeconds: null,
  targetHrZone: null,
  supersetGroup: null,
  notes: null,
  ...over,
})

const logged = (over: Partial<LoggedSet> = {}): LoggedSet =>
  ({
    clientUuid: 'logged-1',
    exerciseId: 1,
    exerciseName: 'Squat',
    setNumber: 1,
    isWarmup: false,
    weightKg: 50,
    reps: 9,
    durationSeconds: null,
    distanceM: null,
    rpe: null,
    ...over,
  }) as LoggedSet

const session = (over: Partial<SessionDetail> = {}): SessionDetail => ({
  id: 7,
  clientUuid: 'session-uuid',
  status: 'in_progress',
  workoutId: 1,
  workoutName: 'Legs',
  programDayId: null,
  scheduledDate: null,
  startedAt: '2026-11-12T08:00:00.000Z',
  endedAt: null,
  durationSeconds: null,
  feeling: null,
  notes: null,
  exercises: [exercise()],
  groups: [],
  sets: [],
  previous: {},
  ...over,
})

const set = (over: Partial<SetState> = {}): SetState => ({
  clientUuid: 'set-1',
  setNumber: 1,
  weight: '42.5',
  reps: '8',
  seconds: '',
  distance: '',
  done: true,
  sync: 'idle',
  ...over,
})

describe('buildBoard', () => {
  it('makes one row per target set, pre-filled from the targets', () => {
    const board = buildBoard(session())
    expect(board[1]).toHaveLength(3)
    expect(board[1]?.map((s) => s.setNumber)).toEqual([1, 2, 3])
    expect(board[1]?.[0]).toMatchObject({ weight: '', reps: '10', done: false, sync: 'idle' })
    expect(new Set(board[1]?.map((s) => s.clientUuid)).size).toBe(3)
  })

  it('prefers what is logged, then last time, then the targets', () => {
    const board = buildBoard(
      session({
        sets: [logged()],
        previous: {
          1: [
            { setNumber: 1, weightKg: 40, reps: 8, durationSeconds: null, distanceM: null },
            { setNumber: 2, weightKg: 45, reps: 7, durationSeconds: null, distanceM: null },
          ],
        },
      }),
    )
    // Set 1 is already logged: its own id and numbers, and it's ticked.
    expect(board[1]?.[0]).toMatchObject({
      clientUuid: 'logged-1',
      weight: '50',
      reps: '9',
      done: true,
    })
    expect(board[1]?.[1]).toMatchObject({ weight: '45', reps: '7', done: false })
    // No third set last time: the last one is repeated.
    expect(board[1]?.[2]).toMatchObject({ weight: '45', reps: '7', done: false })
  })

  it('per-set rep targets beat last time; bodyweight has no weight', () => {
    const board = buildBoard(
      session({
        exercises: [exercise({ targetRepsPerSet: [12, 10, 8], bodyweight: true })],
        previous: {
          1: [{ setNumber: 1, weightKg: 40, reps: 5, durationSeconds: null, distanceM: null }],
        },
      }),
    )
    expect(board[1]?.map((s) => s.reps)).toEqual(['12', '10', '8'])
    expect(board[1]?.every((s) => s.weight === '')).toBe(true)
  })

  it('keeps extra logged sets and never has fewer than one row', () => {
    const extra = buildBoard(
      session({
        exercises: [exercise({ targetSets: 1 })],
        sets: [logged(), logged({ clientUuid: 'logged-2', setNumber: 2 })],
      }),
    )
    expect(extra[1]).toHaveLength(2)
    expect(buildBoard(session({ exercises: [exercise({ targetSets: 0 })] }))[1]).toHaveLength(1)
  })

  it('warm-up exercises only pick up warm-up sets, and distance shows in km', () => {
    const board = buildBoard(
      session({
        exercises: [
          exercise({ section: 'warm_up', targetSets: 1, targetDistanceM: 2500 }),
          exercise({ exerciseId: 2, exerciseName: 'Lunge', targetSets: 1 }),
        ],
        sets: [logged({ isWarmup: false })],
      }),
    )
    expect(board[1]?.[0]).toMatchObject({ done: false, distance: '2.5' })
    expect(Object.keys(board)).toEqual(['1', '2'])
  })

  it('lists an exercise that appears twice only once', () => {
    expect(uniqueExercises([exercise(), exercise(), exercise({ exerciseId: 2 })])).toHaveLength(2)
  })
})

describe('sending sets', () => {
  it('turns what was typed into numbers', () => {
    expect(setPayload(1, set({ distance: '2.5', seconds: '90' }), false)).toEqual({
      clientUuid: 'set-1',
      exerciseId: 1,
      setNumber: 1,
      isWarmup: false,
      weightKg: 42.5,
      reps: 8,
      durationSeconds: 90,
      distanceM: 2500,
      avgHr: null,
      avgWatts: null,
      elevationM: null,
    })
  })

  it('sends heart rate, watts and climb, and drops typos instead of failing the set', () => {
    expect(setPayload(1, set({ hr: '148', watts: '210', climb: '320' }), false)).toMatchObject({
      avgHr: 148,
      avgWatts: 210,
      elevationM: 320,
    })
    expect(setPayload(1, set({ hr: '1480', watts: '-5', climb: 'abc' }), false)).toMatchObject({
      avgHr: null,
      avgWatts: null,
      elevationM: null,
    })
  })

  it('sends null for anything left empty, and marks warm-ups', () => {
    expect(setPayload(3, set({ weight: '', reps: '', distance: undefined }), true)).toMatchObject({
      exerciseId: 3,
      isWarmup: true,
      weightKg: null,
      reps: null,
      durationSeconds: null,
      distanceM: null,
    })
  })

  it('reads numbers safely', () => {
    expect(toNumber('42.5')).toBe(42.5)
    expect(toNumber('')).toBeNull()
    expect(toNumber('abc')).toBeNull()
    expect(toInt('12')).toBe(12)
    expect(toInt('12.9')).toBe(12)
    expect(toInt('')).toBeNull()
  })
})

describe('retrying on poor signal', () => {
  const board: Board = {
    1: [set(), set({ clientUuid: 'failed', sync: 'failed' })],
    2: [
      set({ clientUuid: 'unticked', sync: 'failed', done: false }),
      set({ clientUuid: 'saving', sync: 'saving' }),
    ],
  }

  it('retries only ticked sets whose save failed', () => {
    expect(failedSets(board).map((f) => [f.exerciseId, f.set.clientUuid])).toEqual([[1, 'failed']])
  })

  it('a board read back after the app closed sends its half-sent sets again', () => {
    const revived = reviveBoard(board)
    expect(failedSets(revived).map((f) => f.set.clientUuid)).toEqual(['failed', 'saving'])
    // Nothing else changes, and the saved board itself is left alone.
    expect(revived[1]?.[0]).toEqual(board[1]?.[0])
    expect(board[2]?.[1]?.sync).toBe('saving')
  })
})

import { describe, expect, it } from 'vitest'
import { reviewSession, setResultLabel, setTargetLabel } from './review'
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

let uuid = 0
const logged = (over: Partial<LoggedSet> = {}): LoggedSet => ({
  clientUuid: `set-${++uuid}`,
  exerciseId: 1,
  exerciseName: 'Squat',
  setNumber: 1,
  isWarmup: false,
  weightKg: 60,
  reps: 8,
  durationSeconds: null,
  distanceM: null,
  rpe: null,
  ...over,
})

const session = (over: Partial<SessionDetail> = {}): SessionDetail => ({
  id: 7,
  clientUuid: 'session-uuid',
  status: 'completed',
  workoutId: 1,
  workoutName: 'Legs',
  programDayId: null,
  scheduledDate: null,
  startedAt: '2026-11-12T08:00:00.000Z',
  endedAt: null,
  durationSeconds: 3000,
  feeling: 4,
  notes: null,
  exercises: [exercise()],
  groups: [],
  sets: [],
  previous: {},
  ...over,
})

describe('setResultLabel', () => {
  it('reads each kind of set', () => {
    const blank = { weightKg: null, reps: null, durationSeconds: null, distanceM: null }
    expect(setResultLabel({ ...blank, weightKg: 57.5, reps: 8 }, 'weight_reps')).toBe('57.5 kg × 8')
    expect(setResultLabel({ ...blank, reps: 12 }, 'weight_reps')).toBe('12 reps')
    expect(setResultLabel({ ...blank, reps: 1 }, 'reps')).toBe('1 rep')
    expect(setResultLabel({ ...blank, durationSeconds: 45 }, 'time')).toBe('0:45')
    expect(setResultLabel({ ...blank, distanceM: 1200, durationSeconds: 390 }, 'distance_time')).toBe(
      '1.2 km · 6:30',
    )
    expect(setResultLabel(blank, 'time')).toBe('–')
  })
})

describe('setTargetLabel', () => {
  it('uses the set’s own reps when given set by set', () => {
    const e = exercise({ targetRepsPerSet: [12, 10, 8], targetRepsMin: 8, targetRepsMax: 12 })
    expect(setTargetLabel(e, 1)).toBe('12 reps')
    expect(setTargetLabel(e, 3)).toBe('8 reps')
    expect(setTargetLabel(exercise(), 2)).toBe('8–10 reps')
    expect(setTargetLabel(exercise({ targetRepsMin: null, targetRepsMax: null }), 1)).toBe('Max reps')
    expect(setTargetLabel(exercise({ trackingType: 'time', targetSeconds: 60 }), 1)).toBe('1:00')
  })
})

describe('reviewSession', () => {
  it('lines up sets with the plan, including missed and extra sets', () => {
    const [squat] = reviewSession(
      session({
        sets: [
          logged({ setNumber: 1 }),
          logged({ setNumber: 2, reps: 7 }),
          logged({ setNumber: 4, reps: 6 }),
          logged({ setNumber: 1, isWarmup: true, weightKg: 20, reps: 10 }),
        ],
      }),
    )
    expect(squat?.rows).toEqual([
      { setNumber: 1, target: '8–10 reps', done: '60 kg × 8' },
      { setNumber: 2, target: '8–10 reps', done: '60 kg × 7' },
      { setNumber: 3, target: '8–10 reps', done: null },
      { setNumber: 4, target: null, done: '60 kg × 6' },
    ])
    expect(squat?.warmups).toEqual(['20 kg × 10'])
    expect(squat?.doneSets).toBe(3)
  })

  it('flags a heavier top set (or more reps at the same weight) than last time', () => {
    const previous = {
      1: [{ setNumber: 1, weightKg: 60, reps: 8, durationSeconds: null, distanceM: null }],
    }
    const heavier = reviewSession(session({ previous, sets: [logged({ weightKg: 62.5 })] }))[0]
    expect(heavier).toMatchObject({ improved: true, lastTime: '60 kg × 8' })
    const moreReps = reviewSession(session({ previous, sets: [logged({ reps: 9 })] }))[0]
    expect(moreReps?.improved).toBe(true)
    const same = reviewSession(session({ previous, sets: [logged()] }))[0]
    expect(same?.improved).toBe(false)
    const first = reviewSession(session({ sets: [logged()] }))[0]
    expect(first).toMatchObject({ improved: false, lastTime: null })
  })

  it('keeps sets for exercises that are no longer in the plan', () => {
    const reviews = reviewSession(
      session({ sets: [logged({ exerciseId: 9, exerciseName: 'Lunge', weightKg: 20, reps: 10 })] }),
    )
    expect(reviews).toHaveLength(2)
    expect(reviews[1]).toMatchObject({ doneSets: 1, item: { exerciseName: 'Lunge' } })
    expect(reviews[1]?.rows).toEqual([{ setNumber: 1, target: null, done: '20 kg × 10' }])
  })
})

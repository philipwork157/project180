import { describe, expect, it } from 'vitest'
import { appNotifications, weighInStatus, weightChange } from './weigh-in'

const day = (date: string, checkinRequired = false) => ({ date, checkinRequired })
const week = [
  day('2026-11-09', true),
  day('2026-11-10'),
  day('2026-11-11'),
  day('2026-11-12'),
  day('2026-11-16', true),
]

describe('weighInStatus', () => {
  it('is due on a weigh-in day, and done once logged', () => {
    const before = [{ date: '2026-11-02', weightKg: 82.4 }]
    expect(weighInStatus(week, '2026-11-09', before)).toMatchObject({
      kind: 'today',
      done: false,
      previous: { date: '2026-11-02', weightKg: 82.4 },
    })
    const after = [...before, { date: '2026-11-09', weightKg: 82 }]
    expect(weighInStatus(week, '2026-11-09', after)).toMatchObject({
      kind: 'today',
      done: true,
      weightKg: 82,
    })
  })

  it('asks for a missed weigh-in for a few days, and logging today counts', () => {
    expect(weighInStatus(week, '2026-11-11', [])).toMatchObject({
      kind: 'overdue',
      date: '2026-11-09',
      done: false,
    })
    expect(
      weighInStatus(week, '2026-11-11', [{ date: '2026-11-11', weightKg: 81.8 }]),
    ).toMatchObject({ kind: 'overdue', done: true, weightKg: 81.8 })
    // Logged on the day itself: nothing to say two days later.
    expect(weighInStatus(week, '2026-11-11', [{ date: '2026-11-09', weightKg: 82 }])).toBeNull()
    // Too long ago: wait for the next weigh-in day.
    expect(weighInStatus(week, '2026-11-13', [])).toBeNull()
  })

  it('is null on other days', () => {
    expect(weighInStatus(week, '2026-11-10', [{ date: '2026-11-09', weightKg: 82 }])).toBeNull()
    expect(weighInStatus([], '2026-11-10', [])).toBeNull()
  })
})

describe('weightChange', () => {
  it('rounds to 0.1 kg with a sign', () => {
    expect(weightChange(82.4, 82)).toBe('−0.4 kg')
    expect(weightChange(80, 81.25)).toBe('+1.3 kg')
    expect(weightChange(80, 80.01)).toBe('No change')
  })
})

describe('appNotifications', () => {
  const base = { today: '2026-11-11', workoutInProgress: false, todayWorkout: null }

  it('lists a weigh-in that is due, and drops it once done', () => {
    const due = weighInStatus(week, '2026-11-11', [])
    expect(appNotifications({ ...base, weighIn: due })).toEqual([
      expect.objectContaining({
        id: 'weigh-in:2026-11-09',
        title: 'Weigh-in missed',
        body: expect.stringContaining('2 days ago'),
      }),
    ])
    const done = weighInStatus(week, '2026-11-11', [{ date: '2026-11-11', weightKg: 80 }])
    expect(appNotifications({ ...base, weighIn: done })).toEqual([])
  })

  it("lists today's workout until it's started or done", () => {
    const todayWorkout = { date: '2026-11-11', workoutName: 'Legs', state: 'planned' as const }
    expect(appNotifications({ ...base, weighIn: null, todayWorkout })).toHaveLength(1)
    expect(
      appNotifications({ ...base, weighIn: null, todayWorkout, workoutInProgress: true }),
    ).toEqual([])
    expect(
      appNotifications({
        ...base,
        weighIn: null,
        todayWorkout: { ...todayWorkout, state: 'done' },
      }),
    ).toEqual([])
  })
})

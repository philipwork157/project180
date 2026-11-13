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

describe('program news in the notifications', () => {
  const base = { today: '2026-11-13', workoutInProgress: false, todayWorkout: null, weighIn: null }
  const program = {
    enrollmentId: 4,
    programName: '4-Week Strength',
    startDate: '2026-11-16',
    assignedAt: '2026-11-13T05:00:00.000Z',
    updatedAt: '2026-11-13T05:00:01.000Z',
    coachName: 'Kim Coach',
  }

  it('announces a new program, with when it starts', () => {
    expect(appNotifications({ ...base, program })).toEqual([
      {
        id: 'program:4',
        kind: 'program',
        title: 'New program: 4-Week Strength',
        body: expect.stringMatching(/^Kim set it up for you\. It starts on Monday,? 16 November\.$/),
      },
    ])
    const started = appNotifications({ ...base, program: { ...program, startDate: '2026-11-10' } })
    expect(started[0]?.body).toBe('Kim set it up for you. Your plan is ready.')
  })

  it('drops off after a week, and says "Your coach" when the coach is unknown', () => {
    expect(appNotifications({ ...base, today: '2026-11-20', program })).toHaveLength(1)
    expect(appNotifications({ ...base, today: '2026-11-21', program })).toEqual([])
    const [n] = appNotifications({ ...base, program: { ...program, coachName: null } })
    expect(n?.body).toContain('Your coach set it up')
  })

  it('announces changes the coach brought to it later, as a new notification each time', () => {
    const updated = { ...program, assignedAt: '2026-10-01T05:00:00.000Z' }
    const first = appNotifications({
      ...base,
      program: { ...updated, updatedAt: '2026-11-12T09:00:00.000Z' },
    })
    expect(first).toEqual([
      expect.objectContaining({
        id: 'program-update:4:2026-11-12T09:00:00.000Z',
        title: 'Your program was updated',
      }),
    ])
    const second = appNotifications({
      ...base,
      program: { ...updated, updatedAt: '2026-11-13T09:00:00.000Z' },
    })
    expect(second[0]?.id).not.toBe(first[0]?.id)
    // An old program with no recent changes says nothing.
    expect(appNotifications({ ...base, program: { ...updated, updatedAt: null } })).toEqual([])
  })

  it('comes before the things to do today', () => {
    const todayWorkout = { date: '2026-11-13', workoutName: 'Legs', state: 'planned' as const }
    const list = appNotifications({ ...base, todayWorkout, program })
    expect(list.map((n) => n.kind)).toEqual(['program', 'workout'])
  })
})


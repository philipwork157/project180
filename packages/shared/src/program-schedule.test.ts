import { describe, expect, it } from 'vitest'
import {
  dueToStart,
  formatDay,
  nextProgramStart,
  programEndDate,
  queuesBehind,
  restartProgramInput,
  resumeWeek,
  startDateForWeek,
} from './program-schedule'

describe('formatDay', () => {
  it('reads like a day on a calendar', () => {
    expect(formatDay('2026-11-23')).toBe('Mon 23 Nov')
  })
})

describe('programEndDate', () => {
  it('is the last day of the last week', () => {
    expect(programEndDate('2026-11-16', 1)).toBe('2026-11-22')
    expect(programEndDate('2026-11-16', 4)).toBe('2026-12-13')
  })
})

describe('nextProgramStart', () => {
  it('is the day after the current program ends', () => {
    expect(nextProgramStart('2026-11-18', [{ startDate: '2026-11-16', durationWeeks: 1 }])).toBe(
      '2026-11-23',
    )
  })

  it('goes after anything already queued', () => {
    expect(
      nextProgramStart('2026-11-18', [
        { startDate: '2026-11-16', durationWeeks: 1 },
        { startDate: '2026-11-23', durationWeeks: 2 },
      ]),
    ).toBe('2026-12-07')
  })

  it('is null when nothing runs past today', () => {
    expect(nextProgramStart('2026-12-01', [{ startDate: '2026-11-16', durationWeeks: 1 }])).toBe(
      null,
    )
    expect(nextProgramStart('2026-12-01', [])).toBe(null)
  })
})

describe('queuesBehind', () => {
  const current = { startDate: '2026-11-16' }
  it('queues a future start behind a current program', () => {
    expect(queuesBehind(current, '2026-11-23', '2026-11-18')).toBe(true)
  })
  it('replaces now when it starts today or earlier, or there is no current program', () => {
    expect(queuesBehind(current, '2026-11-18', '2026-11-18')).toBe(false)
    expect(queuesBehind(null, '2026-11-23', '2026-11-18')).toBe(false)
  })
  it('replaces a current program that itself has not started yet when it starts no later', () => {
    expect(queuesBehind({ startDate: '2026-11-30' }, '2026-11-23', '2026-11-18')).toBe(false)
  })
})

describe('dueToStart', () => {
  const active = { id: 1, startDate: '2026-11-16' }

  it('does nothing before the next program starts', () => {
    expect(dueToStart(active, [{ id: 2, startDate: '2026-11-23' }], '2026-11-22')).toEqual({
      activate: null,
      finish: [],
    })
  })

  it('switches on the start date and finishes the old program', () => {
    expect(dueToStart(active, [{ id: 2, startDate: '2026-11-23' }], '2026-11-23')).toEqual({
      activate: 2,
      finish: [1],
    })
  })

  it('jumps to the latest one that has started, finishing the ones it skipped', () => {
    const queue = [
      { id: 4, startDate: '2026-12-07' },
      { id: 2, startDate: '2026-11-23' },
      { id: 3, startDate: '2026-11-30' },
    ]
    expect(dueToStart(active, queue, '2026-12-01')).toEqual({ activate: 3, finish: [1, 2] })
  })

  it('starts the first queued program when there is no current one', () => {
    expect(
      dueToStart(
        null,
        [
          { id: 3, startDate: '2026-12-07' },
          { id: 2, startDate: '2026-11-30' },
        ],
        '2026-11-20',
      ),
    ).toEqual({ activate: 2, finish: [] })
  })
})

describe('restarting a past program', () => {
  const grid = [
    { id: 1, weekNumber: 1, workoutId: 10 },
    { id: 2, weekNumber: 1, workoutId: null },
    { id: 3, weekNumber: 2, workoutId: 11 },
    { id: 4, weekNumber: 2, workoutId: 12 },
    { id: 5, weekNumber: 3, workoutId: 10 },
  ]

  it('picks up at the week of the first workout not done', () => {
    expect(resumeWeek(grid, new Set([1]))).toBe(2)
    expect(resumeWeek(grid, new Set([1, 3]))).toBe(2)
    expect(resumeWeek(grid, new Set([1, 3, 4]))).toBe(3)
  })

  it('starts at week 1 when nothing is done, and skips rest days', () => {
    expect(resumeWeek(grid, new Set())).toBe(1)
    expect(
      resumeWeek([{ id: 9, weekNumber: 1, workoutId: null }, ...grid.slice(2)], new Set()),
    ).toBe(2)
  })

  it('counts a missed early workout as where to pick up', () => {
    expect(resumeWeek(grid, new Set([3, 4, 5]))).toBe(1)
  })

  it('has nothing to pick up when every workout is done', () => {
    expect(resumeWeek(grid, new Set([1, 3, 4, 5]))).toBeNull()
  })

  it('backdates the start so the picked-up week lands on the chosen day', () => {
    expect(startDateForWeek('2026-11-16', 1)).toBe('2026-11-16')
    expect(startDateForWeek('2026-11-16', 3)).toBe('2026-11-02')
  })

  it('validates the restart input', () => {
    expect(restartProgramInput.parse({ startDate: '2026-11-16', mode: 'again' }).mode).toBe('again')
    expect(() => restartProgramInput.parse({ startDate: '2026-11-16', mode: 'nope' })).toThrow()
    expect(() => restartProgramInput.parse({ startDate: '16/11/2026', mode: 'fresh' })).toThrow()
  })
})

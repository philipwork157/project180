// Check-ins: the coach sets the date and how often, the client answers, the coach marks it done
// and the next one is scheduled; the report adds up the period. Only the client and their own
// coach ever see any of it.
import { addDays, todayIn } from '@project180/shared'
import { describe, expect, it } from 'vitest'
import { call, createAdmin, setupHousehold, signIn } from './helpers'

type Json = Record<string, any>

const OTHER = { name: 'Olga', email: 'olga@other.example', password: 'other-password-1' }
const today = todayIn('Africa/Johannesburg')

async function clientId(member: string) {
  return (await call<Json>('/me', { cookie: member })).data.user.id as number
}

describe('check-ins', () => {
  it('the coach schedules one, the client answers, done schedules the next', async () => {
    const { admin, member } = await setupHousehold()
    const id = await clientId(member)
    const due = addDays(today, 3)
    const set = await call<Json>(`/admin/users/${id}/check-ins/next`, {
      method: 'PUT',
      cookie: admin,
      body: { dueDate: due, repeatWeeks: 2 },
    })
    expect(set.data.checkIns.next).toMatchObject({ dueDate: due, repeatWeeks: 2 })
    // Moving it keeps one scheduled check-in.
    const moved = await call<Json>(`/admin/users/${id}/check-ins/next`, {
      method: 'PUT',
      cookie: admin,
      body: { dueDate: addDays(today, 1), repeatWeeks: 2 },
    })
    expect(moved.data.checkIns.next.dueDate).toBe(addDays(today, 1))

    // The client sees it and answers.
    const mine = await call<Json>('/me/check-in', { cookie: member })
    expect(mine.data.checkIn).toMatchObject({ dueDate: addDays(today, 1), answers: null })
    const bad = await call('/me/check-in/answers', {
      method: 'PUT',
      cookie: member,
      body: { week: 9, sleep: 3, stress: 3, hunger: 3 },
    })
    expect(bad.status).toBe(400)
    const answered = await call<Json>('/me/check-in/answers', {
      method: 'PUT',
      cookie: member,
      body: { week: 4, sleep: 2, stress: 4, hunger: 3, wins: 'Hit every workout', struggles: '' },
    })
    expect(answered.data.checkIn.answers).toMatchObject({
      week: 4,
      wins: 'Hit every workout',
      struggles: null,
    })

    // The report for the current period carries their answers and flags.
    const report = await call<Json>(`/admin/users/${id}/check-ins/report`, { cookie: admin })
    expect(report.data.report.answers).toMatchObject({ sleep: 2 })
    expect(report.data.report.flags).toEqual(
      expect.arrayContaining(['Says they’re sleeping badly', 'Says they’re very stressed']),
    )
    expect(report.data.report.verdict.status).toBe('unclear')

    // Done: notes saved, the next one two weeks after the due date.
    const ci = moved.data.checkIns.next.id
    const done = await call<Json>(`/admin/users/${id}/check-ins/${ci}/done`, {
      method: 'POST',
      cookie: admin,
      body: { coachNotes: 'Great fortnight' },
    })
    expect(done.data.checkIns.past[0]).toMatchObject({
      id: ci,
      status: 'done',
      coachNotes: 'Great fortnight',
    })
    expect(done.data.checkIns.next.dueDate).toBe(addDays(today, 15))
    // The past one's report still has its answers.
    const past = await call<Json>(`/admin/users/${id}/check-ins/report?checkInId=${ci}`, {
      cookie: admin,
    })
    expect(past.data.report.answers.week).toBe(4)
  })

  it('works out the period: logged food and the body goal verdict', async () => {
    const { admin, member } = await setupHousehold()
    const id = await clientId(member)
    await call(`/admin/users/${id}/profile`, {
      method: 'PUT',
      cookie: admin,
      body: { bodyGoal: 'lose_fat', birthDate: '1990-01-01', sex: 'female', heightCm: 165 },
    })
    const profile = await call<Json>(`/admin/users/${id}/profile`, { cookie: admin })
    expect(profile.data.profile.bodyGoal).toBe('lose_fat')
    // The client can't change their own body goal while they have a coach.
    await call('/me/profile', { method: 'PUT', cookie: member, body: { bodyGoal: 'gain_weight' } })
    expect(
      (await call<Json>(`/admin/users/${id}/profile`, { cookie: admin })).data.profile.bodyGoal,
    ).toBe('lose_fat')
    await call('/me/food', {
      method: 'POST',
      cookie: member,
      body: {
        date: today,
        meal: 'lunch',
        entries: [
          { clientUuid: crypto.randomUUID(), name: 'Chicken wrap', kcal: 600, proteinG: 40 },
        ],
      },
    })
    const report = await call<Json>(
      `/admin/users/${id}/check-ins/report?from=${addDays(today, -6)}&to=${today}`,
      { cookie: admin },
    )
    const r = report.data.report
    expect(r).toMatchObject({ days: 7, goal: 'lose_fat' })
    expect(r.food).toMatchObject({ daysLogged: 1, avgKcal: 600 })
    expect(r.food.topFoods).toEqual([{ name: 'Chicken wrap', times: 1 }])
    expect(r.flags).toEqual(expect.arrayContaining(['6 of 7 days with no food logged']))
  })

  it('only the client’s own coach reaches them; clients never reach the coach routes', async () => {
    const { member } = await setupHousehold()
    const id = await clientId(member)
    await createAdmin(OTHER, 'owner', 'Other Gym')
    const other = await signIn(OTHER.email, OTHER.password)
    expect((await call(`/admin/users/${id}/check-ins`, { cookie: other })).status).toBe(404)
    expect(
      (
        await call(`/admin/users/${id}/check-ins/next`, {
          method: 'PUT',
          cookie: other,
          body: { dueDate: today, repeatWeeks: null },
        })
      ).status,
    ).toBe(404)
    expect((await call(`/admin/users/${id}/check-ins/report`, { cookie: other })).status).toBe(404)
    expect((await call(`/admin/users/${id}/check-ins`, { cookie: member })).status).toBe(403)
    // No check-in yet: nothing to answer.
    expect(
      (
        await call('/me/check-in/answers', {
          method: 'PUT',
          cookie: member,
          body: { week: 3, sleep: 3, stress: 3, hunger: 3 },
        })
      ).status,
    ).toBe(404)
    expect((await call<Json>('/me/check-in', { cookie: member })).data.checkIn).toBeNull()
  })
})

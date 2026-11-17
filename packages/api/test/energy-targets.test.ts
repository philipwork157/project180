// The calorie calculator's settings (activity level, weekly pace, goal weight) save with the
// daily targets, only their coach sets them, and the phone sees the goal with its targets.

import { describe, expect, it } from 'vitest'
import { call, setupHousehold } from './helpers'

type Json = Record<string, any>

async function household() {
  const { admin, member } = await setupHousehold()
  const id = (await call<Json>('/me', { cookie: member })).data.user.id as number
  return { admin, member, id }
}

const plan = { activityLevel: 'active', weeklyChangeKg: -0.5, goalWeightKg: 80 }

describe('calorie targets from the calculator', () => {
  it('saves the plan on their profile and shows the goal with their targets', async () => {
    const { admin, member, id } = await household()
    const set = await call<Json>(`/admin/users/${id}/nutrition-targets`, {
      method: 'PUT',
      cookie: admin,
      body: { kcal: 2320, proteinG: 160, carbsG: 228, fatG: 64, basisWeightKg: 90, plan },
    })
    expect(set.status).toBe(200)
    expect(set.data.targets).toMatchObject({
      kcal: 2320,
      basisWeightKg: 90,
      goalWeightKg: 80,
      weeklyChangeKg: -0.5,
    })
    const profile = (await call<Json>(`/admin/users/${id}/profile`, { cookie: admin })).data.profile
    expect(profile).toMatchObject({
      activityLevel: 'active',
      weeklyChangeKg: -0.5,
      goalWeightKg: 80,
    })
    const day = (await call<Json>('/me/food', { cookie: member })).data.day
    expect(day.targets).toMatchObject({ kcal: 2320, goalWeightKg: 80, weeklyChangeKg: -0.5 })
  })

  it('typed-in targets leave the plan alone and have no basis weight', async () => {
    const { admin, id } = await household()
    await call(`/admin/users/${id}/nutrition-targets`, {
      method: 'PUT',
      cookie: admin,
      body: { kcal: 2320, proteinG: 160, basisWeightKg: 90, plan },
    })
    const typed = await call<Json>(`/admin/users/${id}/nutrition-targets`, {
      method: 'PUT',
      cookie: admin,
      body: { kcal: 2200, proteinG: 150 },
    })
    expect(typed.data.targets).toMatchObject({
      kcal: 2200,
      basisWeightKg: null,
      weeklyChangeKg: -0.5,
      goalWeightKg: 80,
    })
  })

  it('saves body basics typed into the calculator and logs a new weight as a weigh-in', async () => {
    const { admin, id } = await household()
    const res = await call<Json>(`/admin/users/${id}/nutrition-targets`, {
      method: 'PUT',
      cookie: admin,
      body: {
        kcal: 2320,
        proteinG: 160,
        basisWeightKg: 90,
        plan: { ...plan, birthDate: '1990-06-15', sex: 'male', heightCm: 180, weightKg: 90 },
      },
    })
    expect(res.status).toBe(200)
    const profile = (await call<Json>(`/admin/users/${id}/profile`, { cookie: admin })).data.profile
    expect(profile).toMatchObject({
      birthDate: '1990-06-15',
      sex: 'male',
      heightCm: 180,
      latestWeightKg: 90,
    })
    // Leaving the basics out keeps them.
    await call(`/admin/users/${id}/nutrition-targets`, {
      method: 'PUT',
      cookie: admin,
      body: { kcal: 2300, proteinG: 160, plan },
    })
    const after = (await call<Json>(`/admin/users/${id}/profile`, { cookie: admin })).data.profile
    expect(after).toMatchObject({ heightCm: 180, sex: 'male', latestWeightKg: 90 })
  })

  it('refuses a pace out of range', async () => {
    const { admin, id } = await household()
    const res = await call(`/admin/users/${id}/nutrition-targets`, {
      method: 'PUT',
      cookie: admin,
      body: { kcal: 2000, proteinG: 150, plan: { ...plan, weeklyChangeKg: -3 } },
    })
    expect(res.status).toBe(400)
  })

  it('a client can’t change their own goal weight or activity level from the app', async () => {
    const { admin, member, id } = await household()
    await call(`/admin/users/${id}/nutrition-targets`, {
      method: 'PUT',
      cookie: admin,
      body: { kcal: 2320, proteinG: 160, plan },
    })
    const mine = await call<Json>('/me/profile', {
      method: 'PUT',
      cookie: member,
      body: { mainGoal: 'lose_weight', goalWeightKg: 60, activityLevel: 'very_active' },
    })
    expect(mine.status).toBe(200)
    expect(mine.data.profile).toMatchObject({
      mainGoal: 'lose_weight',
      goalWeightKg: 80,
      activityLevel: 'active',
      weeklyChangeKg: -0.5,
    })
    // And the calculator routes stay staff-only.
    const denied = await call(`/admin/users/${id}/nutrition-targets`, {
      method: 'PUT',
      cookie: member,
      body: { kcal: 3000, proteinG: 100, plan: { ...plan, goalWeightKg: 60 } },
    })
    expect(denied.status).toBe(403)
  })

  it('the coach edits activity level on the profile; leaving it out keeps it', async () => {
    const { admin, id } = await household()
    const path = `/admin/users/${id}/profile`
    await call(path, { method: 'PUT', cookie: admin, body: { activityLevel: 'light' } })
    const kept = await call<Json>(path, { method: 'PUT', cookie: admin, body: { heightCm: 175 } })
    expect(kept.data.profile).toMatchObject({ activityLevel: 'light', heightCm: 175 })
    const cleared = await call<Json>(path, {
      method: 'PUT',
      cookie: admin,
      body: { activityLevel: null },
    })
    expect(cleared.data.profile.activityLevel).toBeNull()
  })
})

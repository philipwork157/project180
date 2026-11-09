import { describe, expect, it } from 'vitest'
import { call, MEMBER, setupHousehold } from './helpers'

type Json = Record<string, any>

describe('admin overview', () => {
  it('counts clients and flags who needs a nudge', async () => {
    const { admin } = await setupHousehold()
    const res = await call<{ overview: Json }>('/admin/overview', { cookie: admin })
    expect(res.status).toBe(200)
    const o = res.data.overview
    expect(o.clients.total).toBe(1)
    expect(o.daily).toHaveLength(14)
    expect(o.attention).toEqual([
      expect.objectContaining({ name: MEMBER.name, reason: 'no_program' }),
    ])
    expect(o.library).toMatchObject({ exercises: 0, workouts: 0, programs: 0 })
  })

  it('is for staff only', async () => {
    const { member } = await setupHousehold()
    expect((await call('/admin/overview', { cookie: member })).status).toBe(403)
  })
})

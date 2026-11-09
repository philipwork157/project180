import type { Me, Role } from '@project180/shared'
import { HTTPException } from 'hono/http-exception'
import type { Auth } from './auth'

interface SessionLikeUser {
  id: string | number
  name: string
  email: string
  role?: unknown
  timezone?: unknown
  weightUnit?: unknown
  mustChangePassword?: unknown
}

/** Better Auth types ids as strings; the rest of the app uses numbers. */
export function toMe(u: SessionLikeUser): Me {
  return {
    id: Number(u.id),
    name: u.name,
    email: u.email,
    role: u.role === 'owner' || u.role === 'admin' ? u.role : 'member',
    timezone: typeof u.timezone === 'string' ? u.timezone : 'Africa/Johannesburg',
    weightUnit: u.weightUnit === 'lb' ? 'lb' : 'kg',
    mustChangePassword: u.mustChangePassword === true || u.mustChangePassword === 1,
  }
}

/**
 * Creates a user with an email + password login. Public sign-up is off, so
 * accounts are created here (the admin's Users screen; admins come from scripts/create-admin.ts).
 */
export async function createUserWithPassword(
  auth: Auth,
  input: { name: string; email: string; password: string; role: Role; coachId?: number | null },
) {
  const ctx = await auth.$context
  const existing = await ctx.internalAdapter.findUserByEmail(input.email)
  if (existing) throw new HTTPException(409, { message: 'That email already has an account' })

  const user = await ctx.internalAdapter.createUser(
    {
      name: input.name,
      email: input.email,
      emailVerified: true,
      role: input.role,
      coachId: input.coachId ?? null,
    },
    { method: 'admin' },
  )
  const hash = await ctx.password.hash(input.password)
  await ctx.internalAdapter.linkAccount({
    userId: user.id,
    providerId: 'credential',
    accountId: String(user.id),
    password: hash,
  })
  return toMe(user)
}

export async function setPassword(auth: Auth, userId: number, password: string) {
  const ctx = await auth.$context
  const hash = await ctx.password.hash(password)
  await ctx.internalAdapter.updatePassword(String(userId), hash)
}

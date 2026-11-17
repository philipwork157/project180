import { sessions, users } from '@project180/db'
import { type Me, ROLES, type Role } from '@project180/shared'
import { sql } from 'drizzle-orm'
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
  businessId?: unknown
  coachId?: unknown
  needsOnboarding?: unknown
}

/**
 * 1 when the person (the `users` row of the query) has a sign-in that hasn't ended, on any
 * device; 0 otherwise. Signing out, "sign out everywhere", a password reset and blocking all
 * delete sessions, so "active now" ends with them. Uses sessions_user_idx.
 */
export const signedInSql = () =>
  sql<number>`exists (select 1 from ${sessions} where ${sessions.userId} = ${users.id} and ${sessions.expiresAt} > ${Date.now()})`

/** Better Auth types ids as strings; the rest of the app uses numbers. */
export function toMe(u: SessionLikeUser): Me {
  return {
    id: Number(u.id),
    name: u.name,
    email: u.email,
    role: ROLES.includes(u.role as Role) ? (u.role as Role) : 'member',
    timezone: typeof u.timezone === 'string' ? u.timezone : 'Africa/Johannesburg',
    weightUnit: u.weightUnit === 'lb' ? 'lb' : 'kg',
    mustChangePassword: u.mustChangePassword === true || u.mustChangePassword === 1,
    businessId:
      typeof u.businessId === 'number' && Number.isInteger(u.businessId) ? u.businessId : null,
    coachId: typeof u.coachId === 'number' && Number.isInteger(u.coachId) ? u.coachId : null,
    needsOnboarding: u.needsOnboarding === true || u.needsOnboarding === 1,
  }
}

/**
 * Creates a user with an email + password login. Public sign-up is off, so
 * accounts are created here (the admin's Users screen; admins come from scripts/create-admin.ts).
 */
export async function createUserWithPassword(
  auth: Auth,
  input: {
    name: string
    email: string
    password: string
    role: Role
    coachId?: number | null
    /** The business they join: always the business of the staff member adding them. */
    businessId: number | null
    /** False for people who sign up themselves: they confirm their email first. */
    emailVerified?: boolean
  },
) {
  const ctx = await auth.$context
  const existing = await ctx.internalAdapter.findUserByEmail(input.email)
  if (existing) throw new HTTPException(409, { message: 'That email already has an account' })

  const user = await ctx.internalAdapter.createUser(
    {
      name: input.name,
      email: input.email,
      emailVerified: input.emailVerified ?? true,
      role: input.role,
      coachId: input.coachId ?? null,
      businessId: input.businessId,
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

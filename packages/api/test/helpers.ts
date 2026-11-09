import { env, SELF } from 'cloudflare:test'
import { hashPassword } from 'better-auth/crypto'
import { adminStatements } from '../src/admin-sql'

const ORIGIN = 'http://localhost'

export interface TestResponse<T = unknown> {
  status: number
  headers: Headers
  data: T
}

/** Calls the API and always reads the body (required for isolated storage). */
export async function call<T = Record<string, unknown>>(
  path: string,
  opts: { method?: string; body?: unknown; cookie?: string } = {},
): Promise<TestResponse<T>> {
  const headers = new Headers({ origin: ORIGIN })
  if (opts.body !== undefined) headers.set('content-type', 'application/json')
  if (opts.cookie) headers.set('cookie', opts.cookie)
  const res = await SELF.fetch(`${ORIGIN}/api${path}`, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  })
  const text = await res.text()
  return { status: res.status, headers: res.headers, data: (text ? JSON.parse(text) : null) as T }
}

export const ADMIN = { name: 'Pieter', email: 'pieter@example.com', password: 'admin-password-1' }
export const MEMBER = { name: 'Wife', email: 'wife@example.com', password: 'member-password-1' }

/** Signs in and returns the session cookie, exactly as the app would (temporary password and all). */
export async function signInAsIs(email: string, password: string): Promise<string> {
  const res = await call('/auth/sign-in/email', { method: 'POST', body: { email, password } })
  if (res.status !== 200)
    throw new Error(`Sign-in failed (${res.status}): ${JSON.stringify(res.data)}`)
  // workerd supports getSetCookie(); the workers types don't list it yet.
  return (res.headers as unknown as { getSetCookie(): string[] })
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ')
}

/**
 * Signs in and skips the "choose your own password" step, as if they'd already done it, so tests
 * about other things can use people made with a temporary password. security.test.ts covers the step.
 */
export async function signIn(email: string, password: string): Promise<string> {
  const cookie = await signInAsIs(email, password)
  await env.DB.prepare('UPDATE users SET must_change_password = 0 WHERE email = ?')
    .bind(email.trim().toLowerCase())
    .run()
  return cookie
}

/** Creates an admin the way `bun run admin:create` does: straight into the database. */
export async function createAdmin(
  person: { name: string; email: string; password: string } = ADMIN,
) {
  const statements = adminStatements({
    ...person,
    passwordHash: await hashPassword(person.password),
  })
  await env.DB.batch(statements.map((sql) => env.DB.prepare(sql)))
}

/** Creates the admin with the admin script's SQL, then a member, and signs both in. */
export async function setupHousehold(): Promise<{ admin: string; member: string }> {
  await createAdmin()
  const admin = await signIn(ADMIN.email, ADMIN.password)
  const created = await call('/admin/users', { method: 'POST', cookie: admin, body: MEMBER })
  if (created.status !== 201)
    throw new Error(`Create member failed: ${JSON.stringify(created.data)}`)
  const member = await signIn(MEMBER.email, MEMBER.password)
  return { admin, member }
}

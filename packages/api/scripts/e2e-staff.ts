/**
 * The end-to-end tests' coach (apps/app/e2e and apps/admin/e2e). Created straight into the local
 * database with the same SQL as `bun run admin:create`, because there is no sign-up to use.
 *
 * It's an owner, because only owners may delete people and the tests remove the clients they
 * make. A real owner's People page still never lists it or its clients (it lists only the
 * clients you coach). Safe to run again: it resets the password and signs it out everywhere.
 */
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { hashPassword } from 'better-auth/crypto'
import { adminStatements } from '../src/admin-sql'

export const E2E_COACH = {
  name: 'E2E Coach',
  email: 'e2e-coach@project180.test',
  password: 'e2e-coach-password-1',
}

/** Names of everything the tests make start with this, so it's easy to spot and clean up. */
export const E2E_PREFIX = 'E2E'
/** Everyone the tests add gets an email at this domain (never a real inbox). */
export const E2E_DOMAIN = 'project180.test'

const root = path.resolve(import.meta.dirname, '../../..')

/**
 * Creates (or resets) the e2e coach (an owner) in the local database that `bun run dev` uses.
 * Also forgets earlier runs' wrong passwords (the smoke tests try one), which count against
 * this computer's address: 20 in 15 minutes would lock every local sign-in.
 */
export async function ensureE2eCoach() {
  const statements = [
    ...adminStatements({
      ...E2E_COACH,
      role: 'owner',
      passwordHash: await hashPassword(E2E_COACH.password),
    }),
    `DELETE FROM sign_in_attempts WHERE key IN ('ip:127.0.0.1', 'ip:::1') OR key LIKE 'email:%@${E2E_DOMAIN}';`,
  ]
  const dir = mkdtempSync(path.join(tmpdir(), 'p180-e2e-'))
  const file = path.join(dir, 'coach.sql')
  writeFileSync(file, `${statements.join('\n')}\n`)
  try {
    const args = ['wrangler', 'd1', 'execute', 'project180-db', '--local']
    const result = spawnSync(
      'bunx',
      [...args, '--persist-to', path.join(root, '.wrangler/state'), '--file', file, '--yes'],
      { cwd: path.join(root, 'apps/app'), encoding: 'utf8' },
    )
    if (result.status !== 0)
      throw new Error(`Could not create the e2e coach:\n${result.stderr || result.stdout}`)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

type Row = { id: number; name: string; email?: string; createdBy?: number }

/**
 * Removes everything earlier test runs made, through the API as the e2e coach: people with an
 * @project180.test email (with their copies, sessions and weigh-ins), then the coach's own E2E
 * programs, workouts and exercises, archived or not. Nothing anyone else made is touched.
 * `baseUrl` is either app's dev server (the admin's proxies /api to the app's).
 */
export async function sweepE2eData(baseUrl: string) {
  const headers = new Headers({ origin: baseUrl, 'content-type': 'application/json' })
  const signIn = await fetch(`${baseUrl}/api/auth/sign-in/email`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ email: E2E_COACH.email, password: E2E_COACH.password }),
  })
  if (!signIn.ok) throw new Error(`The e2e coach couldn't sign in (${signIn.status})`)
  headers.set(
    'cookie',
    signIn.headers
      .getSetCookie()
      .map((c) => c.split(';')[0])
      .join('; '),
  )
  const get = async <T>(url: string): Promise<T> => {
    const res = await fetch(`${baseUrl}/api${url}`, { headers })
    if (!res.ok) throw new Error(`GET ${url}: ${res.status}`)
    return (await res.json()) as T
  }
  const remove = async (url: string) => {
    const res = await fetch(`${baseUrl}/api${url}`, { method: 'DELETE', headers })
    if (!res.ok && res.status !== 404)
      throw new Error(`DELETE ${url}: ${res.status} ${await res.text()}`)
  }

  const { user: me } = await get<{ user: Row }>('/me')
  const { users } = await get<{ users: Row[] }>('/admin/users')
  for (const u of users) {
    if (u.id !== me.id && u.email?.endsWith(`@${E2E_DOMAIN}`)) await remove(`/admin/users/${u.id}`)
  }
  // Programs first: a workout can't be removed while a program uses it.
  for (const kind of ['programs', 'workouts', 'exercises'] as const) {
    for (const archived of ['', '?archived=1']) {
      const rows = (await get<Record<string, Row[]>>(`/${kind}${archived}`))[kind] ?? []
      for (const r of rows) {
        if (r.createdBy === me.id && r.name.startsWith(E2E_PREFIX))
          await remove(`/${kind}/${r.id}/permanent`)
      }
    }
  }
}

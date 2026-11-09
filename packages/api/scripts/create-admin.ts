/**
 * Creates a staff account, owner or coach (or updates an existing account's role and password).
 * Owners see every client and coach; coaches see only the clients they add.
 * There is no public sign-up: admins come from here, everyone else is added on the admin's Users page.
 *
 *   bun run admin:create            local database (bun run dev)
 *   bun run admin:create:dev        the Cloudflare dev environment (dev.project180.co.za)
 *   bun run admin:create:live       the live database (project180.co.za)
 *
 * It asks for name, email and password; the password is typed hidden, hashed here and
 * only the hash is sent. Add as many admins as you like in one run.
 */
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createInterface } from 'node:readline/promises'
import { hashPassword } from 'better-auth/crypto'
import { adminStatements } from '../src/admin-sql'

const args = process.argv.slice(2)
const target = args.includes('--live') ? 'live' : args.includes('--dev') ? 'dev' : 'local'
const root = path.resolve(import.meta.dirname, '../../..')
const where = {
  local: {
    db: 'project180-db',
    flags: ['--local', '--persist-to', path.join(root, '.wrangler/state')],
    label: 'your LOCAL database',
  },
  dev: {
    db: 'project180-db-dev',
    flags: ['--remote', '--env', 'dev'],
    label: 'the Cloudflare DEV database (dev.project180.co.za)',
  },
  live: { db: 'project180-db', flags: ['--remote'], label: 'the LIVE database (project180.co.za)' },
}[target]

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Reads a line without echoing it (for passwords). */
function hidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    process.stdout.write(question)
    const stdin = process.stdin
    stdin.setRawMode?.(true)
    stdin.resume()
    stdin.setEncoding('utf8')
    let value = ''
    const onData = (ch: string) => {
      for (const c of ch) {
        if (c === '\r' || c === '\n') {
          stdin.setRawMode?.(false)
          stdin.pause()
          stdin.off('data', onData)
          process.stdout.write('\n')
          resolve(value)
          return
        }
        if (c === '\u0003') process.exit(130) // Ctrl+C
        if (c === '\u007f' || c === '\b') value = value.slice(0, -1)
        else value += c
      }
    }
    stdin.on('data', onData)
  })
}

async function ask(
  rl: ReturnType<typeof createInterface>,
  question: string,
  check: (v: string) => string | null,
) {
  for (;;) {
    const v = (await rl.question(question)).trim()
    const problem = check(v)
    if (!problem) return v
    console.log(`  ${problem}`)
  }
}

async function askPassword(): Promise<string> {
  for (;;) {
    const first = await hidden('Password (hidden, at least 8 characters): ')
    if (first.length < 8) {
      console.log('  At least 8 characters, please.')
      continue
    }
    const again = await hidden('Same password again: ')
    if (first === again) return first
    console.log("  Those didn't match. Try again.")
  }
}

console.log(`\nProject 180: add an admin to ${where.label}\n`)
const people: Array<{ name: string; email: string; password: string; role: 'owner' | 'admin' }> = []
for (;;) {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const name = await ask(rl, 'Name: ', (v) => (v ? null : 'A name, please.'))
  const email = await ask(rl, 'Email: ', (v) =>
    EMAIL.test(v) ? null : 'That doesn’t look like an email.',
  )
  const kind = await ask(
    rl,
    'Owner (sees every client and coach) or coach (sees only their own clients)? [O/c] ',
    (v) =>
      ['', 'o', 'owner', 'c', 'coach'].includes(v.toLowerCase())
        ? null
        : 'Type o for owner or c for coach.',
  )
  rl.close()
  const role = kind.toLowerCase().startsWith('c') ? 'admin' : 'owner'
  const password = await askPassword()
  people.push({ name, email, password, role })
  const rl2 = createInterface({ input: process.stdin, output: process.stdout })
  const more = (await rl2.question('Add another admin? (y/N) ')).trim().toLowerCase()
  rl2.close()
  if (more !== 'y' && more !== 'yes') break
  console.log('')
}

const statements: string[] = []
for (const p of people) {
  statements.push(
    ...adminStatements({
      name: p.name,
      email: p.email,
      role: p.role,
      passwordHash: await hashPassword(p.password),
    }),
  )
}

const dir = mkdtempSync(path.join(tmpdir(), 'p180-admin-'))
const file = path.join(dir, 'admins.sql')
writeFileSync(file, `${statements.join('\n')}\n`)
try {
  const result = spawnSync(
    'bunx',
    ['wrangler', 'd1', 'execute', where.db, ...where.flags, '--file', file, '--yes'],
    {
      cwd: path.join(root, 'apps/app'),
      stdio: 'inherit',
    },
  )
  if (result.status !== 0) process.exit(result.status ?? 1)
} finally {
  rmSync(dir, { recursive: true, force: true })
}

console.log(
  `\nDone. ${people.map((p) => `${p.name} <${p.email.toLowerCase()}> (${p.role === 'owner' ? 'owner' : 'coach'})`).join(' and ')} can now sign in to the app and the admin.`,
)
console.log('Add everyone else from the admin: Users → Add person.\n')

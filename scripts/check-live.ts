// Runs before `bun run deploy`: refuses to ship the live site while it isn't set up, so a
// deploy never goes out against the placeholder database or without the sign-in secret.
// Usage: bun scripts/check-live.ts   (needs `bunx wrangler login` for the secrets check)
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const PLACEHOLDER = '00000000-0000-0000-0000-000000000000'
const APPS = ['app', 'admin'] as const

/** JSON with // and /* comments (wrangler.jsonc), leaving "//" inside strings alone. */
function parseJsonc(text: string): Record<string, unknown> {
  let out = ''
  let inString = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    const next = text[i + 1]
    if (inString) {
      out += ch
      if (ch === '\\') out += text[++i] ?? ''
      else if (ch === '"') inString = false
    } else if (ch === '"') {
      inString = true
      out += ch
    } else if (ch === '/' && next === '/') {
      while (i < text.length && text[i] !== '\n') i++
      out += '\n'
    } else if (ch === '/' && next === '*') {
      i = text.indexOf('*/', i + 2) + 1
      if (i === 0) break
    } else out += ch
  }
  // Trailing commas are allowed in wrangler.jsonc.
  return JSON.parse(out.replace(/,(\s*[}\]])/g, '$1'))
}

const problems: string[] = []
const warnings: string[] = []
const ids = new Map<string, string>()

for (const app of APPS) {
  const config = parseJsonc(readFileSync(`apps/${app}/wrangler.jsonc`, 'utf8')) as {
    name: string
    d1_databases?: Array<{ database_id?: string }>
  }
  const id = config.d1_databases?.[0]?.database_id ?? ''
  ids.set(app, id)
  if (!id || id === PLACEHOLDER)
    problems.push(
      `apps/${app}/wrangler.jsonc: the live database_id is still the placeholder. Run \`bunx wrangler d1 create project180-db\` and paste the id into both apps.`,
    )

  const list = spawnSync('bunx', ['wrangler', 'secret', 'list', '--name', config.name, '--format', 'json'], {
    cwd: `apps/${app}`,
    encoding: 'utf8',
  })
  if (list.status !== 0) {
    problems.push(
      `${config.name}: couldn't list its secrets (signed in with \`bunx wrangler login\`?).`,
    )
    continue
  }
  let names: string[] = []
  try {
    names = (JSON.parse(list.stdout) as Array<{ name: string }>).map((s) => s.name)
  } catch {
    problems.push(`${config.name}: unexpected answer from \`wrangler secret list\`.`)
    continue
  }
  if (!names.includes('BETTER_AUTH_SECRET'))
    problems.push(`${config.name}: BETTER_AUTH_SECRET is not set (sign-in can't work).`)
  if (!names.includes('AWS_ACCESS_KEY_ID') || !names.includes('AWS_SECRET_ACCESS_KEY'))
    warnings.push(`${config.name}: no AWS keys, so emails are only logged, never sent.`)
  if (!names.includes('VAPID_PUBLIC_KEY') || !names.includes('VAPID_PRIVATE_KEY'))
    warnings.push(`${config.name}: no VAPID keys, so phones get no push notifications.`)
}

if (ids.get('app') !== ids.get('admin'))
  problems.push('The two apps point at different live databases; they must share one.')

for (const w of warnings) console.warn(`warning: ${w}`)
if (problems.length > 0) {
  for (const p of problems) console.error(`not ready: ${p}`)
  console.error('\nThe live site was not deployed. See README, "Going live".')
  process.exit(1)
}
console.log('Live configuration looks ready.')

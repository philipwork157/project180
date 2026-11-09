import { applyD1Migrations, env } from 'cloudflare:test'
import { beforeEach } from 'vitest'

await applyD1Migrations(env.DB, env.TEST_MIGRATIONS)

// Storage is only isolated per test file, so empty every table (and the media bucket)
// before each test: tests reuse the same people and emails.
const { results: tables } = await env.DB.prepare(
  "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name <> 'd1_migrations'",
).all<{ name: string }>()

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare('PRAGMA defer_foreign_keys = on'),
    ...tables.map((t) => env.DB.prepare(`DELETE FROM "${t.name}"`)),
  ])
  if (!env.MEDIA) return
  let listed = await env.MEDIA.list()
  while (listed.objects.length) {
    await env.MEDIA.delete(listed.objects.map((o) => o.key))
    if (!listed.truncated) break
    listed = await env.MEDIA.list({ cursor: listed.cursor })
  }
})

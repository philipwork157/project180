// The platform admin's page (the developer, role `platform`): which Claude features are on,
// their models and hard daily limits, what Claude costs, every coach and owner, and site health.
// Nothing here reads anyone's training, food or chats: only accounts, counts and spend.
import {
  auditEvents,
  businesses,
  claudeCalls,
  errorEvents,
  exercises,
  programs,
  recipes,
  signInEvents,
  users,
} from '@project180/db'
import {
  type AuditAction,
  type AuditPage,
  addDays,
  type ClaudeCosts,
  type ClaudeFeature,
  type ClaudeSpendRow,
  claudeFeatureUpdate,
  D1_LIMIT_BYTES,
  type DatabaseSummary,
  type ErrorSummary,
  type PlatformBusiness,
  type PlatformCoach,
  type PlatformHealth,
  type PlatformPeople,
  type SignInSummary,
  type StarterLibrary,
  starterLibraryInput,
  todayIn,
} from '@project180/shared'
import {
  and,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  like,
  lt,
  ne,
  sql,
} from 'drizzle-orm'
import { Hono } from 'hono'
import { audit } from '../audit'
import { emailMode } from '../email'
import type { AppEnv } from '../env'
import { notFound, parseBody } from '../errors'
import { requirePlatform, requireUser } from '../middleware'
import { claudeConfig, setClaudeFeature } from '../settings'
import { setStarterBusiness, starterBusinessId } from '../starter'
import { signedInSql } from '../users'

/** Midnight on the first of a month in Johannesburg (UTC+2 all year). */
const monthStart = (yearMonth: string) => new Date(`${yearMonth}-01T00:00:00+02:00`)
function monthsAround(today: string) {
  const [y, m] = today.split('-').map(Number) as [number, number]
  const prev = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`
  return { thisMonth: monthStart(today.slice(0, 7)), lastMonth: monthStart(prev) }
}

/** Calls and spend per feature between two moments: one grouped query. */
async function spendByFeature(db: AppEnv['Variables']['db'], from: Date, to?: Date) {
  const rows = await db
    .select({
      feature: claudeCalls.feature,
      calls: count(),
      failed: sql<number>`coalesce(sum(case when ${claudeCalls.outcome} = 'failed' then 1 else 0 end), 0)`,
      costMicros: sql<number>`coalesce(sum(${claudeCalls.costMicros}), 0)`,
      inputTokens: sql<number>`coalesce(sum(${claudeCalls.inputTokens}), 0)`,
      outputTokens: sql<number>`coalesce(sum(${claudeCalls.outputTokens}), 0)`,
      avgMs: sql<
        number | null
      >`avg(case when ${claudeCalls.outcome} <> 'failed' then ${claudeCalls.durationMs} end)`,
    })
    .from(claudeCalls)
    .where(and(gte(claudeCalls.createdAt, from), to ? lt(claudeCalls.createdAt, to) : undefined))
    .groupBy(claudeCalls.feature)
  return rows.map(
    (r): ClaudeSpendRow => ({
      ...r,
      feature: r.feature as ClaudeFeature,
      avgMs: r.avgMs === null ? null : Math.round(r.avgMs),
    }),
  )
}

const AUDIT_PAGE = 50
const SIGN_IN_PAGE = 50

export const platformRoutes = new Hono<AppEnv>()
  .use(requireUser, requirePlatform)
  /** Every Claude feature: switch, model and hard daily limit, and whether there's a key. */
  .get('/claude', async (c) => c.json({ claude: await claudeConfig(c.var.db, c.env) }))
  .put('/claude', async (c) => {
    const { db, user } = c.var
    const input = await parseBody(c.req.raw, claudeFeatureUpdate)
    await setClaudeFeature(db, input, user.id)
    await audit(db, {
      action: 'platform.claude',
      actor: user,
      detail: Object.entries(input)
        .map(([k, v]) => `${k}: ${v}`)
        .join(', '),
    })
    return c.json({ claude: await claudeConfig(db, c.env) })
  })
  /** The record of who did what, newest first, 50 at a time (?before= an id for older). */
  .get('/audit', async (c) => {
    const { db } = c.var
    const before = Number(c.req.query('before'))
    const rows = await db
      .select({
        id: auditEvents.id,
        action: auditEvents.action,
        actorName: auditEvents.actorName,
        targetName: auditEvents.targetName,
        businessName: businesses.name,
        detail: auditEvents.detail,
        createdAt: auditEvents.createdAt,
      })
      .from(auditEvents)
      .leftJoin(businesses, eq(businesses.id, auditEvents.businessId))
      .where(Number.isInteger(before) && before > 0 ? lt(auditEvents.id, before) : undefined)
      .orderBy(desc(auditEvents.id))
      .limit(AUDIT_PAGE + 1)
    const page: AuditPage = {
      events: rows.slice(0, AUDIT_PAGE).map((r) => ({
        ...r,
        action: r.action as AuditAction,
        createdAt: r.createdAt.toISOString(),
      })),
      nextBefore: rows.length > AUDIT_PAGE ? (rows[AUDIT_PAGE - 1]?.id ?? null) : null,
    }
    return c.json({ audit: page })
  })
  /**
   * Every try to sign in to the app or the admin, newest first, 50 at a time: ?app=app|admin,
   * ?failed=1 for only the ones that didn't get in, ?q= part of an email, ?before= an id.
   */
  .get('/sign-ins', async (c) => {
    const { db } = c.var
    const app = c.req.query('app')
    const q = c.req.query('q')?.trim().toLowerCase().slice(0, 80)
    const before = Number(c.req.query('before'))
    const failed = ne(signInEvents.outcome, 'ok')
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const where = and(
      app === 'app' || app === 'admin' ? eq(signInEvents.app, app) : undefined,
      c.req.query('failed') === '1' ? failed : undefined,
      q ? like(signInEvents.email, `%${q.replace(/[%_]/g, '')}%`) : undefined,
      Number.isInteger(before) && before > 0 ? lt(signInEvents.id, before) : undefined,
    )
    const [rows, [day], topFailing] = await Promise.all([
      db
        .select({
          id: signInEvents.id,
          app: signInEvents.app,
          email: signInEvents.email,
          name: users.name,
          outcome: signInEvents.outcome,
          ip: signInEvents.ip,
          country: signInEvents.country,
          device: signInEvents.device,
          createdAt: signInEvents.createdAt,
        })
        .from(signInEvents)
        .leftJoin(users, eq(users.id, signInEvents.userId))
        .where(where)
        .orderBy(desc(signInEvents.id))
        .limit(SIGN_IN_PAGE + 1),
      db
        .select({
          ok: sql<number>`coalesce(sum(case when ${signInEvents.outcome} = 'ok' then 1 else 0 end), 0)`,
          failed: sql<number>`coalesce(sum(case when ${signInEvents.outcome} != 'ok' then 1 else 0 end), 0)`,
        })
        .from(signInEvents)
        .where(gte(signInEvents.createdAt, since)),
      db
        .select({
          ip: signInEvents.ip,
          country: sql<string | null>`max(${signInEvents.country})`,
          failed: count(),
          emails: sql<number>`count(distinct ${signInEvents.email})`,
        })
        .from(signInEvents)
        .where(and(gte(signInEvents.createdAt, since), failed, isNotNull(signInEvents.ip)))
        .groupBy(signInEvents.ip)
        .orderBy(desc(count()))
        .limit(5),
    ])
    const signIns: SignInSummary = {
      last24h: { ok: Number(day?.ok ?? 0), failed: Number(day?.failed ?? 0) },
      topFailing: topFailing.map((t) => ({
        ip: t.ip ?? '',
        country: t.country,
        failed: t.failed,
        emails: Number(t.emails),
      })),
      events: rows.slice(0, SIGN_IN_PAGE).map((r) => ({
        ...r,
        createdAt: r.createdAt.toISOString(),
      })),
      nextBefore: rows.length > SIGN_IN_PAGE ? (rows[SIGN_IN_PAGE - 1]?.id ?? null) : null,
    }
    return c.json({ signIns })
  })
  /** Every table with its row count, the database size against D1's limit, the newest migration. */
  .get('/database', async (c) => {
    const d1 = c.env.DB
    const tables = await d1
      .prepare(
        "select name from sqlite_master where type = 'table' and name not like 'sqlite_%' and name not like '_cf_%' order by name",
      )
      .all<{ name: string }>()
    const names = tables.results.map((t) => t.name).filter((n) => /^[a-z0-9_]+$/.test(n))
    // Every count in ONE query (one column per table): the free plan allows 50 queries a request,
    // and D1 refuses one big UNION (too many terms in a compound SELECT).
    const row = names.length
      ? await d1
          .prepare(
            `select ${names.map((n) => `(select count(*) from "${n}") as "${n}"`).join(', ')}`,
          )
          .first<Record<string, number>>()
      : null
    const counts = { results: names.map((name) => ({ name, rows: Number(row?.[name] ?? 0) })) }
    const probe = await d1.prepare('select 1').run()
    const size = (probe.meta as { size_after?: number }).size_after
    let migration: string | null = null
    try {
      const row = await d1
        .prepare('select name from d1_migrations order by id desc limit 1')
        .first<{ name: string }>()
      migration = row?.name ?? null
    } catch {
      migration = null
    }
    const database: DatabaseSummary = {
      sizeBytes: typeof size === 'number' && size > 0 ? size : null,
      limitBytes: D1_LIMIT_BYTES,
      tables: counts.results
        .map((t) => ({ name: t.name, rows: Number(t.rows) }))
        .sort((a, b) => b.rows - a.rows),
      migration,
    }
    return c.json({ database })
  })
  /** Errors in the last day and hour, the latest 50, and whether alert emails can go out. */
  .get('/errors', async (c) => {
    const { db } = c.var
    const now = Date.now()
    const [[day], [hour], recent, [admin]] = await Promise.all([
      db
        .select({ n: count() })
        .from(errorEvents)
        .where(gte(errorEvents.createdAt, new Date(now - 24 * 60 * 60 * 1000))),
      db
        .select({ n: count() })
        .from(errorEvents)
        .where(gte(errorEvents.createdAt, new Date(now - 60 * 60 * 1000))),
      db.select().from(errorEvents).orderBy(desc(errorEvents.id)).limit(50),
      db.select({ n: count() }).from(users).where(eq(users.role, 'platform')),
    ])
    const errors: ErrorSummary = {
      last24h: day?.n ?? 0,
      lastHour: hour?.n ?? 0,
      recent: recent.map((e) => ({ ...e, createdAt: e.createdAt.toISOString() })),
      alertsOn: emailMode(c.env).mode !== 'off' && (admin?.n ?? 0) > 0,
    }
    return c.json({ errors })
  })
  /** What Claude costs: this month and last per feature, the last 30 days, top users, failures. */
  .get('/costs', async (c) => {
    const { db } = c.var
    const today = todayIn('Africa/Johannesburg')
    const { thisMonth, lastMonth } = monthsAround(today)
    const thirtyDaysAgo = new Date(`${today}T00:00:00+02:00`)
    thirtyDaysAgo.setUTCDate(thirtyDaysAgo.getUTCDate() - 29)
    // Johannesburg day of a call: created_at is Unix ms; +2 hours, then the date.
    const day = sql<string>`date((${claudeCalls.createdAt} / 1000) + 7200, 'unixepoch')`
    const [month, previous, days, topUsers, failures] = await Promise.all([
      spendByFeature(db, thisMonth),
      spendByFeature(db, lastMonth, thisMonth),
      db
        .select({
          date: day,
          calls: count(),
          costMicros: sql<number>`coalesce(sum(${claudeCalls.costMicros}), 0)`,
        })
        .from(claudeCalls)
        .where(gte(claudeCalls.createdAt, thirtyDaysAgo))
        .groupBy(day)
        .orderBy(day),
      db
        .select({
          userId: claudeCalls.userId,
          name: users.name,
          role: users.role,
          calls: count(),
          costMicros: sql<number>`coalesce(sum(${claudeCalls.costMicros}), 0)`,
        })
        .from(claudeCalls)
        .leftJoin(users, eq(users.id, claudeCalls.userId))
        .where(gte(claudeCalls.createdAt, thisMonth))
        .groupBy(claudeCalls.userId)
        .orderBy(desc(sql`coalesce(sum(${claudeCalls.costMicros}), 0)`))
        .limit(10),
      db
        .select({
          at: claudeCalls.createdAt,
          feature: claudeCalls.feature,
          model: claudeCalls.model,
          reason: claudeCalls.failReason,
          requestId: claudeCalls.requestId,
        })
        .from(claudeCalls)
        .where(and(eq(claudeCalls.outcome, 'failed'), gte(claudeCalls.createdAt, thirtyDaysAgo)))
        .orderBy(desc(claudeCalls.createdAt))
        .limit(10),
    ])
    const costs: ClaudeCosts = {
      month,
      lastMonth: previous,
      days,
      topUsers: topUsers.map((u) => ({
        ...u,
        name: u.name ?? 'Deleted account',
      })),
      failures: failures.map((f) => ({
        at: f.at.toISOString(),
        feature: f.feature as ClaudeFeature,
        model: f.model,
        reason: f.reason ?? 'unknown',
        requestId: f.requestId,
      })),
    }
    return c.json({ costs })
  })
  /**
   * Every coach and owner: how many clients they have, when they were last seen, and what
   * Claude cost this month for them and their clients. A fixed number of queries.
   */
  .get('/coaches', async (c) => {
    const { db } = c.var
    const { thisMonth } = monthsAround(todayIn('Africa/Johannesburg'))
    const caller = sql<number>`case when ${users.role} = 'member' then ${users.coachId} else ${users.id} end`
    const [staff, clientCounts, spend] = await Promise.all([
      db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          role: users.role,
          businessId: users.businessId,
          business: businesses.name,
          createdAt: users.createdAt,
          lastSeenAt: users.lastSeenAt,
          signedIn: signedInSql(),
          blockedAt: users.blockedAt,
        })
        .from(users)
        .leftJoin(businesses, eq(businesses.id, users.businessId))
        .where(inArray(users.role, ['owner', 'admin']))
        .orderBy(sql`${businesses.name} collate nocase`, sql`${users.name} collate nocase`),
      db
        .select({ coachId: users.coachId, n: count() })
        .from(users)
        .where(and(eq(users.role, 'member'), isNotNull(users.coachId)))
        .groupBy(users.coachId),
      db
        .select({
          coachId: caller,
          calls: count(),
          costMicros: sql<number>`coalesce(sum(${claudeCalls.costMicros}), 0)`,
        })
        .from(claudeCalls)
        .innerJoin(users, eq(users.id, claudeCalls.userId))
        .where(gte(claudeCalls.createdAt, thisMonth))
        .groupBy(caller),
    ])
    const clientsOf = new Map(clientCounts.map((r) => [r.coachId, r.n]))
    const spendOf = new Map(spend.map((r) => [r.coachId, r]))
    const coaches: PlatformCoach[] = staff.map((s) => ({
      id: s.id,
      name: s.name,
      email: s.email,
      role: s.role === 'owner' ? 'owner' : 'admin',
      businessId: s.businessId,
      business: s.business,
      clients: clientsOf.get(s.id) ?? 0,
      createdAt: s.createdAt.toISOString(),
      lastSeenAt: s.lastSeenAt?.toISOString() ?? null,
      signedIn: Boolean(s.signedIn),
      blocked: s.blockedAt !== null,
      monthCalls: spendOf.get(s.id)?.calls ?? 0,
      monthCostMicros: spendOf.get(s.id)?.costMicros ?? 0,
    }))
    return c.json({ coaches })
  })
  /** Which keys this site has (set or not, never the values) and the newest migration. */
  .get('/health', async (c) => {
    const env = c.env
    let migration: string | null = null
    try {
      const row = await env.DB.prepare(
        'select name from d1_migrations order by id desc limit 1',
      ).first<{ name: string }>()
      migration = row?.name ?? null
    } catch {
      migration = null
    }
    const health: PlatformHealth = {
      migration,
      keys: [
        {
          name: 'ANTHROPIC_API_KEY',
          label: 'Claude',
          set: Boolean(env.ANTHROPIC_API_KEY),
          note: 'Food photos and Build with Claude. Without it, those buttons hide.',
        },
        {
          name: 'AWS_ACCESS_KEY_ID',
          label: 'Email (Amazon SES)',
          set: Boolean(env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY && env.EMAIL_FROM),
          note: 'New passwords and welcome emails. Without it, emails are only logged.',
        },
        {
          name: 'VAPID_PUBLIC_KEY',
          label: 'Push notifications',
          set: Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY),
          note: 'Coach messages and reminders on phones. Without it, only the bell shows them.',
        },
        {
          name: 'YOUTUBE_API_KEY',
          label: 'YouTube search',
          set: Boolean(env.YOUTUBE_API_KEY),
          note: 'How-to video results. Without it, a “Search on YouTube” link shows instead.',
        },
        {
          name: 'MEDIA',
          label: 'Photo uploads (R2)',
          set: Boolean(env.MEDIA),
          note: 'Coach photos for exercises and recipes. Without it, uploading is refused.',
        },
      ],
    }
    return c.json({ health })
  })
  /**
   * The starter library: which business people without a coach read from (exercises, recipes,
   * programs), and what new coach businesses get a copy of. Lists every business with counts.
   */
  .get('/starter', async (c) => c.json({ starter: await loadStarter(c.var.db) }))
  .put('/starter', async (c) => {
    const { db, user } = c.var
    const { businessId } = await parseBody(c.req.raw, starterLibraryInput)
    if (businessId !== null) {
      const [found] = await db
        .select({ id: businesses.id })
        .from(businesses)
        .where(eq(businesses.id, businessId))
      if (!found) notFound('Business not found')
    }
    await setStarterBusiness(db, businessId, user.id)
    await audit(db, {
      action: 'platform.starter',
      actor: user,
      businessId,
      detail: businessId === null ? 'none' : null,
    })
    return c.json({ starter: await loadStarter(db) })
  })
  /**
   * Everyone at a glance: totals, new businesses / people on their own / coaches' clients per
   * week (12 weeks), and every business with its owner, people, last activity and spend.
   * A fixed number of queries.
   */
  .get('/people', async (c) => {
    const { db } = c.var
    const today = todayIn('Africa/Johannesburg')
    const { thisMonth } = monthsAround(today)
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    // The Monday (Johannesburg) of the week a row was made.
    const weekOf = (col: unknown) =>
      sql<string>`date((${col} / 1000) + 7200, 'unixepoch', 'weekday 0', '-6 days')`
    const firstWeek = (() => {
      const weekday = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7
      return addDays(today, -weekday - 7 * 11)
    })()
    const since = new Date(`${firstWeek}T00:00:00+02:00`)
    const [[totals], people, newBusinesses, newPeople, spend, starter] = await Promise.all([
      db
        .select({
          coaches: sql<number>`coalesce(sum(case when ${users.role} in ('owner', 'admin') then 1 else 0 end), 0)`,
          clients: sql<number>`coalesce(sum(case when ${users.role} = 'member' and ${users.businessId} is not null then 1 else 0 end), 0)`,
          onOwn: sql<number>`coalesce(sum(case when ${users.role} = 'member' and ${users.businessId} is null then 1 else 0 end), 0)`,
          unconfirmed: sql<number>`coalesce(sum(case when ${users.emailVerified} = 0 then 1 else 0 end), 0)`,
          activeWeek: sql<number>`coalesce(sum(case when ${users.role} <> 'platform' and ${users.lastSeenAt} >= ${weekAgo.getTime()} then 1 else 0 end), 0)`,
        })
        .from(users),
      db
        .select({
          businessId: users.businessId,
          coaches: sql<number>`coalesce(sum(case when ${users.role} in ('owner', 'admin') then 1 else 0 end), 0)`,
          clients: sql<number>`coalesce(sum(case when ${users.role} = 'member' then 1 else 0 end), 0)`,
          lastSeen: sql<number | null>`max(${users.lastSeenAt})`,
          ownerId: sql<number | null>`min(case when ${users.role} = 'owner' then ${users.id} end)`,
        })
        .from(users)
        .where(isNotNull(users.businessId))
        .groupBy(users.businessId),
      db
        .select({ week: weekOf(businesses.createdAt), n: count() })
        .from(businesses)
        .where(gte(businesses.createdAt, since))
        .groupBy(weekOf(businesses.createdAt)),
      db
        .select({
          week: weekOf(users.createdAt),
          onOwn: sql<number>`coalesce(sum(case when ${users.businessId} is null then 1 else 0 end), 0)`,
          clients: sql<number>`coalesce(sum(case when ${users.businessId} is not null then 1 else 0 end), 0)`,
        })
        .from(users)
        .where(and(eq(users.role, 'member'), gte(users.createdAt, since)))
        .groupBy(weekOf(users.createdAt)),
      db
        .select({
          businessId: users.businessId,
          calls: count(),
          costMicros: sql<number>`coalesce(sum(${claudeCalls.costMicros}), 0)`,
        })
        .from(claudeCalls)
        .innerJoin(users, eq(users.id, claudeCalls.userId))
        .where(and(gte(claudeCalls.createdAt, thisMonth), isNotNull(users.businessId)))
        .groupBy(users.businessId),
      starterBusinessId(db),
    ])
    const list = await db
      .select({
        id: businesses.id,
        name: businesses.name,
        createdAt: businesses.createdAt,
      })
      .from(businesses)
      .orderBy(desc(businesses.createdAt))
    const peopleOf = new Map(people.map((p) => [p.businessId, p]))
    const spendOf = new Map(spend.map((r) => [r.businessId, r]))
    const ownerIds = people.map((p) => p.ownerId).filter((v): v is number => v !== null)
    const owners = ownerIds.length
      ? await db
          .select({ id: users.id, name: users.name, email: users.email })
          .from(users)
          .where(inArray(users.id, ownerIds))
      : []
    const ownerOf = new Map(owners.map((o) => [o.id, o]))
    const businessRows: PlatformBusiness[] = list.map((b) => {
      const p = peopleOf.get(b.id)
      const owner = p?.ownerId ? ownerOf.get(p.ownerId) : undefined
      return {
        id: b.id,
        name: b.name,
        ownerName: owner?.name ?? null,
        ownerEmail: owner?.email ?? null,
        coaches: p?.coaches ?? 0,
        clients: p?.clients ?? 0,
        createdAt: b.createdAt.toISOString(),
        lastActiveAt: p?.lastSeen ? new Date(p.lastSeen).toISOString() : null,
        monthCalls: spendOf.get(b.id)?.calls ?? 0,
        monthCostMicros: spendOf.get(b.id)?.costMicros ?? 0,
        starter: b.id === starter,
      }
    })
    const byWeekB = new Map(newBusinesses.map((r) => [r.week, r.n]))
    const byWeekP = new Map(newPeople.map((r) => [r.week, r]))
    const weeks = Array.from({ length: 12 }, (_, i) => {
      const week = addDays(firstWeek, i * 7)
      return {
        week,
        businesses: byWeekB.get(week) ?? 0,
        onOwn: byWeekP.get(week)?.onOwn ?? 0,
        clients: byWeekP.get(week)?.clients ?? 0,
      }
    })
    const result: PlatformPeople = {
      totals: {
        businesses: list.length,
        ...(totals ?? { coaches: 0, clients: 0, onOwn: 0, unconfirmed: 0, activeWeek: 0 }),
      },
      weeks,
      businesses: businessRows,
    }
    return c.json({ people: result })
  })

/** Every business with how many exercises, recipes and library programs it has (4 queries). */
async function loadStarter(db: AppEnv['Variables']['db']): Promise<StarterLibrary> {
  const [list, ex, re, pr, businessId] = await Promise.all([
    db
      .select({ id: businesses.id, name: businesses.name })
      .from(businesses)
      .orderBy(businesses.name),
    db
      .select({ id: exercises.businessId, n: count() })
      .from(exercises)
      .where(isNull(exercises.archivedAt))
      .groupBy(exercises.businessId),
    db
      .select({ id: recipes.businessId, n: count() })
      .from(recipes)
      .where(isNull(recipes.archivedAt))
      .groupBy(recipes.businessId),
    db
      .select({ id: users.businessId, n: count() })
      .from(programs)
      .innerJoin(users, eq(users.id, programs.createdBy))
      .where(and(isNull(programs.clientId), isNull(programs.archivedAt)))
      .groupBy(users.businessId),
    starterBusinessId(db),
  ])
  const by = (rows: Array<{ id: number | null; n: number }>) =>
    new Map(rows.map((r) => [r.id, r.n]))
  const exOf = by(ex)
  const reOf = by(re)
  const prOf = by(pr)
  return {
    businessId,
    businesses: list.map((b) => ({
      ...b,
      exercises: exOf.get(b.id) ?? 0,
      recipes: reOf.get(b.id) ?? 0,
      programs: prOf.get(b.id) ?? 0,
    })),
  }
}

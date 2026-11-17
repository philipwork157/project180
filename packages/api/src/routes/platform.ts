// The platform admin's page (the developer, role `platform`): which Claude features are on,
// their models and hard daily limits, what Claude costs, every coach and owner, and site health.
// Nothing here reads anyone's training, food or chats: only accounts, counts and spend.
import { businesses, claudeCalls, exercises, programs, recipes, users } from '@project180/db'
import {
  addDays,
  type ClaudeCosts,
  type ClaudeFeature,
  type ClaudeSpendRow,
  claudeFeatureUpdate,
  type PlatformBusiness,
  type PlatformCoach,
  type PlatformHealth,
  type PlatformPeople,
  type StarterLibrary,
  starterLibraryInput,
  todayIn,
} from '@project180/shared'
import { and, count, desc, eq, gte, inArray, isNotNull, isNull, lt, sql } from 'drizzle-orm'
import { Hono } from 'hono'
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

export const platformRoutes = new Hono<AppEnv>()
  .use(requireUser, requirePlatform)
  /** Every Claude feature: switch, model and hard daily limit, and whether there's a key. */
  .get('/claude', async (c) => c.json({ claude: await claudeConfig(c.var.db, c.env) }))
  .put('/claude', async (c) => {
    const { db, user } = c.var
    const input = await parseBody(c.req.raw, claudeFeatureUpdate)
    await setClaudeFeature(db, input, user.id)
    return c.json({ claude: await claudeConfig(db, c.env) })
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

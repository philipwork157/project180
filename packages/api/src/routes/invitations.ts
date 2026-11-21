// Invitations: a coach invites someone by email to be their client.
// - Add client (POST /admin/users) sets the account up first (profile, goals, program) and sends
//   a link tied to it (`invitations.user_id`): opening it only asks for a password.
// - adminInvitationRoutes (/admin/invitations): staff send, list, resend and cancel.
// - acceptInvitationRoutes (inside /account): the link's page looks an invitation up, and
//   someone new accepts it by choosing a password (no sign-in needed; the link proves the email).
// - meInvitationRoutes (inside /me): someone already training on their own sees invitations for
//   their email in the app and accepts (they join the business and keep all their history) or
//   declines. Clients with a coach never see any.
import { businesses, type Db, invitations, users } from '@project180/db'
import {
  acceptInviteNewInput,
  INVITE_DAYS,
  type Invitation,
  type InvitationForMe,
  inviteInput,
  inviteTokenInput,
  isClient,
  isOwner,
  isStaff,
  type Me,
} from '@project180/shared'
import { and, desc, eq, gt, isNull } from 'drizzle-orm'
import { alias } from 'drizzle-orm/sqlite-core'
import { type Context, Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { audit } from '../audit'
import { inviteEmail, isLocalSite, sendEmail } from '../email'
import type { AppEnv, Bindings } from '../env'
import { conflict, forbidden, notFound, parseBody, parseId } from '../errors'
import { requireAdmin, requireUser } from '../middleware'
import { appOrigin } from '../origins'
import { takeAttempt } from '../sign-in-limit'
import { hashToken, newToken } from '../tokens'
import { createUserWithPassword, setPassword } from '../users'

const DAY = 24 * 60 * 60 * 1000
const HOUR = 60 * 60 * 1000
/** Invitations one coach may send an hour (each sends an email). */
const INVITES_PER_HOUR = 30
/** New accounts from invitation links per network address per hour. */
const ACCEPTS_PER_IP = 20

const coach = alias(users, 'coach')
/** The account a coach set up (Add client). */
const setUp = alias(users, 'set_up')

/** Someone with no coach and no business: they can accept an invitation. */
export const onTheirOwn = (u: {
  role: string
  businessId: number | null
  coachId: number | null
}) => isClient(u.role as Me['role']) && u.businessId === null && u.coachId === null

/** The coach an invitation is for: yourself, or (owners) a coach in your business. */
export async function pickCoach(db: Db, me: Me, coachId: number | null | undefined) {
  if (!coachId || coachId === me.id) return { id: me.id, name: me.name }
  if (!isOwner(me.role)) forbidden('Only an owner can invite for another coach')
  const [found] = await db
    .select({ id: users.id, name: users.name, role: users.role, businessId: users.businessId })
    .from(users)
    .where(eq(users.id, coachId))
  if (!found || !isStaff(found.role) || found.businessId !== me.businessId)
    notFound('Coach not found')
  return { id: found.id, name: found.name }
}

/** The invitations staff may see: owners their whole business's, coaches only their own. */
function myInvitations(me: Me) {
  const business = eq(invitations.businessId, me.businessId ?? -1)
  return isOwner(me.role) ? business : and(business, eq(invitations.coachId, me.id))
}

async function listInvitations(db: Db, me: Me): Promise<Invitation[]> {
  const rows = await db
    .select({
      id: invitations.id,
      name: invitations.name,
      email: invitations.email,
      coachId: invitations.coachId,
      coachName: coach.name,
      status: invitations.status,
      createdAt: invitations.createdAt,
      expiresAt: invitations.expiresAt,
      userId: invitations.userId,
      emailedAt: invitations.emailedAt,
    })
    .from(invitations)
    .leftJoin(coach, eq(coach.id, invitations.coachId))
    .leftJoin(setUp, eq(setUp.id, invitations.userId))
    .where(
      and(
        myInvitations(me),
        eq(invitations.status, 'pending'),
        // A set-up account that has signed in some other way (a temporary password) has joined.
        isNull(setUp.lastSeenAt),
      ),
    )
    .orderBy(desc(invitations.createdAt))
    .limit(100)
  return rows.map((r) => ({
    ...r,
    createdAt: r.createdAt.toISOString(),
    expiresAt: r.expiresAt.toISOString(),
    emailedAt: r.emailedAt?.toISOString() ?? null,
  }))
}

/**
 * A new link for an invitation (older links stop working), emailed when `email` is set; without,
 * it only comes back for the coach to copy or send on WhatsApp.
 */
async function sendInvite(
  env: Bindings,
  db: Db,
  invite: { id: number; name: string; email: string; businessName: string; coachName: string },
  existing: boolean,
  prepared = false,
  email = true,
) {
  const token = newToken()
  await db
    .update(invitations)
    .set({
      tokenHash: await hashToken(token),
      expiresAt: new Date(Date.now() + INVITE_DAYS * DAY),
      ...(email ? { emailedAt: new Date() } : {}),
    })
    .where(eq(invitations.id, invite.id))
  const link = `${appOrigin(env)}/invite?token=${token}`
  if (!email) return link
  await sendEmail(env, {
    to: invite.email,
    ...inviteEmail({
      name: invite.name,
      coachName: invite.coachName,
      businessName: invite.businessName,
      link,
      days: INVITE_DAYS,
      existing,
      prepared,
    }),
  })
  return link
}

async function businessName(db: Db, id: number) {
  const [row] = await db
    .select({ name: businesses.name })
    .from(businesses)
    .where(eq(businesses.id, id))
  return row?.name ?? 'your coach'
}

/**
 * Saves an invitation and emails its link: a plain one (`userId` null: accepting makes the
 * account, or someone on their own joins), or one for an account the coach already set up
 * (Add client: accepting only sets the password). A newer invitation from this business
 * replaces an older pending one to the same email. With `sendEmail: false` nothing is sent yet: the
 * coach sends it later. Returns the invitation's id and link.
 */
export async function createInvitation(
  env: Bindings,
  db: Db,
  me: Me,
  input: {
    name: string
    email: string
    coach: { id: number; name: string }
    existing: boolean
    userId?: number
    /** Email the link now (default). Add client leaves it for the coach to send. */
    sendEmail?: boolean
  },
): Promise<{ id: number; link: string }> {
  if (me.businessId === null) forbidden('Only staff of a business can invite')
  await db
    .update(invitations)
    .set({ status: 'cancelled', answeredAt: new Date() })
    .where(
      and(
        eq(invitations.businessId, me.businessId),
        eq(invitations.email, input.email),
        eq(invitations.status, 'pending'),
      ),
    )
  const [created] = await db
    .insert(invitations)
    .values({
      businessId: me.businessId,
      coachId: input.coach.id,
      email: input.email,
      name: input.name,
      userId: input.userId ?? null,
      // Replaced by sendInvite straight away; never a usable link.
      tokenHash: await hashToken(newToken()),
      expiresAt: new Date(Date.now() + INVITE_DAYS * DAY),
    })
    .returning({ id: invitations.id })
  if (!created) throw new Error('Invitation not saved')
  const link = await sendInvite(
    env,
    db,
    {
      id: created.id,
      name: input.name,
      email: input.email,
      businessName: await businessName(db, me.businessId),
      coachName: input.coach.name,
    },
    input.existing,
    input.userId !== undefined,
    input.sendEmail ?? true,
  )
  await audit(db, {
    action: 'invite.sent',
    actor: me,
    target: { id: input.userId ?? 0, name: input.name },
    businessId: me.businessId,
    detail: input.userId
      ? 'account set up by their coach'
      : input.existing
        ? 'already uses the app'
        : 'new to the app',
  })
  return { id: created.id, link }
}

export const adminInvitationRoutes = new Hono<AppEnv>()
  .use(requireUser, requireAdmin)
  .get('/', async (c) => c.json({ invitations: await listInvitations(c.var.db, c.var.user) }))
  /** Invite someone by email: someone new, or someone already training on their own. */
  .post('/', async (c) => {
    const { db, user: me } = c.var
    if (me.businessId === null) forbidden('Only staff of a business can invite')
    const input = await parseBody(c.req.raw, inviteInput)
    const forCoach = await pickCoach(db, me, input.coachId)
    if (!(await takeAttempt(db, `invite:${me.id}`, INVITES_PER_HOUR, HOUR)))
      throw new HTTPException(429, { message: 'That’s a lot of invitations. Try again later.' })
    const [person] = await db
      .select({
        role: users.role,
        businessId: users.businessId,
        coachId: users.coachId,
      })
      .from(users)
      .where(eq(users.email, input.email))
    if (person && person.businessId === me.businessId) conflict('They’re already in your business.')
    if (person && !onTheirOwn(person))
      conflict('That person can’t be invited: they already have a coach.')
    const { link } = await createInvitation(c.env, db, me, {
      name: input.name,
      email: input.email,
      coach: forCoach,
      existing: Boolean(person),
    })
    // On a local site the link comes back too, so invitations can be tried without an inbox.
    return c.json(
      { invitations: await listInvitations(db, me), ...(isLocalSite(c.env) ? { link } : {}) },
      201,
    )
  })
  /** Email the link (first time or again) with a fresh link: another 14 days. */
  .post('/:id/resend', (c) => freshLink(c, true))
  /**
   * A fresh link without emailing it, for the coach to copy or send on WhatsApp. Older links
   * stop working.
   */
  .post('/:id/link', (c) => freshLink(c, false))
  /** Cancel a pending invitation: its link stops working. */
  .delete('/:id', async (c) => {
    const { db, user: me } = c.var
    const [row] = await db
      .update(invitations)
      .set({ status: 'cancelled', answeredAt: new Date() })
      .where(
        and(
          eq(invitations.id, parseId(c.req.param('id'))),
          myInvitations(me),
          eq(invitations.status, 'pending'),
        ),
      )
      .returning({ name: invitations.name })
    if (!row) notFound('Invitation not found')
    await audit(db, {
      action: 'invite.cancelled',
      actor: me,
      target: { id: 0, name: row.name },
      businessId: me.businessId,
    })
    return c.json({ invitations: await listInvitations(db, me) })
  })

/** A fresh link for a pending invitation of mine: emailed, or only returned to copy. */
async function freshLink(c: Context<AppEnv, '/:id/resend' | '/:id/link'>, email: boolean) {
  const { db, user: me } = c.var
  const [invite] = await db
    .select({
      id: invitations.id,
      name: invitations.name,
      email: invitations.email,
      businessId: invitations.businessId,
      coachName: coach.name,
      userId: invitations.userId,
    })
    .from(invitations)
    .leftJoin(coach, eq(coach.id, invitations.coachId))
    .where(
      and(
        eq(invitations.id, parseId(c.req.param('id'))),
        myInvitations(me),
        eq(invitations.status, 'pending'),
      ),
    )
  if (!invite) notFound('Invitation not found')
  const prepared = invite.userId !== null
  // A plain invitation's link only ever goes to the person's inbox: whoever opens it can make
  // the account. A set-up account is the coach's own work, so they may send that link themselves.
  if (!email && !prepared && !isLocalSite(c.env))
    conflict('This invitation can only be sent by email.')
  if (!(await takeAttempt(db, `invite:${me.id}`, INVITES_PER_HOUR, HOUR)))
    throw new HTTPException(429, { message: 'That’s a lot of invitations. Try again later.' })
  const [found] = await db.select({ id: users.id }).from(users).where(eq(users.email, invite.email))
  const link = await sendInvite(
    c.env,
    db,
    {
      ...invite,
      coachName: invite.coachName ?? me.name,
      businessName: await businessName(db, invite.businessId),
    },
    Boolean(found) && !prepared,
    prepared,
    email,
  )
  return c.json({
    invitations: await listInvitations(db, me),
    ...(prepared || isLocalSite(c.env) ? { link } : {}),
  })
}

/** A pending, unexpired invitation by its link, with who it's from. */
async function inviteByToken(db: Db, token: string) {
  const [row] = await db
    .select({
      id: invitations.id,
      email: invitations.email,
      name: invitations.name,
      businessId: invitations.businessId,
      coachId: invitations.coachId,
      coachName: coach.name,
      businessName: businesses.name,
      userId: invitations.userId,
      userEmail: setUp.email,
      userSeen: setUp.lastSeenAt,
    })
    .from(invitations)
    .innerJoin(coach, eq(coach.id, invitations.coachId))
    .innerJoin(businesses, eq(businesses.id, invitations.businessId))
    .leftJoin(setUp, eq(setUp.id, invitations.userId))
    .where(
      and(
        eq(invitations.tokenHash, await hashToken(token)),
        eq(invitations.status, 'pending'),
        gt(invitations.expiresAt, new Date()),
      ),
    )
  if (!row) return null
  // A set-up account: the link only works until they're in. Once they've signed in (or the
  // account is gone) it never sets a password again.
  if (row.userId !== null && (row.userEmail === null || row.userSeen !== null)) return null
  return row
}

const EXPIRED =
  'This invitation has expired, was cancelled or was already used. Ask your coach to send a new one.'

export const acceptInvitationRoutes = new Hono<AppEnv>()
  /** The invitation behind a link (the token is sent in the body, never the address). */
  .post('/look', async (c) => {
    const { db } = c.var
    const { token } = await parseBody(c.req.raw, inviteTokenInput)
    const invite = await inviteByToken(db, token)
    if (!invite) throw new HTTPException(400, { message: EXPIRED })
    const [person] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, invite.email))
    const prepared = invite.userId !== null
    const found: InvitationForMe = {
      id: invite.id,
      email: invite.userEmail ?? invite.email,
      name: invite.name,
      businessName: invite.businessName,
      coachName: invite.coachName,
      existing: Boolean(person) && !prepared,
      prepared,
    }
    return c.json({ invitation: found })
  })
  /**
   * Someone new accepts: their account is made in the coach's business, with the email already
   * confirmed (the link proves it's theirs) and no welcome wizard (their coach sets things up).
   */
  .post('/accept', async (c) => {
    const { db } = c.var
    // It makes an account, so it's limited like sign-up (the link itself can't be guessed).
    const ip = c.req.header('cf-connecting-ip') ?? 'unknown'
    if (!(await takeAttempt(db, `invite-accept-ip:${ip}`, ACCEPTS_PER_IP, HOUR)))
      throw new HTTPException(429, { message: 'Too many tries. Please wait a while.' })
    const input = await parseBody(c.req.raw, acceptInviteNewInput)
    const invite = await inviteByToken(db, input.token)
    if (!invite) throw new HTTPException(400, { message: EXPIRED })
    if (invite.userId !== null && invite.userEmail !== null) {
      // Their coach already set the account up: they only choose their password. The email is
      // confirmed (the link proves it's theirs), and no welcome wizard: everything is ready.
      await setPassword(c.var.auth, invite.userId, input.password)
      await db.batch([
        db
          .update(users)
          .set({ emailVerified: true, mustChangePassword: false, termsAcceptedAt: new Date() })
          .where(eq(users.id, invite.userId)),
        db
          .update(invitations)
          .set({ status: 'accepted', acceptedUserId: invite.userId, answeredAt: new Date() })
          .where(eq(invitations.id, invite.id)),
      ])
      await audit(db, {
        action: 'invite.accepted',
        actor: { id: invite.userId, name: invite.name },
        target: { id: invite.coachId, name: invite.coachName },
        businessId: invite.businessId,
        detail: 'account set up by their coach',
      })
      return c.json({ email: invite.userEmail }, 201)
    }
    const [person] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, invite.email))
    if (person) conflict('You already have an account. Sign in to accept the invitation.')
    const created = await createUserWithPassword(c.var.auth, {
      name: input.name,
      email: invite.email,
      password: input.password,
      role: 'member',
      businessId: invite.businessId,
      coachId: invite.coachId,
      emailVerified: true,
    })
    await db.batch([
      db.update(users).set({ termsAcceptedAt: new Date() }).where(eq(users.id, created.id)),
      db
        .update(invitations)
        .set({ status: 'accepted', acceptedUserId: created.id, answeredAt: new Date() })
        .where(eq(invitations.id, invite.id)),
    ])
    await audit(db, {
      action: 'invite.accepted',
      actor: created,
      target: { id: invite.coachId, name: invite.coachName },
      businessId: invite.businessId,
      detail: 'new account',
    })
    return c.json({ email: created.email }, 201)
  })

/** Pending invitations to the signed-in person's email (only when they're on their own). */
async function invitationsForMe(db: Db, me: Me): Promise<InvitationForMe[]> {
  if (!onTheirOwn(me)) return []
  const rows = await db
    .select({
      id: invitations.id,
      email: invitations.email,
      name: invitations.name,
      coachName: coach.name,
      businessName: businesses.name,
    })
    .from(invitations)
    .innerJoin(coach, eq(coach.id, invitations.coachId))
    .innerJoin(businesses, eq(businesses.id, invitations.businessId))
    .where(
      and(
        eq(invitations.email, me.email),
        eq(invitations.status, 'pending'),
        gt(invitations.expiresAt, new Date()),
        isNull(invitations.userId),
      ),
    )
    .orderBy(desc(invitations.createdAt))
  return rows.map((r) => ({ ...r, existing: true }))
}

export const meInvitationRoutes = new Hono<AppEnv>()
  .get('/', async (c) => c.json({ invitations: await invitationsForMe(c.var.db, c.var.user) }))
  /**
   * Join the coach's business. Everything they logged stays theirs and their coach can now see
   * it; their goals and daily targets become the coach's to set.
   */
  .post('/:id/accept', async (c) => {
    const { db, user: me } = c.var
    const id = parseId(c.req.param('id'))
    const invite = (await invitationsForMe(db, me)).find((i) => i.id === id)
    if (!invite) notFound('Invitation not found')
    const [row] = await db
      .select({ businessId: invitations.businessId, coachId: invitations.coachId })
      .from(invitations)
      .where(eq(invitations.id, id))
    if (!row) notFound('Invitation not found')
    await db.batch([
      db
        .update(users)
        .set({ businessId: row.businessId, coachId: row.coachId, needsOnboarding: false })
        .where(eq(users.id, me.id)),
      db
        .update(invitations)
        .set({ status: 'accepted', acceptedUserId: me.id, answeredAt: new Date() })
        .where(eq(invitations.id, id)),
      // Any other invitations to them stop: they have a coach now.
      db
        .update(invitations)
        .set({ status: 'cancelled', answeredAt: new Date() })
        .where(and(eq(invitations.email, me.email), eq(invitations.status, 'pending'))),
    ])
    await audit(db, {
      action: 'invite.accepted',
      actor: me,
      target: { id: row.coachId, name: invite.coachName },
      businessId: row.businessId,
      detail: 'joined with their history',
    })
    // The sign-in cookie caches who they are for a minute: refresh it so their new coach and
    // business count straight away.
    const fresh = await c.var.auth.api.getSession({
      headers: c.req.raw.headers,
      query: { disableCookieCache: true },
      returnHeaders: true,
    })
    for (const cookie of fresh.headers.getSetCookie())
      c.header('set-cookie', cookie, { append: true })
    return c.json({ ok: true })
  })
  .post('/:id/decline', async (c) => {
    const { db, user: me } = c.var
    const id = parseId(c.req.param('id'))
    const invite = (await invitationsForMe(db, me)).find((i) => i.id === id)
    if (!invite) notFound('Invitation not found')
    await db
      .update(invitations)
      .set({ status: 'declined', answeredAt: new Date() })
      .where(eq(invitations.id, id))
    await audit(db, { action: 'invite.declined', actor: me, detail: invite.businessName })
    return c.json({ invitations: await invitationsForMe(db, me) })
  })

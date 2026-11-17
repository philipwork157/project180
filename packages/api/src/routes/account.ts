// Your own account: sign up (the phone app makes a person who trains on their own; the admin
// makes a coach with a new business), confirm your email, and reset a forgotten password.
// None of it needs a sign-in. Every route that sends email is limited per address and per
// network, and answers the same whether or not an account exists (except sign-up itself).
import { businesses, type Db, emailTokens, sessions, users } from '@project180/db'
import {
  emailOnlyInput,
  RESET_LINK_MINUTES,
  resetPasswordWithTokenInput,
  signUpInput,
  VERIFY_LINK_HOURS,
  verifyEmailInput,
} from '@project180/shared'
import { and, eq, gt } from 'drizzle-orm'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { audit } from '../audit'
import { isLocalSite, resetPasswordEmail, sendEmail, verifyEmailEmail } from '../email'
import type { AppEnv, Bindings } from '../env'
import { parseBody } from '../errors'
import { requestOrigin } from '../origins'
import { takeAttempt } from '../sign-in-limit'
import { copyStarterLibrary } from '../starter'
import { hashToken, newToken } from '../tokens'
import { verifyTurnstile } from '../turnstile'
import { createUserWithPassword, setPassword } from '../users'
import { acceptInvitationRoutes } from './invitations'

const HOUR = 60 * 60 * 1000
/** Sign-ups per network address an hour; emails (resend, forgot) per address and per email. */
const SIGNUPS_PER_IP = 5
const EMAILS_PER_IP = 10
const EMAILS_PER_EMAIL = 3

/** A fresh link of this kind for this person (older ones of the same kind stop working). */
async function issueToken(db: Db, userId: number, purpose: 'verify' | 'reset', ms: number) {
  const token = newToken()
  await db.batch([
    db
      .delete(emailTokens)
      .where(and(eq(emailTokens.userId, userId), eq(emailTokens.purpose, purpose))),
    db.insert(emailTokens).values({
      userId,
      purpose,
      tokenHash: await hashToken(token),
      expiresAt: new Date(Date.now() + ms),
    }),
  ])
  return token
}

/** The person a still-valid link belongs to, or null. */
async function redeem(db: Db, token: string, purpose: 'verify' | 'reset') {
  const [row] = await db
    .select({ id: emailTokens.id, userId: emailTokens.userId })
    .from(emailTokens)
    .where(
      and(
        eq(emailTokens.tokenHash, await hashToken(token)),
        eq(emailTokens.purpose, purpose),
        gt(emailTokens.expiresAt, new Date()),
      ),
    )
  return row ?? null
}

const ipOf = (c: { req: { header: (n: string) => string | undefined } }) =>
  c.req.header('cf-connecting-ip') ?? 'unknown'

/** 400 unless Turnstile (when set up) says a person sent this form. */
async function assertPerson(env: Bindings, token: string | undefined, ip: string) {
  if (!(await verifyTurnstile(env, token, ip === 'unknown' ? undefined : ip)))
    throw new HTTPException(400, {
      message: 'We couldn’t check you’re a person. Wait a moment and try again.',
    })
}

/**
 * On a local site (localhost) the link also comes back in the answer, so sign-up and reset can
 * be tried without an inbox. Never on dev or live: the dev site is public, and handing back a
 * reset link there would let anyone take over any account.
 */
const devLink = (env: Bindings, link: string) => (isLocalSite(env) ? { link } : {})

async function sendVerify(
  env: Bindings,
  db: Db,
  person: { id: number; name: string; email: string; coach: boolean },
  base: string,
) {
  const token = await issueToken(db, person.id, 'verify', VERIFY_LINK_HOURS * HOUR)
  const link = `${base}/verify?token=${token}`
  await sendEmail(env, {
    to: person.email,
    ...verifyEmailEmail({
      name: person.name,
      link,
      hours: VERIFY_LINK_HOURS,
      coach: person.coach,
    }),
  })
  return link
}

export const EMAIL_NOT_VERIFIED_MESSAGE =
  'Confirm your email first: open the link we sent you. Check your spam folder, or ask for a new link below.'

/**
 * After a right password: refuses (and removes the session just made) while the account's
 * email isn't confirmed. Only people who signed up themselves start unconfirmed.
 */
export async function refuseUnverified(db: Db, email: string, token: string | null) {
  const [row] = await db
    .select({ verified: users.emailVerified })
    .from(users)
    .where(eq(users.email, email.trim().toLowerCase()))
  if (!row || row.verified) return false
  if (token) await db.delete(sessions).where(eq(sessions.token, token))
  return true
}

export const accountRoutes = new Hono<AppEnv>()
  /**
   * Create your own account. In the phone app: someone who trains on their own (no coach, no
   * business; quick workouts on). In the admin: a coach, who becomes the owner of a new
   * business with its own copy of the starter library. Either way they confirm their email
   * before they can sign in.
   */
  .post('/signup', async (c) => {
    const { db } = c.var
    const env = c.env
    if (!(await takeAttempt(db, `signup-ip:${ipOf(c)}`, SIGNUPS_PER_IP, HOUR)))
      throw new HTTPException(429, { message: 'Too many new accounts from here. Try again later.' })
    const input = await parseBody(c.req.raw, signUpInput)
    await assertPerson(env, input.turnstileToken, ipOf(c))
    const coach = c.var.appKind === 'admin'
    if (coach && !input.businessName)
      throw new HTTPException(400, { message: 'Name your business' })
    const [taken] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, input.email))
    if (taken)
      throw new HTTPException(409, {
        message: 'That email already has an account. Sign in, or reset your password.',
      })
    let businessId: number | null = null
    if (coach) {
      const [business] = await db
        .insert(businesses)
        .values({ name: input.businessName as string })
        .returning({ id: businesses.id })
      businessId = business?.id ?? null
    }
    const created = await createUserWithPassword(c.var.auth, {
      name: input.name,
      email: input.email,
      password: input.password,
      role: coach ? 'owner' : 'member',
      businessId,
      emailVerified: false,
    })
    // They ticked "I agree to the terms and privacy policy" (the form requires it).
    await db.update(users).set({ termsAcceptedAt: new Date() }).where(eq(users.id, created.id))
    if (coach && businessId !== null) await copyStarterLibrary(db, businessId, created.id)
    // On their own: they build their own workouts, and the app's welcome wizard asks their goal
    // and works out their calories (only ever for people who signed up themselves).
    else
      await db
        .update(users)
        .set({ quickWorkouts: true, needsOnboarding: true })
        .where(eq(users.id, created.id))
    await audit(db, {
      action: coach ? 'account.signup_coach' : 'account.signup',
      actor: created,
      businessId,
      detail: coach ? (input.businessName ?? null) : null,
    })
    const base = requestOrigin(env, c.req.header('origin'), c.req.url)
    const link = await sendVerify(env, db, { ...created, coach }, base)
    return c.json({ email: created.email, ...devLink(env, link) }, 201)
  })
  /** The link in the "confirm your email" email. */
  .post('/verify', async (c) => {
    const { db } = c.var
    const { token } = await parseBody(c.req.raw, verifyEmailInput)
    const found = await redeem(db, token, 'verify')
    if (!found)
      throw new HTTPException(400, {
        message: 'This link has expired or was already used. Sign in to get a new one.',
      })
    const [person] = await db
      .update(users)
      .set({ emailVerified: true })
      .where(eq(users.id, found.userId))
      .returning({
        id: users.id,
        name: users.name,
        email: users.email,
        businessId: users.businessId,
      })
    if (person)
      await audit(db, { action: 'account.verified', actor: person, businessId: person.businessId })
    await db
      .delete(emailTokens)
      .where(and(eq(emailTokens.userId, found.userId), eq(emailTokens.purpose, 'verify')))
    return c.json({ email: person?.email ?? null })
  })
  /** A new "confirm your email" link. Answers the same whether or not the account exists. */
  .post('/resend', async (c) => {
    const { db } = c.var
    const { email, turnstileToken } = await parseBody(c.req.raw, emailOnlyInput)
    await assertPerson(c.env, turnstileToken, ipOf(c))
    const allowed =
      (await takeAttempt(db, `email-ip:${ipOf(c)}`, EMAILS_PER_IP, HOUR)) &&
      (await takeAttempt(db, `email-to:${email}`, EMAILS_PER_EMAIL, HOUR))
    if (!allowed) throw new HTTPException(429, { message: 'Too many emails. Try again later.' })
    const [person] = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        verified: users.emailVerified,
        role: users.role,
      })
      .from(users)
      .where(eq(users.email, email))
    if (!person || person.verified) return c.json({ ok: true })
    const base = requestOrigin(c.env, c.req.header('origin'), c.req.url)
    const link = await sendVerify(c.env, db, { ...person, coach: person.role !== 'member' }, base)
    return c.json({ ok: true, ...devLink(c.env, link) })
  })
  /** "Forgot your password?": a one-time reset link by email, for anyone not blocked. */
  .post('/forgot', async (c) => {
    const { db } = c.var
    const { email, turnstileToken } = await parseBody(c.req.raw, emailOnlyInput)
    await assertPerson(c.env, turnstileToken, ipOf(c))
    const allowed =
      (await takeAttempt(db, `email-ip:${ipOf(c)}`, EMAILS_PER_IP, HOUR)) &&
      (await takeAttempt(db, `email-to:${email}`, EMAILS_PER_EMAIL, HOUR))
    if (!allowed) throw new HTTPException(429, { message: 'Too many emails. Try again later.' })
    const [person] = await db
      .select({ id: users.id, name: users.name, email: users.email, blockedAt: users.blockedAt })
      .from(users)
      .where(eq(users.email, email))
    // The same answer either way, so nobody learns which emails have an account.
    if (!person || person.blockedAt) return c.json({ ok: true })
    const token = await issueToken(db, person.id, 'reset', RESET_LINK_MINUTES * 60 * 1000)
    const base = requestOrigin(c.env, c.req.header('origin'), c.req.url)
    const link = `${base}/reset?token=${token}`
    await sendEmail(c.env, {
      to: person.email,
      ...resetPasswordEmail({ name: person.name, link, minutes: RESET_LINK_MINUTES }),
    })
    return c.json({ ok: true, ...devLink(c.env, link) })
  })
  /**
   * The reset link: sets the new password, confirms the email (they just proved it's theirs),
   * ends a temporary password and signs them out everywhere. The link works once.
   */
  .post('/reset', async (c) => {
    const { db } = c.var
    const { token, password } = await parseBody(c.req.raw, resetPasswordWithTokenInput)
    const found = await redeem(db, token, 'reset')
    if (!found)
      throw new HTTPException(400, {
        message: 'This link has expired or was already used. Ask for a new one.',
      })
    await setPassword(c.var.auth, found.userId, password)
    await db.batch([
      db
        .update(users)
        .set({ emailVerified: true, mustChangePassword: false })
        .where(eq(users.id, found.userId)),
      db.delete(sessions).where(eq(sessions.userId, found.userId)),
      db
        .delete(emailTokens)
        .where(and(eq(emailTokens.userId, found.userId), eq(emailTokens.purpose, 'reset'))),
    ])
    const [person] = await db
      .select({ id: users.id, name: users.name, businessId: users.businessId })
      .from(users)
      .where(eq(users.id, found.userId))
    if (person)
      await audit(db, {
        action: 'account.password_reset',
        actor: person,
        businessId: person.businessId,
      })
    return c.json({ ok: true })
  })
  /** Invitations from a coach: look one up by its link, or accept it as someone new. */
  .route('/invite', acceptInvitationRoutes)

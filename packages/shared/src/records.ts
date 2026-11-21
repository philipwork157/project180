// Invitations, the record of who did what, errors, first steps for new coaches and the
// "download my data" file.
import { z } from 'zod'

const name = z.string().trim().min(1, 'Enter their name').max(80)
const email = z.string().trim().toLowerCase().pipe(z.email('Enter a valid email'))
const token = z.string().regex(/^[\w-]{43}$/, 'This link isn’t valid')

/** How long an invitation link works. */
export const INVITE_DAYS = 14

/** A coach invites someone by email. Owners can pick the coach; a coach invites for themselves. */
export const inviteInput = z.object({
  name,
  email,
  coachId: z.number().int().positive().nullish(),
})
export type InviteInput = z.input<typeof inviteInput>

/** Someone new accepts from the link: they choose their own password. */
export const acceptInviteNewInput = z.object({
  token,
  name: z.string().trim().min(1, 'Enter your name').max(80),
  password: z.string().min(8, 'At least 8 characters').max(128),
  acceptTerms: z.literal(true, { error: 'Agree to the terms and privacy policy to continue' }),
})
export const inviteTokenInput = z.object({ token })

export type InvitationStatus = 'pending' | 'accepted' | 'declined' | 'cancelled'

/** An invitation as the coach sees it on the Clients page. */
export interface Invitation {
  id: number
  name: string
  email: string
  coachId: number
  coachName: string | null
  status: InvitationStatus
  createdAt: string
  expiresAt: string
  /** The account the coach already set up (Add client); null for a plain invitation. */
  userId: number | null
  /** When the link was last emailed; null = not sent yet (the coach sends it when ready). */
  emailedAt: string | null
}

/** An invitation as the invited person sees it (the link's page, or a card in the app). */
export interface InvitationForMe {
  id: number
  email: string
  name: string
  businessName: string
  coachName: string
  /** The email already has an account: sign in and accept, instead of signing up. */
  existing: boolean
  /** Their coach already set the account up: they only choose a password. */
  prepared?: boolean
}

/** What the record lists. Each has a plain label on the Platform page. */
export const AUDIT_ACTIONS = {
  'account.signup': 'Signed up on their own',
  'account.signup_coach': 'Signed up as a coach',
  'account.verified': 'Confirmed their email',
  'account.password_reset': 'Reset their password by email',
  'account.deleted': 'Deleted their own account',
  'user.created': 'Added a person',
  'user.deleted': 'Deleted a person',
  'user.blocked': 'Blocked a person',
  'user.unblocked': 'Unblocked a person',
  'user.password_set': 'Set a temporary password',
  'user.coach_changed': 'Changed a client’s coach',
  'invite.sent': 'Sent an invitation',
  'invite.cancelled': 'Cancelled an invitation',
  'invite.accepted': 'Accepted an invitation',
  'invite.declined': 'Declined an invitation',
  'signin.locked': 'Too many wrong passwords',
  'platform.claude': 'Changed Claude settings',
  'platform.starter': 'Changed the starter library',
} as const
export type AuditAction = keyof typeof AUDIT_ACTIONS

export interface AuditEvent {
  id: number
  action: AuditAction
  actorName: string | null
  targetName: string | null
  businessName: string | null
  detail: string | null
  createdAt: string
}

export interface AuditPage {
  events: AuditEvent[]
  /** Pass as ?before= for the next (older) page; null when there's no more. */
  nextBefore: number | null
}

export interface ErrorEvent {
  id: number
  source: 'api' | 'email' | 'push' | 'cron'
  where: string
  message: string
  createdAt: string
}

export interface ErrorSummary {
  last24h: number
  lastHour: number
  recent: ErrorEvent[]
  /** Whether alert emails can go out (the platform admin has an email and email is set up). */
  alertsOn: boolean
}

/** Errors within ERROR_ALERT_MINUTES that send the platform admin an email (at most hourly). */
export const ERROR_ALERT_COUNT = 10
export const ERROR_ALERT_MINUTES = 15

/** A new coach's first steps on Today, each ticked from what they've actually done. */
export interface CoachFirstSteps {
  client: boolean
  program: boolean
  assigned: boolean
  message: boolean
}

/** Version of the "download my data" file, so its shape can change later. */
export const EXPORT_VERSION = 1

/** What happened when someone tried to sign in, in plain words for the Platform page. */
export const SIGN_IN_OUTCOME_LABELS = {
  ok: 'Signed in',
  wrong_password: 'Wrong password',
  no_account: 'No account with this email',
  locked: 'Locked out (too many tries)',
  blocked: 'Blocked by their coach',
  unverified: 'Email not confirmed yet',
  temp_expired: 'Temporary password expired',
  staff_only: 'Client tried the admin',
  dashboard_only: 'Platform admin tried the app',
} as const
export type SignInOutcomeKey = keyof typeof SIGN_IN_OUTCOME_LABELS

export interface SignInEvent {
  id: number
  app: 'app' | 'admin'
  email: string
  /** Their name when the email has an account. */
  name: string | null
  outcome: SignInOutcomeKey
  ip: string | null
  country: string | null
  device: string | null
  createdAt: string
}

export interface SignInSummary {
  last24h: { ok: number; failed: number }
  /** Network addresses with the most failed tries in the last 24 hours. */
  topFailing: Array<{ ip: string; country: string | null; failed: number; emails: number }>
  events: SignInEvent[]
  nextBefore: number | null
}

export interface DatabaseSummary {
  /** Bytes, as D1 reports it; null when it can't tell. */
  sizeBytes: number | null
  /** D1's size limit per database. */
  limitBytes: number
  tables: Array<{ name: string; rows: number }>
  migration: string | null
}

/** D1's limit per database on the paid plan (10 GB). */
export const D1_LIMIT_BYTES = 10 * 1024 * 1024 * 1024

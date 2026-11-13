// Sending email with Amazon SES (v2 API), signed by hand: no AWS SDK in the Worker.
//
// - No AWS key pair configured (local dev, tests): nothing is sent; the email is written to the log.
// - EMAIL_REDIRECT_TO set (the Cloudflare dev environment): every email goes to that one address
//   instead, with the real recipient shown in the subject and a banner, so testing never emails clients.
import { TEMP_PASSWORD_DAYS } from '@project180/shared'
import type { Bindings } from './env'

export interface EmailMessage {
  to: string
  subject: string
  html: string
  text: string
}

export type EmailResult =
  | { status: 'sent'; to: string; messageId?: string }
  | { status: 'logged'; to: string }
  | { status: 'failed'; to: string; error: string }

export const escapeHtml = (v: string) =>
  v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const utf8 = new TextEncoder()
const hex = (buf: ArrayBuffer) =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
const sha256 = async (data: string) => hex(await crypto.subtle.digest('SHA-256', utf8.encode(data)))
async function hmac(key: ArrayBuffer | Uint8Array, data: string) {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ])
  return crypto.subtle.sign('HMAC', k, utf8.encode(data))
}

/** AWS Signature V4 signing key (exported for the test against AWS's published example). */
export async function sigV4Key(secret: string, date: string, region: string, service: string) {
  let key = await hmac(utf8.encode(`AWS4${secret}`), date)
  key = await hmac(key, region)
  key = await hmac(key, service)
  return hmac(key, 'aws4_request')
}

/**
 * SES v2 SendEmail as a plain signed fetch. The AWS SDK needs Node internals the Workers
 * runtime doesn't have, so we sign the request ourselves (Signature V4, WebCrypto).
 */
async function sesSendEmail(env: Bindings, body: unknown): Promise<string | undefined> {
  const region = env.AWS_REGION || 'af-south-1'
  const host = `email.${region}.amazonaws.com`
  const path = '/v2/email/outbound-emails'
  const payload = JSON.stringify(body)
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '')
  const date = amzDate.slice(0, 8)
  const payloadHash = await sha256(payload)
  const signedHeaders = 'content-type;host;x-amz-content-sha256;x-amz-date'
  const canonical = [
    'POST',
    path,
    '',
    `content-type:application/json\nhost:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`,
    signedHeaders,
    payloadHash,
  ].join('\n')
  const scope = `${date}/${region}/ses/aws4_request`
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, await sha256(canonical)].join('\n')
  const signature = hex(
    await hmac(await sigV4Key(env.AWS_SECRET_ACCESS_KEY ?? '', date, region, 'ses'), toSign),
  )
  const res = await fetch(`https://${host}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-amz-date': amzDate,
      'x-amz-content-sha256': payloadHash,
      authorization: `AWS4-HMAC-SHA256 Credential=${env.AWS_ACCESS_KEY_ID}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    },
    body: payload,
  })
  const data = (await res.json().catch(() => null)) as {
    MessageId?: string
    message?: string
    Message?: string
  } | null
  if (!res.ok)
    throw new Error(`SES ${res.status}: ${data?.message ?? data?.Message ?? res.statusText}`)
  return data?.MessageId
}

/** Local and dev addresses: never the live site. */
export function isTestSite(env: Bindings) {
  const url = env.APP_URL || env.BETTER_AUTH_URL || ''
  return /localhost|127\.0\.0\.1|\/\/dev\.|admin-dev\.|\.workers\.dev/.test(url)
}

/** How email behaves on this site, for the admin's Settings page. */
export function emailMode(env: Bindings) {
  const redirectTo = env.EMAIL_REDIRECT_TO?.trim() || null
  const configured = Boolean(env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY && env.EMAIL_FROM)
  const mode = !configured ? 'off' : redirectTo ? 'redirect' : isTestSite(env) ? 'blocked' : 'live'
  return { mode, redirectTo, from: env.EMAIL_FROM ?? null } as const
}

export async function sendEmail(env: Bindings, message: EmailMessage): Promise<EmailResult> {
  // Safety net: a local or dev site without a redirect address never emails real people.
  if (!env.EMAIL_REDIRECT_TO?.trim() && isTestSite(env)) {
    console.log(
      `[email] Not sent: test site without EMAIL_REDIRECT_TO. Meant for: ${message.to}\nSubject: ${message.subject}`,
    )
    return { status: 'logged', to: message.to }
  }
  const redirect = env.EMAIL_REDIRECT_TO?.trim()
  const to = redirect || message.to
  const subject = redirect ? `[DEV for ${message.to}] ${message.subject}` : message.subject
  const html = redirect
    ? `<div style="background:#dcb46a;color:#202321;padding:10px 16px;font:600 13px/18px sans-serif">Dev environment: this email was meant for ${escapeHtml(message.to)}.</div>${message.html}`
    : message.html
  const text = redirect
    ? `[Dev environment: meant for ${message.to}]\n\n${message.text}`
    : message.text

  if (!env.AWS_ACCESS_KEY_ID || !env.AWS_SECRET_ACCESS_KEY || !env.EMAIL_FROM) {
    // Recipient and subject only: the body can hold a temporary password, and logs are kept.
    console.log(`[email] Not sent (no AWS credentials). To: ${to}\nSubject: ${subject}`)
    return { status: 'logged', to }
  }

  try {
    const messageId = await sesSendEmail(env, {
      FromEmailAddress: env.EMAIL_FROM,
      Destination: { ToAddresses: [to] },
      Content: {
        Simple: {
          Subject: { Data: subject, Charset: 'UTF-8' },
          Body: { Html: { Data: html, Charset: 'UTF-8' }, Text: { Data: text, Charset: 'UTF-8' } },
        },
      },
    })
    return { status: 'sent', to, messageId }
  } catch (err) {
    console.error('[email] SES send failed', err)
    return { status: 'failed', to, error: err instanceof Error ? err.message : String(err) }
  }
}

/** The branded shell: charcoal header with the wordmark, a white card, a lime button. */
function layout(title: string, body: string) {
  return `<!doctype html><html><body style="margin:0;background:#f5f3ed;font-family:'Plus Jakarta Sans',Helvetica,Arial,sans-serif;color:#202321">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f3ed;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#fcfbf8;border-radius:20px;overflow:hidden">
<tr><td style="background:#202321;padding:24px 28px">
<div style="font:700 10px/1 Helvetica,Arial,sans-serif;letter-spacing:.44em;color:#f5f3ed">PROJECT</div>
<div style="font:italic 900 34px/1.05 Helvetica,Arial,sans-serif;letter-spacing:-.04em;color:#f5f3ed">180<span style="color:#b6e63b">.</span></div>
</td></tr>
<tr><td style="padding:28px">
<h1 style="margin:0 0 12px;font:800 24px/30px Helvetica,Arial,sans-serif">${escapeHtml(title)}</h1>
${body}
</td></tr>
<tr><td style="padding:0 28px 24px;font:700 11px/16px Helvetica,Arial,sans-serif;letter-spacing:.24em;color:#5b605c">TRAIN<span style="color:#4a6110">.</span> FUEL<span style="color:#4a6110">.</span> FEEL<span style="color:#4a6110">.</span> LIVE<span style="color:#4a6110">.</span></td></tr>
</table></td></tr></table></body></html>`
}

const p = (html: string) =>
  `<p style="margin:0 0 14px;font:500 15px/23px Helvetica,Arial,sans-serif">${html}</p>`

/** "You're in": how to sign in, with the temporary password their coach set. */
export function welcomeEmail(input: {
  name: string
  email: string
  password: string
  appUrl: string
  coachName: string
}): Omit<EmailMessage, 'to'> {
  const first = input.name.split(' ')[0] ?? input.name
  const login = `${input.appUrl.replace(/\/$/, '')}/login`
  const html = layout(
    `Welcome, ${first}`,
    [
      p(
        `${escapeHtml(input.coachName)} has set you up on Project 180, where your training plan, workouts and progress live.`,
      ),
      `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:6px 0 18px;background:#ece9e1;border-radius:14px"><tr><td style="padding:14px 16px;font:500 14px/22px Helvetica,Arial,sans-serif">
<b>Email:</b> ${escapeHtml(input.email)}<br><b>Temporary password:</b> <span style="font-family:Menlo,Consolas,monospace">${escapeHtml(input.password)}</span></td></tr></table>`,
      `<a href="${escapeHtml(login)}" style="display:inline-block;background:#b6e63b;color:#202321;text-decoration:none;font:700 16px/1 Helvetica,Arial,sans-serif;padding:16px 26px;border-radius:14px">Open Project 180</a>`,
      `<p style="margin:18px 0 0;font:500 13px/20px Helvetica,Arial,sans-serif;color:#5b605c">On your phone, open the link and choose "Add to Home Screen" to install it like an app. You'll choose your own password the first time you sign in. The temporary one works for ${TEMP_PASSWORD_DAYS} days.</p>`,
      `<p style="margin:12px 0 0;font:500 12px/18px Helvetica,Arial,sans-serif;color:#7a7f7b">To help your coach support you, Project 180 records when you use the app, roughly how long, and which devices you're signed in on, alongside the workouts and check-ins you log. Only you, your coach and the Project 180 team can see it. Ask your coach if you'd like it removed.</p>`,
    ].join('\n'),
  )
  const text = `Welcome, ${first}

${input.coachName} has set you up on Project 180, where your training plan, workouts and progress live.

Email: ${input.email}
Temporary password: ${input.password}

Sign in: ${login}

On your phone, open the link and choose "Add to Home Screen" to install it like an app. You'll choose your own password the first time you sign in. The temporary one works for ${TEMP_PASSWORD_DAYS} days.

To help your coach support you, Project 180 records when you use the app, roughly how long, and which devices you're signed in on, alongside the workouts and check-ins you log. Only you, your coach and the Project 180 team can see it. Ask your coach if you'd like it removed.

TRAIN. FUEL. FEEL. LIVE.`
  return { subject: `Welcome to Project 180, ${first}`, html, text }
}

/** A new password set by their coach. */
export function newPasswordEmail(input: {
  name: string
  email: string
  password: string
  appUrl: string
}): Omit<EmailMessage, 'to'> {
  const first = input.name.split(' ')[0] ?? input.name
  const login = `${input.appUrl.replace(/\/$/, '')}/login`
  const html = layout(
    'Your new password',
    [
      p(
        `Hi ${escapeHtml(first)}, your coach has set a temporary password for you. It works for ${TEMP_PASSWORD_DAYS} days, and you'll choose your own when you sign in.`,
      ),
      `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:6px 0 18px;background:#ece9e1;border-radius:14px"><tr><td style="padding:14px 16px;font:500 14px/22px Helvetica,Arial,sans-serif">
<b>Email:</b> ${escapeHtml(input.email)}<br><b>Temporary password:</b> <span style="font-family:Menlo,Consolas,monospace">${escapeHtml(input.password)}</span></td></tr></table>`,
      `<a href="${escapeHtml(login)}" style="display:inline-block;background:#b6e63b;color:#202321;text-decoration:none;font:700 16px/1 Helvetica,Arial,sans-serif;padding:16px 26px;border-radius:14px">Sign in</a>`,
    ].join('\n'),
  )
  const text = `Hi ${first}, your coach has set a temporary password for you. It works for ${TEMP_PASSWORD_DAYS} days, and you'll choose your own when you sign in.\n\nEmail: ${input.email}\nTemporary password: ${input.password}\n\nSign in: ${login}`
  return { subject: 'Your temporary Project 180 password', html, text }
}

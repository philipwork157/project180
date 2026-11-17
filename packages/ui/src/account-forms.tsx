// Forms for creating your own account, confirming your email and resetting a forgotten
// password. Both apps use them inside AuthShell and pass their own API calls; each call
// resolves with what the server answered, or throws an Error whose message is shown.
import { CheckCircle2, MailCheck } from 'lucide-react'
import { type FormEvent, type ReactNode, useEffect, useRef, useState } from 'react'
import { Button } from './button'
import { Field, Input, PasswordInput } from './field'
import { useTurnstile } from './turnstile'

const errorOf = (err: unknown) => (err instanceof Error ? err.message : 'Something went wrong.')

/** "Check your email": after signing up or asking for a link. Shows the link on test sites. */
function SentPanel({
  email,
  title,
  text,
  link,
  onResend,
  footer,
  turnstileSiteKey,
}: {
  email: string
  title: string
  text: string
  /** Only on local and dev sites: the link itself, as there may be no inbox. */
  link?: string
  onResend?: (turnstileToken: string | undefined) => Promise<unknown>
  footer?: ReactNode
  turnstileSiteKey?: string
}) {
  const [resent, setResent] = useState<'idle' | 'sending' | 'sent' | string>('idle')
  const check = useTurnstile(onResend ? turnstileSiteKey : undefined)
  return (
    <div className="flex flex-col gap-4" aria-live="polite">
      <div className="flex items-start gap-3 rounded-md bg-surface-raised p-4">
        <MailCheck className="mt-0.5 size-5 shrink-0 text-brand-text" aria-hidden />
        <div className="flex min-w-0 flex-col gap-1">
          <p className="font-bold text-[15px]">{title}</p>
          <p className="text-[14px] text-ink-muted">
            {text} <span className="break-all font-semibold text-ink">{email}</span>
          </p>
        </div>
      </div>
      {link && (
        <a href={link} className="break-all font-semibold text-[13px] text-brand-text underline">
          Test site: open the link
        </a>
      )}
      {onResend && resent !== 'sent' && check.widget}
      {onResend && (
        <Button
          variant="secondary"
          block
          loading={resent === 'sending'}
          disabled={resent === 'sent' || !check.ready}
          onClick={async () => {
            setResent('sending')
            try {
              await onResend(check.token)
              setResent('sent')
            } catch (err) {
              check.reset()
              setResent(errorOf(err))
            }
          }}
        >
          {resent === 'sent' ? 'Sent again' : 'Send it again'}
        </Button>
      )}
      {resent !== 'idle' && resent !== 'sending' && resent !== 'sent' && (
        <p role="alert" className="font-semibold text-[13px] text-danger">
          {resent}
        </p>
      )}
      {footer}
    </div>
  )
}

/**
 * Create an account. `business` adds a business name field (coaches in the admin). After it
 * works, shows "check your email" with a resend button.
 */
export function SignUpForm({
  business = false,
  onSignUp,
  onResend,
  footer,
  turnstileSiteKey,
}: {
  business?: boolean
  onSignUp: (input: {
    name: string
    email: string
    password: string
    businessName?: string
    turnstileToken?: string
    acceptTerms: true
  }) => Promise<{ email: string; link?: string }>
  onResend: (email: string, turnstileToken: string | undefined) => Promise<unknown>
  /** Under the form and the "sent" panel, e.g. "Already have an account? Sign in". */
  footer?: ReactNode
  /** Cloudflare Turnstile's site key; without it there's no check. */
  turnstileSiteKey?: string
}) {
  const [error, setError] = useState<{
    field: 'password' | 'repeat' | 'terms' | 'form'
    text: string
  }>()
  const [pending, setPending] = useState(false)
  const [sent, setSent] = useState<{ email: string; link?: string }>()
  const check = useTurnstile(turnstileSiteKey)

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const password = String(form.get('password'))
    if (password.length < 8)
      return setError({ field: 'password', text: 'Use at least 8 characters.' })
    if (password !== String(form.get('repeat')))
      return setError({ field: 'repeat', text: 'The two passwords don’t match.' })
    if (form.get('terms') !== 'on')
      return setError({
        field: 'terms',
        text: 'Agree to the terms and privacy policy to continue.',
      })
    setPending(true)
    setError(undefined)
    try {
      setSent(
        await onSignUp({
          name: String(form.get('name')),
          email: String(form.get('email')),
          password,
          businessName: business ? String(form.get('business')) : undefined,
          turnstileToken: check.token,
          acceptTerms: true,
        }),
      )
    } catch (err) {
      // A token works once: get a fresh one for the next try.
      check.reset()
      setError({ field: 'form', text: errorOf(err) })
    } finally {
      setPending(false)
    }
  }

  if (sent)
    return (
      <SentPanel
        email={sent.email}
        title="Check your email"
        text="Open the link we sent to confirm your account. It's on its way to"
        link={sent.link}
        onResend={(token) => onResend(sent.email, token)}
        footer={footer}
        turnstileSiteKey={turnstileSiteKey}
      />
    )
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <Field label="Your name">
        {(id) => <Input id={id} name="name" autoComplete="name" required autoFocus />}
      </Field>
      {business && (
        <Field
          label="Business name"
          hint="What your clients know you as. You can add coaches later."
        >
          {(id) => <Input id={id} name="business" autoComplete="organization" required />}
        </Field>
      )}
      <Field label="Email">
        {(id) => <Input id={id} name="email" type="email" autoComplete="email" required />}
      </Field>
      <Field
        label="Password"
        hint="At least 8 characters."
        error={error?.field === 'password' ? error.text : undefined}
      >
        {(id) => <PasswordInput id={id} name="password" autoComplete="new-password" required />}
      </Field>
      <Field label="Type it again" error={error?.field === 'repeat' ? error.text : undefined}>
        {(id) => <PasswordInput id={id} name="repeat" autoComplete="new-password" required />}
      </Field>
      <div className="flex flex-col gap-1.5">
        <label className="flex min-h-11 cursor-pointer items-start gap-3 text-[14px]">
          <input
            type="checkbox"
            name="terms"
            className="mt-0.5 size-5 shrink-0 accent-[var(--brand)]"
          />
          <span>
            I agree to the{' '}
            <a href="/terms" target="_blank" rel="noreferrer" className="font-bold text-brand-text">
              terms
            </a>{' '}
            and{' '}
            <a
              href="/privacy"
              target="_blank"
              rel="noreferrer"
              className="font-bold text-brand-text"
            >
              privacy policy
            </a>
            , including keeping my health details (like weight and body measurements) to run the app
            for me.
          </span>
        </label>
        {error?.field === 'terms' && (
          <p role="alert" className="font-semibold text-[13px] text-danger">
            {error.text}
          </p>
        )}
      </div>
      {check.widget}
      {error?.field === 'form' && (
        <p role="alert" className="font-semibold text-[13px] text-danger">
          {error.text}
        </p>
      )}
      <Button
        type="submit"
        size="lg"
        block
        loading={pending}
        disabled={!check.ready}
        className="mt-2 rounded-md shadow-none"
      >
        Create account
      </Button>
      {footer}
    </form>
  )
}

/** "Forgot your password?": asks for the email, then says a link is on its way. */
export function ForgotPasswordForm({
  onSend,
  footer,
  turnstileSiteKey,
}: {
  onSend: (email: string, turnstileToken: string | undefined) => Promise<{ link?: string }>
  footer?: ReactNode
  turnstileSiteKey?: string
}) {
  const [error, setError] = useState<string>()
  const [pending, setPending] = useState(false)
  const [sent, setSent] = useState<{ email: string; link?: string }>()
  const check = useTurnstile(turnstileSiteKey)

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const email = String(new FormData(e.currentTarget).get('email'))
    setPending(true)
    setError(undefined)
    try {
      const res = await onSend(email, check.token)
      setSent({ email, link: res.link })
    } catch (err) {
      check.reset()
      setError(errorOf(err))
    } finally {
      setPending(false)
    }
  }

  if (sent)
    return (
      <SentPanel
        email={sent.email}
        title="Check your email"
        text="If there's an account for this address, a link to choose a new password is on its way to"
        link={sent.link}
        footer={footer}
      />
    )
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <Field label="Email" error={error}>
        {(id) => (
          <Input id={id} name="email" type="email" autoComplete="email" required autoFocus />
        )}
      </Field>
      {check.widget}
      <Button
        type="submit"
        size="lg"
        block
        loading={pending}
        disabled={!check.ready}
        className="mt-2 rounded-md shadow-none"
      >
        Send me a link
      </Button>
      {footer}
    </form>
  )
}

/** The reset link: choose a new password (typed twice). */
export function ResetPasswordForm({
  token,
  onReset,
  done,
}: {
  token: string | undefined
  onReset: (token: string, password: string) => Promise<unknown>
  /** Shown once it worked, e.g. a "Sign in" button. */
  done: ReactNode
}) {
  const [password, setPassword] = useState('')
  const [repeat, setRepeat] = useState('')
  const [error, setError] = useState<string>()
  const [pending, setPending] = useState(false)
  const [ok, setOk] = useState(false)

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!token) return setError('This link isn’t complete. Ask for a new one.')
    if (password.length < 8) return setError('Use at least 8 characters.')
    if (password !== repeat) return setError('The two passwords don’t match.')
    setPending(true)
    setError(undefined)
    try {
      await onReset(token, password)
      setOk(true)
    } catch (err) {
      setError(errorOf(err))
    } finally {
      setPending(false)
    }
  }

  if (ok)
    return (
      <div className="flex flex-col gap-4">
        <p className="flex items-start gap-3 rounded-md bg-surface-raised p-4 text-[14px]">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-brand-text" aria-hidden />
          Your password is changed. You’re signed out on your other devices.
        </p>
        {done}
      </div>
    )
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <Field label="New password" hint="At least 8 characters.">
        {(id) => (
          <PasswordInput
            id={id}
            autoComplete="new-password"
            required
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        )}
      </Field>
      <Field label="Type it again" error={error}>
        {(id) => (
          <PasswordInput
            id={id}
            autoComplete="new-password"
            required
            value={repeat}
            onChange={(e) => setRepeat(e.target.value)}
          />
        )}
      </Field>
      <Button
        type="submit"
        size="lg"
        block
        loading={pending}
        className="mt-2 rounded-md shadow-none"
      >
        Save new password
      </Button>
    </form>
  )
}

/** The "confirm your email" link: confirms on arrival, then offers to sign in. */
export function VerifyEmailPanel({
  token,
  onVerify,
  done,
  failed,
}: {
  token: string | undefined
  onVerify: (token: string) => Promise<unknown>
  done: ReactNode
  /** Shown under the error, e.g. a "Sign in" button (signing in offers a new link). */
  failed: ReactNode
}) {
  const [state, setState] = useState<'working' | 'ok' | string>('working')
  const started = useRef(false)
  useEffect(() => {
    // Once, even in StrictMode: the link only works once.
    if (started.current) return
    started.current = true
    if (!token) return setState('This link isn’t complete. Sign in to get a new one.')
    onVerify(token).then(
      () => setState('ok'),
      (err: unknown) => setState(errorOf(err)),
    )
  }, [token, onVerify])
  if (state === 'working')
    return <div className="h-20 animate-pulse rounded-md bg-surface-raised" aria-busy="true" />
  if (state === 'ok')
    return (
      <div className="flex flex-col gap-4">
        <p className="flex items-start gap-3 rounded-md bg-surface-raised p-4 text-[14px]">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-brand-text" aria-hidden />
          Your email is confirmed. Sign in to get started.
        </p>
        {done}
      </div>
    )
  return (
    <div className="flex flex-col gap-4">
      <p
        role="alert"
        className="rounded-md bg-surface-raised p-4 font-semibold text-[14px] text-danger"
      >
        {state}
      </p>
      {failed}
    </div>
  )
}

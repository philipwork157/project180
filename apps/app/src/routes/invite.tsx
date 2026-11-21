import {
  ApiError,
  acceptInvitationNew,
  authClient,
  claimLocalData,
  lookUpInvitation,
} from '@project180/client'
import { AuthShell, Button, buttonClasses, Field, Input, PasswordInput } from '@project180/ui'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { type FormEvent, useState } from 'react'
import { claimPushForMe } from '../lib/push'

export const Route = createFileRoute('/invite')({
  validateSearch: (search: Record<string, unknown>): { token?: string } =>
    typeof search.token === 'string' ? { token: search.token } : {},
  component: InvitePage,
})

const STORY = {
  title: 'Your turnaround, one session at a time.',
  text: 'Your program, every set you log and how far you’ve come, together in one place.',
}

/**
 * The link in a coach's invitation email. Someone new chooses a password and is signed in
 * straight away; someone with an account signs in and accepts on Today. When their coach already
 * set the account up (Add client), they only choose a password and land on Today, ready to go.
 */
function InvitePage() {
  const { token } = Route.useSearch()
  const invitation = useQuery({
    queryKey: ['invitation', token],
    queryFn: async () => (await lookUpInvitation(token ?? '')).invitation,
    enabled: Boolean(token),
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
  })

  if (!token || invitation.isError)
    return (
      <AuthShell
        title="This invitation doesn’t work"
        subtitle="It may have expired or already been used."
        story={STORY}
      >
        <div className="flex flex-col gap-4">
          <p className="text-[15px] text-ink-muted">
            {invitation.error instanceof ApiError
              ? invitation.error.message
              : 'The link is incomplete. Open it again from the email, or ask your coach to send a new one.'}
          </p>
          <Link to="/login" className={buttonClasses('primary', 'lg', true)}>
            Sign in
          </Link>
        </div>
      </AuthShell>
    )
  if (!invitation.data)
    return (
      <AuthShell title="Opening your invitation" subtitle="One moment." story={STORY}>
        <div className="h-40 animate-pulse rounded-md bg-surface-raised" />
      </AuthShell>
    )

  const { coachName, businessName, existing, prepared } = invitation.data
  const first = invitation.data.name.split(' ')[0] || invitation.data.name
  return (
    <AuthShell
      title={prepared ? `Welcome, ${first}` : `${coachName} invited you`}
      subtitle={
        prepared
          ? `${coachName} has set up your program and goals on Project 180. Choose a password and you’re in.`
          : `Train with ${businessName} on Project 180: your program, food, progress and a chat with your coach.`
      }
      story={STORY}
    >
      {existing ? (
        <div className="flex flex-col gap-4">
          <p className="text-[15px]">
            You already have an account with <b>{invitation.data.email}</b>. Sign in and accept the
            invitation on your Today screen. Everything you’ve logged stays yours.
          </p>
          <Link to="/login" className={buttonClasses('primary', 'lg', true)}>
            Sign in to accept
          </Link>
        </div>
      ) : (
        <NewAccountForm
          token={token}
          email={invitation.data.email}
          name={invitation.data.name}
          prepared={Boolean(prepared)}
        />
      )}
    </AuthShell>
  )
}

function NewAccountForm({
  token,
  email,
  name,
  prepared,
}: {
  token: string
  email: string
  name: string
  /** Their coach set the account up: only a password to choose. */
  prepared: boolean
}) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [error, setError] = useState<{
    field: 'password' | 'repeat' | 'terms' | 'form'
    text: string
  }>()
  const [pending, setPending] = useState(false)

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
      await acceptInvitationNew({
        token,
        name: prepared ? name : String(form.get('name')),
        password,
        acceptTerms: true,
      })
      const { data, error: signInError } = await authClient.signIn.email({ email, password })
      if (signInError) throw new Error(signInError.message)
      queryClient.clear()
      claimLocalData(data?.user.id)
      await claimPushForMe()
      await navigate({ to: '/', replace: true })
    } catch (err) {
      setError({
        field: 'form',
        text: err instanceof Error ? err.message : 'Couldn’t create your account. Try again.',
      })
      setPending(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {!prepared && (
        <Field label="Your name">
          {(id) => (
            <Input id={id} name="name" autoComplete="name" defaultValue={name} required autoFocus />
          )}
        </Field>
      )}
      <Field
        label="Email"
        hint={prepared ? 'You sign in with this.' : 'The invitation was sent here.'}
      >
        {(id) => <Input id={id} value={email} readOnly className="text-ink-muted" />}
      </Field>
      <Field
        label="Choose a password"
        hint="At least 8 characters."
        error={error?.field === 'password' ? error.text : undefined}
      >
        {(id) => (
          <PasswordInput
            id={id}
            name="password"
            autoComplete="new-password"
            required
            autoFocus={prepared}
          />
        )}
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
            <Link to="/terms" target="_blank" className="font-bold text-brand-text">
              terms
            </Link>{' '}
            and{' '}
            <Link to="/privacy" target="_blank" className="font-bold text-brand-text">
              privacy policy
            </Link>
            , including keeping my health details (like weight and body measurements) to run the app
            for me and my coach.
          </span>
        </label>
        {error?.field === 'terms' && (
          <p role="alert" className="font-semibold text-[13px] text-danger">
            {error.text}
          </p>
        )}
      </div>
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
        className="mt-2 rounded-md shadow-none"
      >
        {prepared ? 'Choose password and start' : 'Create my account'}
      </Button>
    </form>
  )
}

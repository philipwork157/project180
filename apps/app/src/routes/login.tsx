import { authClient, claimLocalData, meQuery, resendVerifyEmail } from '@project180/client'
import { AuthShell, Button, Field, Input, PasswordInput, useTurnstile } from '@project180/ui'
import { useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link, redirect, useNavigate } from '@tanstack/react-router'
import { type FormEvent, useState } from 'react'
import { claimPushForMe } from '../lib/push'

export const Route = createFileRoute('/login')({
  beforeLoad: async ({ context }) => {
    if (await context.queryClient.ensureQueryData(meQuery)) throw redirect({ to: '/' })
  },
  component: LoginPage,
})

function LoginPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [error, setError] = useState<string>()
  const [pending, setPending] = useState(false)
  // Signed up but not confirmed yet: offer a new link for this email.
  const [unverified, setUnverified] = useState<string>()
  const [resent, setResent] = useState(false)
  // A new link sends an email: the same "are you a person" check as sign-up.
  const check = useTurnstile(unverified ? import.meta.env.VITE_TURNSTILE_SITE_KEY : undefined)

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    setPending(true)
    setError(undefined)
    const email = String(form.get('email'))
    const { data, error } = await authClient.signIn.email({
      email,
      password: String(form.get('password')),
    })
    setPending(false)
    if (error) {
      setError(error.status === 401 ? 'That email and password don’t match.' : error.message)
      setUnverified((error as { code?: string }).code === 'EMAIL_NOT_VERIFIED' ? email : undefined)
      setResent(false)
      return
    }
    // Start clean: nothing cached from whoever used this phone before (or the "signed out" answer).
    // Sets they hadn't sent yet are kept only if it's the same person signing back in.
    queryClient.clear()
    claimLocalData(data?.user.id)
    await claimPushForMe()
    await navigate({ to: '/' })
  }

  return (
    <AuthShell
      title="Sign in"
      subtitle="Welcome back. Sign in with your email and password."
      story={{
        title: 'Your turnaround, one session at a time.',
        text: 'Your program, every set you log and how far you’ve come, together in one place.',
      }}
      help={
        <span className="flex flex-col items-center gap-2">
          <Link to="/forgot" className="font-bold text-brand-text">
            Forgot your password?
          </Link>
          <span>
            New here?{' '}
            <Link to="/signup" className="font-bold text-brand-text">
              Create an account
            </Link>
          </span>
        </span>
      }
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <Field label="Email">
          {(id) => <Input id={id} name="email" type="email" autoComplete="email" required />}
        </Field>
        <Field label="Password" error={error}>
          {(id) => (
            <PasswordInput id={id} name="password" autoComplete="current-password" required />
          )}
        </Field>
        {unverified && !resent && check.widget}
        {unverified && (
          <Button
            variant="secondary"
            block
            disabled={resent || !check.ready}
            onClick={async () => {
              await resendVerifyEmail(unverified, check.token).catch(() => null)
              setResent(true)
            }}
          >
            {resent ? 'New link sent: check your email' : 'Send me a new link'}
          </Button>
        )}
        <Button
          type="submit"
          size="lg"
          block
          loading={pending}
          className="mt-2 rounded-md shadow-none"
        >
          Sign in
        </Button>
      </form>
    </AuthShell>
  )
}

import { authClient, forgetLocalData, meQuery, resendVerifyEmail } from '@project180/client'
import { canUseAdmin, isPlatform } from '@project180/shared'
import { AuthShell, Button, Field, Input, PasswordInput, useTurnstile } from '@project180/ui'
import { useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link, redirect, useNavigate } from '@tanstack/react-router'
import { type FormEvent, useState } from 'react'

export const Route = createFileRoute('/login')({
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData(meQuery)
    if (me && canUseAdmin(me.role)) throw redirect({ to: isPlatform(me.role) ? '/platform' : '/' })
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
    const { error } = await authClient.signIn.email({
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
    // The server already refuses clients here; this is a second check.
    const me = await queryClient.fetchQuery({ ...meQuery, staleTime: 0 })
    if (!me || !canUseAdmin(me.role)) {
      await authClient.signOut()
      queryClient.clear()
      setError('This sign-in is for coaches and owners. Clients sign in on the Project 180 app.')
      return
    }
    // Start clean: nothing cached from whoever used this computer before.
    queryClient.clear()
    forgetLocalData()
    // The platform admin's home is their own page.
    await navigate({ to: isPlatform(me.role) ? '/platform' : '/' })
  }

  return (
    <AuthShell
      title="Sign in"
      subtitle="Manage clients, programs and progress."
      badge="Admin"
      story={{
        title: 'Coach every client through the turn.',
        text: 'Build programs, assign them in seconds and see how everyone is going.',
      }}
      help={
        <span className="flex flex-col items-center gap-2">
          <Link to="/forgot" className="font-bold text-brand-text">
            Forgot your password?
          </Link>
          <span>
            New coach?{' '}
            <Link to="/signup" className="font-bold text-brand-text">
              Start coaching
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

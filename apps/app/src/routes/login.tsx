import { authClient, claimLocalData, meQuery } from '@project180/client'
import { AuthShell, Button, Field, Input, PasswordInput } from '@project180/ui'
import { useQueryClient } from '@tanstack/react-query'
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
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

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    setPending(true)
    setError(undefined)
    const { data, error } = await authClient.signIn.email({
      email: String(form.get('email')),
      password: String(form.get('password')),
    })
    setPending(false)
    if (error) {
      setError(error.status === 401 ? 'That email and password don’t match.' : error.message)
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
      subtitle="Use the email and password your coach gave you."
      story={{
        title: 'Your turnaround, one session at a time.',
        text: 'Your program, every set you log and how far you’ve come, together in one place.',
      }}
      help="Forgot your password? Ask your coach to set a new one."
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

import { authClient, forgetLocalData, meQuery } from '@project180/client'
import { isStaff } from '@project180/shared'
import { AuthShell, Button, Field, Input, PasswordInput } from '@project180/ui'
import { useQueryClient } from '@tanstack/react-query'
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { type FormEvent, useState } from 'react'

export const Route = createFileRoute('/login')({
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData(meQuery)
    if (me && isStaff(me.role)) throw redirect({ to: '/' })
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
    const { error } = await authClient.signIn.email({
      email: String(form.get('email')),
      password: String(form.get('password')),
    })
    setPending(false)
    if (error) {
      setError(error.status === 401 ? 'That email and password don’t match.' : error.message)
      return
    }
    // The server already refuses clients here; this is a second check.
    const me = await queryClient.fetchQuery({ ...meQuery, staleTime: 0 })
    if (!me || !isStaff(me.role)) {
      await authClient.signOut()
      queryClient.clear()
      setError('This sign-in is for coaches and owners. Clients sign in on the Project 180 app.')
      return
    }
    // Start clean: nothing cached from whoever used this computer before.
    queryClient.clear()
    forgetLocalData()
    await navigate({ to: '/' })
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
      help="Forgot your password? Ask an owner to reset it."
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

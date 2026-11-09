import { ApiError, api, authClient, meQuery } from '@project180/client'
import type { Me } from '@project180/shared'
import { AuthShell, ChoosePasswordForm } from '@project180/ui'
import { useQueryClient } from '@tanstack/react-query'
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'

/** First sign-in with a temporary password: choose your own before anything else. */
export const Route = createFileRoute('/choose-password')({
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData(meQuery)
    if (!me) throw redirect({ to: '/login' })
    if (!me.mustChangePassword) throw redirect({ to: '/' })
    return { me }
  },
  component: ChoosePasswordPage,
})

function ChoosePasswordPage() {
  const { me } = Route.useRouteContext()
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  async function save(password: string) {
    try {
      const { user } = await api<{ user: Me }>('/me/first-password', {
        method: 'POST',
        body: { password },
      })
      queryClient.setQueryData(meQuery.queryKey, user)
      await navigate({ to: '/', replace: true })
      return undefined
    } catch (e) {
      return e instanceof ApiError ? e.message : 'Something went wrong. Try again.'
    }
  }

  async function signOut() {
    await authClient.signOut().catch(() => undefined)
    queryClient.clear()
    await navigate({ to: '/login', replace: true })
  }

  return (
    <AuthShell
      title="Choose your password"
      subtitle={`Welcome, ${me.name.split(' ')[0]}. Pick a password only you know.`}
      story={{
        title: 'Make it yours.',
        text: 'Your coach set you up with a temporary password. Choose one only you know, and you’ll stay signed in on this device.',
      }}
    >
      <ChoosePasswordForm onSave={save} onSignOut={signOut} />
    </AuthShell>
  )
}

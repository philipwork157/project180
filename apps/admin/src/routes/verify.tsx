import { verifyEmail } from '@project180/client'
import { AuthShell, buttonClasses, VerifyEmailPanel } from '@project180/ui'
import { createFileRoute, Link } from '@tanstack/react-router'

export const Route = createFileRoute('/verify')({
  validateSearch: (search: Record<string, unknown>): { token?: string } =>
    typeof search.token === 'string' ? { token: search.token } : {},
  component: VerifyPage,
})

function VerifyPage() {
  const { token } = Route.useSearch()
  const signIn = (
    <Link to="/login" className={buttonClasses('primary', 'lg', true)}>
      Sign in
    </Link>
  )
  return (
    <AuthShell
      title="Confirm your email"
      subtitle="One moment while we check your link."
      badge="Admin"
      story={{
        title: 'Coach every client through the turn.',
        text: 'Build programs, assign them in seconds and see how everyone is going.',
      }}
    >
      <VerifyEmailPanel token={token} onVerify={verifyEmail} done={signIn} failed={signIn} />
    </AuthShell>
  )
}

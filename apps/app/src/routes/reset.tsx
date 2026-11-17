import { resetPassword } from '@project180/client'
import { AuthShell, buttonClasses, ResetPasswordForm } from '@project180/ui'
import { createFileRoute, Link } from '@tanstack/react-router'

export const Route = createFileRoute('/reset')({
  validateSearch: (search: Record<string, unknown>): { token?: string } =>
    typeof search.token === 'string' ? { token: search.token } : {},
  component: ResetPage,
})

function ResetPage() {
  const { token } = Route.useSearch()
  return (
    <AuthShell
      title="Choose a new password"
      subtitle="You’ll be signed out everywhere else."
      story={{
        title: 'Your turnaround, one session at a time.',
        text: 'Your program, every set you log and how far you’ve come, together in one place.',
      }}
    >
      <ResetPasswordForm
        token={token}
        onReset={resetPassword}
        done={
          <Link to="/login" className={buttonClasses('primary', 'lg', true)}>
            Sign in
          </Link>
        }
      />
    </AuthShell>
  )
}

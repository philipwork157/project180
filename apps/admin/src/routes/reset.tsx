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
      badge="Admin"
      story={{
        title: 'Coach every client through the turn.',
        text: 'Build programs, assign them in seconds and see how everyone is going.',
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

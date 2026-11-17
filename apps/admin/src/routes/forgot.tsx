import { forgotPassword } from '@project180/client'
import { AuthShell, ForgotPasswordForm } from '@project180/ui'
import { createFileRoute, Link } from '@tanstack/react-router'

export const Route = createFileRoute('/forgot')({
  component: ForgotPage,
})

function ForgotPage() {
  return (
    <AuthShell
      title="Forgot your password?"
      subtitle="We’ll email you a link to choose a new one."
      badge="Admin"
      story={{
        title: 'Coach every client through the turn.',
        text: 'Build programs, assign them in seconds and see how everyone is going.',
      }}
    >
      <ForgotPasswordForm
        onSend={forgotPassword}
        turnstileSiteKey={import.meta.env.VITE_TURNSTILE_SITE_KEY}
        footer={
          <Link to="/login" className="text-center font-bold text-[14px] text-brand-text">
            Back to sign in
          </Link>
        }
      />
    </AuthShell>
  )
}

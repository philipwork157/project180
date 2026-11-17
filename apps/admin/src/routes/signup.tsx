import { resendVerifyEmail, signUp } from '@project180/client'
import { AuthShell, SignUpForm } from '@project180/ui'
import { createFileRoute, Link } from '@tanstack/react-router'

export const Route = createFileRoute('/signup')({
  component: SignUpPage,
})

function SignUpPage() {
  return (
    <AuthShell
      title="Start coaching"
      subtitle="Your own dashboard for clients, programs and food, with a starter library to build from."
      badge="Admin"
      story={{
        title: 'Coach every client through the turn.',
        text: 'Build programs, assign them in seconds and see how everyone is going.',
      }}
    >
      <SignUpForm
        business
        onSignUp={signUp}
        onResend={resendVerifyEmail}
        turnstileSiteKey={import.meta.env.VITE_TURNSTILE_SITE_KEY}
        footer={
          <p className="text-center text-[14px] text-ink-muted">
            Already have an account?{' '}
            <Link to="/login" className="font-bold text-brand-text">
              Sign in
            </Link>
          </p>
        }
      />
    </AuthShell>
  )
}

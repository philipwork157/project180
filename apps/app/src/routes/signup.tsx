import { resendVerifyEmail, signUp } from '@project180/client'
import { AuthShell, SignUpForm } from '@project180/ui'
import { createFileRoute, Link } from '@tanstack/react-router'

export const Route = createFileRoute('/signup')({
  component: SignUpPage,
})

function SignUpPage() {
  return (
    <AuthShell
      title="Create your account"
      subtitle="Train, log your food and track your progress, with or without a coach."
      story={{
        title: 'Your turnaround, one session at a time.',
        text: 'Your program, every set you log and how far you’ve come, together in one place.',
      }}
    >
      <SignUpForm
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

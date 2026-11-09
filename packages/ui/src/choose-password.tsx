import { type FormEvent, useState } from 'react'
import { Button } from './button'
import { Field, PasswordInput } from './field'

/**
 * First sign-in after a temporary password: choose your own (typed twice). Goes inside AuthShell.
 * `onSave` returns an error message to show, or nothing when it worked.
 */
export function ChoosePasswordForm({
  onSave,
  onSignOut,
}: {
  onSave: (password: string) => Promise<string | undefined>
  onSignOut: () => void
}) {
  const [password, setPassword] = useState('')
  const [repeat, setRepeat] = useState('')
  const [error, setError] = useState<string>()
  const [pending, setPending] = useState(false)

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (password.length < 8) return setError('Use at least 8 characters.')
    if (password !== repeat) return setError('The two passwords don’t match.')
    setPending(true)
    setError(undefined)
    const problem = await onSave(password)
    setPending(false)
    if (problem) setError(problem)
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <Field label="New password" hint="At least 8 characters. Not the one from your email.">
        {(id) => (
          <PasswordInput
            id={id}
            name="new-password"
            autoComplete="new-password"
            required
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        )}
      </Field>
      <Field label="Type it again" error={error}>
        {(id) => (
          <PasswordInput
            id={id}
            name="confirm-password"
            autoComplete="new-password"
            required
            value={repeat}
            onChange={(e) => setRepeat(e.target.value)}
          />
        )}
      </Field>
      <Button
        type="submit"
        size="lg"
        block
        loading={pending}
        className="mt-2 rounded-md shadow-none"
      >
        Save and continue
      </Button>
      <button
        type="button"
        onClick={onSignOut}
        className="self-center rounded-md px-3 py-2 font-semibold text-[14px] text-ink-muted transition hover:text-ink"
      >
        Not you? Sign out
      </button>
    </form>
  )
}

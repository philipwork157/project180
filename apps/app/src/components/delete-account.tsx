import { ApiError, api, forgetLocalData } from '@project180/client'
import { Button, ConfirmDialog, Field, PasswordInput } from '@project180/ui'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Trash2 } from 'lucide-react'
import { useState } from 'react'
import { turnPushOff } from '../lib/push'

/**
 * Profile → Delete my account (clients): everything they logged goes, for good (POPIA). Asks
 * for their password in the confirm dialog, so a phone left unlocked can't do it.
 */
export function DeleteAccount({ coached }: { coached: boolean }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string>()
  const [pending, setPending] = useState(false)

  async function remove() {
    setPending(true)
    setError(undefined)
    try {
      // While still signed in: this phone stops getting notifications.
      await turnPushOff().catch(() => null)
      await api('/me/delete', { method: 'POST', body: { password } })
      queryClient.clear()
      forgetLocalData()
      await navigate({ to: '/login', replace: true })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Couldn’t delete it. Try again.')
      setPending(false)
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <Button
        variant="ghost"
        block
        className="text-danger hover:bg-danger/10"
        icon={<Trash2 className="size-5" aria-hidden />}
        onClick={() => setOpen(true)}
      >
        Delete my account
      </Button>
      <ConfirmDialog
        open={open}
        title="Delete your account for good?"
        confirmLabel="Delete everything"
        loading={pending}
        confirmDisabled={!password}
        onConfirm={() => void remove()}
        onClose={() => {
          if (pending) return
          setOpen(false)
          setPassword('')
          setError(undefined)
        }}
      >
        <div className="flex flex-col gap-4">
          <p className="text-[15px] text-ink-muted">
            Your account, workouts, food log, weigh-ins, goals and messages are deleted straight
            away. This can’t be undone.
            {coached && ' Your coach will no longer see you.'}
          </p>
          <Field label="Your password" error={error}>
            {(id) => (
              <PasswordInput
                id={id}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            )}
          </Field>
        </div>
      </ConfirmDialog>
    </section>
  )
}

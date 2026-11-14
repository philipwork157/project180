import { api, authClient, myProfileQuery } from '@project180/client'
import {
  type ClientProfile,
  EXPERIENCE_LABELS,
  EXPERIENCE_LEVELS,
  GOAL_LABELS,
  GOALS,
  TRAINING_PLACE_LABELS,
  TRAINING_PLACES,
} from '@project180/shared'
import {
  Button,
  Chip,
  ChoiceChips,
  Field,
  Input,
  MultiChoiceChips,
  PasswordInput,
  toast,
} from '@project180/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { KeyRound, Pencil, Target } from 'lucide-react'
import { useState } from 'react'
import { claimPushForMe } from '../lib/push'
import { Sheet } from './sheet'

const goalOptions = GOALS.map((g) => ({ value: g, label: GOAL_LABELS[g] }))

/** Your goals as your coach sees them, editable here. */
export function MyGoals() {
  const profile = useQuery(myProfileQuery)
  const [editing, setEditing] = useState(false)
  const p = profile.data
  if (!p) return <div className="h-28 animate-pulse rounded-lg bg-surface" />
  const set = Boolean(p.mainGoal || p.focusAreas.length)
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-[17px]">Your goals</h2>
        <Button
          variant="ghost"
          size="sm"
          icon={<Pencil className="size-4" aria-hidden />}
          onClick={() => setEditing(true)}
        >
          {set ? 'Edit' : 'Add'}
        </Button>
      </div>
      <div className="flex flex-col gap-3 rounded-lg bg-surface p-5 shadow-card">
        {set ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Target className="size-5 text-brand-text" aria-hidden />
              {p.mainGoal && <Chip tone="brand">{GOAL_LABELS[p.mainGoal]}</Chip>}
              {p.focusAreas.map((g) => (
                <Chip key={g}>{GOAL_LABELS[g]}</Chip>
              ))}
            </div>
            <p className="font-semibold text-[14px] text-ink-muted">
              {[
                p.experience && EXPERIENCE_LABELS[p.experience],
                p.daysPerWeek && `${p.daysPerWeek} days a week`,
                p.places.length > 0 && p.places.map((x) => TRAINING_PLACE_LABELS[x]).join(', '),
                p.goalWeightKg && `goal ${p.goalWeightKg} kg`,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
            {p.targetEvent && (
              <p className="font-bold text-[14px]">
                Training for {p.targetEvent}
                {p.targetEventDate && (
                  <span className="font-semibold text-ink-muted"> on {p.targetEventDate}</span>
                )}
              </p>
            )}
          </>
        ) : (
          <p className="text-[15px] text-ink-muted">Tell your coach what you’re working towards.</p>
        )}
      </div>
      <GoalsSheet open={editing} onClose={() => setEditing(false)} profile={p} />
    </section>
  )
}

function GoalsSheet({
  open,
  onClose,
  profile,
}: {
  open: boolean
  onClose: () => void
  profile: ClientProfile
}) {
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState(profile)
  const [goalWeight, setGoalWeight] = useState(profile.goalWeightKg?.toString() ?? '')
  const save = useMutation({
    mutationFn: () => {
      const gw = Number.parseFloat(goalWeight.replace(',', '.'))
      const { latestWeightKg: _ignored, ...rest } = draft
      return api<{ profile: ClientProfile }>('/me/profile', {
        method: 'PUT',
        body: { ...rest, goalWeightKg: Number.isFinite(gw) ? gw : null },
      })
    },
    onSuccess: ({ profile: saved }) => {
      // The server sends the saved profile back: use it, no second request.
      queryClient.setQueryData(myProfileQuery.queryKey, saved)
      toast({ title: 'Goals saved' })
      onClose()
    },
  })
  const update = (patch: Partial<ClientProfile>) => setDraft((d) => ({ ...d, ...patch }))
  return (
    <Sheet open={open} onClose={onClose} label="Your goals">
      <div className="flex flex-col gap-5 pb-4">
        <h2 className="font-display font-extrabold text-[24px]">Your goals</h2>
        <Field label="Main goal">
          {() => (
            <ChoiceChips
              label="Main goal"
              options={goalOptions}
              value={draft.mainGoal}
              onChange={(mainGoal) =>
                update({ mainGoal, focusAreas: draft.focusAreas.filter((g) => g !== mainGoal) })
              }
            />
          )}
        </Field>
        <Field label="Also working on">
          {() => (
            <MultiChoiceChips
              label="Also working on"
              options={goalOptions.filter((o) => o.value !== draft.mainGoal)}
              value={draft.focusAreas}
              onChange={(focusAreas) => update({ focusAreas })}
            />
          )}
        </Field>
        <Field label="Experience">
          {() => (
            <ChoiceChips
              label="Experience"
              options={EXPERIENCE_LEVELS.map((e) => ({ value: e, label: EXPERIENCE_LABELS[e] }))}
              value={draft.experience}
              onChange={(experience) => update({ experience })}
            />
          )}
        </Field>
        <Field label="Days a week">
          {() => (
            <ChoiceChips
              label="Days a week"
              options={['1', '2', '3', '4', '5', '6', '7'].map((n) => ({ value: n, label: n }))}
              value={draft.daysPerWeek ? String(draft.daysPerWeek) : null}
              onChange={(v) => update({ daysPerWeek: v ? Number(v) : null })}
            />
          )}
        </Field>
        <Field label="Where you train">
          {() => (
            <MultiChoiceChips
              label="Where you train"
              options={TRAINING_PLACES.map((x) => ({ value: x, label: TRAINING_PLACE_LABELS[x] }))}
              value={draft.places}
              onChange={(places) => update({ places })}
            />
          )}
        </Field>
        <Field label="Goal weight (kg)" hint="Optional">
          {(id) => (
            <Input
              id={id}
              inputMode="decimal"
              value={goalWeight}
              onChange={(e) => setGoalWeight(e.target.value)}
            />
          )}
        </Field>
        <Button size="lg" block loading={save.isPending} onClick={() => save.mutate()}>
          Save goals
        </Button>
      </div>
    </Sheet>
  )
}

/** Change your own password (e.g. the temporary one your coach set). */
export function ChangePassword() {
  const [open, setOpen] = useState(false)
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [repeat, setRepeat] = useState('')
  const [errors, setErrors] = useState<{ current?: string; next?: string; repeat?: string }>({})
  const [pending, setPending] = useState(false)

  function close() {
    setOpen(false)
    setCurrent('')
    setNext('')
    setRepeat('')
    setErrors({})
  }

  async function submit() {
    if (!current) return setErrors({ current: 'Enter your current password.' })
    if (next.length < 8) return setErrors({ next: 'Use at least 8 characters.' })
    if (next === current) return setErrors({ next: 'Use a different password.' })
    if (next !== repeat) return setErrors({ repeat: 'The two passwords don’t match.' })
    setErrors({})
    setPending(true)
    const { error: err } = await authClient.changePassword({
      currentPassword: current,
      newPassword: next,
      revokeOtherSessions: true,
    })
    setPending(false)
    if (err) {
      return setErrors(
        err.status === 400 || err.status === 401
          ? { current: 'Your current password isn’t right.' }
          : { repeat: err.message ?? 'Could not change it.' },
      )
    }
    // Changing it signs in again (new sign-in): this phone's notifications move to it.
    await claimPushForMe()
    toast({ title: 'Password changed', description: 'Other devices were signed out.' })
    close()
  }

  return (
    <section className="flex flex-col gap-3">
      <Button
        variant="secondary"
        block
        icon={<KeyRound className="size-5" aria-hidden />}
        onClick={() => setOpen(true)}
      >
        Change password
      </Button>
      <Sheet open={open} onClose={close} label="Change password">
        <form
          className="flex flex-col gap-5 pb-4"
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
        >
          <h2 className="font-display font-extrabold text-[24px]">Change password</h2>
          <Field label="Current password" error={errors.current}>
            {(id) => (
              <PasswordInput
                id={id}
                name="current-password"
                autoComplete="current-password"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
              />
            )}
          </Field>
          <Field label="New password" hint="At least 8 characters" error={errors.next}>
            {(id) => (
              <PasswordInput
                id={id}
                name="new-password"
                autoComplete="new-password"
                value={next}
                onChange={(e) => setNext(e.target.value)}
              />
            )}
          </Field>
          <Field label="Confirm new password" error={errors.repeat}>
            {(id) => (
              <PasswordInput
                id={id}
                name="confirm-password"
                autoComplete="new-password"
                value={repeat}
                onChange={(e) => setRepeat(e.target.value)}
              />
            )}
          </Field>
          <Button type="submit" size="lg" block loading={pending}>
            Save new password
          </Button>
        </form>
      </Sheet>
    </section>
  )
}

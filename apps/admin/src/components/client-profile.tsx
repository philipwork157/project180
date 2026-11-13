import { ApiError, api, clientProfileQuery } from '@project180/client'
import {
  type ClientProfile,
  type ClientProfileInput,
  EXPERIENCE_LABELS,
  EXPERIENCE_LEVELS,
  type ExperienceLevel,
  GOAL_LABELS,
  GOALS,
  type Goal,
  type Sex,
  TRAINING_PLACE_LABELS,
  TRAINING_PLACES,
  type TrainingPlace,
} from '@project180/shared'
import {
  BirthDateSelect,
  Button,
  Chip,
  ChoiceChips,
  DatePicker,
  Drawer,
  Field,
  Input,
  MultiChoiceChips,
  Textarea,
  toast,
} from '@project180/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarClock, NotebookPen, Pencil, Ruler, Scale, Target } from 'lucide-react'
import { type ReactNode, useState } from 'react'

export interface ProfileDraft {
  phone: string
  birthDate: string | null
  sex: Sex | null
  heightCm: string
  goalWeightKg: string
  mainGoal: Goal | null
  focusAreas: Goal[]
  places: TrainingPlace[]
  experience: ExperienceLevel | null
  daysPerWeek: number | null
  targetEvent: string
  targetEventDate: string | null
  notes: string
}

export const EMPTY_PROFILE: ProfileDraft = {
  phone: '',
  birthDate: null,
  sex: null,
  heightCm: '',
  goalWeightKg: '',
  mainGoal: null,
  focusAreas: [],
  places: [],
  experience: null,
  daysPerWeek: null,
  targetEvent: '',
  targetEventDate: null,
  notes: '',
}

const num = (v: string) => {
  const n = Number.parseFloat(v.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

export function profileToDraft(p: ClientProfile): ProfileDraft {
  return {
    phone: p.phone ?? '',
    birthDate: p.birthDate,
    sex: p.sex,
    heightCm: p.heightCm?.toString() ?? '',
    goalWeightKg: p.goalWeightKg?.toString() ?? '',
    mainGoal: p.mainGoal,
    focusAreas: p.focusAreas,
    places: p.places,
    experience: p.experience,
    daysPerWeek: p.daysPerWeek,
    targetEvent: p.targetEvent ?? '',
    targetEventDate: p.targetEventDate,
    notes: p.notes ?? '',
  }
}

export function draftToInput(d: ProfileDraft): ClientProfileInput {
  return {
    phone: d.phone.trim() || null,
    birthDate: d.birthDate,
    sex: d.sex,
    heightCm: num(d.heightCm),
    goalWeightKg: num(d.goalWeightKg),
    mainGoal: d.mainGoal,
    focusAreas: d.focusAreas,
    places: d.places,
    experience: d.experience,
    daysPerWeek: d.daysPerWeek,
    targetEvent: d.targetEvent.trim() || null,
    targetEventDate: d.targetEvent.trim() ? d.targetEventDate : null,
    notes: d.notes.trim() || null,
  }
}

const goalOptions = GOALS.map((g) => ({ value: g, label: GOAL_LABELS[g] }))
const SEX_OPTIONS = [
  { value: 'female' as const, label: 'Female' },
  { value: 'male' as const, label: 'Male' },
]

/** Body basics: birth date, sex, height, weight now and goal weight. */
export function BodyFields({
  draft,
  onChange,
  currentWeight,
  onCurrentWeight,
}: {
  draft: ProfileDraft
  onChange: (patch: Partial<ProfileDraft>) => void
  /** Only when adding someone: becomes their first weigh-in. */
  currentWeight?: string
  onCurrentWeight?: (v: string) => void
}) {
  return (
    <div className="flex flex-col gap-5">
      <Field label="Date of birth" hint="Optional">
        {(id) => (
          <BirthDateSelect
            id={id}
            value={draft.birthDate}
            onChange={(birthDate) => onChange({ birthDate })}
          />
        )}
      </Field>
      <Field label="Sex" hint="Optional. Used later for calorie and heart-rate estimates.">
        {() => (
          <ChoiceChips
            label="Sex"
            options={SEX_OPTIONS}
            value={draft.sex}
            onChange={(sex) => onChange({ sex })}
          />
        )}
      </Field>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Field label="Height (cm)">
          {(id) => (
            <Input
              id={id}
              inputMode="decimal"
              placeholder="170"
              value={draft.heightCm}
              onChange={(e) => onChange({ heightCm: e.target.value })}
            />
          )}
        </Field>
        {onCurrentWeight && (
          <Field label="Weight now (kg)">
            {(id) => (
              <Input
                id={id}
                inputMode="decimal"
                placeholder="70"
                value={currentWeight ?? ''}
                onChange={(e) => onCurrentWeight(e.target.value)}
              />
            )}
          </Field>
        )}
        <Field label="Goal weight (kg)">
          {(id) => (
            <Input
              id={id}
              inputMode="decimal"
              placeholder="Optional"
              value={draft.goalWeightKg}
              onChange={(e) => onChange({ goalWeightKg: e.target.value })}
            />
          )}
        </Field>
      </div>
    </div>
  )
}

/** Goals: one main goal, extra focus areas, experience, days a week, where, an event, notes. */
export function GoalFields({
  draft,
  onChange,
}: {
  draft: ProfileDraft
  onChange: (patch: Partial<ProfileDraft>) => void
}) {
  return (
    <div className="flex flex-col gap-5">
      <Field label="Main goal">
        {() => (
          <ChoiceChips
            label="Main goal"
            options={goalOptions}
            value={draft.mainGoal}
            onChange={(mainGoal) =>
              onChange({ mainGoal, focusAreas: draft.focusAreas.filter((g) => g !== mainGoal) })
            }
          />
        )}
      </Field>
      <Field label="Also working on" hint="Optional, pick any">
        {() => (
          <MultiChoiceChips
            label="Also working on"
            options={goalOptions.filter((o) => o.value !== draft.mainGoal)}
            value={draft.focusAreas}
            onChange={(focusAreas) => onChange({ focusAreas })}
          />
        )}
      </Field>
      <Field label="Experience">
        {() => (
          <ChoiceChips
            label="Experience"
            options={EXPERIENCE_LEVELS.map((e) => ({ value: e, label: EXPERIENCE_LABELS[e] }))}
            value={draft.experience}
            onChange={(experience) => onChange({ experience })}
          />
        )}
      </Field>
      <Field label="Days a week they can train">
        {() => (
          <ChoiceChips
            label="Days a week"
            options={['1', '2', '3', '4', '5', '6', '7'].map((n) => ({ value: n, label: n }))}
            value={draft.daysPerWeek ? String(draft.daysPerWeek) : null}
            onChange={(v) => onChange({ daysPerWeek: v ? Number(v) : null })}
          />
        )}
      </Field>
      <Field label="Where they train">
        {() => (
          <MultiChoiceChips
            label="Where they train"
            options={TRAINING_PLACES.map((p) => ({ value: p, label: TRAINING_PLACE_LABELS[p] }))}
            value={draft.places}
            onChange={(places) => onChange({ places })}
          />
        )}
      </Field>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_200px]">
        <Field label="Training for an event?" hint="Optional, e.g. Two Oceans half marathon">
          {(id) => (
            <Input
              id={id}
              value={draft.targetEvent}
              onChange={(e) => onChange({ targetEvent: e.target.value })}
            />
          )}
        </Field>
        {draft.targetEvent.trim() && (
          <Field label="Event date">
            {(id) => (
              <DatePicker
                id={id}
                value={draft.targetEventDate}
                onChange={(targetEventDate) => onChange({ targetEventDate })}
              />
            )}
          </Field>
        )}
      </div>
      <Field label="Injuries or anything to know" hint="Only what helps you coach them">
        {(id) => (
          <Textarea
            id={id}
            value={draft.notes}
            onChange={(e) => onChange({ notes: e.target.value })}
          />
        )}
      </Field>
    </div>
  )
}

function ageFrom(birthDate: string | null) {
  if (!birthDate) return null
  const b = new Date(`${birthDate}T00:00:00Z`)
  const now = new Date()
  let age = now.getUTCFullYear() - b.getUTCFullYear()
  if (
    now.getUTCMonth() < b.getUTCMonth() ||
    (now.getUTCMonth() === b.getUTCMonth() && now.getUTCDate() < b.getUTCDate())
  )
    age--
  return age
}

function daysUntil(date: string) {
  return Math.ceil((Date.parse(`${date}T00:00:00Z`) - Date.now()) / 86_400_000)
}

/** Goals and body basics at a glance on a person's card, with Edit. */
export function ProfileSummary({ userId, name }: { userId: number; name: string }) {
  const profile = useQuery(clientProfileQuery(userId))
  const [editing, setEditing] = useState(false)
  const p = profile.data
  if (!p) return null
  const age = ageFrom(p.birthDate)
  const empty =
    !p.mainGoal && !p.heightCm && !p.latestWeightKg && p.focusAreas.length === 0 && !p.notes
  const facts: Array<{ icon: ReactNode; text: string }> = []
  if (p.latestWeightKg)
    facts.push({
      icon: <Scale aria-hidden />,
      text: `${p.latestWeightKg} kg${p.goalWeightKg ? ` → ${p.goalWeightKg} kg` : ''}`,
    })
  if (p.heightCm || age)
    facts.push({
      icon: <Ruler aria-hidden />,
      text: [p.heightCm && `${p.heightCm} cm`, age && `${age} yrs`].filter(Boolean).join(' · '),
    })
  if (p.targetEvent) {
    const d = p.targetEventDate ? daysUntil(p.targetEventDate) : null
    facts.push({
      icon: <CalendarClock aria-hidden />,
      text: `${p.targetEvent}${d !== null && d >= 0 ? ` · in ${d} days` : ''}`,
    })
  }
  return (
    <div className="flex flex-col gap-3 rounded-md bg-surface-raised p-4">
      <div className="flex items-start gap-3">
        <Target className="mt-0.5 size-4 shrink-0 text-brand-text" aria-hidden />
        <div className="min-w-0 flex-1">
          {empty ? (
            <p className="font-semibold text-[14px] text-ink-muted">
              No goals or body details yet.
            </p>
          ) : (
            <div className="flex flex-wrap items-center gap-1.5">
              {p.mainGoal && <Chip tone="brand">{GOAL_LABELS[p.mainGoal]}</Chip>}
              {p.focusAreas.map((g) => (
                <Chip key={g}>{GOAL_LABELS[g]}</Chip>
              ))}
              {(p.experience || p.daysPerWeek) && (
                // One line of its own, so it never breaks oddly between the chips.
                <span className="w-full font-semibold text-[13px] text-ink-muted">
                  {[
                    p.experience && EXPERIENCE_LABELS[p.experience],
                    p.daysPerWeek && `${p.daysPerWeek} days a week`,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              )}
            </div>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          icon={<Pencil className="size-4" aria-hidden />}
          className="-my-1 shrink-0 max-sm:px-2"
          onClick={() => setEditing(true)}
        >
          {/* Phones: just the pencil, so the goals get the width. */}
          <span className="max-sm:sr-only">{empty ? 'Add' : 'Edit'}</span>
        </Button>
      </div>
      {facts.length > 0 && (
        <ul className="flex flex-wrap gap-x-5 gap-y-1.5 pl-7 font-semibold text-[13px] [&_svg]:size-3.5 [&_svg]:text-ink-muted">
          {facts.map((f) => (
            <li key={f.text} className="inline-flex items-center gap-1.5">
              {f.icon}
              {f.text}
            </li>
          ))}
        </ul>
      )}
      {p.notes && (
        <p className="flex gap-2 pl-7 text-[13px] text-ink-muted">
          <NotebookPen className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span className="line-clamp-2">{p.notes}</span>
        </p>
      )}
      <ProfileDrawer
        open={editing}
        onClose={() => setEditing(false)}
        userId={userId}
        name={name}
        profile={p}
      />
    </div>
  )
}

function ProfileDrawer({
  open,
  onClose,
  userId,
  name,
  profile,
}: {
  open: boolean
  onClose: () => void
  userId: number
  name: string
  profile: ClientProfile
}) {
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState(() => profileToDraft(profile))
  const [error, setError] = useState<string>()
  const save = useMutation({
    mutationFn: () =>
      api(`/admin/users/${userId}/profile`, { method: 'PUT', body: draftToInput(draft) }),
    onSuccess: () => {
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: clientProfileQuery(userId).queryKey }),
        queryClient.invalidateQueries({ queryKey: ['admin', 'users'] }),
      ])
      toast({ title: 'Profile saved', description: name })
      onClose()
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Could not save.'),
  })
  const update = (patch: Partial<ProfileDraft>) => setDraft((d) => ({ ...d, ...patch }))
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={`${name.split(' ')[0]}’s profile`}
      description="Contact, body basics and goals."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={save.isPending} onClick={() => save.mutate()}>
            Save profile
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-8">
        <Field label="Phone" hint="Optional, for WhatsApp" error={error}>
          {(id) => (
            <Input
              id={id}
              type="tel"
              value={draft.phone}
              onChange={(e) => update({ phone: e.target.value })}
            />
          )}
        </Field>
        <BodyFields draft={draft} onChange={update} />
        <GoalFields draft={draft} onChange={update} />
      </div>
    </Drawer>
  )
}

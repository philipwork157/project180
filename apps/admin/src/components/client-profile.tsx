import { ApiError, api, clientProfileQuery } from '@project180/client'
import {
  ACTIVITY_LABELS,
  ACTIVITY_LEVELS,
  type ActivityLevel,
  BODY_GOAL_LABELS,
  BODY_GOALS,
  type BodyGoal,
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
  Button,
  Card,
  Chip,
  ChoiceChips,
  cn,
  DatePicker,
  Drawer,
  Field,
  Input,
  MultiChoiceChips,
  Textarea,
  toast,
} from '@project180/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarClock, Mars, NotebookPen, Pencil, Ruler, Scale, Target, Venus } from 'lucide-react'
import { type ReactNode, useState } from 'react'

export interface ProfileDraft {
  phone: string
  birthDate: string | null
  sex: Sex | null
  heightCm: string
  goalWeightKg: string
  activityLevel: ActivityLevel | null
  bodyGoal: BodyGoal | null
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
  activityLevel: null,
  bodyGoal: null,
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
    activityLevel: p.activityLevel,
    bodyGoal: p.bodyGoal,
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
    activityLevel: d.activityLevel,
    bodyGoal: d.bodyGoal,
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
export const SEX_OPTIONS = [
  { value: 'female' as const, label: 'Female', icon: <Venus strokeWidth={2.5} /> },
  { value: 'male' as const, label: 'Male', icon: <Mars strokeWidth={2.5} /> },
]

export const ACTIVITY_OPTIONS = ACTIVITY_LEVELS.map((a) => ({
  value: a,
  label: ACTIVITY_LABELS[a],
}))

/** A titled block in a long form: small-caps heading, a line above, an optional one-line note. */
function FormSection({
  title,
  note,
  children,
}: {
  title: string
  note?: string
  children: ReactNode
}) {
  return (
    <section className="flex flex-col gap-5 border-border border-t pt-6 first:border-t-0 first:pt-0">
      <header className="flex flex-col gap-1">
        <h3 className="font-extrabold text-[11px] text-ink-muted uppercase tracking-[0.08em]">
          {title}
        </h3>
        {note && <p className="text-[13px] text-ink-muted">{note}</p>}
      </header>
      {children}
    </section>
  )
}

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
          <DatePicker
            id={id}
            birth
            placeholder="Pick their birthday"
            value={draft.birthDate}
            onChange={(birthDate) => onChange({ birthDate })}
            onClear={() => onChange({ birthDate: null })}
          />
        )}
      </Field>
      <Field label="Sex" hint="Optional. Used to work out their daily calories.">
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
      <Field
        label="How active are they?"
        hint="Everyday life, not counting workouts (those are added each day). Optional."
      >
        {() => (
          <ChoiceChips
            label="How active are they?"
            options={ACTIVITY_OPTIONS}
            value={draft.activityLevel}
            onChange={(activityLevel: ActivityLevel | null) => onChange({ activityLevel })}
          />
        )}
      </Field>
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
      <Field label="Body goal" hint="What their body should do. Check-ins measure them against it.">
        {() => (
          <ChoiceChips
            label="Body goal"
            options={BODY_GOALS.map((g) => ({ value: g, label: BODY_GOAL_LABELS[g] }))}
            value={draft.bodyGoal}
            onChange={(bodyGoal) => onChange({ bodyGoal })}
          />
        )}
      </Field>
      <Field label="Training focus">
        {() => (
          <ChoiceChips
            label="Training focus"
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
    !p.bodyGoal &&
    !p.mainGoal &&
    !p.heightCm &&
    !p.latestWeightKg &&
    p.focusAreas.length === 0 &&
    !p.notes
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
              {p.bodyGoal && <Chip tone="brand">{BODY_GOAL_LABELS[p.bodyGoal]}</Chip>}
              {p.mainGoal && <Chip>{GOAL_LABELS[p.mainGoal]}</Chip>}
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

const birthLabel = (iso: string) =>
  new Intl.DateTimeFormat('en-ZA', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${iso}T00:00:00Z`))

/**
 * Everything in their profile, every field showing (Not set where it's empty), with Edit. For
 * the Profile & access tab, so nothing is only visible inside the drawer.
 */
export function ProfileDetails({ userId, name }: { userId: number; name: string }) {
  const profile = useQuery(clientProfileQuery(userId))
  const [editing, setEditing] = useState(false)
  const p = profile.data
  if (!p) return <div className="h-80 animate-pulse rounded-lg bg-surface" />
  const age = ageFrom(p.birthDate)
  const list = (items: string[]) => (items.length > 0 ? items.join(', ') : null)
  const groups: Array<{ title: string; rows: Array<[string, string | null]> }> = [
    {
      title: 'Contact and body',
      rows: [
        ['Phone', p.phone],
        ['Date of birth', p.birthDate && `${birthLabel(p.birthDate)} · ${age} yrs`],
        ['Sex', SEX_OPTIONS.find((o) => o.value === p.sex)?.label ?? null],
        ['Height', p.heightCm ? `${p.heightCm} cm` : null],
        ['Weight now', p.latestWeightKg ? `${p.latestWeightKg} kg (latest weigh-in)` : null],
        ['Goal weight', p.goalWeightKg ? `${p.goalWeightKg} kg` : null],
        ['How active', p.activityLevel && ACTIVITY_LABELS[p.activityLevel]],
      ],
    },
    {
      title: 'Goals',
      rows: [
        ['Body goal', p.bodyGoal && BODY_GOAL_LABELS[p.bodyGoal]],
        ['Training focus', p.mainGoal && GOAL_LABELS[p.mainGoal]],
        ['Also working on', list(p.focusAreas.map((g) => GOAL_LABELS[g]))],
        ['Experience', p.experience && EXPERIENCE_LABELS[p.experience]],
        ['Days a week', p.daysPerWeek ? `${p.daysPerWeek} days` : null],
        ['Where they train', list(p.places.map((x) => TRAINING_PLACE_LABELS[x]))],
        [
          'Event',
          p.targetEvent &&
            [p.targetEvent, p.targetEventDate && birthLabel(p.targetEventDate)]
              .filter(Boolean)
              .join(' · '),
        ],
        ['Injuries or anything to know', p.notes],
      ],
    },
  ]
  return (
    <Card className="flex min-w-0 flex-col gap-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="font-bold text-[17px]">Profile</h2>
          <p className="text-[14px] text-ink-muted">
            Body basics and goals. Used for their daily calories and shown to them in the app.
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          icon={<Pencil className="size-4" aria-hidden />}
          onClick={() => setEditing(true)}
        >
          Edit
        </Button>
      </div>
      {groups.map((g) => (
        <section key={g.title} className="flex flex-col gap-4 border-border border-t pt-5">
          <h3 className="font-extrabold text-[11px] text-ink-muted uppercase tracking-[0.08em]">
            {g.title}
          </h3>
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {g.rows.map(([label, value]) => (
              <div
                key={label}
                className={cn(
                  'flex min-w-0 flex-col gap-1',
                  label === 'Injuries or anything to know' && 'sm:col-span-2',
                )}
              >
                <dt className="font-semibold text-[13px] text-ink-muted">{label}</dt>
                <dd
                  className={cn(
                    'whitespace-pre-line break-words text-[15px]',
                    value ? 'font-semibold' : 'text-ink-muted',
                  )}
                >
                  {value || 'Not set'}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
      <ProfileDrawer
        open={editing}
        onClose={() => setEditing(false)}
        userId={userId}
        name={name}
        profile={p}
      />
    </Card>
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
      <div className="flex flex-col gap-6">
        <FormSection title="Contact">
          <Field label="Phone" hint="Optional, for WhatsApp" error={error}>
            {(id) => (
              <Input
                id={id}
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="082 123 4567"
                value={draft.phone}
                onChange={(e) => update({ phone: e.target.value })}
              />
            )}
          </Field>
        </FormSection>
        <FormSection
          title="Body"
          note="Age, sex, height and activity work out their daily calories."
        >
          <BodyFields draft={draft} onChange={update} />
        </FormSection>
        <FormSection title="Goals">
          <GoalFields draft={draft} onChange={update} />
        </FormSection>
      </div>
    </Drawer>
  )
}

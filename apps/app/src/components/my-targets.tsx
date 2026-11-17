import { ApiError, api, foodDayQuery, myProfileQuery } from '@project180/client'
import {
  ACTIVITY_LABELS,
  ACTIVITY_LEVELS,
  type ActivityLevel,
  type ClientProfile,
  ENERGY_MISSING_LABELS,
  energyMissing,
  energyPlan,
  kcalLabel,
  paceLabel,
  type Sex,
  suggestedPace,
  todayIn,
  WEEKLY_PACES,
} from '@project180/shared'
import { Button, ChoiceChips, DatePicker, Field, Input } from '@project180/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Mars, Pencil, Scale, Venus } from 'lucide-react'
import { useState } from 'react'
import { Sheet } from './sheet'

const SEX_OPTIONS = [
  { value: 'female' as const, label: 'Female', icon: <Venus strokeWidth={2.5} /> },
  { value: 'male' as const, label: 'Male', icon: <Mars strokeWidth={2.5} /> },
]
const ACTIVITY_OPTIONS = ACTIVITY_LEVELS.map((a) => ({ value: a, label: ACTIVITY_LABELS[a] }))
const PACE_OPTIONS = WEEKLY_PACES.map((p) => ({ value: String(p), label: paceLabel(p) }))

const num = (v: string) => {
  const n = Number.parseFloat(v.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}
const text = (n: number | null | undefined) => (n == null ? '' : String(n))

/**
 * On your own (no coach): work out your daily calories and macros from your body and goal, the
 * same calculator a coach uses, and save them as your targets.
 */
export function MyTargetsSheet({
  open,
  onClose,
  timezone,
}: {
  open: boolean
  onClose: () => void
  timezone: string
}) {
  return (
    <Sheet open={open} onClose={onClose} label="Your daily targets">
      {open && <TargetsForm timezone={timezone} onDone={onClose} />}
    </Sheet>
  )
}

function TargetsForm({ timezone, onDone }: { timezone: string; onDone: () => void }) {
  const profile = useQuery(myProfileQuery)
  if (!profile.data)
    return (
      <div className="pb-6">
        {profile.isError ? (
          <p className="text-[14px] text-ink-muted">Couldn’t load your details. Try again.</p>
        ) : (
          <div className="h-64 animate-pulse rounded-md bg-surface-raised" />
        )}
      </div>
    )
  return <Calculator timezone={timezone} profile={profile.data} onDone={onDone} />
}

function Calculator({
  timezone,
  profile: p,
  onDone,
}: {
  timezone: string
  profile: ClientProfile
  onDone: () => void
}) {
  const queryClient = useQueryClient()
  const today = todayIn(timezone)
  const [weight, setWeight] = useState(text(p.latestWeightKg))
  const [height, setHeight] = useState(text(p.heightCm))
  const [birthDate, setBirthDate] = useState<string | null>(p.birthDate)
  const [sex, setSex] = useState<Sex | null>(p.sex)
  const [activity, setActivity] = useState<ActivityLevel | null>(p.activityLevel)
  const [goal, setGoal] = useState(text(p.goalWeightKg))
  const [pace, setPace] = useState(
    String(p.weeklyChangeKg ?? suggestedPace(p.latestWeightKg, p.goalWeightKg)),
  )
  // Work it out from the calculator, or type your own numbers.
  const [mode, setMode] = useState<'calc' | 'own'>('calc')
  const [ownKcal, setOwnKcal] = useState('')
  const [ownProtein, setOwnProtein] = useState('')
  const inputs = {
    birthDate,
    sex,
    heightCm: num(height),
    weightKg: num(weight),
    activity,
    weeklyChangeKg: Number(pace),
    goalWeightKg: num(goal),
    today,
  }
  const missing = energyMissing(inputs)
  const calculated = energyPlan(inputs)
  const typedKcal = num(ownKcal)
  const typedProtein = num(ownProtein)
  const typedOk =
    typedKcal !== null &&
    typedKcal >= 800 &&
    typedKcal <= 6000 &&
    typedProtein !== null &&
    typedProtein >= 20 &&
    typedProtein <= 400
  // What gets saved: the calculator's numbers, or the ones typed in.
  const plan =
    mode === 'calc'
      ? calculated
      : typedOk
        ? {
            kcal: Math.round(typedKcal),
            proteinG: Math.round(typedProtein),
            carbsG: null,
            fatG: null,
          }
        : null
  const save = useMutation({
    mutationFn: () => {
      if (!plan) throw new Error('Fill in the missing details first.')
      return api('/me/nutrition-targets', {
        method: 'PUT',
        body: {
          kcal: plan.kcal,
          proteinG: plan.proteinG,
          carbsG: plan.carbsG,
          fatG: plan.fatG,
          // Typed numbers aren't from a weight, so no "recalculate after 2 kg" for them.
          basisWeightKg: mode === 'calc' ? inputs.weightKg : null,
          plan: {
            activityLevel: activity,
            weeklyChangeKg: Number(pace),
            goalWeightKg: inputs.goalWeightKg,
            birthDate,
            sex,
            heightCm: inputs.heightCm,
            weightKg: inputs.weightKg,
          },
        },
      })
    },
    onSuccess: () => {
      onDone()
      void queryClient.invalidateQueries({ queryKey: ['food'] })
      void queryClient.invalidateQueries({ queryKey: myProfileQuery.queryKey })
    },
  })

  return (
    <div className="flex flex-col gap-5 pb-6">
      <div className="pr-12">
        <h2 className="font-display font-extrabold text-[24px] leading-7">Your daily targets</h2>
        <p className="mt-1 text-[14px] text-ink-muted">
          Worked out from your body and your goal. Change them any time.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Weight now (kg)">
          {(id) => (
            <Input
              id={id}
              inputMode="decimal"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
            />
          )}
        </Field>
        <Field label="Height (cm)">
          {(id) => (
            <Input
              id={id}
              inputMode="decimal"
              value={height}
              onChange={(e) => setHeight(e.target.value)}
            />
          )}
        </Field>
      </div>
      <Field label="Date of birth">
        {(id) => (
          <DatePicker
            id={id}
            birth
            placeholder="Pick your birthday"
            value={birthDate}
            onChange={setBirthDate}
            onClear={() => setBirthDate(null)}
          />
        )}
      </Field>
      <Field label="Sex" hint="The calculator needs it for your resting burn.">
        {() => <ChoiceChips label="Sex" options={SEX_OPTIONS} value={sex} onChange={setSex} />}
      </Field>
      <Field label="How active are you?" hint="Day to day, workouts included.">
        {() => (
          <ChoiceChips
            label="How active are you?"
            options={ACTIVITY_OPTIONS}
            value={activity}
            onChange={setActivity}
          />
        )}
      </Field>
      <Field label="Goal weight (kg)" hint="Optional">
        {(id) => (
          <Input
            id={id}
            inputMode="decimal"
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
          />
        )}
      </Field>
      <Field label="Pace">
        {() => (
          <ChoiceChips
            label="Pace"
            options={PACE_OPTIONS}
            value={pace}
            onChange={(v) => v && setPace(v)}
          />
        )}
      </Field>

      <ChoiceChips
        label="How to set them"
        options={[
          { value: 'calc', label: 'Work it out for me' },
          { value: 'own', label: 'Type my own' },
        ]}
        value={mode}
        onChange={(v) => v && setMode(v)}
      />
      {mode === 'own' && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Calories a day" hint="800 to 6,000">
            {(id) => (
              <Input
                id={id}
                inputMode="numeric"
                value={ownKcal}
                onChange={(e) => setOwnKcal(e.target.value)}
              />
            )}
          </Field>
          <Field label="Protein (g)" hint="20 to 400">
            {(id) => (
              <Input
                id={id}
                inputMode="numeric"
                value={ownProtein}
                onChange={(e) => setOwnProtein(e.target.value)}
              />
            )}
          </Field>
        </div>
      )}
      {mode === 'calc' && (
        <div className="flex flex-col gap-3 rounded-md bg-surface-raised p-4" aria-live="polite">
          {calculated ? (
            <>
              <p className="flex flex-wrap items-baseline gap-x-1.5">
                <span className="metric text-[32px] leading-none">
                  {kcalLabel(calculated.kcal)}
                </span>
                <span className="text-[14px] text-ink-muted">kcal a day</span>
              </p>
              <p className="tabular text-[14px]">
                <span className="font-bold">{calculated.proteinG} g</span> protein ·{' '}
                <span className="font-bold">{calculated.carbsG} g</span> carbs ·{' '}
                <span className="font-bold">{calculated.fatG} g</span> fat
              </p>
              {calculated.floored && (
                <p className="text-[13px] text-ink-muted">
                  That pace would go below a safe minimum, so the target is set at the minimum.
                </p>
              )}
              <p className="text-[12px] text-ink-muted">
                An estimate (Mifflin-St Jeor) to start from. Not for pregnancy or breastfeeding.
              </p>
            </>
          ) : (
            <p className="text-[14px] text-ink-muted">
              Add your {missing.map((m) => ENERGY_MISSING_LABELS[m]).join(', ')} to work it out.
            </p>
          )}
        </div>
      )}
      {save.isError && (
        <p role="alert" className="font-semibold text-[14px] text-danger">
          {save.error instanceof ApiError || save.error instanceof Error
            ? save.error.message
            : 'Couldn’t save. Check your signal and try again.'}
        </p>
      )}
      <Button
        size="lg"
        block
        disabled={!plan}
        loading={save.isPending}
        onClick={() => save.mutate()}
      >
        Save my targets
      </Button>
    </div>
  )
}

/**
 * On your own: your body basics and daily calories at a glance on Profile, with Update (the
 * same calculator, or your own numbers).
 */
export function MyPlanCard({ timezone }: { timezone: string }) {
  const profile = useQuery(myProfileQuery)
  const today = todayIn(timezone)
  const targets = useQuery(foodDayQuery(today)).data?.targets ?? null
  const [open, setOpen] = useState(false)
  const p = profile.data
  if (!p) return <div className="h-40 animate-pulse rounded-lg bg-surface" />
  const facts: Array<[string, string | null]> = [
    ['Height', p.heightCm ? `${p.heightCm} cm` : null],
    ['Weight', p.latestWeightKg ? `${p.latestWeightKg} kg` : null],
    ['How active', p.activityLevel ? ACTIVITY_LABELS[p.activityLevel] : null],
    [
      'Goal',
      [
        p.goalWeightKg && `${p.goalWeightKg} kg`,
        p.weeklyChangeKg !== null && paceLabel(p.weeklyChangeKg),
      ]
        .filter(Boolean)
        .join(' · ') || null,
    ],
  ]
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-bold text-[17px]">Your body and calories</h2>
        <Button
          variant="ghost"
          size="sm"
          icon={<Pencil className="size-4" aria-hidden />}
          onClick={() => setOpen(true)}
        >
          Update
        </Button>
      </div>
      <div className="flex flex-col gap-4 rounded-lg bg-surface p-5 shadow-card">
        <div className="flex items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-sand/20 text-sand-text">
            <Scale className="size-5" aria-hidden />
          </span>
          {targets ? (
            <p className="flex flex-wrap items-baseline gap-x-1.5">
              <span className="metric text-[28px] leading-none">{kcalLabel(targets.kcal)}</span>
              <span className="text-[14px] text-ink-muted">
                kcal a day · {targets.proteinG} g protein
              </span>
            </p>
          ) : (
            <p className="text-[15px] text-ink-muted">
              No daily targets yet. Tap Update to set them.
            </p>
          )}
        </div>
        <dl className="grid grid-cols-2 gap-3">
          {facts.map(([label, value]) => (
            <div key={label} className="flex min-w-0 flex-col gap-1">
              <dt className="font-extrabold text-[11px] text-ink-muted uppercase tracking-[0.08em]">
                {label}
              </dt>
              <dd className={value ? 'font-semibold text-[15px]' : 'text-[15px] text-ink-muted'}>
                {value ?? 'Not set'}
              </dd>
            </div>
          ))}
        </dl>
      </div>
      <MyTargetsSheet open={open} onClose={() => setOpen(false)} timezone={timezone} />
    </section>
  )
}

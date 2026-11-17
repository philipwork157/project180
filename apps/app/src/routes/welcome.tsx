import { ApiError, api, meQuery, myProfileQuery } from '@project180/client'
import {
  ACTIVITY_LABELS,
  ACTIVITY_LEVELS,
  type ActivityLevel,
  ENERGY_MISSING_LABELS,
  EXPERIENCE_LABELS,
  EXPERIENCE_LEVELS,
  type ExperienceLevel,
  energyMissing,
  energyPlan,
  GOAL_LABELS,
  GOALS,
  type Goal,
  kcalLabel,
  type Me,
  paceLabel,
  type Sex,
  suggestedPace,
  TRAINING_PLACE_LABELS,
  TRAINING_PLACES,
  type TrainingPlace,
  todayIn,
  WEEKLY_PACES,
} from '@project180/shared'
import {
  Button,
  ChoiceChips,
  cn,
  DatePicker,
  Field,
  Input,
  LogoMark,
  MultiChoiceChips,
} from '@project180/ui'
import { useQueryClient } from '@tanstack/react-query'
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { ArrowLeft, Mars, Venus } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { type ReactNode, useState } from 'react'

/**
 * The welcome wizard, once, for people who signed up themselves: their goal, a few body basics
 * and their daily calories. Every step can be skipped. People a coach added never come here
 * (their coach sets all of this), and anyone who finished or skipped is sent straight on.
 */
export const Route = createFileRoute('/welcome')({
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData(meQuery)
    if (!me) throw redirect({ to: '/login' })
    if (me.mustChangePassword) throw redirect({ to: '/choose-password' })
    if (!me.needsOnboarding) throw redirect({ to: '/' })
    return { me }
  },
  component: WelcomePage,
})

const goalOptions = GOALS.map((g) => ({ value: g, label: GOAL_LABELS[g] }))
const SEX_OPTIONS = [
  { value: 'female' as const, label: 'Female', icon: <Venus strokeWidth={2.5} /> },
  { value: 'male' as const, label: 'Male', icon: <Mars strokeWidth={2.5} /> },
]
const STEPS = ['Your goal', 'About you', 'Your plan'] as const

const num = (v: string) => {
  const n = Number.parseFloat(v.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

function WelcomePage() {
  const { me } = Route.useRouteContext()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const today = todayIn(me.timezone)
  const [step, setStep] = useState(0)
  const [mainGoal, setMainGoal] = useState<Goal | null>(null)
  const [focusAreas, setFocusAreas] = useState<Goal[]>([])
  const [places, setPlaces] = useState<TrainingPlace[]>([])
  const [experience, setExperience] = useState<ExperienceLevel | null>(null)
  const [sex, setSex] = useState<Sex | null>(null)
  const [birthDate, setBirthDate] = useState<string | null>(null)
  const [height, setHeight] = useState('')
  const [weight, setWeight] = useState('')
  const [activity, setActivity] = useState<ActivityLevel | null>(null)
  const [goalWeight, setGoalWeight] = useState('')
  const [pace, setPace] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string>()

  const weightKg = num(weight)
  const goalWeightKg = num(goalWeight)
  const weeklyChangeKg = Number(pace ?? suggestedPace(weightKg, goalWeightKg))
  const inputs = {
    birthDate,
    sex,
    heightCm: num(height),
    weightKg,
    activity,
    weeklyChangeKg,
    goalWeightKg,
    today,
  }
  const plan = energyPlan(inputs)
  const missing = energyMissing(inputs)

  /** Done (or skipped): never shows again, then on to Today. */
  async function finish(save: boolean) {
    setSaving(true)
    setError(undefined)
    try {
      if (save) {
        await api('/me/profile', {
          method: 'PUT',
          body: {
            birthDate,
            sex,
            heightCm: inputs.heightCm,
            goalWeightKg,
            activityLevel: activity,
            mainGoal,
            focusAreas: focusAreas.filter((g) => g !== mainGoal),
            places,
            experience,
          },
        })
        if (plan)
          await api('/me/nutrition-targets', {
            method: 'PUT',
            body: {
              kcal: plan.kcal,
              proteinG: plan.proteinG,
              carbsG: plan.carbsG,
              fatG: plan.fatG,
              basisWeightKg: weightKg,
              plan: {
                activityLevel: activity,
                weeklyChangeKg,
                goalWeightKg,
                birthDate,
                sex,
                heightCm: inputs.heightCm,
                weightKg,
              },
            },
          })
      }
      const { user } = await api<{ user: Me }>('/me/onboarding/done', { method: 'POST' })
      queryClient.setQueryData(meQuery.queryKey, user)
      void queryClient.invalidateQueries({ queryKey: myProfileQuery.queryKey })
      void queryClient.invalidateQueries({ queryKey: ['food'] })
      await navigate({ to: '/', replace: true })
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Couldn’t save. Check your signal and try again.',
      )
      setSaving(false)
    }
  }

  const last = step === STEPS.length - 1
  return (
    <div className="flex min-h-dvh w-full flex-col bg-bg">
      <header className="flex w-full items-center gap-3 px-4 pt-safe md:px-8 lg:px-12">
        <div className="flex h-16 w-full items-center gap-3">
          <LogoMark className="size-9 text-ink" title="Project 180" />
          <ol className="flex flex-1 items-center gap-1.5" aria-label="Steps">
            {STEPS.map((name, i) => (
              <li
                key={name}
                aria-current={i === step ? 'step' : undefined}
                className={cn(
                  'h-1.5 flex-1 rounded-pill transition-colors',
                  i <= step ? 'bg-lime' : 'bg-surface-raised',
                )}
              >
                <span className="sr-only">{name}</span>
              </li>
            ))}
          </ol>
          <Button variant="ghost" size="sm" disabled={saving} onClick={() => void finish(false)}>
            Skip for now
          </Button>
        </div>
      </header>

      <main className="w-full flex-1 px-4 pt-4 pb-32 md:px-8 lg:px-12">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -16 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] lg:gap-12"
          >
            {step === 0 && (
              <Step
                title={`Welcome, ${me.name.split(' ')[0]}. What brings you here?`}
                text="Pick your main goal and anything else you're into. It shapes what you see, and you can change it any time in Profile."
              >
                <Field label="Main goal">
                  {() => (
                    <ChoiceChips
                      label="Main goal"
                      options={goalOptions}
                      value={mainGoal}
                      onChange={setMainGoal}
                    />
                  )}
                </Field>
                <Field label="Also interested in" hint="Optional, pick any">
                  {() => (
                    <MultiChoiceChips
                      label="Also interested in"
                      options={goalOptions.filter((o) => o.value !== mainGoal)}
                      value={focusAreas}
                      onChange={setFocusAreas}
                    />
                  )}
                </Field>
                <Field label="Where do you train?">
                  {() => (
                    <MultiChoiceChips
                      label="Where do you train?"
                      options={TRAINING_PLACES.map((p) => ({
                        value: p,
                        label: TRAINING_PLACE_LABELS[p],
                      }))}
                      value={places}
                      onChange={setPlaces}
                    />
                  )}
                </Field>
                <Field label="Experience">
                  {() => (
                    <ChoiceChips
                      label="Experience"
                      options={EXPERIENCE_LEVELS.map((e) => ({
                        value: e,
                        label: EXPERIENCE_LABELS[e],
                      }))}
                      value={experience}
                      onChange={setExperience}
                    />
                  )}
                </Field>
              </Step>
            )}
            {step === 1 && (
              <Step
                title="A bit about you"
                text="Used only to work out how much you burn a day. Your weight today becomes your first weigh-in."
              >
                <Field label="Sex">
                  {() => (
                    <ChoiceChips label="Sex" options={SEX_OPTIONS} value={sex} onChange={setSex} />
                  )}
                </Field>
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
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Height (cm)">
                    {(id) => (
                      <Input
                        id={id}
                        inputMode="decimal"
                        placeholder="170"
                        value={height}
                        onChange={(e) => setHeight(e.target.value)}
                      />
                    )}
                  </Field>
                  <Field label="Weight today (kg)">
                    {(id) => (
                      <Input
                        id={id}
                        inputMode="decimal"
                        placeholder="75"
                        value={weight}
                        onChange={(e) => setWeight(e.target.value)}
                      />
                    )}
                  </Field>
                </div>
              </Step>
            )}
            {step === 2 && (
              <Step
                title="Your daily plan"
                text="How active you are and where you're heading. We work out your calories and protein, carbs and fat; change them any time."
              >
                <Field label="How active are you?" hint="Day to day, workouts included.">
                  {() => (
                    <ChoiceChips
                      label="How active are you?"
                      options={ACTIVITY_LEVELS.map((a) => ({
                        value: a,
                        label: ACTIVITY_LABELS[a],
                      }))}
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
                      value={goalWeight}
                      onChange={(e) => setGoalWeight(e.target.value)}
                    />
                  )}
                </Field>
                <Field label="Pace">
                  {() => (
                    <ChoiceChips
                      label="Pace"
                      options={WEEKLY_PACES.map((p) => ({ value: String(p), label: paceLabel(p) }))}
                      value={String(weeklyChangeKg)}
                      onChange={(v) => v && setPace(v)}
                    />
                  )}
                </Field>
                <div
                  className="flex flex-col gap-2 rounded-md bg-surface p-4 shadow-card"
                  aria-live="polite"
                >
                  {plan ? (
                    <>
                      <p className="flex flex-wrap items-baseline gap-x-1.5">
                        <span className="metric text-[36px] leading-none">
                          {kcalLabel(plan.kcal)}
                        </span>
                        <span className="text-[14px] text-ink-muted">kcal a day</span>
                      </p>
                      <p className="tabular text-[14px]">
                        <span className="font-bold">{plan.proteinG} g</span> protein ·{' '}
                        <span className="font-bold">{plan.carbsG} g</span> carbs ·{' '}
                        <span className="font-bold">{plan.fatG} g</span> fat
                      </p>
                      <p className="text-[12px] text-ink-muted">
                        An estimate to start from. Not for pregnancy or breastfeeding.
                      </p>
                    </>
                  ) : (
                    <p className="text-[14px] text-ink-muted">
                      Add your {missing.map((m) => ENERGY_MISSING_LABELS[m]).join(', ')} to see your
                      calories. Or finish now and set them later on the Fuel tab.
                    </p>
                  )}
                </div>
              </Step>
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* The main action within thumb reach, never over the fields (the page leaves room). */}
      <footer className="fixed inset-x-0 bottom-0 z-10 border-border border-t bg-surface/95 px-4 pt-3 pb-safe backdrop-blur md:px-8 lg:px-12">
        <div className="flex w-full flex-col gap-2 pb-3">
          {error && (
            <p role="alert" className="font-semibold text-[13px] text-danger">
              {error}
            </p>
          )}
          <div className="flex w-full items-center gap-3">
            {step > 0 && (
              <Button
                variant="secondary"
                size="lg"
                icon={<ArrowLeft className="size-5" aria-hidden />}
                disabled={saving}
                onClick={() => setStep(step - 1)}
              >
                Back
              </Button>
            )}
            <Button
              size="lg"
              className="flex-1"
              loading={saving}
              onClick={() => (last ? void finish(true) : setStep(step + 1))}
            >
              {last ? (plan ? 'Save and start' : 'Finish') : 'Next'}
            </Button>
          </div>
        </div>
      </footer>
    </div>
  )
}

function Step({ title, text, children }: { title: string; text: string; children: ReactNode }) {
  return (
    <>
      <div className="flex flex-col gap-2">
        <h1 className="font-display font-extrabold text-[28px] leading-[32px] tracking-tight md:text-[34px] md:leading-[38px]">
          {title}
        </h1>
        <p className="text-[15px] text-ink-muted">{text}</p>
      </div>
      <div className="flex min-w-0 flex-col gap-5">{children}</div>
    </>
  )
}

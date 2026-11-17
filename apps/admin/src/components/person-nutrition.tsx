import {
  ApiError,
  api,
  clientProfileQuery,
  personFoodDayQuery,
  personFoodSummaryQuery,
  personPhotoLimitQuery,
} from '@project180/client'
import {
  ACTIVITY_KIND_LABELS,
  type ActivityLevel,
  addDays,
  type ClientProfile,
  type DayBurn,
  ENERGY_MISSING_LABELS,
  type EnergyInputs,
  type EnergyPlan,
  energyMissing,
  energyPlan,
  type FoodDayTotals,
  gramsLabel,
  kcalLabel,
  MAX_FOOD_PHOTOS_PER_DAY,
  MEAL_LABELS,
  MEALS,
  type NutritionTargets,
  needsRecalc,
  type PhotoLimit,
  paceLabel,
  type Sex,
  suggestedPace,
  targetShare,
  todayIn,
  WEEKLY_PACES,
} from '@project180/shared'
import {
  Button,
  Card,
  ChoiceChips,
  cn,
  DatePicker,
  Drawer,
  Field,
  Input,
  MacroTotalsCard,
  MacroWeekChart,
  Select,
  toast,
} from '@project180/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Calculator,
  Camera,
  ChefHat,
  ChevronRight,
  Flame,
  Pencil,
  RefreshCw,
  ScanBarcode,
  Search,
  ShieldAlert,
  Target,
} from 'lucide-react'
import { type ChangeEvent, useState } from 'react'
import { ACTIVITY_OPTIONS, SEX_OPTIONS } from './client-profile'
import { WaterRow } from './person-water'
import { SettingTile, TileValue } from './setting-tile'

const DAYS = 7

const dayLabel = (date: string) =>
  new Intl.DateTimeFormat('en-ZA', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`))

/** Their average logged day: calories and grams of each macro. */
function averageDay(days: FoodDayTotals[]) {
  const n = Math.max(1, days.length)
  const mean = (k: 'kcal' | 'proteinG' | 'carbsG' | 'fatG') =>
    days.reduce((a, d) => a + d[k], 0) / n
  return {
    kcal: mean('kcal'),
    proteinG: mean('proteinG'),
    carbsG: mean('carbsG'),
    fatG: mean('fatG'),
  }
}

/**
 * A client's food over the last week against the targets you set, for the progress page.
 * Rows open the day's foods; the button sets their daily targets.
 */
export function NutritionCard({ userId, name }: { userId: number; name: string }) {
  // Everyone here is on Johannesburg time; the server answers with their own "today" too.
  const today = todayIn('Africa/Johannesburg')
  const from = addDays(today, -(DAYS - 1))
  const summary = useQuery(personFoodSummaryQuery(userId, from, today))
  const [editing, setEditing] = useState(false)
  const [openDay, setOpenDay] = useState<string | null>(null)
  const data = summary.data?.summary
  const targets = data?.targets ?? null
  const latestKg = useQuery(clientProfileQuery(userId)).data?.latestWeightKg ?? null
  const byDate = new Map((data?.days ?? []).map((d) => [d.date, d]))
  const burnedBy = new Map((data?.burned ?? []).map((b) => [b.date, b.kcal]))
  const dates = Array.from({ length: DAYS }, (_, i) => addDays(today, -i))
  const logged = data?.days ?? []

  return (
    <Card className="flex min-w-0 flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="font-bold text-[17px]">Food</h2>
          <p className="text-[14px] text-ink-muted">
            What {firstNameOf(name)} aims for each day, and what they logged in the app over the
            last 7 days.
          </p>
        </div>
      </div>

      {/* Their food settings with the values showing, each with its own Edit: nothing to open
          just to read them. Targets get the most room; phones stack them. */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <TargetsTile
          targets={summary.isPending ? undefined : targets}
          name={name}
          onEdit={() => setEditing(true)}
          className="md:col-span-2 xl:col-span-1"
        />
        <WaterRow userId={userId} name={name} />
        <PhotoLimitRow userId={userId} name={name} />
      </div>

      {targets && needsRecalc(targets.basisWeightKg, latestKg) && (
        <div className="flex flex-wrap items-center gap-3 rounded-md bg-sand/20 p-4">
          <RefreshCw className="size-5 shrink-0 text-sand-text" aria-hidden />
          <p className="min-w-0 flex-1 basis-56 text-[14px]">
            {firstNameOf(name)} weighs <span className="font-bold">{latestKg} kg</span> now,{' '}
            {Math.abs(Math.round(((latestKg ?? 0) - (targets.basisWeightKg ?? 0)) * 10) / 10)} kg{' '}
            {(latestKg ?? 0) < (targets.basisWeightKg ?? 0) ? 'less' : 'more'} than when these
            targets were worked out.
          </p>
          <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
            Recalculate
          </Button>
        </div>
      )}

      {summary.isError ? (
        <p className="rounded-md bg-surface-raised p-4 text-[14px] text-ink-muted">
          Couldn’t load their food log. Try again.
        </p>
      ) : !data ? (
        <p className="text-[14px] text-ink-muted">Loading…</p>
      ) : (
        <>
          {logged.length === 0 ? (
            <p className="rounded-md bg-surface-raised p-4 text-[14px] text-ink-muted">
              Nothing logged this week. They add food from the Fuel tab in the app.
            </p>
          ) : (
            // At a glance: their average day (calories and where they came from, against the
            // targets) beside every day's calories split into protein, carbs and fat. A bar
            // opens that day's foods, like the rows below.
            <div className="grid grid-cols-1 items-stretch gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
              <div className="flex flex-col gap-3 rounded-md border border-border p-4 md:p-5">
                <p className="font-extrabold text-[11px] text-ink-muted uppercase tracking-[0.08em]">
                  Average day · logged {logged.length} of {DAYS} days
                </p>
                <MacroTotalsCard
                  embedded
                  totals={averageDay(logged)}
                  targets={targets}
                  heading="Where their calories came from"
                  shareOf="their calories"
                  noTargetsText="No daily targets yet. Set them to see how they compare."
                />
              </div>
              <div className="rounded-md border border-border p-4 md:p-5">
                <MacroWeekChart
                  embedded
                  title="Day by day"
                  defaultMetric="all"
                  week={[...dates].reverse()}
                  days={data.days}
                  targets={targets}
                  selected={openDay}
                  today={today}
                  onSelect={setOpenDay}
                />
              </div>
            </div>
          )}
          <ul className="flex w-full flex-col">
            {dates.map((date) => (
              <DayRow
                key={date}
                date={date}
                day={byDate.get(date)}
                burnedKcal={burnedBy.get(date) ?? 0}
                targets={targets}
                onOpen={() => setOpenDay(date)}
              />
            ))}
          </ul>
        </>
      )}

      <TargetsDrawer
        open={editing}
        onClose={() => setEditing(false)}
        userId={userId}
        name={name}
        targets={targets}
      />
      <FoodDayDrawer userId={userId} name={name} date={openDay} onClose={() => setOpenDay(null)} />
    </Card>
  )
}

const longDay = (iso: string) =>
  new Intl.DateTimeFormat('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' }).format(
    new Date(iso),
  )

/** Their daily targets at a glance: calories, the three macros, the pace and where they came from. */
function TargetsTile({
  targets,
  name,
  onEdit,
  className,
}: {
  /** undefined while loading. */
  targets: NutritionTargets | null | undefined
  name: string
  onEdit: () => void
  className?: string
}) {
  if (targets === undefined)
    return <div className={cn('h-44 animate-pulse rounded-md bg-surface-raised', className)} />
  if (!targets)
    return (
      <SettingTile
        icon={<Target aria-hidden />}
        title="Daily targets"
        className={className}
        action={
          <Button size="sm" onClick={onEdit}>
            Set targets
          </Button>
        }
      >
        <p className="font-semibold text-[15px] text-ink-muted">None yet</p>
        <p className="text-[13px] text-ink-muted">
          Work them out from {firstNameOf(name)}’s body and goal, or type the numbers in. They see
          them on their Fuel tab.
        </p>
      </SettingTile>
    )
  const macros = [
    { label: 'Protein', grams: targets.proteinG, dot: 'bg-macro-protein' },
    { label: 'Carbs', grams: targets.carbsG, dot: 'bg-macro-carbs' },
    { label: 'Fat', grams: targets.fatG, dot: 'bg-macro-fat' },
  ]
  return (
    <SettingTile
      icon={<Target aria-hidden />}
      title="Daily targets"
      className={className}
      action={
        <Button
          variant="secondary"
          size="sm"
          icon={<Pencil className="size-4" aria-hidden />}
          onClick={onEdit}
        >
          Edit
        </Button>
      }
    >
      <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
        <TileValue value={kcalLabel(targets.kcal)} unit="kcal a day" />
        <dl className="flex gap-6">
          {macros.map((m) => (
            <div key={m.label} className="flex flex-col gap-1">
              <dt className="flex items-center gap-1.5 font-extrabold text-[11px] text-ink-muted uppercase tracking-[0.08em]">
                <span aria-hidden className={cn('size-2 rounded-full', m.dot)} />
                {m.label}
              </dt>
              <dd className="tabular font-bold text-[15px]">
                {m.grams === null ? (
                  <span className="text-ink-muted">Not set</span>
                ) : (
                  `${gramsLabel(m.grams)} g`
                )}
              </dd>
            </div>
          ))}
        </dl>
      </div>
      <p className="text-[13px] text-ink-muted">
        {[
          targets.weeklyChangeKg !== null && paceLabel(targets.weeklyChangeKg),
          targets.goalWeightKg !== null && `goal ${targets.goalWeightKg} kg`,
          targets.basisWeightKg !== null
            ? `worked out at ${targets.basisWeightKg} kg`
            : 'typed in by hand',
          `set ${longDay(targets.updatedAt)}`,
        ]
          .filter(Boolean)
          .join(' · ')}
      </p>
    </SettingTile>
  )
}

function DayRow({
  date,
  day,
  burnedKcal,
  targets,
  onOpen,
}: {
  date: string
  day: FoodDayTotals | undefined
  /** Exercise that day (added to their target, the MyFitnessPal way). */
  burnedKcal: number
  targets: NutritionTargets | null
  onOpen: () => void
}) {
  const burned = burnedKcal > 0 && (
    <>
      <span className="text-ink-muted"> · </span>
      <span className="font-bold text-clay-text">{kcalLabel(burnedKcal)}</span>
      <span className="text-ink-muted"> burned</span>
    </>
  )
  const share = targetShare(day?.proteinG ?? 0, targets?.proteinG)
  return (
    <li>
      <button
        type="button"
        disabled={!day && burnedKcal === 0}
        onClick={onOpen}
        className="flex min-h-12 w-full flex-wrap items-center gap-x-4 gap-y-2 border-border border-t py-3 text-left transition hover:bg-surface-raised/60 disabled:cursor-default disabled:hover:bg-transparent sm:flex-nowrap"
      >
        <span className="w-28 shrink-0 font-semibold text-[14px]">{dayLabel(date)}</span>
        {day ? (
          <>
            <span className="tabular min-w-0 flex-1 text-[14px]">
              <span className="font-bold">{gramsLabel(day.proteinG)} g</span>
              <span className="text-ink-muted"> protein · </span>
              <span className="font-bold">{kcalLabel(day.kcal)}</span>
              <span className="text-ink-muted"> kcal</span>
              {burned}
            </span>
            {targets && (
              <span
                aria-hidden
                className="h-2 w-full overflow-hidden rounded-pill bg-surface-raised sm:w-32"
              >
                <span
                  className={cn('block h-full rounded-pill', share >= 1 ? 'bg-lime' : 'bg-steel')}
                  style={{ width: `${share * 100}%` }}
                />
              </span>
            )}
            <ChevronRight className="hidden size-4 shrink-0 text-ink-muted sm:block" aria-hidden />
          </>
        ) : (
          <span className="tabular flex-1 text-[14px] text-ink-muted">
            {burnedKcal > 0 ? 'No food logged' : 'Nothing logged'}
            {burned}
          </span>
        )}
      </button>
    </li>
  )
}

/** Work out a client's daily calories from their body and goal, or type the numbers in. */
function TargetsDrawer({
  open,
  onClose,
  userId,
  name,
  targets,
}: {
  open: boolean
  onClose: () => void
  userId: number
  name: string
  targets: NutritionTargets | null
}) {
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Daily targets"
      description={`What ${firstNameOf(name)} aims for each day. They see it on their Fuel tab.`}
    >
      {open && <TargetsForm userId={userId} name={name} targets={targets} onDone={onClose} />}
    </Drawer>
  )
}

const firstNameOf = (name: string) => name.split(' ')[0] ?? name
const text = (n: number | null | undefined) => (n == null ? '' : String(n))
const whole = (value: string) => {
  const n = Number.parseInt(value, 10)
  return Number.isFinite(n) ? n : null
}
const decimal = (value: string) => {
  const n = Number.parseFloat(value.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}
const longDate = (day: string) =>
  new Intl.DateTimeFormat('en-ZA', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${day}T00:00:00Z`))

function TargetsForm({
  userId,
  name,
  targets,
  onDone,
}: {
  userId: number
  name: string
  targets: NutritionTargets | null
  onDone: () => void
}) {
  const profile = useQuery(clientProfileQuery(userId))
  if (!profile.data)
    return (
      <p className="text-[14px] text-ink-muted">
        {profile.isError ? 'Couldn’t load their details. Try again.' : 'Loading…'}
      </p>
    )
  return (
    <TargetsEditor
      userId={userId}
      name={name}
      targets={targets}
      profile={profile.data}
      onDone={onDone}
    />
  )
}

function TargetsEditor({
  userId,
  name,
  targets,
  profile: p,
  onDone,
}: {
  userId: number
  name: string
  targets: NutritionTargets | null
  profile: ClientProfile
  onDone: () => void
}) {
  const queryClient = useQueryClient()
  const first = firstNameOf(name)
  const today = todayIn('Africa/Johannesburg')
  // Body and goal, prefilled from their profile and latest weigh-in.
  const [weight, setWeight] = useState(text(p.latestWeightKg))
  const [height, setHeight] = useState(text(p.heightCm))
  const [birthDate, setBirthDate] = useState(p.birthDate)
  const [sex, setSex] = useState<Sex | null>(p.sex)
  const [activity, setActivity] = useState<ActivityLevel | null>(p.activityLevel)
  const [goal, setGoal] = useState(text(p.goalWeightKg))
  const [pace, setPace] = useState<number>(
    p.weeklyChangeKg ?? suggestedPace(p.latestWeightKg, p.goalWeightKg),
  )
  // The numbers. With no targets yet (or after "Use these"), they follow the calculator.
  const [auto, setAuto] = useState(targets === null)
  const [kcal, setKcal] = useState(text(targets?.kcal))
  const [protein, setProtein] = useState(text(targets?.proteinG))
  const [carbs, setCarbs] = useState(text(targets?.carbsG))
  const [fat, setFat] = useState(text(targets?.fatG))
  const [error, setError] = useState<string>()

  const inputs: EnergyInputs = {
    birthDate,
    sex,
    heightCm: decimal(height),
    weightKg: decimal(weight),
    activity,
    weeklyChangeKg: pace,
    goalWeightKg: decimal(goal),
    today,
  }
  const plan = energyPlan(inputs)
  const missing = energyMissing(inputs)
  const shown = auto && plan
  const values = shown
    ? { kcal: plan.kcal, proteinG: plan.proteinG, carbsG: plan.carbsG, fatG: plan.fatG }
    : { kcal: whole(kcal), proteinG: whole(protein), carbsG: whole(carbs), fatG: whole(fat) }

  function applySuggestion() {
    if (!plan) return
    setKcal(String(plan.kcal))
    setProtein(String(plan.proteinG))
    setCarbs(String(plan.carbsG))
    setFat(String(plan.fatG))
    setAuto(true)
  }
  /** Typing a number of your own stops the calculator filling them in. */
  const typed = (set: (v: string) => void) => (e: ChangeEvent<HTMLInputElement>) => {
    if (shown) {
      setKcal(String(plan.kcal))
      setProtein(String(plan.proteinG))
      setCarbs(String(plan.carbsG))
      setFat(String(plan.fatG))
      setAuto(false)
    }
    set(e.target.value.replace(/\D/g, ''))
  }
  const field = (v: number | null, own: string) => (shown ? text(v) : own)

  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['admin', 'users', userId] })
  const save = useMutation({
    mutationFn: () =>
      api(`/admin/users/${userId}/nutrition-targets`, {
        method: 'PUT',
        body: {
          ...values,
          // The weight the numbers were worked out on; kept from before when typed by hand.
          basisWeightKg: shown ? inputs.weightKg : (targets?.basisWeightKg ?? null),
          plan: {
            activityLevel: activity,
            weeklyChangeKg: pace,
            goalWeightKg: inputs.goalWeightKg,
            birthDate,
            sex,
            heightCm: inputs.heightCm,
            weightKg: inputs.weightKg,
          },
        },
      }),
    onSuccess: () => {
      refresh()
      toast({
        title: 'Targets saved',
        description: `${first}: ${kcalLabel(values.kcal ?? 0)} kcal and ${values.proteinG} g protein a day.`,
      })
      onDone()
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Could not save.'),
  })
  const clear = useMutation({
    mutationFn: () => api(`/admin/users/${userId}/nutrition-targets`, { method: 'DELETE' }),
    onSuccess: () => {
      refresh()
      toast({ title: 'Targets removed', description: name })
      onDone()
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Could not remove.'),
  })

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault()
        setError(undefined)
        if (values.kcal === null || values.proteinG === null) {
          setError(
            plan
              ? 'Calories and protein are both needed.'
              : `Fill in ${first}’s details above, or type the calories and protein in.`,
          )
          return
        }
        save.mutate()
      }}
    >
      <section className="flex flex-col gap-4 rounded-md bg-surface-raised p-4">
        <div className="flex items-center gap-3">
          <Calculator className="size-5 shrink-0 text-brand-text" aria-hidden />
          <h3 className="font-bold text-[15px]">Work it out for me</h3>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field
            label="Weight now (kg)"
            hint={p.latestWeightKg ? 'Latest weigh-in' : 'Saved as a weigh-in'}
          >
            {(id) => (
              <Input
                id={id}
                inputMode="decimal"
                placeholder="70"
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
                placeholder="170"
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
              placeholder="Pick their birthday"
              value={birthDate}
              onChange={setBirthDate}
              onClear={() => setBirthDate(null)}
            />
          )}
        </Field>
        <Field label="Sex">
          {() => <ChoiceChips label="Sex" options={SEX_OPTIONS} value={sex} onChange={setSex} />}
        </Field>
        <Field
          label="How active are they?"
          hint="Everyday life, not counting workouts: exercise they log is added to each day."
        >
          {() => (
            <ChoiceChips
              label="How active are they?"
              options={ACTIVITY_OPTIONS}
              value={activity}
              onChange={(v: ActivityLevel | null) => setActivity(v)}
            />
          )}
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Goal weight (kg)" hint="Optional">
            {(id) => (
              <Input
                id={id}
                inputMode="decimal"
                placeholder="Optional"
                value={goal}
                onChange={(e) => {
                  setGoal(e.target.value)
                  // A first goal picks a sensible pace; one already chosen stays.
                  if (p.weeklyChangeKg === null)
                    setPace(suggestedPace(decimal(weight), decimal(e.target.value)))
                }}
              />
            )}
          </Field>
          <Field label="Pace">
            {(id) => (
              <Select
                id={id}
                value={String(pace)}
                onChange={(e) => setPace(Number(e.target.value))}
              >
                {WEEKLY_PACES.map((k) => (
                  <option key={k} value={k}>
                    {paceLabel(k)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>

        {plan ? (
          <PlanResult plan={plan} goalKg={inputs.goalWeightKg} first={first} />
        ) : (
          <p className="rounded-md bg-surface p-4 text-[14px] text-ink-muted">
            To work it out, add{' '}
            {missing.map((m, i) => (
              <span key={m}>
                {i > 0 && (i === missing.length - 1 ? ' and ' : ', ')}
                <span className="font-semibold text-ink">{ENERGY_MISSING_LABELS[m]}</span>
              </span>
            ))}
            .
          </p>
        )}
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h3 className="font-bold text-[15px]">Their daily targets</h3>
            <p className="text-[13px] text-ink-muted">
              {shown
                ? 'Filled in from the calculator. Change any number to set your own.'
                : 'Typed in by you. Calories and protein are needed; carbs and fat are optional.'}
            </p>
          </div>
          {plan && !shown && (
            <Button
              variant="secondary"
              size="sm"
              icon={<Calculator className="size-4" aria-hidden />}
              onClick={applySuggestion}
            >
              Use the calculator’s numbers
            </Button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Calories (kcal)" hint="800 to 6 000">
            {(id) => (
              <Input
                id={id}
                inputMode="numeric"
                value={field(values.kcal, kcal)}
                onChange={typed(setKcal)}
              />
            )}
          </Field>
          <Field label="Protein (g)" hint="20 to 400">
            {(id) => (
              <Input
                id={id}
                inputMode="numeric"
                value={field(values.proteinG, protein)}
                onChange={typed(setProtein)}
              />
            )}
          </Field>
          <Field label="Carbs (g)" hint="Optional">
            {(id) => (
              <Input
                id={id}
                inputMode="numeric"
                value={field(values.carbsG, carbs)}
                onChange={typed(setCarbs)}
              />
            )}
          </Field>
          <Field label="Fat (g)" hint="Optional">
            {(id) => (
              <Input
                id={id}
                inputMode="numeric"
                value={field(values.fatG, fat)}
                onChange={typed(setFat)}
              />
            )}
          </Field>
        </div>
      </section>
      {error && (
        <p role="alert" className="font-semibold text-[13px] text-danger">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-end gap-3">
        {targets && (
          <Button
            variant="ghost"
            className="mr-auto text-danger hover:bg-danger/10"
            loading={clear.isPending}
            onClick={() => clear.mutate()}
          >
            Remove targets
          </Button>
        )}
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" loading={save.isPending}>
          Save targets
        </Button>
      </div>
    </form>
  )
}

/** What the calculator came to: maintenance, the target, macros and when they'd reach the goal. */
function PlanResult({
  plan,
  goalKg,
  first,
}: {
  plan: EnergyPlan
  goalKg: number | null
  first: string
}) {
  const stat = (label: string, value: string, unit: string, strong = false) => (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="font-extrabold text-[11px] text-ink-muted uppercase tracking-[0.08em]">
        {label}
      </span>
      <span className="flex items-baseline gap-1">
        <span className={cn('metric leading-none', strong ? 'text-[30px]' : 'text-[22px]')}>
          {value}
        </span>
        <span className="font-semibold text-[13px] text-ink-muted">{unit}</span>
      </span>
    </div>
  )
  return (
    <div className="flex flex-col gap-4 rounded-md bg-surface p-4">
      <div className="grid grid-cols-2 gap-4">
        {stat('Keeps weight the same', kcalLabel(plan.maintenance), 'kcal')}
        {stat('Suggested a day', kcalLabel(plan.kcal), 'kcal', true)}
      </div>
      <div className="grid grid-cols-3 gap-4">
        {stat('Protein', String(plan.proteinG), 'g')}
        {stat('Carbs', String(plan.carbsG), 'g')}
        {stat('Fat', String(plan.fatG), 'g')}
      </div>
      {plan.goalDate && goalKg !== null && (
        <p className="flex items-start gap-3 text-[14px]">
          <Target className="mt-0.5 size-4 shrink-0 text-brand-text" aria-hidden />
          <span>
            Reaches <span className="font-bold">{goalKg} kg</span> around{' '}
            <span className="font-bold">{longDate(plan.goalDate)}</span> (about {plan.weeksToGoal}{' '}
            {plan.weeksToGoal === 1 ? 'week' : 'weeks'}).
          </span>
        </p>
      )}
      {plan.floored && (
        <p className="flex items-start gap-3 rounded-md bg-clay/15 p-3 text-[13px]">
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-clay-text" aria-hidden />
          <span>
            That pace needs fewer calories than is safe for {first}, so it’s set to the floor of{' '}
            {kcalLabel(plan.kcal)} kcal: about {Math.abs(plan.weeklyChangeKg)} kg a week.
          </span>
        </p>
      )}
      {plan.goalMismatch && (
        <p className="flex items-start gap-3 rounded-md bg-clay/15 p-3 text-[13px]">
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-clay-text" aria-hidden />
          <span>The goal weight is the other way from the pace. Check the goal or the pace.</span>
        </p>
      )}
      <p className="text-[12px] text-ink-muted">
        An estimate (Mifflin-St Jeor) to start from. Adjust it against their weigh-ins. Not for
        pregnancy or breastfeeding: set those by hand.
      </p>
    </div>
  )
}

/** How many food photos this client may take a day, and a way to change it for them. */
function PhotoLimitRow({ userId, name }: { userId: number; name: string }) {
  const limit = useQuery(personPhotoLimitQuery(userId))
  const [open, setOpen] = useState(false)
  const l = limit.data
  if (!l) return <div className="h-36 animate-pulse rounded-md bg-surface-raised" />
  const owner = l.owner
  return (
    <SettingTile
      icon={<Camera aria-hidden />}
      iconClass="bg-surface text-ink-muted"
      title="Food photos"
      action={
        !owner && (
          <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
            Change
          </Button>
        )
      }
    >
      {l.effective === 0 ? (
        <p className="font-semibold text-[15px] text-ink-muted">Switched off</p>
      ) : (
        <TileValue value={l.effective} unit="a day" />
      )}
      <p className="text-[13px] text-ink-muted">
        <span className="font-bold text-ink">{l.usedToday}</span> used today ·{' '}
        {owner
          ? 'the most anyone can take'
          : l.perDay === null
            ? 'the default for everyone'
            : 'their own limit'}
      </p>
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title="Food photo limit"
        description={`How many photo estimates ${name.split(' ')[0]} may take a day.`}
      >
        {open && (
          <PhotoLimitForm userId={userId} limit={l} name={name} onDone={() => setOpen(false)} />
        )}
      </Drawer>
    </SettingTile>
  )
}

function PhotoLimitForm({
  userId,
  limit,
  name,
  onDone,
}: {
  userId: number
  limit: PhotoLimit
  name: string
  onDone: () => void
}) {
  const queryClient = useQueryClient()
  const [value, setValue] = useState(limit.perDay === null ? '' : String(limit.perDay))
  const perDay = value === '' ? null : Number(value)
  const valid = perDay === null || perDay <= MAX_FOOD_PHOTOS_PER_DAY
  const save = useMutation({
    mutationFn: (next: number | null) =>
      api<{ photoLimit: PhotoLimit }>(`/admin/users/${userId}/food/photo-limit`, {
        method: 'PUT',
        body: { perDay: next },
      }),
    onSuccess: ({ photoLimit }) => {
      queryClient.setQueryData(personPhotoLimitQuery(userId).queryKey, photoLimit)
      toast({
        title: 'Photo limit saved',
        description:
          photoLimit.perDay === null
            ? `${name} uses the default (${photoLimit.defaultPerDay} a day).`
            : photoLimit.perDay === 0
              ? `Photo estimates are off for ${name}.`
              : `${name} can take ${photoLimit.perDay} a day.`,
      })
      onDone()
    },
    onError: (err) =>
      toast({
        tone: 'error',
        title: 'Couldn’t save it',
        description: err instanceof ApiError ? err.message : undefined,
      }),
  })
  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault()
        if (valid) save.mutate(perDay)
      }}
    >
      <Field
        label="Photos a day"
        hint={`Leave it empty for the default (${limit.defaultPerDay}). 0 switches photos off for them. Up to ${MAX_FOOD_PHOTOS_PER_DAY}.`}
        error={valid ? undefined : `At most ${MAX_FOOD_PHOTOS_PER_DAY}.`}
      >
        {(id) => (
          <Input
            id={id}
            inputMode="numeric"
            placeholder={`Default (${limit.defaultPerDay})`}
            value={value}
            onChange={(e) => setValue(e.target.value.replace(/\D/g, '').slice(0, 2))}
          />
        )}
      </Field>
      <p className="text-[13px] text-ink-muted">{limit.usedToday} used today.</p>
      <div className="flex flex-wrap items-center justify-end gap-3">
        {limit.perDay !== null && (
          <Button
            variant="ghost"
            className="mr-auto"
            loading={save.isPending && save.variables === null}
            onClick={() => save.mutate(null)}
          >
            Use the default
          </Button>
        )}
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" loading={save.isPending && save.variables !== null} disabled={!valid}>
          Save limit
        </Button>
      </div>
    </form>
  )
}

/** One day's foods by meal, read only. */
function FoodDayDrawer({
  userId,
  name,
  date,
  onClose,
}: {
  userId: number
  name: string
  date: string | null
  onClose: () => void
}) {
  const day = useQuery({ ...personFoodDayQuery(userId, date ?? ''), enabled: date !== null })
  return (
    <Drawer
      open={date !== null}
      onClose={onClose}
      title={date ? dayLabel(date) : 'Food'}
      description={`What ${name.split(' ')[0]} logged.`}
    >
      {!day.data ? (
        <p className="text-[14px] text-ink-muted">
          {day.isError ? 'Couldn’t load it.' : 'Loading…'}
        </p>
      ) : (
        <div className="flex flex-col gap-5">
          <p className="tabular rounded-md bg-surface-raised p-4 text-[14px]">
            <span className="font-bold">{gramsLabel(day.data.totals.proteinG)} g</span> protein ·{' '}
            <span className="font-bold">{kcalLabel(day.data.totals.kcal)}</span> kcal ·{' '}
            {gramsLabel(day.data.totals.carbsG)} g carbs · {gramsLabel(day.data.totals.fatG)} g fat
          </p>
          {day.data.burned.kcal > 0 && <BurnList burned={day.data.burned} />}
          {MEALS.map((meal) => {
            const foods = day.data.entries.filter((e) => e.meal === meal)
            if (foods.length === 0) return null
            return (
              <section key={meal} className="flex flex-col gap-1">
                <h3 className="font-extrabold text-[11px] text-ink-muted uppercase tracking-[0.08em]">
                  {MEAL_LABELS[meal]}
                </h3>
                <ul className="flex w-full flex-col">
                  {foods.map((f) => (
                    <li
                      key={f.id}
                      className="flex items-center gap-3 border-border border-b py-2.5 text-[14px]"
                    >
                      <span className="flex min-w-0 flex-1 items-center gap-2">
                        <span className="truncate font-semibold">{f.name}</span>
                        {f.grams !== null && (
                          <span className="tabular shrink-0 text-ink-muted">
                            {gramsLabel(f.grams)} g
                          </span>
                        )}
                        {f.source === 'barcode' && (
                          <ScanBarcode
                            className="size-3.5 shrink-0 text-ink-muted"
                            aria-label="From a barcode"
                          />
                        )}
                        {f.source === 'recipe' && (
                          <ChefHat
                            className="size-3.5 shrink-0 text-ink-muted"
                            aria-label="From a recipe"
                          />
                        )}
                        {f.source === 'search' && (
                          <Search
                            className="size-3.5 shrink-0 text-ink-muted"
                            aria-label="From the food database"
                          />
                        )}
                        {f.source === 'photo' && (
                          <Camera
                            className="size-3.5 shrink-0 text-ink-muted"
                            aria-label="Estimated from a photo"
                          />
                        )}
                      </span>
                      <span className="tabular shrink-0 text-right">
                        {gramsLabel(f.proteinG)} g · {kcalLabel(f.kcal)} kcal
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )
          })}
        </div>
      )}
    </Drawer>
  )
}

/** What they burned that day (read-only for the coach). */
function BurnList({ burned }: { burned: DayBurn }) {
  const rows = [
    ...burned.workouts.map((w) => ({
      key: `w${w.sessionId}`,
      label: w.name,
      detail: w.minutes ? `${w.minutes} min workout` : 'Workout',
      kcal: w.kcal,
    })),
    ...burned.activities.map((a) => ({
      key: `a${a.id}`,
      label: ACTIVITY_KIND_LABELS[a.kind],
      detail: `${a.minutes} min`,
      kcal: a.kcal,
    })),
    ...(burned.steps === null
      ? []
      : [
          {
            key: 'steps',
            label: `${new Intl.NumberFormat('en-ZA').format(burned.steps)} steps`,
            detail: 'Steps',
            kcal: burned.stepsKcal,
          },
        ]),
  ]
  return (
    <section className="flex flex-col gap-1">
      <h3 className="font-extrabold text-[11px] text-ink-muted uppercase tracking-[0.08em]">
        Exercise · {kcalLabel(burned.kcal)} kcal burned
      </h3>
      <ul className="flex w-full flex-col">
        {rows.map((r) => (
          <li
            key={r.key}
            className="flex min-h-11 items-center gap-3 border-border border-t py-2 text-[14px]"
          >
            <Flame className="size-4 shrink-0 text-clay-text" aria-hidden />
            <span className="min-w-0 flex-1 truncate font-semibold">{r.label}</span>
            <span className="text-ink-muted">{r.detail}</span>
            <span className="tabular w-20 shrink-0 text-right font-bold">
              {kcalLabel(r.kcal)} kcal
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

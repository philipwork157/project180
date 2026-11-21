import {
  ApiError,
  foodDayQuery,
  foodStreakQuery,
  foodSummaryQuery,
  waterDayQuery,
} from '@project180/client'
import {
  addDays,
  type FoodEntry,
  gramsLabel,
  isClient,
  kcalLabel,
  MEAL_LABELS,
  MEALS,
  type Meal,
  mealForHour,
  sumMacros,
  todayIn,
} from '@project180/shared'
import { Button, cn, Field, IconButton, Input, MacroWeekChart } from '@project180/ui'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import {
  Bookmark,
  Camera,
  ChefHat,
  ChevronLeft,
  ChevronRight,
  Copy,
  Flame,
  Plus,
  ScanBarcode,
  Search,
  Target,
} from 'lucide-react'
import { useState } from 'react'
import { AddFoodSheet } from '../../components/add-food-sheet'
import { EditFoodSheet } from '../../components/edit-food-sheet'
import { ExerciseCard } from '../../components/exercise-card'
import { FuelTotals, FuelWeek } from '../../components/fuel-totals'
import { MyTargetsSheet } from '../../components/my-targets'
import { RecipesEntryCard } from '../../components/recipe-card'
import { ScreenHeader } from '../../components/screen-header'
import { Sheet } from '../../components/sheet'
import { WaterCard } from '../../components/water-card'
import { useCopyMeal, useSaveMeal } from '../../lib/food'

export const Route = createFileRoute('/_app/fuel')({
  component: FuelPage,
})

/** The Monday of the week a day falls in. */
function mondayOf(date: string) {
  const weekday = (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7
  return addDays(date, -weekday)
}

const longDay = (date: string) =>
  new Intl.DateTimeFormat('en-ZA', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`))

function FuelPage() {
  const { me } = Route.useRouteContext()
  // A client without a coach sets their own daily targets.
  const onOwn = isClient(me.role) && me.coachId === null
  const [targeting, setTargeting] = useState(false)
  const today = todayIn(me.timezone)
  const [date, setDate] = useState(today)
  const [adding, setAdding] = useState<Meal | null>(null)
  const [editing, setEditing] = useState<FoodEntry | null>(null)
  const monday = mondayOf(date)
  const week = Array.from({ length: 7 }, (_, i) => addDays(monday, i))
  const sunday = week[6] ?? monday
  const day = useQuery(foodDayQuery(date))
  // The day before, for "Copy yesterday's breakfast" on an empty meal.
  const dayBefore = useQuery(foodDayQuery(addDays(date, -1)))
  const streak = useQuery(foodStreakQuery).data ?? 0
  const [savingMeal, setSavingMeal] = useState<Meal | null>(null)
  const water = useQuery(waterDayQuery(date))
  const summary = useQuery(foodSummaryQuery(monday, sunday))
  const targets = day.data?.targets ?? summary.data?.targets ?? null
  const thisWeek = sunday >= today

  return (
    <div className="flex flex-col gap-5">
      <ScreenHeader
        overline={date === today ? 'Today' : longDay(date)}
        title="Fuel"
        action={
          <div className="flex gap-1">
            <IconButton
              label="Previous week"
              icon={<ChevronLeft aria-hidden />}
              className="size-11"
              onClick={() => setDate(addDays(date, -7))}
            />
            <IconButton
              label="Next week"
              icon={<ChevronRight aria-hidden />}
              className="size-11"
              disabled={thisWeek}
              onClick={() => {
                const next = addDays(date, 7)
                // biome-ignore lint/complexity/useMathMinMax: YYYY-MM-DD strings; Math.min would give NaN
                setDate(next > today ? today : next)
              }}
            />
          </div>
        }
      />
      <FuelWeek
        week={week}
        selected={date}
        today={today}
        days={summary.data?.days ?? []}
        proteinTarget={targets?.proteinG ?? null}
        kcalTarget={targets?.kcal ?? null}
        burned={summary.data?.burned ?? []}
        onSelect={setDate}
      />
      {(date !== today || streak >= 2) && (
        <div className="flex flex-wrap items-center gap-3">
          {streak >= 2 && (
            <span className="inline-flex min-h-9 items-center gap-2 rounded-pill bg-lime/20 px-3 font-bold text-[13px] text-lime-text">
              <Flame className="size-4" aria-hidden />
              {streak} days in a row
            </span>
          )}
          {date !== today && (
            <Button variant="ghost" onClick={() => setDate(today)}>
              Back to today
            </Button>
          )}
        </div>
      )}

      {day.isError ? (
        <p className="rounded-md bg-surface p-4 text-[14px] text-ink-muted shadow-card">
          Couldn’t load this day. Check your signal and try again.
        </p>
      ) : !day.data ? (
        <div className="h-64 animate-pulse rounded-xl bg-surface" />
      ) : (
        // What you tap all day sits near the top. Phone: totals, Add food, water and exercise,
        // the meals, recipes, then the week. Laptop: totals, Add food and recipes on the left;
        // water and exercise side by side above the meals on the right, so both columns end
        // level and nothing you use daily hides under the fold. The week runs full width below.
        <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <div className="flex flex-col gap-5">
            <FuelTotals
              totals={day.data.totals}
              targets={day.data.targets}
              burnedKcal={day.data.burned.kcal}
              extras={day.data.extras}
              showGoal
              noTargetsText={
                onOwn ? 'Set your daily targets to see how each day compares.' : undefined
              }
            />
            {/* On your own, you set your own targets (with a coach, they do). */}
            {onOwn && (
              <Button
                variant="secondary"
                block
                icon={<Target className="size-5" aria-hidden />}
                onClick={() => setTargeting(true)}
              >
                {day.data.targets ? 'Change my daily targets' : 'Set my daily targets'}
              </Button>
            )}
            <Button
              size="lg"
              block
              icon={<Plus className="size-5" aria-hidden />}
              onClick={() =>
                setAdding(date === today ? mealForHour(new Date().getHours()) : 'lunch')
              }
            >
              Add food
            </Button>
            <div className="hidden lg:block">
              <RecipesEntryCard />
            </div>
          </div>
          <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2">
            {water.data ? (
              <WaterCard water={water.data} isToday={date === today} />
            ) : (
              <div
                className={cn(
                  'rounded-lg bg-surface p-5 shadow-card md:p-6',
                  water.isError ? 'text-[14px] text-ink-muted' : 'h-48 animate-pulse',
                )}
              >
                {water.isError && 'Couldn’t load your water. Check your signal and try again.'}
              </div>
            )}
            <ExerciseCard
              burned={day.data.burned}
              date={date}
              hasTarget={day.data.targets !== null}
            />
            {MEALS.map((meal) => (
              <MealCard
                key={meal}
                meal={meal}
                entries={day.data.entries.filter((e) => e.meal === meal)}
                yesterday={
                  dayBefore.data?.entries.some((e) => e.meal === meal) ? addDays(date, -1) : null
                }
                date={date}
                onAdd={() => setAdding(meal)}
                onOpen={setEditing}
                onSave={() => setSavingMeal(meal)}
              />
            ))}
          </div>
          <div className="lg:hidden">
            <RecipesEntryCard />
          </div>
          <div className="lg:col-span-2">
            <MacroWeekChart
              week={week}
              days={summary.data?.days ?? []}
              targets={targets}
              selected={date}
              today={today}
              onSelect={setDate}
            />
          </div>
        </div>
      )}

      <AddFoodSheet
        open={adding !== null}
        date={date}
        meal={adding ?? 'lunch'}
        onClose={() => setAdding(null)}
      />
      <EditFoodSheet entry={editing} onClose={() => setEditing(null)} />
      <MyTargetsSheet open={targeting} onClose={() => setTargeting(false)} timezone={me.timezone} />
      <SaveMealSheet meal={savingMeal} date={date} onClose={() => setSavingMeal(null)} />
    </div>
  )
}

function MealCard({
  meal,
  entries,
  yesterday,
  date,
  onAdd,
  onOpen,
  onSave,
}: {
  meal: Meal
  entries: FoodEntry[]
  /** The day before, when it had this meal (offers to copy it into an empty meal). */
  yesterday: string | null
  date: string
  onAdd: () => void
  onOpen: (entry: FoodEntry) => void
  onSave: () => void
}) {
  const totals = sumMacros(entries)
  const copy = useCopyMeal()
  return (
    <section
      aria-label={MEAL_LABELS[meal]}
      className="flex min-w-0 flex-col gap-2 rounded-lg bg-surface p-5 shadow-card md:p-6"
    >
      <header className="flex items-center gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h2 className="font-bold text-[17px]">{MEAL_LABELS[meal]}</h2>
          <p className="tabular text-[13px] text-ink-muted">
            {entries.length === 0
              ? 'Nothing yet'
              : `${kcalLabel(totals.kcal)} kcal · ${gramsLabel(totals.proteinG)} g protein`}
          </p>
        </div>
        <IconButton
          label={`Add to ${MEAL_LABELS[meal]}`}
          icon={<Plus aria-hidden />}
          className="size-11 bg-surface-raised"
          onClick={onAdd}
        />
      </header>
      {entries.length > 0 && (
        <ul className="flex w-full flex-col">
          {entries.map((e) => (
            <li key={e.id}>
              <button
                type="button"
                onClick={() => onOpen(e)}
                className="flex min-h-12 w-full items-center gap-3 border-border border-t py-2.5 text-left transition active:scale-[0.99]"
              >
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex items-center gap-2 font-semibold text-[15px]">
                    <span className="truncate">{e.name}</span>
                    {e.source === 'photo' && (
                      <Camera
                        className="size-3.5 shrink-0 text-ink-muted"
                        aria-label="From a photo"
                      />
                    )}
                    {e.source === 'barcode' && (
                      <ScanBarcode
                        className="size-3.5 shrink-0 text-ink-muted"
                        aria-label="From a barcode"
                      />
                    )}
                    {e.source === 'recipe' && (
                      <ChefHat
                        className="size-3.5 shrink-0 text-ink-muted"
                        aria-label="From a recipe"
                      />
                    )}
                    {e.source === 'search' && (
                      <Search
                        className="size-3.5 shrink-0 text-ink-muted"
                        aria-label="From the food database"
                      />
                    )}
                  </span>
                  {e.grams !== null && (
                    <span className="tabular text-[13px] text-ink-muted">
                      {gramsLabel(e.grams)} g
                    </span>
                  )}
                </span>
                <span className="tabular flex shrink-0 flex-col items-end gap-0.5 text-[13px]">
                  <span className="font-bold text-ink">{kcalLabel(e.kcal)} kcal</span>
                  <span className="text-ink-muted">{gramsLabel(e.proteinG)} g protein</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {entries.length === 0 && yesterday && (
        <Button
          variant="ghost"
          className="self-start"
          icon={<Copy className="size-4" aria-hidden />}
          loading={copy.isPending}
          onClick={() => copy.mutate({ fromDate: yesterday, fromMeal: meal, date, meal })}
        >
          Copy yesterday’s {MEAL_LABELS[meal].toLowerCase()}
        </Button>
      )}
      {entries.length > 0 && (
        <Button
          variant="ghost"
          size="sm"
          className="h-11 self-start text-ink-muted hover:text-ink"
          icon={<Bookmark className="size-4" aria-hidden />}
          onClick={onSave}
        >
          Save as a meal
        </Button>
      )}
      {copy.isError && (
        <p role="alert" className="font-semibold text-[13px] text-danger">
          Couldn’t copy it. Try again.
        </p>
      )}
    </section>
  )
}

/** Name a meal to log again in one tap (My meals, in Add food). */
function SaveMealSheet({
  meal,
  date,
  onClose,
}: {
  meal: Meal | null
  date: string
  onClose: () => void
}) {
  const [name, setName] = useState('')
  const save = useSaveMeal(() => close())
  function close() {
    setName('')
    save.reset()
    onClose()
  }
  const label = meal ? MEAL_LABELS[meal] : 'meal'
  return (
    <Sheet open={meal !== null} onClose={close} label="Save as a meal">
      <form
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault()
          if (meal) save.mutate({ name: name.trim() || `My ${label.toLowerCase()}`, date, meal })
        }}
      >
        <div className="flex flex-col gap-1">
          <h2 className="font-bold text-[22px]">Save as a meal</h2>
          <p className="text-[14px] text-ink-muted">
            Saves this {label.toLowerCase()} so you can add it again in one tap, from My meals in
            Add food.
          </p>
        </div>
        <Field label="Name">
          {(id) => (
            <Input
              id={id}
              maxLength={60}
              placeholder={`My ${label.toLowerCase()}`}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          )}
        </Field>
        {save.isError && (
          <p role="alert" className="font-semibold text-[14px] text-danger">
            {save.error instanceof ApiError ? save.error.message : 'Couldn’t save it. Try again.'}
          </p>
        )}
        <Button type="submit" size="lg" block loading={save.isPending}>
          Save meal
        </Button>
      </form>
    </Sheet>
  )
}

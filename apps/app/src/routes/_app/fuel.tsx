import { foodDayQuery, foodSummaryQuery, waterDayQuery } from '@project180/client'
import {
  addDays,
  type FoodEntry,
  gramsLabel,
  kcalLabel,
  MEAL_LABELS,
  MEALS,
  type Meal,
  mealForHour,
  sumMacros,
  todayIn,
} from '@project180/shared'
import { Button, cn, IconButton } from '@project180/ui'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { Camera, ChevronLeft, ChevronRight, Plus, ScanBarcode, Search } from 'lucide-react'
import { useState } from 'react'
import { AddFoodSheet } from '../../components/add-food-sheet'
import { EditFoodSheet } from '../../components/edit-food-sheet'
import { FuelTotals, FuelWeek } from '../../components/fuel-totals'
import { MacroWeekChart } from '../../components/macro-week-chart'
import { ScreenHeader } from '../../components/screen-header'
import { WaterCard } from '../../components/water-card'

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
  const today = todayIn(me.timezone)
  const [date, setDate] = useState(today)
  const [adding, setAdding] = useState<Meal | null>(null)
  const [editing, setEditing] = useState<FoodEntry | null>(null)
  const monday = mondayOf(date)
  const week = Array.from({ length: 7 }, (_, i) => addDays(monday, i))
  const sunday = week[6] ?? monday
  const day = useQuery(foodDayQuery(date))
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
        onSelect={setDate}
      />
      {date !== today && (
        <Button variant="ghost" className="self-start" onClick={() => setDate(today)}>
          Back to today
        </Button>
      )}

      {day.isError ? (
        <p className="rounded-md bg-surface p-4 text-[14px] text-ink-muted shadow-card">
          Couldn’t load this day. Check your signal and try again.
        </p>
      ) : !day.data ? (
        <div className="h-64 animate-pulse rounded-xl bg-surface" />
      ) : (
        // Phone: totals, Add food, water, the meals, then the week. Laptop: totals, Add food and
        // water on the left, the meals filling the rest of that row, and the week full width
        // underneath, so neither column runs on while the other sits empty.
        <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <div className="flex flex-col gap-5">
            <FuelTotals totals={day.data.totals} targets={day.data.targets} />
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
          </div>
          <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2">
            {MEALS.map((meal) => (
              <MealCard
                key={meal}
                meal={meal}
                entries={day.data.entries.filter((e) => e.meal === meal)}
                onAdd={() => setAdding(meal)}
                onOpen={setEditing}
              />
            ))}
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
    </div>
  )
}

function MealCard({
  meal,
  entries,
  onAdd,
  onOpen,
}: {
  meal: Meal
  entries: FoodEntry[]
  onAdd: () => void
  onOpen: (entry: FoodEntry) => void
}) {
  const totals = sumMacros(entries)
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
    </section>
  )
}

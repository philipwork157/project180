import {
  ApiError,
  api,
  personFoodDayQuery,
  personFoodSummaryQuery,
} from '@project180/client'
import {
  addDays,
  type FoodDayTotals,
  gramsLabel,
  kcalLabel,
  MEAL_LABELS,
  MEALS,
  type NutritionTargets,
  targetShare,
  todayIn,
} from '@project180/shared'
import { Button, Card, cn, Drawer, Field, Input, toast } from '@project180/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Camera, ChevronRight, ScanBarcode } from 'lucide-react'
import { type ChangeEvent, useState } from 'react'

const DAYS = 7

const dayLabel = (date: string) =>
  new Intl.DateTimeFormat('en-ZA', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`))

const average = (values: number[]) =>
  values.length === 0 ? null : values.reduce((a, b) => a + b, 0) / values.length

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
  const byDate = new Map((data?.days ?? []).map((d) => [d.date, d]))
  const dates = Array.from({ length: DAYS }, (_, i) => addDays(today, -i))
  const logged = data?.days ?? []
  const avgKcal = average(logged.map((d) => d.kcal))
  const avgProtein = average(logged.map((d) => d.proteinG))

  return (
    <Card className="flex min-w-0 flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="font-bold text-[17px]">Food</h2>
          <p className="text-[14px] text-ink-muted">
            What they log in the app over the last 7 days, against their daily targets.
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
          {targets ? 'Edit targets' : 'Set targets'}
        </Button>
      </div>

      {summary.isError ? (
        <p className="rounded-md bg-surface-raised p-4 text-[14px] text-ink-muted">
          Couldn’t load their food log. Try again.
        </p>
      ) : !data ? (
        <p className="text-[14px] text-ink-muted">Loading…</p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Figure
              label="Avg protein"
              value={avgProtein === null ? '–' : gramsLabel(Math.round(avgProtein))}
              unit="g"
              target={targets ? `${targets.proteinG} g target` : 'No target'}
            />
            <Figure
              label="Avg calories"
              value={avgKcal === null ? '–' : kcalLabel(avgKcal)}
              unit="kcal"
              target={targets ? `${kcalLabel(targets.kcal)} kcal target` : 'No target'}
            />
            <Figure label="Days logged" value={String(logged.length)} unit={`of ${DAYS}`} />
          </div>
          {logged.length === 0 && (
            <p className="rounded-md bg-surface-raised p-4 text-[14px] text-ink-muted">
              Nothing logged this week. They add food from the Fuel tab in the app.
            </p>
          )}
          <ul className="flex w-full flex-col">
            {dates.map((date) => (
              <DayRow
                key={date}
                date={date}
                day={byDate.get(date)}
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

function Figure({
  label,
  value,
  unit,
  target,
}: {
  label: string
  value: string
  unit: string
  target?: string
}) {
  return (
    <div className="flex flex-col gap-1 rounded-md bg-surface-raised p-4">
      <span className="font-extrabold text-[11px] text-ink-muted uppercase tracking-[0.08em]">
        {label}
      </span>
      <span className="flex items-baseline gap-1">
        <span className="metric text-[24px] leading-7">{value}</span>
        <span className="font-semibold text-[13px] text-ink-muted">{unit}</span>
      </span>
      {target && <span className="text-[13px] text-ink-muted">{target}</span>}
    </div>
  )
}

function DayRow({
  date,
  day,
  targets,
  onOpen,
}: {
  date: string
  day: FoodDayTotals | undefined
  targets: NutritionTargets | null
  onOpen: () => void
}) {
  const share = targetShare(day?.proteinG ?? 0, targets?.proteinG)
  return (
    <li>
      <button
        type="button"
        disabled={!day}
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
          <span className="flex-1 text-[14px] text-ink-muted">Nothing logged</span>
        )}
      </button>
    </li>
  )
}

/** Set or change a client's daily targets. Carbs and fat are optional. */
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
      description={`What ${name.split(' ')[0]} aims for each day. They see it on their Fuel tab.`}
    >
      {open && <TargetsForm userId={userId} name={name} targets={targets} onDone={onClose} />}
    </Drawer>
  )
}

const text = (n: number | null | undefined) => (n == null ? '' : String(n))
const whole = (value: string) => {
  const n = Number.parseInt(value, 10)
  return Number.isFinite(n) ? n : null
}

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
  const queryClient = useQueryClient()
  const [kcal, setKcal] = useState(text(targets?.kcal))
  const [protein, setProtein] = useState(text(targets?.proteinG))
  const [carbs, setCarbs] = useState(text(targets?.carbsG))
  const [fat, setFat] = useState(text(targets?.fatG))
  const [error, setError] = useState<string>()
  const refresh = () =>
    void queryClient.invalidateQueries({ queryKey: ['admin', 'users', userId, 'food'] })
  const save = useMutation({
    mutationFn: () =>
      api(`/admin/users/${userId}/nutrition-targets`, {
        method: 'PUT',
        body: { kcal: whole(kcal), proteinG: whole(protein), carbsG: whole(carbs), fatG: whole(fat) },
      }),
    onSuccess: () => {
      refresh()
      toast({ title: 'Targets saved', description: name })
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
  const numeric = (set: (v: string) => void) => (e: ChangeEvent<HTMLInputElement>) =>
    set(e.target.value.replace(/\D/g, ''))

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault()
        setError(undefined)
        if (whole(kcal) === null || whole(protein) === null) {
          setError('Calories and protein are both needed.')
          return
        }
        save.mutate()
      }}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Calories (kcal)" hint="800 to 6 000">
          {(id) => (
            <Input id={id} inputMode="numeric" value={kcal} onChange={numeric(setKcal)} />
          )}
        </Field>
        <Field label="Protein (g)" hint="20 to 400">
          {(id) => (
            <Input id={id} inputMode="numeric" value={protein} onChange={numeric(setProtein)} />
          )}
        </Field>
        <Field label="Carbs (g)" hint="Optional">
          {(id) => <Input id={id} inputMode="numeric" value={carbs} onChange={numeric(setCarbs)} />}
        </Field>
        <Field label="Fat (g)" hint="Optional">
          {(id) => <Input id={id} inputMode="numeric" value={fat} onChange={numeric(setFat)} />}
        </Field>
      </div>
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
        <p className="text-[14px] text-ink-muted">{day.isError ? 'Couldn’t load it.' : 'Loading…'}</p>
      ) : (
        <div className="flex flex-col gap-5">
          <p className="tabular rounded-md bg-surface-raised p-4 text-[14px]">
            <span className="font-bold">{gramsLabel(day.data.totals.proteinG)} g</span> protein ·{' '}
            <span className="font-bold">{kcalLabel(day.data.totals.kcal)}</span> kcal ·{' '}
            {gramsLabel(day.data.totals.carbsG)} g carbs · {gramsLabel(day.data.totals.fatG)} g fat
          </p>
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
                          <span className="tabular shrink-0 text-ink-muted">{gramsLabel(f.grams)} g</span>
                        )}
                        {f.source === 'barcode' && (
                          <ScanBarcode
                            className="size-3.5 shrink-0 text-ink-muted"
                            aria-label="From a barcode"
                          />
                        )}
                        {f.source === 'photo' && (
                          <Camera className="size-3.5 shrink-0 text-ink-muted" aria-label="Estimated from a photo" />
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

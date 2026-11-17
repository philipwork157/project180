import {
  energySplit,
  type FoodDayTotals,
  gramsLabel,
  kcalLabel,
  MACROS,
  type MacroKey,
  type NutritionTargets,
} from '@project180/shared'
import { motion } from 'motion/react'
import { useState } from 'react'
import { ChoiceChips } from './choice'
import { cn } from './cn'

/** `all`: calories per day, each bar split into protein, carbs and fat (everything at once). */
export type MacroMetric = 'all' | 'proteinG' | 'carbsG' | 'fatG' | 'kcal'
type Metric = MacroMetric

const METRICS: ReadonlyArray<{ value: Metric; label: string }> = [
  { value: 'all', label: 'All macros' },
  ...MACROS.map((m) => ({ value: m.key, label: m.label })),
  { value: 'kcal', label: 'Calories' },
]

/** One colour per macro, the same in every chart (tokens.css, checked for colour blindness). */
export const MACRO_FILL: Record<MacroKey, string> = {
  proteinG: 'bg-macro-protein',
  carbsG: 'bg-macro-carbs',
  fatG: 'bg-macro-fat',
}

const FILL: Record<Metric, string> = { ...MACRO_FILL, kcal: 'bg-ink-muted', all: 'bg-ink-muted' }

/** "Mon", "Tue": from the date itself, so a rolling 7 days (the coach's view) reads right too. */
const weekday = (date: string) =>
  new Intl.DateTimeFormat('en-ZA', { weekday: 'short', timeZone: 'UTC' }).format(
    new Date(`${date}T00:00:00Z`),
  )
const PLOT_HEIGHT = 160

const valueText = (metric: Metric, n: number) =>
  metric === 'kcal' || metric === 'all' ? `${kcalLabel(n)} kcal` : `${gramsLabel(n)} g`

/** Protein, carbs and fat in grams: "P 150 g · C 180 g · F 55 g". */
const gramsLine = (d: Pick<FoodDayTotals, MacroKey>) =>
  MACROS.map((m) => `${m.label} ${gramsLabel(d[m.key])} g`).join(' · ')

const dayLabel = (date: string) =>
  new Intl.DateTimeFormat('en-ZA', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`))

/** Average grams of each macro over the days that have food. */
function averageGrams(days: FoodDayTotals[]): Record<MacroKey, number> {
  const n = Math.max(1, days.length)
  const sum = (k: MacroKey) => days.reduce((a, d) => a + d[k], 0) / n
  return { proteinG: sum('proteinG'), carbsG: sum('carbsG'), fatG: sum('fatG') }
}

/** A round top for the axis (25, 50, 100, 250 …) so labels read 0 · 50 · 100. */
function niceMax(value: number) {
  if (value <= 0) return 10
  const steps = [1, 2, 2.5, 5, 10]
  const magnitude = 10 ** Math.floor(Math.log10(value))
  const step = steps.find((s) => s * magnitude >= value) ?? 10
  return step * magnitude
}

/**
 * One macro (or calories) per day across 7 days, with the coach's target as a dashed line.
 * Tap a day's column to open that day; the open day shows its number above its bar. Used on
 * the phone's Fuel tab (its own card) and inside the coach's Food card (`embedded`).
 */
export function MacroWeekChart({
  week,
  days,
  targets,
  selected = null,
  today,
  onSelect,
  title = 'This week',
  embedded = false,
  defaultMetric = 'proteinG',
}: {
  week: string[]
  days: FoodDayTotals[]
  targets: NutritionTargets | null
  selected?: string | null
  today: string
  onSelect: (date: string) => void
  title?: string
  /** Inside another card: no card of its own. */
  embedded?: boolean
  /** What it opens on (the coach's view opens on all macros at once). */
  defaultMetric?: Metric
}) {
  const [metric, setMetric] = useState<Metric>(defaultMetric)
  const stacked = metric === 'all'
  const [hovered, setHovered] = useState<string | null>(null)
  const byDate = new Map(days.map((d) => [d.date, d]))
  const field = stacked ? 'kcal' : metric
  const values = week.map((date) => byDate.get(date)?.[field] ?? null)
  const target = targets ? (targets[field] ?? null) : null
  const max = niceMax(Math.max(target ?? 0, ...values.map((v) => v ?? 0)) * 1.1)
  const logged = values.filter((v): v is number => v !== null)
  const average = logged.length ? logged.reduce((a, b) => a + b, 0) / logged.length : null
  const label = METRICS.find((m) => m.value === metric)?.label ?? ''
  const active = hovered ?? selected

  return (
    <section
      aria-label={title}
      className={cn(
        'flex min-w-0 flex-col gap-5',
        !embedded && 'rounded-lg bg-surface p-5 shadow-card md:p-6',
      )}
    >
      <div className="flex flex-col gap-1">
        <h2 className={cn('font-bold', embedded ? 'text-[15px]' : 'text-[17px]')}>{title}</h2>
        <p className="text-[14px] text-ink-muted">
          {average === null
            ? 'Nothing logged in these 7 days yet.'
            : stacked
              ? `${kcalLabel(average)} kcal a day on average: ${gramsLine(averageGrams(days))}, over ${logged.length} day${
                  logged.length === 1 ? '' : 's'
                } logged.`
              : `${label} averages ${valueText(metric, average)} a day, over ${logged.length} day${
                  logged.length === 1 ? '' : 's'
                } logged.`}
        </p>
      </div>
      <ChoiceChips
        label="Show"
        options={METRICS}
        value={metric}
        onChange={(m) => m && setMetric(m)}
        className="no-scrollbar -mx-5 flex-nowrap overflow-x-auto px-5 md:mx-0 md:px-0 [&>button]:shrink-0 [&>button]:whitespace-nowrap"
      />
      {stacked && (
        <ul aria-hidden className="-mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
          {MACROS.map((m) => (
            <li key={m.key} className="flex items-center gap-2">
              <span className={cn('size-3 rounded-[3px]', MACRO_FILL[m.key])} />
              {m.label}
            </li>
          ))}
          <li className="text-ink-muted">Bar height = calories</li>
        </ul>
      )}

      <div className="relative" style={{ height: PLOT_HEIGHT + 28 }}>
        {/* Recessive grid: 0, half and the top, labelled on the left. */}
        {[0, 0.5, 1].map((f) => (
          <div
            key={f}
            aria-hidden
            className="absolute inset-x-0 flex items-center gap-2"
            style={{ bottom: 28 + f * PLOT_HEIGHT, transform: 'translateY(50%)' }}
          >
            <span className="tabular w-9 shrink-0 text-right text-[11px] text-ink-muted">
              {metric === 'kcal' || stacked ? kcalLabel(max * f) : gramsLabel(max * f)}
            </span>
            <span className={cn('h-px flex-1', f === 0 ? 'bg-border-strong/60' : 'bg-border')} />
          </div>
        ))}
        {target !== null && (
          <div
            aria-hidden
            className="absolute right-0 left-11 border-ink border-t-2 border-dashed"
            style={{ bottom: 28 + (target / max) * PLOT_HEIGHT }}
          >
            <span className="tabular absolute -top-5 right-0 rounded-sm bg-surface px-1 font-bold text-[11px]">
              Target {valueText(metric, target)}
            </span>
          </div>
        )}

        <ol className="absolute top-0 right-0 bottom-0 left-11 grid grid-cols-7 gap-1">
          {week.map((date, i) => {
            const v = values[i] ?? null
            const height = v === null ? 0 : Math.max(2, (v / max) * PLOT_HEIGHT)
            const isActive = date === active
            const future = date > today
            const day = byDate.get(date)
            const split = day ? energySplit(day) : null
            return (
              <li key={date} className="relative">
                <button
                  type="button"
                  onClick={() => onSelect(date)}
                  onMouseEnter={() => setHovered(date)}
                  onMouseLeave={() => setHovered(null)}
                  onFocus={() => setHovered(date)}
                  onBlur={() => setHovered(null)}
                  aria-pressed={date === selected}
                  aria-label={`${dayLabel(date)}: ${
                    v === null
                      ? 'nothing logged'
                      : `${valueText(metric, v)}${stacked && day ? `, ${gramsLine(day)}` : ''}`
                  }`}
                  className="flex h-full w-full flex-col items-center justify-end gap-2 rounded-sm"
                >
                  <span
                    className="relative flex w-full justify-center"
                    style={{ height: PLOT_HEIGHT }}
                  >
                    {isActive && v !== null && (
                      <span
                        className="tabular absolute z-10 whitespace-nowrap rounded-sm bg-ink px-1.5 py-0.5 font-bold text-[11px] text-surface shadow-card"
                        style={{ bottom: height + 6 }}
                      >
                        {valueText(metric, v)}
                      </span>
                    )}
                    <motion.span
                      key={metric}
                      className={cn(
                        'absolute bottom-0 w-[58%] max-w-7 rounded-t-[4px] transition-opacity lg:max-w-12',
                        // All macros: one bar of calories, split protein (bottom), carbs, fat.
                        stacked ? 'flex flex-col-reverse gap-px overflow-hidden' : FILL[metric],
                        !isActive && hovered !== null && 'opacity-50',
                      )}
                      initial={{ height: 0 }}
                      animate={{ height }}
                      transition={{ type: 'spring', stiffness: 160, damping: 24, delay: i * 0.03 }}
                    >
                      {stacked &&
                        split &&
                        MACROS.filter((m) => split[m.key] > 0).map((m) => (
                          <span
                            key={m.key}
                            className={cn('block w-full basis-0', MACRO_FILL[m.key])}
                            style={{ flexGrow: split[m.key] }}
                          />
                        ))}
                    </motion.span>
                  </span>
                  <span
                    className={cn(
                      'h-5 text-[11px] uppercase tracking-wide',
                      date === selected ? 'font-extrabold text-ink' : 'font-bold text-ink-muted',
                      future && 'opacity-50',
                    )}
                  >
                    {weekday(date)}
                  </span>
                </button>
              </li>
            )
          })}
        </ol>
      </div>

      <details className="group text-[13px]">
        <summary className="cursor-pointer font-bold text-brand-text">Show the numbers</summary>
        <div className="mt-3 overflow-x-auto rounded-md bg-surface-raised">
          <table className="tabular w-full text-left">
            <thead>
              <tr>
                {['Day', 'Protein', 'Carbs', 'Fat', 'kcal'].map((h, i) => (
                  <th
                    key={h}
                    className={cn(
                      'px-3 py-2 font-extrabold text-[11px] text-ink-muted uppercase tracking-[0.08em]',
                      i > 0 && 'text-right',
                    )}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {week.map((date) => {
                const d = byDate.get(date)
                return (
                  <tr key={date} className="border-border border-t">
                    <td className="px-3 py-2 font-semibold">{dayLabel(date)}</td>
                    <td className="px-3 py-2 text-right">
                      {d ? `${gramsLabel(d.proteinG)} g` : '–'}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {d ? `${gramsLabel(d.carbsG)} g` : '–'}
                    </td>
                    <td className="px-3 py-2 text-right">{d ? `${gramsLabel(d.fatG)} g` : '–'}</td>
                    <td className="px-3 py-2 text-right">{d ? kcalLabel(d.kcal) : '–'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  )
}

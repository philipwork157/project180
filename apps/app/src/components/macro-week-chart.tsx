import {
  type FoodDayTotals,
  gramsLabel,
  kcalLabel,
  MACROS,
  type NutritionTargets,
} from '@project180/shared'
import { ChoiceChips, cn } from '@project180/ui'
import { motion } from 'motion/react'
import { useState } from 'react'
import { MACRO_FILL } from './fuel-totals'

type Metric = 'proteinG' | 'carbsG' | 'fatG' | 'kcal'

const METRICS: ReadonlyArray<{ value: Metric; label: string }> = [
  ...MACROS.map((m) => ({ value: m.key, label: m.label })),
  { value: 'kcal', label: 'Calories' },
]

const FILL: Record<Metric, string> = { ...MACRO_FILL, kcal: 'bg-ink-muted' }
const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const PLOT_HEIGHT = 160

const valueText = (metric: Metric, n: number) =>
  metric === 'kcal' ? `${kcalLabel(n)} kcal` : `${gramsLabel(n)} g`

const dayLabel = (date: string) =>
  new Intl.DateTimeFormat('en-ZA', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`))

/** A round top for the axis (25, 50, 100, 250 …) so labels read 0 · 50 · 100. */
function niceMax(value: number) {
  if (value <= 0) return 10
  const steps = [1, 2, 2.5, 5, 10]
  const magnitude = 10 ** Math.floor(Math.log10(value))
  const step = steps.find((s) => s * magnitude >= value) ?? 10
  return step * magnitude
}

/**
 * One macro (or calories) per day across the week, with the coach's target as a dashed line.
 * Tap a day's column to open that day; the open day shows its number above its bar.
 */
export function MacroWeekChart({
  week,
  days,
  targets,
  selected,
  today,
  onSelect,
}: {
  week: string[]
  days: FoodDayTotals[]
  targets: NutritionTargets | null
  selected: string
  today: string
  onSelect: (date: string) => void
}) {
  const [metric, setMetric] = useState<Metric>('proteinG')
  const [hovered, setHovered] = useState<string | null>(null)
  const byDate = new Map(days.map((d) => [d.date, d]))
  const values = week.map((date) => byDate.get(date)?.[metric] ?? null)
  const target = targets ? (targets[metric] ?? null) : null
  const max = niceMax(Math.max(target ?? 0, ...values.map((v) => v ?? 0)) * 1.1)
  const logged = values.filter((v): v is number => v !== null)
  const average = logged.length ? logged.reduce((a, b) => a + b, 0) / logged.length : null
  const label = METRICS.find((m) => m.value === metric)?.label ?? ''
  const active = hovered ?? selected

  return (
    <section
      aria-label="This week"
      className="flex min-w-0 flex-col gap-5 rounded-lg bg-surface p-5 shadow-card md:p-6"
    >
      <div className="flex flex-col gap-1">
        <h2 className="font-bold text-[17px]">This week</h2>
        <p className="text-[14px] text-ink-muted">
          {average === null
            ? 'Nothing logged this week yet.'
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
              {metric === 'kcal' ? kcalLabel(max * f) : gramsLabel(max * f)}
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
                  aria-label={`${dayLabel(date)}: ${v === null ? 'nothing logged' : valueText(metric, v)}`}
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
                        FILL[metric],
                        !isActive && hovered !== null && 'opacity-50',
                      )}
                      initial={{ height: 0 }}
                      animate={{ height }}
                      transition={{ type: 'spring', stiffness: 160, damping: 24, delay: i * 0.03 }}
                    />
                  </span>
                  <span
                    className={cn(
                      'h-5 text-[11px] uppercase tracking-wide',
                      date === selected ? 'font-extrabold text-ink' : 'font-bold text-ink-muted',
                      future && 'opacity-50',
                    )}
                  >
                    {DAY_NAMES[i]}
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
                    <td className="px-3 py-2 text-right">{d ? `${gramsLabel(d.proteinG)} g` : '–'}</td>
                    <td className="px-3 py-2 text-right">{d ? `${gramsLabel(d.carbsG)} g` : '–'}</td>
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

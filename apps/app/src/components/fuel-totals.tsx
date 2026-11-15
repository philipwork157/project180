import {
  energySplit,
  type FoodDayTotals,
  gramsLabel,
  kcalLabel,
  MACROS,
  type MacroKey,
  type MacroTotals,
  type NutritionTargets,
  targetShare,
} from '@project180/shared'
import { cn } from '@project180/ui'
import { Check } from 'lucide-react'
import { motion } from 'motion/react'
import { useState } from 'react'

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/** One colour per macro, the same in every chart (tokens.css, checked for colour blindness). */
export const MACRO_FILL: Record<MacroKey, string> = {
  proteinG: 'bg-macro-protein',
  carbsG: 'bg-macro-carbs',
  fatG: 'bg-macro-fat',
}

const targetOf = (targets: NutritionTargets | null, key: MacroKey) =>
  targets ? (targets[key] ?? null) : null

const percent = (share: number) => `${Math.round(share * 100)}%`

/**
 * The day at a glance: calories against the target, then where those calories came from
 * (one bar split into protein, carbs and fat), with each macro's grams beside its colour.
 */
export function FuelTotals({
  totals,
  targets,
}: {
  totals: MacroTotals
  targets: NutritionTargets | null
}) {
  const split = energySplit(totals)
  const empty = totals.kcal === 0 && totals.proteinG === 0
  const kcalTarget = targets?.kcal ?? null
  const reached = kcalTarget !== null && totals.kcal >= kcalTarget
  return (
    <section
      aria-label="Totals"
      className="flex flex-col gap-6 rounded-lg bg-surface p-5 shadow-card md:p-6"
    >
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-3">
          <p className="flex items-baseline gap-2">
            <span className="metric text-[44px] leading-none">{kcalLabel(totals.kcal)}</span>
            <span className="font-semibold text-[15px] text-ink-muted">
              {kcalTarget === null ? 'kcal' : `/ ${kcalLabel(kcalTarget)} kcal`}
            </span>
          </p>
          {kcalTarget !== null && (
            <span className="shrink-0 text-[13px] text-ink-muted">
              {reached ? (
                <span className="inline-flex items-center gap-1 font-bold text-lime-text">
                  <Check className="size-3.5" strokeWidth={3} aria-hidden />
                  Target reached
                </span>
              ) : (
                `${kcalLabel(kcalTarget - totals.kcal)} to go`
              )}
            </span>
          )}
        </div>
        {kcalTarget !== null && (
          // The numbers above say the same for screen readers.
          <div aria-hidden className="h-2 w-full overflow-hidden rounded-pill bg-surface-raised">
            <motion.div
              className="h-full rounded-pill bg-lime"
              initial={{ width: 0 }}
              animate={{ width: `${targetShare(totals.kcal, kcalTarget) * 100}%` }}
              transition={{ type: 'spring', stiffness: 120, damping: 22 }}
            />
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="font-bold text-[15px]">Where your calories came from</h2>
        <EnergyBar split={split} empty={empty} />
        <ul className="flex w-full flex-col">
          {MACROS.map((m) => {
            const target = targetOf(targets, m.key)
            return (
              <li
                key={m.key}
                className="flex min-h-11 items-center gap-3 border-border border-t py-2 first:border-t-0"
              >
                <span
                  aria-hidden
                  className={cn('size-3 shrink-0 rounded-[3px]', MACRO_FILL[m.key])}
                />
                <span className="min-w-0 flex-1 font-semibold text-[15px]">{m.label}</span>
                <span className="tabular text-[15px]">
                  <span className="font-bold">{gramsLabel(totals[m.key])}</span>
                  <span className="text-ink-muted">
                    {target === null ? ' g' : ` / ${target} g`}
                  </span>
                </span>
                <span className="tabular w-11 shrink-0 text-right text-[13px] text-ink-muted">
                  {empty ? '–' : percent(split[m.key])}
                </span>
              </li>
            )
          })}
        </ul>
      </div>

      {!targets && (
        <p className="text-[13px] text-ink-muted">
          Your coach hasn’t set daily targets yet. Your totals still add up here.
        </p>
      )}
    </section>
  )
}

/** One bar split by share of energy, 2px gaps between the parts. Tap a part for its number. */
function EnergyBar({ split, empty }: { split: Record<MacroKey, number>; empty: boolean }) {
  const [active, setActive] = useState<MacroKey | null>(null)
  const parts = MACROS.filter((m) => split[m.key] > 0)
  const shown = parts.find((m) => m.key === active)
  return (
    <div className="flex flex-col gap-2">
      <div className="flex h-4 w-full gap-0.5 rounded-[4px] bg-surface-raised">
        {!empty &&
          parts.map((m) => (
            <button
              key={m.key}
              type="button"
              aria-label={`${m.label}: ${percent(split[m.key])} of calories`}
              onClick={() => setActive((a) => (a === m.key ? null : m.key))}
              onMouseEnter={() => setActive(m.key)}
              onMouseLeave={() => setActive(null)}
              onFocus={() => setActive(m.key)}
              onBlur={() => setActive(null)}
              className={cn(
                // A 44px-tall tap area around the 16px bar.
                'relative h-full min-w-1.5 basis-0 transition-[flex-grow,opacity] duration-500 ease-out',
                'first:rounded-l-[4px] last:rounded-r-[4px] after:absolute after:inset-x-0 after:-inset-y-3.5',
                MACRO_FILL[m.key],
                active && active !== m.key && 'opacity-40',
              )}
              style={{ flexGrow: split[m.key] }}
            />
          ))}
      </div>
      <p className="min-h-5 text-[13px] text-ink-muted" aria-live="polite">
        {empty
          ? 'Log food to see the split.'
          : shown
            ? `${shown.label}: ${percent(split[shown.key])} of today’s calories`
            : 'Tap the bar for each part.'}
      </p>
    </div>
  )
}

/** Monday to Sunday: tap a day to see it. A dot marks days with food; lime when protein hit. */
export function FuelWeek({
  week,
  selected,
  today,
  days,
  proteinTarget,
  onSelect,
}: {
  week: string[]
  selected: string
  today: string
  days: FoodDayTotals[]
  proteinTarget: number | null
  onSelect: (date: string) => void
}) {
  const byDate = new Map(days.map((d) => [d.date, d]))
  return (
    <ol className="grid grid-cols-7 gap-1.5 rounded-lg bg-surface p-2 shadow-card">
      {week.map((date, i) => {
        const d = byDate.get(date)
        const isSelected = date === selected
        const hit = d && proteinTarget !== null && d.proteinG >= proteinTarget
        return (
          <li key={date}>
            <button
              type="button"
              onClick={() => onSelect(date)}
              aria-pressed={isSelected}
              aria-label={`${DAY_NAMES[i]} ${date}${date === today ? ', today' : ''}: ${
                d
                  ? `${kcalLabel(d.kcal)} kcal, ${gramsLabel(d.proteinG)} g protein`
                  : 'nothing logged'
              }`}
              className={cn(
                'flex min-h-11 w-full flex-col items-center gap-1.5 rounded-pill py-2.5 transition active:scale-95',
                isSelected ? 'bg-brand text-on-brand' : 'text-ink',
              )}
            >
              <span
                className={cn(
                  'font-extrabold text-[11px] uppercase tracking-wide',
                  isSelected ? 'opacity-80' : 'text-ink-muted',
                )}
              >
                {DAY_NAMES[i]}
              </span>
              <span
                className={cn(
                  'metric text-[18px] leading-6',
                  date === today && !isSelected && 'text-brand-text',
                )}
              >
                {Number(date.slice(8))}
              </span>
              <span
                aria-hidden
                className={cn(
                  'size-2 rounded-full',
                  !d
                    ? 'bg-transparent'
                    : hit
                      ? 'bg-lime'
                      : isSelected
                        ? 'bg-on-brand'
                        : 'bg-ink-muted',
                )}
              />
            </button>
          </li>
        )
      })}
    </ol>
  )
}

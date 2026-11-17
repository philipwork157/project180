// Calories and where they came from: one bar split into protein, carbs and fat, with each
// macro's grams against its target. The phone's Fuel tab (a day) and the coach's Food card
// (their average day) share it.
import {
  type ExtrasTotals,
  energySplit,
  gramsLabel,
  kcalLabel,
  kcalStatus,
  MACROS,
  type MacroKey,
  type MacroTotals,
  type NutritionTargets,
  paceLabel,
  targetShare,
} from '@project180/shared'
import { Check, Target } from 'lucide-react'
import { motion } from 'motion/react'
import { useState } from 'react'
import { cn } from './cn'
import { MACRO_FILL } from './macro-week-chart'

const targetOf = (targets: NutritionTargets | null, key: MacroKey) =>
  targets ? (targets[key] ?? null) : null

const percent = (share: number) => `${Math.round(share * 100)}%`

/**
 * The day at a glance: calories against the target, then where those calories came from
 * (one bar split into protein, carbs and fat), with each macro's grams beside its colour.
 */
export function MacroTotalsCard({
  totals,
  targets,
  heading = 'Where your calories came from',
  emptyText = 'Log food to see the split.',
  noTargetsText = 'Your coach hasn’t set daily targets yet. Your totals still add up here.',
  shareOf = 'today’s calories',
  embedded = false,
  showGoal = false,
  burnedKcal,
  extras,
}: {
  totals: MacroTotals
  targets: NutritionTargets | null
  heading?: string
  emptyText?: string
  noTargetsText?: string
  /** "50% of today’s calories". */
  shareOf?: string
  /** Inside another card: no card of its own. */
  embedded?: boolean
  /** Their goal under the totals ("Lose 0.5 kg a week · goal 80 kg"), on the phone. */
  showGoal?: boolean
  /** Exercise that day: added to the target, with Goal + Exercise − Food = left shown. */
  burnedKcal?: number
  /** Fibre, sugar and sodium, shown when any food that day had them. */
  extras?: ExtrasTotals
}) {
  const split = energySplit(totals)
  const empty = totals.kcal === 0 && totals.proteinG === 0
  const goalKcal = targets?.kcal ?? null
  const kcalTarget = goalKcal === null ? null : goalKcal + (burnedKcal ?? 0)
  // Under, within 5% of, or over the target: over is a gentle clay, never a lime "well done".
  const status = kcalTarget === null ? null : kcalStatus(totals.kcal, kcalTarget)
  const goal =
    showGoal && targets
      ? [
          targets.weeklyChangeKg !== null && paceLabel(targets.weeklyChangeKg),
          targets.goalWeightKg !== null && `goal ${targets.goalWeightKg} kg`,
        ].filter(Boolean)
      : []
  return (
    <section
      aria-label="Totals"
      // Phones: tighter, and the three macros side by side, so what comes after (Add food, water,
      // exercise) reaches the first screen. Wider screens: the roomy rows.
      className={cn(
        'flex flex-col gap-4 md:gap-6',
        !embedded && 'rounded-lg bg-surface p-5 shadow-card md:p-6',
      )}
    >
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <p className="flex items-baseline gap-2">
            <span className="metric text-[38px] leading-none md:text-[44px]">
              {kcalLabel(totals.kcal)}
            </span>
            <span className="whitespace-nowrap font-semibold text-[15px] text-ink-muted">
              {kcalTarget === null ? 'kcal' : `/ ${kcalLabel(kcalTarget)} kcal`}
            </span>
          </p>
          {kcalTarget !== null && (
            <span className="shrink-0 text-[13px] text-ink-muted">
              {status === 'on_target' ? (
                <span className="inline-flex items-center gap-1 font-bold text-lime-text">
                  <Check className="size-3.5" strokeWidth={3} aria-hidden />
                  On target
                </span>
              ) : status === 'over' ? (
                <span className="font-bold text-clay-text">
                  {kcalLabel(totals.kcal - kcalTarget)} kcal over
                </span>
              ) : (
                `${kcalLabel(kcalTarget - totals.kcal)} kcal left`
              )}
            </span>
          )}
        </div>
        {kcalTarget !== null && (
          // The numbers above say the same for screen readers.
          <div aria-hidden className="h-2 w-full overflow-hidden rounded-pill bg-surface-raised">
            <motion.div
              className={cn('h-full rounded-pill', status === 'over' ? 'bg-clay' : 'bg-lime')}
              initial={{ width: 0 }}
              animate={{ width: `${targetShare(totals.kcal, kcalTarget) * 100}%` }}
              transition={{ type: 'spring', stiffness: 120, damping: 22 }}
            />
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="sr-only font-bold text-[15px] md:not-sr-only">{heading}</h2>
        <EnergyBar split={split} empty={empty} emptyText={emptyText} shareOf={shareOf} />
        <ul className="grid w-full grid-cols-3 gap-2 md:flex md:flex-col md:gap-0">
          {MACROS.map((m) => {
            const target = targetOf(targets, m.key)
            return (
              <li
                key={m.key}
                className="flex min-w-0 flex-col gap-1 rounded-md bg-surface-raised p-2.5 md:min-h-11 md:flex-row md:items-center md:gap-3 md:rounded-none md:border-border md:border-t md:bg-transparent md:p-0 md:py-2 md:first:border-t-0"
              >
                <span className="flex min-w-0 items-center gap-2 md:flex-1 md:gap-3">
                  <span
                    aria-hidden
                    className={cn('size-2.5 shrink-0 rounded-[3px] md:size-3', MACRO_FILL[m.key])}
                  />
                  <span className="truncate font-semibold text-[13px] md:text-[15px]">
                    {m.label}
                  </span>
                </span>
                <span className="tabular text-[14px] md:text-[15px]">
                  <span className="font-bold">{gramsLabel(totals[m.key])}</span>
                  <span className="text-ink-muted">
                    {target === null ? ' g' : ` / ${target} g`}
                  </span>
                </span>
                <span className="tabular hidden w-11 shrink-0 text-right text-[13px] text-ink-muted md:block">
                  {empty ? '–' : percent(split[m.key])}
                </span>
              </li>
            )
          })}
        </ul>
      </div>

      {extras && (extras.fibreG !== null || extras.sugarG !== null || extras.sodiumMg !== null) && (
        <p className="tabular flex flex-wrap gap-x-3 gap-y-1 text-[13px] text-ink-muted">
          {extras.fibreG !== null && (
            <span>
              Fibre <span className="font-bold text-ink">{gramsLabel(extras.fibreG)} g</span>
            </span>
          )}
          {extras.sugarG !== null && (
            <span>
              Sugar <span className="font-bold text-ink">{gramsLabel(extras.sugarG)} g</span>
            </span>
          )}
          {extras.sodiumMg !== null && (
            <span>
              Sodium <span className="font-bold text-ink">{kcalLabel(extras.sodiumMg)} mg</span>
            </span>
          )}
        </p>
      )}
      {goalKcal !== null && burnedKcal !== undefined && (
        <KcalSum goal={goalKcal} exercise={burnedKcal} food={totals.kcal} />
      )}
      {goal.length > 0 && (
        <p className="flex items-center gap-2 font-semibold text-[13px]">
          <Target className="size-4 shrink-0 text-brand-text" aria-hidden />
          {goal.join(' · ')}
        </p>
      )}
      {!targets && <p className="text-[13px] text-ink-muted">{noTargetsText}</p>}
    </section>
  )
}

/** One bar split by share of energy, 2px gaps between the parts. Tap a part for its number. */
function EnergyBar({
  split,
  empty,
  emptyText,
  shareOf,
}: {
  split: Record<MacroKey, number>
  empty: boolean
  emptyText: string
  shareOf: string
}) {
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
          ? emptyText
          : shown
            ? `${shown.label}: ${percent(split[shown.key])} of ${shareOf}`
            : 'Tap the bar for each part.'}
      </p>
    </div>
  )
}

/** MyFitnessPal's sum: Goal + Exercise − Food = left (or over). */
function KcalSum({ goal, exercise, food }: { goal: number; exercise: number; food: number }) {
  const left = goal + exercise - food
  const cell = (label: string, value: string, tone?: string) => (
    <div className="flex min-w-0 flex-col items-center gap-1 text-center">
      <span className={cn('metric text-[18px] leading-none', tone)}>{value}</span>
      <span className="font-extrabold text-[10px] text-ink-muted uppercase tracking-[0.08em]">
        {label}
      </span>
    </div>
  )
  const sign = (s: string) => (
    <span aria-hidden className="self-start pt-0.5 font-bold text-[15px] text-ink-muted">
      {s}
    </span>
  )
  return (
    <div>
      <p className="sr-only">
        Goal {kcalLabel(goal)} plus exercise {kcalLabel(exercise)} minus food {kcalLabel(food)}:{' '}
        {kcalLabel(Math.abs(left))} kcal {left >= 0 ? 'left' : 'over'}
      </p>
      <div
        aria-hidden
        className="grid grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr] items-start gap-1.5 rounded-md bg-surface-raised px-2 py-3"
      >
        {cell('Goal', kcalLabel(goal))}
        {sign('+')}
        {cell('Exercise', kcalLabel(exercise), exercise > 0 ? 'text-clay-text' : undefined)}
        {sign('−')}
        {cell('Food', kcalLabel(food))}
        {sign('=')}
        {cell(
          left >= 0 ? 'Left' : 'Over',
          kcalLabel(Math.abs(left)),
          left < 0 ? 'text-clay-text' : undefined,
        )}
      </div>
    </div>
  )
}

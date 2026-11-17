import { type FoodDayTotals, gramsLabel, kcalLabel, kcalStatus } from '@project180/shared'
import { cn, MacroTotalsCard } from '@project180/ui'

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/** The day at a glance (shared with the coach's Food card). */
export const FuelTotals = MacroTotalsCard

/** Monday to Sunday: tap a day to see it. A dot marks days with food: lime when protein hit, clay
 * when over the calorie target. */
export function FuelWeek({
  week,
  selected,
  today,
  days,
  proteinTarget,
  kcalTarget = null,
  burned = [],
  onSelect,
}: {
  week: string[]
  selected: string
  today: string
  days: FoodDayTotals[]
  proteinTarget: number | null
  /** Days over it get a clay dot. */
  kcalTarget?: number | null
  /** kcal burned per day, added to that day's target. */
  burned?: { date: string; kcal: number }[]
  onSelect: (date: string) => void
}) {
  const byDate = new Map(days.map((d) => [d.date, d]))
  return (
    <ol className="grid grid-cols-7 gap-1.5 rounded-lg bg-surface p-2 shadow-card">
      {week.map((date, i) => {
        const d = byDate.get(date)
        const isSelected = date === selected
        const hit = d && proteinTarget !== null && d.proteinG >= proteinTarget
        const extra = burned.find((b) => b.date === date)?.kcal ?? 0
        const over = d && kcalTarget !== null && kcalStatus(d.kcal, kcalTarget + extra) === 'over'
        return (
          <li key={date}>
            <button
              type="button"
              onClick={() => onSelect(date)}
              aria-pressed={isSelected}
              aria-label={`${DAY_NAMES[i]} ${date}${date === today ? ', today' : ''}: ${
                d
                  ? `${kcalLabel(d.kcal)} kcal${over ? ' (over your target)' : ''}, ${gramsLabel(d.proteinG)} g protein`
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
                    : over
                      ? 'bg-clay'
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

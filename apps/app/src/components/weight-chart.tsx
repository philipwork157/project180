import { addDays, daysBetween, formatWeight, weightChange } from '@project180/shared'
import { Button, cn } from '@project180/ui'
import { Scale } from 'lucide-react'
import { motion } from 'motion/react'
import { useState } from 'react'

interface Point {
  date: string
  weightKg: number
}

const RANGES = [
  { value: 30, label: '1M' },
  { value: 90, label: '3M' },
  { value: 0, label: 'All' },
] as const

const shortDay = (iso: string) =>
  new Intl.DateTimeFormat('en-ZA', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
    new Date(`${iso}T00:00:00Z`),
  )

/** Round tick steps (0.5, 1, 2, 5, 10 kg) so the axis reads 68 · 70 · 72, never 68.37. */
function axis(values: number[]) {
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  const spread = Math.max(hi - lo, 1)
  const step = [0.5, 1, 2, 5, 10, 20].find((s) => spread / s <= 4) ?? 20
  const min = Math.floor((lo - spread * 0.1) / step) * step
  const max = Math.ceil((hi + spread * 0.1) / step) * step
  const ticks: number[] = []
  for (let t = min; t <= max + 1e-9; t += step) ticks.push(Math.round(t * 10) / 10)
  return { min, max, ticks }
}

/**
 * Body weight on the Progress screen: today's number big, the change over the chosen range,
 * a line that draws in (dates to scale), the goal as a dashed line, and tap any point for
 * its date and weight.
 */
export function WeightChart({
  points: all,
  today,
  goalKg,
  onLog,
}: {
  points: Point[]
  today: string
  goalKg: number | null
  onLog: () => void
}) {
  const span = all.length > 1 ? daysBetween(all[0]?.date ?? today, today) : 0
  const [range, setRange] = useState<number>(span > 90 ? 90 : 0)
  const from = range ? addDays(today, -range) : ''
  const inRange = all.filter((p) => p.date >= from)
  // Too few in the window to draw a line: show the latest two at least.
  const points = inRange.length >= 2 ? inRange : all.slice(-2)
  const latest = all.at(-1)
  const first = points[0]

  const header = (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="font-extrabold text-[11px] text-ink-muted uppercase tracking-[0.08em]">
          {latest
            ? latest.date === today
              ? 'Today'
              : `Last weighed ${shortDay(latest.date)}`
            : 'No weigh-ins yet'}
        </p>
        <p className="mt-1 flex items-baseline gap-1.5">
          <span className="metric text-[40px] leading-none">
            {latest ? formatWeight(latest.weightKg) : '–'}
          </span>
          <span className="font-bold text-[15px] text-ink-muted">kg</span>
        </p>
        {latest && first && first.date !== latest.date && (
          <p className="mt-2 flex flex-wrap items-center gap-2 text-[13px]">
            <span className="tabular rounded-pill bg-sand/20 px-2.5 py-0.5 font-bold text-sand-text">
              {weightChange(first.weightKg, latest.weightKg)}
            </span>
            <span className="font-semibold text-ink-muted">since {shortDay(first.date)}</span>
          </p>
        )}
      </div>
      <Button
        variant="secondary"
        size="sm"
        className="h-11 shrink-0"
        icon={<Scale className="size-4" aria-hidden />}
        onClick={onLog}
      >
        Log weight
      </Button>
    </div>
  )

  if (all.length < 2) {
    return (
      <div className="flex flex-col gap-4 rounded-lg bg-surface p-5 shadow-card md:p-6">
        {header}
        <p className="rounded-md bg-surface-raised p-4 text-[14px] text-ink-muted">
          {all.length === 0
            ? 'Log your weight on weigh-in days and your trend shows up here.'
            : 'One more weigh-in and your trend line shows up here.'}
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5 rounded-lg bg-surface p-5 shadow-card md:p-6">
      {header}
      {span > 30 && (
        <fieldset className="flex w-fit gap-1 rounded-pill bg-surface-raised p-1">
          <legend className="sr-only">Time range</legend>
          {RANGES.filter((r) => r.value === 0 || r.value < span + 30).map((r) => (
            <button
              key={r.value}
              type="button"
              aria-pressed={range === r.value}
              onClick={() => setRange(r.value)}
              className={cn(
                'h-9 min-w-12 rounded-pill px-3 font-bold text-[13px] transition active:scale-95',
                range === r.value ? 'bg-surface text-ink shadow-card' : 'text-ink-muted',
              )}
            >
              {r.label}
            </button>
          ))}
        </fieldset>
      )}
      <Plot key={range} points={points} goalKg={goalKg} />
      <Summary points={points} goalKg={goalKg} />
    </div>
  )
}

function Plot({ points, goalKg }: { points: Point[]; goalKg: number | null }) {
  const [active, setActive] = useState<number | null>(null)
  const values = points.map((p) => p.weightKg)
  // The goal sits on the chart when it's near enough to be useful (within 15 kg).
  const showGoal =
    goalKg !== null && Math.abs(goalKg - (values.at(-1) ?? goalKg)) <= 15 ? goalKg : null
  const { min, max, ticks } = axis(showGoal === null ? values : [...values, showGoal])
  const start = Date.parse(`${points[0]?.date}T00:00:00Z`)
  const days = Math.max(1, (Date.parse(`${points.at(-1)?.date}T00:00:00Z`) - start) / 86_400_000)
  const xs = points.map(
    (p) => ((Date.parse(`${p.date}T00:00:00Z`) - start) / 86_400_000 / days) * 100,
  )
  const yOf = (v: number) => 100 - ((v - min) / (max - min)) * 100
  const ys = values.map(yOf)
  const line = xs.map((x, i) => `${x},${ys[i]}`).join(' ')
  // Each point's tap area reaches halfway to its neighbours.
  const edges = xs.map((x, i) => [
    i === 0 ? 0 : (x + (xs[i - 1] ?? 0)) / 2,
    i === xs.length - 1 ? 100 : (x + (xs[i + 1] ?? 100)) / 2,
  ])
  const tip = active === null ? null : points[active]
  const before = active ? points[active - 1] : undefined
  const keyed = points.map((p, n) => ({
    ...p,
    key: `${p.date}#${points.slice(0, n).filter((q) => q.date === p.date).length}`,
  }))

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-3">
        {/* Weight axis */}
        <div className="relative h-44 w-8 shrink-0 md:h-56">
          {ticks.map((t) => (
            <span
              key={t}
              className="tabular -translate-y-1/2 absolute right-0 font-semibold text-[11px] text-ink-muted"
              style={{ top: `${yOf(t)}%` }}
            >
              {formatWeight(t)}
            </span>
          ))}
        </div>
        <div className="relative h-44 min-w-0 flex-1 md:h-56">
          {ticks.map((t) => (
            <span
              key={t}
              aria-hidden
              className="absolute inset-x-0 border-border border-t"
              style={{ top: `${yOf(t)}%` }}
            />
          ))}
          {showGoal !== null && (
            <div
              className="pointer-events-none absolute inset-x-0 border-lime border-t-2 border-dashed"
              style={{ top: `${yOf(showGoal)}%` }}
            >
              <span className="-translate-y-full absolute right-0 pb-1 font-bold text-[11px] text-lime-text">
                Goal {formatWeight(showGoal)} kg
              </span>
            </div>
          )}

          {/* The line draws in from the left. */}
          <motion.div
            className="absolute inset-0 text-sand"
            initial={{ clipPath: 'inset(-10% 100% -10% 0)' }}
            animate={{ clipPath: 'inset(-10% 0% -10% 0)' }}
            transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
          >
            <svg
              aria-hidden
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              className="absolute inset-0 size-full overflow-visible"
            >
              <polygon points={`0,100 ${line} 100,100`} className="fill-sand/15" />
              <polyline
                points={line}
                fill="none"
                stroke="currentColor"
                strokeWidth={2.5}
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
            {keyed.map((p, i) => (
              <span
                key={p.key}
                aria-hidden
                className={cn(
                  '-translate-x-1/2 -translate-y-1/2 absolute rounded-full bg-sand ring-2 ring-surface transition-[width,height]',
                  active === i || (active === null && i === keyed.length - 1)
                    ? 'size-3.5'
                    : 'size-2',
                )}
                style={{ left: `${xs[i]}%`, top: `${ys[i]}%` }}
              />
            ))}
          </motion.div>

          {active !== null && (
            <span
              aria-hidden
              className="pointer-events-none absolute inset-y-0 w-px bg-border-strong"
              style={{ left: `${xs[active]}%` }}
            />
          )}
          {tip && active !== null && (
            <div
              className="pointer-events-none absolute top-0 z-10 rounded-md bg-ink px-3 py-2 text-bg shadow-float"
              style={{
                left: `${xs[active]}%`,
                transform: `translate(${(xs[active] ?? 50) > 70 ? '-100%' : (xs[active] ?? 50) < 30 ? '0' : '-50%'}, -105%)`,
              }}
            >
              <p className="metric whitespace-nowrap text-[18px] leading-none">
                {formatWeight(tip.weightKg)} kg
              </p>
              <p className="mt-1 whitespace-nowrap font-semibold text-[12px] opacity-75">
                {shortDay(tip.date)}
                {before ? ` · ${weightChange(before.weightKg, tip.weightKg)}` : ''}
              </p>
            </div>
          )}

          {keyed.map((p, i) => (
            <button
              key={`hit-${p.key}`}
              type="button"
              aria-label={`${shortDay(p.date)}: ${formatWeight(p.weightKg)} kg`}
              onPointerEnter={() => setActive(i)}
              onPointerLeave={() => setActive(null)}
              onFocus={() => setActive(i)}
              onBlur={() => setActive(null)}
              onClick={() => setActive(i)}
              className="absolute inset-y-0 cursor-default rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-brand"
              style={{
                left: `${edges[i]?.[0]}%`,
                width: `${(edges[i]?.[1] ?? 0) - (edges[i]?.[0] ?? 0)}%`,
              }}
            />
          ))}
        </div>
      </div>
      <div className="flex justify-between gap-2 pl-11 font-semibold text-[12px] text-ink-muted">
        <span>{shortDay(points[0]?.date ?? '')}</span>
        <span>{shortDay(points.at(-1)?.date ?? '')}</span>
      </div>
    </div>
  )
}

function Summary({ points, goalKg }: { points: Point[]; goalKg: number | null }) {
  const values = points.map((p) => p.weightKg)
  const latest = values.at(-1) ?? 0
  const items = [
    { label: 'Start', value: values[0] ?? 0 },
    { label: 'Lowest', value: Math.min(...values) },
    goalKg !== null
      ? { label: 'To goal', value: Math.abs(latest - goalKg), hint: goalKg }
      : { label: 'Highest', value: Math.max(...values) },
  ]
  return (
    <dl className="grid grid-cols-3 gap-2">
      {items.map((it) => (
        <div key={it.label} className="flex flex-col gap-1 rounded-md bg-surface-raised p-3">
          <dt className="font-extrabold text-[11px] text-ink-muted uppercase tracking-[0.08em]">
            {it.label}
          </dt>
          <dd className="flex items-baseline gap-1">
            <span className="metric text-[20px] leading-none">{formatWeight(it.value)}</span>
            <span className="font-semibold text-[12px] text-ink-muted">kg</span>
          </dd>
        </div>
      ))}
    </dl>
  )
}

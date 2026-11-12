import { formatNumber } from '@project180/shared'
import { cn } from '@project180/ui'
import { type ReactNode, useState } from 'react'

/** "12 Nov" from an ISO day. */
export const shortDay = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })

/** The hover/focus readout: the value leads, the label follows. */
function ChartTip({ x, value, label }: { x: number; value: string; label: string }) {
  return (
    <span
      role="status"
      className="-translate-x-1/2 pointer-events-none absolute top-0 z-10 flex flex-col gap-0.5 whitespace-nowrap rounded-sm bg-ink px-2.5 py-1.5 text-bg shadow-float"
      // Kept inside the chart at both ends.
      style={{ left: `clamp(4.5rem, ${x}%, calc(100% - 4.5rem))` }}
    >
      <span className="tabular font-extrabold text-[13px] leading-4">{value}</span>
      <span className="font-semibold text-[11px] leading-4 opacity-80">{label}</span>
    </span>
  )
}

export interface BarDatum {
  key: string
  value: number
  /** Shown under the value in the readout, e.g. "Week of 3 Nov · 3 workouts". */
  label: string
  valueText: string
}

/** One series of bars from a zero baseline (weekly volume). One colour, so no legend. */
export function Bars({
  data,
  barClass,
  label,
  first,
  last,
}: {
  data: BarDatum[]
  barClass: string
  label: string
  first: string
  last: string
}) {
  const [active, setActive] = useState<number | null>(null)
  const most = Math.max(1, ...data.map((d) => d.value))
  const tip = active === null ? null : data[active]
  return (
    <div className="flex flex-col gap-2">
      <div className="relative pt-12">
        {tip && active !== null && (
          <ChartTip
            x={((active + 0.5) / data.length) * 100}
            value={tip.valueText}
            label={tip.label}
          />
        )}
        <ol className="flex h-40 items-end gap-[2px] border-border border-b" aria-label={label}>
          {data.map((d, i) => (
            <li key={d.key} className="flex h-full min-w-0 flex-1">
              <button
                // The whole column is the hit target, not just the bar. Hover, focus or a tap
                // (phones have no hover) shows the readout.
                type="button"
                aria-label={`${d.label}: ${d.valueText}`}
                onPointerEnter={() => setActive(i)}
                onPointerLeave={() => setActive(null)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
                onClick={() => setActive(i)}
                className={cn(
                  'flex h-full w-full cursor-default items-end justify-center rounded-t-[4px] px-[3px] outline-none focus-visible:ring-2 focus-visible:ring-brand',
                  active === i && 'bg-surface-raised',
                )}
              >
                {d.value > 0 && (
                  <span
                    className={cn('block w-full max-w-12 rounded-t-[4px]', barClass)}
                    style={{ height: `${(d.value / most) * 100}%` }}
                  />
                )}
              </button>
            </li>
          ))}
        </ol>
      </div>
      <div className="flex justify-between gap-2 font-semibold text-[12px] text-ink-muted">
        <span>{first}</span>
        <span>{last}</span>
      </div>
    </div>
  )
}

export interface LinePoint {
  date: string
  value: number
  valueText: string
  /** Extra line in the readout, e.g. "Heaviest set 45 kg". */
  detail?: string
}

/** One series over time, spaced by date. A thin line with dots; hover or tab for the numbers. */
export function TrendLine({
  points,
  lineClass,
  label,
  unit,
}: {
  points: LinePoint[]
  /** A text colour class; the line and dots use currentColor. */
  lineClass: string
  label: string
  unit: string
}) {
  const [active, setActive] = useState<number | null>(null)
  const values = points.map((p) => p.value)
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  const pad = hi === lo ? Math.max(1, hi * 0.05) : (hi - lo) * 0.15
  const min = lo - pad
  const max = hi + pad
  const day = (iso: string) => new Date(`${iso}T12:00:00Z`).getTime()
  const start = day(points[0]?.date ?? '1970-01-01')
  const span = day(points.at(-1)?.date ?? '1970-01-01') - start
  const xs = points.map((p, i) =>
    points.length === 1
      ? 50
      : span === 0
        ? (i / (points.length - 1)) * 100
        : ((day(p.date) - start) / span) * 100,
  )
  const yOf = (v: number) => 100 - ((v - min) / (max - min)) * 100
  const ys = points.map((p) => yOf(p.value))
  const yHi = yOf(hi)
  const yLo = yOf(lo)
  const tip = active === null ? null : points[active]
  // Two points can share a date (two workouts in a day): number repeats for unique keys.
  const keyed = points.map((p, n) => ({
    ...p,
    key: `${p.date}#${points.slice(0, n).filter((q) => q.date === p.date).length}`,
  }))
  // Hit areas reach halfway to the neighbours, so the pointer only has to be closest.
  const edges = xs.map((x, i) => [
    i === 0 ? 0 : (x + (xs[i - 1] ?? 0)) / 2,
    i === xs.length - 1 ? 100 : (x + (xs[i + 1] ?? 100)) / 2,
  ])

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-3">
        {/* The highest and lowest values, level with their dashed guides. */}
        <div className="tabular relative mt-12 h-40 w-12 shrink-0 text-right font-semibold text-[12px] text-ink-muted">
          <span className="-translate-y-1/2 absolute right-0" style={{ top: `${yHi}%` }}>
            {formatNumber(hi)}
          </span>
          {hi !== lo && (
            <span className="-translate-y-1/2 absolute right-0" style={{ top: `${yLo}%` }}>
              {formatNumber(lo)}
            </span>
          )}
        </div>
        <div className="relative min-w-0 flex-1 pt-12">
          {tip && active !== null && (
            <ChartTip
              x={xs[active] ?? 50}
              value={tip.valueText}
              label={tip.detail ? `${shortDay(tip.date)} · ${tip.detail}` : shortDay(tip.date)}
            />
          )}
          <div
            role="img"
            aria-label={`${label}, ${points.length} points, from ${formatNumber(lo)} to ${formatNumber(hi)} ${unit}`}
            className={cn('relative h-40 border-border border-b', lineClass)}
          >
            {/* Recessive guides at the highest and lowest values. */}
            <span
              aria-hidden
              className="absolute inset-x-0 border-border border-t border-dashed"
              style={{ top: `${yHi}%` }}
            />
            {hi !== lo && (
              <span
                aria-hidden
                className="absolute inset-x-0 border-border border-t border-dashed"
                style={{ top: `${yLo}%` }}
              />
            )}
            <svg
              aria-hidden
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              className="absolute inset-0 size-full overflow-visible"
            >
              {points.length > 1 && (
                <polyline
                  points={xs.map((x, i) => `${x},${ys[i]}`).join(' ')}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
              )}
            </svg>
            {keyed.map((p, i) => (
              <span
                key={p.key}
                aria-hidden
                className={cn(
                  '-translate-x-1/2 -translate-y-1/2 absolute rounded-full bg-current ring-2 ring-surface transition-[width,height]',
                  active === i ? 'size-3' : 'size-2',
                )}
                style={{ left: `${xs[i]}%`, top: `${ys[i]}%` }}
              />
            ))}
            {active !== null && (
              <span
                aria-hidden
                className="pointer-events-none absolute inset-y-0 w-px bg-border-strong"
                style={{ left: `${xs[active]}%` }}
              />
            )}
            {keyed.map((p, i) => (
              <button
                key={`hit-${p.key}`}
                type="button"
                aria-label={`${shortDay(p.date)}: ${p.valueText}${p.detail ? `, ${p.detail}` : ''}`}
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
      </div>
      <div className="flex justify-between gap-2 pl-15 font-semibold text-[12px] text-ink-muted">
        <span>{shortDay(points[0]?.date ?? '')}</span>
        {points.length > 1 && <span>{shortDay(points.at(-1)?.date ?? '')}</span>}
      </div>
    </div>
  )
}

/** The same numbers as a table, for screen readers and anyone who'd rather read than hover. */
export function NumbersTable({
  head,
  rows,
}: {
  head: string[]
  rows: Array<{ key: string; cells: ReactNode[] }>
}) {
  return (
    <details className="group text-[13px]">
      <summary className="cursor-pointer font-bold text-brand-text">Show the numbers</summary>
      <div className="mt-3 max-h-64 overflow-auto rounded-md bg-surface-raised">
        <table className="tabular w-full text-left">
          <thead className="sticky top-0 bg-surface-raised">
            <tr>
              {head.map((h, i) => (
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
          <tbody className="divide-y divide-border">
            {rows.map((r) => (
              <tr key={r.key}>
                {r.cells.map((c, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: cells are fixed columns
                  <td key={i} className={cn('px-3 py-2 font-semibold', i > 0 && 'text-right')}>
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  )
}

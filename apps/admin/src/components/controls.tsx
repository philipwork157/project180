import { cn } from '@project180/ui'
import { Minus, Plus, Search } from 'lucide-react'
import type { InputHTMLAttributes, ReactNode } from 'react'

/** Two or three mutually exclusive views, e.g. Active / Archived. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T
  options: Array<{ value: T; label: string; count?: number }>
  onChange: (value: T) => void
  label: string
}) {
  return (
    // Phones: scrolls sideways rather than running off the screen. The scroller wraps the box, so
    // the room it keeps under the row for a phone's scroll indicator stays outside the grey box.
    <div className="no-scrollbar min-w-0 max-w-full overflow-x-auto">
      <fieldset aria-label={label} className="inline-flex gap-1 rounded-md bg-surface-raised p-1">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            aria-pressed={value === o.value}
            onClick={() => onChange(o.value)}
            className={cn(
              'flex h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-sm px-3 font-bold text-[14px] transition sm:px-4',
              value === o.value
                ? 'bg-surface text-ink shadow-card'
                : 'text-ink-muted hover:text-ink',
            )}
          >
            {o.label}
            {o.count !== undefined && (
              <span className="tabular rounded-pill bg-surface-raised px-1.5 text-[12px]">
                {o.count}
              </span>
            )}
          </button>
        ))}
      </fieldset>
    </div>
  )
}

export function SearchInput({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <span className={cn('relative block', className)}>
      <Search
        aria-hidden
        className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-3 size-4 text-ink-muted"
      />
      <input
        type="search"
        className="h-11 w-full rounded-sm bg-surface-raised pr-3 pl-9 text-[15px] text-ink outline-none ring-1 ring-border-strong ring-inset transition placeholder:text-ink-muted focus:ring-2 focus:ring-brand"
        {...rest}
      />
    </span>
  )
}

/** Small number field with − / + buttons, for sets, reps and weeks. */
export function Stepper({
  value,
  onChange,
  min = 0,
  max = 999,
  step = 1,
  label,
  suffix,
}: {
  value: number | null
  onChange: (value: number | null) => void
  min?: number
  max?: number
  step?: number
  label: string
  suffix?: string
}) {
  const clamp = (n: number) => Math.min(max, Math.max(min, n))
  const btn =
    'grid size-8 shrink-0 place-items-center rounded-[8px] text-ink-muted transition hover:bg-surface hover:text-ink'
  return (
    <span className="inline-flex h-10 items-center rounded-sm bg-surface-raised px-1 ring-1 ring-border-strong ring-inset">
      <button
        type="button"
        className={btn}
        aria-label={`Less ${label}`}
        onClick={() => onChange(clamp((value ?? min) - step))}
      >
        <Minus className="size-4" aria-hidden />
      </button>
      <input
        aria-label={label}
        inputMode="numeric"
        value={value ?? ''}
        onChange={(e) => {
          const n = Number.parseInt(e.target.value, 10)
          onChange(Number.isNaN(n) ? null : clamp(n))
        }}
        className="tabular w-9 bg-transparent text-center font-bold text-[15px] text-ink outline-none"
      />
      {suffix && <span className="pr-1 font-semibold text-[12px] text-ink-muted">{suffix}</span>}
      <button
        type="button"
        className={btn}
        aria-label={`More ${label}`}
        onClick={() => onChange(clamp((value ?? min) + step))}
      >
        <Plus className="size-4" aria-hidden />
      </button>
    </span>
  )
}

export function Toolbar({ children }: { children: ReactNode }) {
  return <div className="mb-4 flex flex-wrap items-center gap-3">{children}</div>
}

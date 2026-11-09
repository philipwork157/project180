import { Check } from 'lucide-react'
import { useEffect, useState } from 'react'
import { cn } from './cn'
import { Select } from './field'

export interface ChoiceOption<T extends string> {
  value: T
  label: string
}

function Pill({
  on,
  multiple,
  label,
  onClick,
}: {
  on: boolean
  multiple: boolean
  label: string
  onClick: () => void
}) {
  return (
    // biome-ignore lint/a11y/useAriaPropsSupportedByRole: the role is checkbox or radio, both support aria-checked
    <button
      type="button"
      role={multiple ? 'checkbox' : 'radio'}
      aria-checked={on}
      onClick={onClick}
      className={cn(
        'inline-flex h-10 items-center gap-1.5 rounded-pill px-4 font-bold text-[14px] transition active:scale-[0.97]',
        on
          ? 'bg-brand text-on-brand'
          : 'bg-surface-raised text-ink hover:ring-[1.5px] hover:ring-border-strong hover:ring-inset',
      )}
    >
      {on && <Check className="size-4" strokeWidth={3} aria-hidden />}
      {label}
    </button>
  )
}

/** Tappable pills to pick one (tap again to clear). Selected = solid `brand` with a check; 40px tall. */
export function ChoiceChips<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
}: {
  options: ReadonlyArray<ChoiceOption<T>>
  value: T | null
  onChange: (value: T | null) => void
  label: string
  className?: string
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn('flex flex-wrap gap-2', className)}>
      {options.map((o) => (
        <Pill
          key={o.value}
          on={value === o.value}
          multiple={false}
          label={o.label}
          onClick={() => onChange(value === o.value ? null : o.value)}
        />
      ))}
    </div>
  )
}

/** The same pills, picking several. */
export function MultiChoiceChips<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
}: {
  options: ReadonlyArray<ChoiceOption<T>>
  value: T[]
  onChange: (value: T[]) => void
  label: string
  className?: string
}) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: a fieldset can't be a flex container in every browser
    <div role="group" aria-label={label} className={cn('flex flex-wrap gap-2', className)}>
      {options.map((o) => {
        const on = value.includes(o.value)
        return (
          <Pill
            key={o.value}
            on={on}
            multiple
            label={o.label}
            onClick={() => onChange(on ? value.filter((x) => x !== o.value) : [...value, o.value])}
          />
        )
      })}
    </div>
  )
}

function parseBirthDate(v: string | null) {
  const [y, m, d] = v ? v.split('-').map(Number) : []
  return { y: y ?? null, m: m ?? null, d: d ?? null }
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Birth dates are years back, so three small selects beat a calendar. Value is YYYY-MM-DD or null. */
export function BirthDateSelect({
  id,
  value,
  onChange,
}: {
  id?: string
  value: string | null
  onChange: (value: string | null) => void
}) {
  const [parts, setParts] = useState(() => parseBirthDate(value))
  useEffect(() => {
    if (value) setParts(parseBirthDate(value))
  }, [value])
  const thisYear = new Date().getFullYear()
  const years = Array.from({ length: 90 }, (_, i) => thisYear - 10 - i)

  function set(patch: Partial<typeof parts>) {
    const next = { ...parts, ...patch }
    setParts(next)
    if (next.y && next.m && next.d) {
      const max = new Date(Date.UTC(next.y, next.m, 0)).getUTCDate()
      onChange(
        `${next.y}-${String(next.m).padStart(2, '0')}-${String(Math.min(next.d, max)).padStart(2, '0')}`,
      )
    } else if (value) {
      onChange(null)
    }
  }

  return (
    <div className="grid grid-cols-[1fr_1.2fr_1.3fr] gap-2">
      <Select
        id={id}
        aria-label="Day"
        value={parts.d ?? ''}
        onChange={(e) => set({ d: Number(e.target.value) || null })}
      >
        <option value="">Day</option>
        {Array.from({ length: 31 }, (_, i) => i + 1).map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </Select>
      <Select
        aria-label="Month"
        value={parts.m ?? ''}
        onChange={(e) => set({ m: Number(e.target.value) || null })}
      >
        <option value="">Month</option>
        {MONTHS.map((name, i) => (
          <option key={name} value={i + 1}>
            {name}
          </option>
        ))}
      </Select>
      <Select
        aria-label="Year"
        value={parts.y ?? ''}
        onChange={(e) => set({ y: Number(e.target.value) || null })}
      >
        <option value="">Year</option>
        {years.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </Select>
    </div>
  )
}

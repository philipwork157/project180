import { Check } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from './cn'

export interface ChoiceOption<T extends string> {
  value: T
  label: string
  /** Shown before the label (16px). When set it replaces the check; the fill shows it's picked. */
  icon?: ReactNode
}

function Pill({
  on,
  multiple,
  label,
  icon,
  onClick,
}: {
  on: boolean
  multiple: boolean
  label: string
  icon?: ReactNode
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
      {icon ? (
        <span className="grid size-4 place-items-center [&_svg]:size-4" aria-hidden>
          {icon}
        </span>
      ) : (
        on && <Check className="size-4" strokeWidth={3} aria-hidden />
      )}
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
          icon={o.icon}
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
            icon={o.icon}
            onClick={() => onChange(on ? value.filter((x) => x !== o.value) : [...value, o.value])}
          />
        )
      })}
    </div>
  )
}

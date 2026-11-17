import { cn } from '@project180/ui'
import type { ReactNode } from 'react'

/**
 * One setting shown with its current value, so nothing hides behind a drawer: an icon and a
 * title with the action beside them, then the value and a line or two about it.
 */
export function SettingTile({
  icon,
  iconClass = 'bg-brand-soft text-brand-text',
  title,
  action,
  children,
  className,
}: {
  icon: ReactNode
  iconClass?: string
  title: string
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section
      className={cn('flex min-w-0 flex-col gap-3 rounded-md bg-surface-raised p-4', className)}
    >
      <header className="flex items-center gap-3">
        <span
          className={cn(
            'grid size-9 shrink-0 place-items-center rounded-full [&_svg]:size-5',
            iconClass,
          )}
        >
          {icon}
        </span>
        <h3 className="min-w-0 flex-1 font-bold text-[15px]">{title}</h3>
        {action}
      </header>
      {children}
    </section>
  )
}

/** The value a tile is about: a big number and its unit, e.g. "2 470 kcal a day". */
export function TileValue({ value, unit }: { value: ReactNode; unit?: string }) {
  return (
    <p className="flex flex-wrap items-baseline gap-x-1.5">
      <span className="metric text-[28px] leading-none">{value}</span>
      {unit && <span className="text-[13px] text-ink-muted">{unit}</span>}
    </p>
  )
}

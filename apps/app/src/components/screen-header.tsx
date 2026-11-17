import type { ReactNode } from 'react'

export function ScreenHeader({
  overline,
  title,
  subtitle,
  action,
}: {
  overline?: string
  title: string
  /** A quiet line under the title (e.g. "Coached by Cara · Cara Coaching"). */
  subtitle?: string
  action?: ReactNode
}) {
  return (
    <header className="flex items-end justify-between gap-4 pt-4 pb-6">
      <div className="min-w-0">
        {overline && (
          <p className="font-extrabold text-[11px] text-ink-muted uppercase tracking-[0.08em]">
            {overline}
          </p>
        )}
        <h1 className="mt-1 font-display font-extrabold text-[30px] leading-[34px] tracking-tight">
          {title}
        </h1>
        {subtitle && <p className="mt-1 truncate text-[14px] text-ink-muted">{subtitle}</p>}
      </div>
      {action}
    </header>
  )
}

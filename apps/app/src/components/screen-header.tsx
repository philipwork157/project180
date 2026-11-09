import type { ReactNode } from 'react'

export function ScreenHeader({
  overline,
  title,
  action,
}: {
  overline?: string
  title: string
  action?: ReactNode
}) {
  return (
    <header className="flex items-end justify-between gap-4 pt-4 pb-6">
      <div>
        {overline && (
          <p className="font-extrabold text-[11px] text-ink-muted uppercase tracking-[0.08em]">
            {overline}
          </p>
        )}
        <h1 className="mt-1 font-display font-extrabold text-[30px] leading-[34px] tracking-tight">
          {title}
        </h1>
      </div>
      {action}
    </header>
  )
}

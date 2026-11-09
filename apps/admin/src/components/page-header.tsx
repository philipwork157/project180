import type { ReactNode } from 'react'

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string
  subtitle?: string
  action?: ReactNode
}) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display font-extrabold text-[30px] leading-[34px] tracking-tight">
          {title}
        </h1>
        {subtitle && <p className="mt-1 font-medium text-[15px] text-ink-muted">{subtitle}</p>}
      </div>
      {action}
    </header>
  )
}

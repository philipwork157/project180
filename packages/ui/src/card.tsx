import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from './cn'

export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-lg bg-surface p-5 shadow-card md:p-6', className)} {...rest} />
}

export type StatTone = 'surface' | 'brand' | 'lime' | 'clay' | 'steel' | 'sand'

/** Filled tones are for the one hero number on a screen; the muted accents tint the card instead. */
const statTones: Record<StatTone, { card: string; dot: string; value: string }> = {
  surface: { card: 'bg-surface text-ink shadow-card', dot: 'bg-ink-muted', value: '' },
  brand: { card: 'bg-brand text-on-brand', dot: 'bg-lime', value: '' },
  lime: { card: 'bg-lime text-on-lime', dot: 'bg-on-lime', value: '' },
  clay: { card: 'bg-surface text-ink shadow-card', dot: 'bg-clay', value: 'text-clay-text' },
  steel: { card: 'bg-surface text-ink shadow-card', dot: 'bg-steel', value: 'text-steel-text' },
  sand: { card: 'bg-surface text-ink shadow-card', dot: 'bg-sand', value: 'text-sand-text' },
}

/** One headline number. Tone follows meaning: effort clay, time steel, feeling sand. */
export function StatCard({
  label,
  value,
  unit,
  delta,
  tone = 'surface',
  className,
}: {
  label: string
  value: ReactNode
  unit?: string
  delta?: string
  tone?: StatTone
  className?: string
}) {
  const t = statTones[tone]
  const filled = tone === 'brand' || tone === 'lime'
  return (
    <div
      className={cn(
        'relative flex flex-col gap-2 overflow-hidden rounded-lg p-4',
        t.card,
        className,
      )}
    >
      {!filled && tone !== 'surface' && (
        <span aria-hidden className={cn('absolute inset-x-0 top-0 h-[3px]', t.dot)} />
      )}
      <span
        className={cn(
          'flex items-center gap-2 font-extrabold text-[11px] uppercase tracking-[0.1em]',
          !filled && 'text-ink-muted',
        )}
      >
        <span aria-hidden className={cn('size-2 rounded-full', t.dot)} />
        {label}
      </span>
      <span className="flex items-baseline gap-1">
        <span className={cn('metric text-[30px] leading-8', t.value)}>{value}</span>
        {unit && (
          <span className={cn('font-bold text-[14px]', !filled && 'text-ink-muted')}>{unit}</span>
        )}
      </span>
      {delta && <span className="font-bold text-[13px]">{delta}</span>}
    </div>
  )
}

export function EmptyState({
  icon,
  title,
  children,
  action,
  className,
}: {
  icon?: ReactNode
  title: string
  children?: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-3 rounded-lg bg-surface px-6 py-10 text-center shadow-card',
        className,
      )}
    >
      {icon && (
        <span className="grid size-14 place-items-center rounded-full bg-brand-soft text-brand-text">
          {icon}
        </span>
      )}
      <h3 className="font-bold text-[17px] text-ink">{title}</h3>
      {children && <p className="max-w-sm text-[15px] text-ink-muted">{children}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

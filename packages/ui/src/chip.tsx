import type { MuscleGroup } from '@project180/shared'
import type { ReactNode } from 'react'
import { cn } from './cn'

export type Tone = 'neutral' | 'brand' | 'lime' | 'clay' | 'steel' | 'sand' | 'mauve'

const tones: Record<Tone, string> = {
  neutral: 'bg-surface-raised text-ink',
  brand: 'bg-brand-soft text-brand-text',
  lime: 'bg-lime text-on-lime',
  clay: 'bg-clay/20 text-clay-text',
  steel: 'bg-steel/20 text-steel-text',
  sand: 'bg-sand/25 text-sand-text',
  mauve: 'bg-mauve/20 text-mauve-text',
}

/** A colour always means the same body part. */
export const MUSCLE_GROUP_TONE: Record<MuscleGroup, Tone> = {
  legs: 'brand',
  glutes: 'mauve',
  chest: 'clay',
  back: 'steel',
  core: 'sand',
  pelvic_floor: 'mauve',
  shoulders: 'sand',
  arms: 'clay',
  cardio: 'steel',
  full_body: 'neutral',
}

export function Chip({
  tone = 'neutral',
  dot = false,
  className,
  children,
}: {
  tone?: Tone
  dot?: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <span
      className={cn(
        'inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-pill px-3 font-bold text-[13px]',
        tones[tone],
        className,
      )}
    >
      {dot && <span aria-hidden className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  )
}

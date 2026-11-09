import { cn } from '@project180/ui'
import { Flame, Frown, Laugh, type LucideIcon, Meh, Smile } from 'lucide-react'
import { AnimatePresence, motion, type TargetAndTransition } from 'motion/react'

export interface Feeling {
  value: 1 | 2 | 3 | 4 | 5
  label: string
  icon: LucideIcon
  /** Selected tile: fill + text. Unselected: icon colour. */
  fill: string
  ink: string
  /** Reaction played when it's picked. */
  react: TargetAndTransition
  message: string
}

/** Rough → Great, clay → lime: the better it felt, the closer to lime it gets. */
export const FEELINGS: Feeling[] = [
  {
    value: 1,
    label: 'Rough',
    icon: Frown,
    fill: 'bg-clay text-on-clay',
    ink: 'text-clay-text',
    react: { rotate: [0, -12, 10, -8, 0], y: [0, 3, 3, 3, 0], transition: { duration: 0.8 } },
    message: 'Tough one. Showing up still counts.',
  },
  {
    value: 2,
    label: 'Meh',
    icon: Meh,
    fill: 'bg-sand text-on-sand',
    ink: 'text-sand-text',
    react: { x: [0, -4, 4, -3, 0], transition: { duration: 0.9, ease: 'easeInOut' } },
    message: 'Some days are like that. You still did it.',
  },
  {
    value: 3,
    label: 'Okay',
    icon: Smile,
    fill: 'bg-steel text-on-steel',
    ink: 'text-steel-text',
    react: { y: [0, -6, 0, -3, 0], transition: { duration: 0.6 } },
    message: 'Solid work. Consistency wins.',
  },
  {
    value: 4,
    label: 'Good',
    icon: Laugh,
    fill: 'bg-mauve text-on-mauve',
    ink: 'text-mauve-text',
    react: { scale: [1, 1.35, 0.95, 1.1, 1], y: [0, -8, 0, -2, 0], transition: { duration: 0.6 } },
    message: 'Nice! That was a good session.',
  },
  {
    value: 5,
    label: 'Great',
    icon: Flame,
    fill: 'bg-lime text-on-lime',
    ink: 'text-lime-text',
    react: { scale: [1, 1.3, 1.1, 1.15], rotate: [0, -10, 8, 0], transition: { duration: 0.7 } },
    message: 'On fire. Best kind of day!',
  },
]

export function feelingFor(value: number | null | undefined) {
  return FEELINGS.find((f) => f.value === value)
}

const SPARKS = ['var(--lime)', 'var(--lime)', 'var(--sand)']

/** Five tappable faces. Each one reacts in its own way; Great throws sparks. */
export function FeelingPicker({
  value,
  onChange,
}: {
  value: number | null
  onChange: (value: number) => void
}) {
  const picked = feelingFor(value)
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-5 gap-2" role="radiogroup" aria-label="How you felt">
        {FEELINGS.map((f) => {
          const selected = value === f.value
          const Icon = f.icon
          return (
            <motion.button
              key={f.value}
              type="button"
              role="radio"
              aria-checked={selected}
              whileTap={{ scale: 0.9 }}
              onClick={() => {
                navigator.vibrate?.(f.value === 5 ? [20, 40, 20] : 15)
                onChange(f.value)
              }}
              animate={{ y: selected ? -4 : 0 }}
              className={cn(
                'relative flex h-24 flex-col items-center justify-center gap-1.5 rounded-lg transition-colors md:h-28',
                selected
                  ? cn(f.fill, 'shadow-float')
                  : 'bg-surface-raised text-ink-muted hover:text-ink',
              )}
            >
              <motion.span
                key={selected ? `on-${f.value}` : `off-${f.value}`}
                animate={selected ? f.react : { scale: 1, rotate: 0, x: 0, y: 0 }}
                className={cn('grid place-items-center', !selected && f.ink)}
              >
                <Icon className="size-8 md:size-9" strokeWidth={2.2} aria-hidden />
              </motion.span>
              <span className="font-bold text-[12px] md:text-[13px]">{f.label}</span>
              {selected && f.value === 5 && <Sparks />}
            </motion.button>
          )
        })}
      </div>
      <div className="h-6 text-center" aria-live="polite">
        <AnimatePresence mode="wait">
          {picked && (
            <motion.p
              key={picked.value}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2 }}
              className={cn('font-bold text-[15px]', picked.ink)}
            >
              {picked.message}
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

/** A small burst of sparks from the "Great" tile. */
function Sparks() {
  return (
    <span aria-hidden className="pointer-events-none absolute inset-0">
      {Array.from({ length: 8 }, (_, i) => {
        const angle = (i / 8) * Math.PI * 2
        const dist = 46 + (i % 3) * 10
        return (
          <motion.span
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed decorative list
            key={i}
            className="absolute top-1/2 left-1/2 block size-2 rounded-full"
            style={{ background: SPARKS[i % SPARKS.length] }}
            initial={{ x: '-50%', y: '-50%', scale: 0.4, opacity: 1 }}
            animate={{ x: Math.cos(angle) * dist, y: Math.sin(angle) * dist, scale: 1, opacity: 0 }}
            transition={{ duration: 0.8, ease: [0.1, 0.7, 0.3, 1], delay: (i % 4) * 0.02 }}
          />
        )
      })}
    </span>
  )
}

/** Small icon + label for showing a past rating. */
export function FeelingBadge({ value }: { value: number | null | undefined }) {
  const f = feelingFor(value)
  if (!f) return <span>–</span>
  const Icon = f.icon
  return (
    <span className={cn('inline-flex items-center gap-1', f.ink)}>
      <Icon className="size-4" aria-hidden />
      {f.label}
    </span>
  )
}

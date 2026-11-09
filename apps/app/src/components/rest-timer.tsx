import { formatDuration } from '@project180/shared'
import { Button, cn } from '@project180/ui'
import { motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'

/**
 * Floating rest timer. Counts down to `endsAt` (a timestamp, so it stays right
 * even if the phone sleeps), turns lime for the last 10 seconds and buzzes at zero.
 */
export function RestTimer({
  endsAt,
  total,
  onAdjust,
  onClose,
}: {
  endsAt: number
  total: number
  onAdjust: (seconds: number) => void
  onClose: () => void
}) {
  const [now, setNow] = useState(() => Date.now())
  const buzzed = useRef(false)
  const left = Math.max(0, Math.ceil((endsAt - now) / 1000))
  const finished = left === 0

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (!finished) {
      buzzed.current = false
      return
    }
    if (!buzzed.current) {
      buzzed.current = true
      navigator.vibrate?.([200, 100, 200])
    }
    const id = setTimeout(onClose, 2500)
    return () => clearTimeout(id)
  }, [finished, onClose])

  const r = 26
  const c = 2 * Math.PI * r
  const frac = total > 0 ? left / total : 0

  return (
    <motion.div
      role="timer"
      aria-label={`Rest: ${formatDuration(left)} left`}
      initial={{ y: 120, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 120, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 360, damping: 30 }}
      className={cn(
        'fixed inset-x-3 bottom-6 z-30 flex items-center gap-4 rounded-xl p-3 pr-4 shadow-float md:inset-x-8 lg:inset-x-12',
        finished
          ? 'bg-lime text-on-lime'
          : 'bg-[#202321] text-[#f5f3ed] ring-1 ring-[#f5f3ed]/[0.06]',
      )}
    >
      <span className="relative grid size-16 shrink-0 place-items-center">
        <svg viewBox="0 0 64 64" className="-rotate-90 absolute inset-0" aria-hidden>
          <circle
            cx="32"
            cy="32"
            r={r}
            fill="none"
            strokeWidth="6"
            className="stroke-current opacity-15"
          />
          <circle
            cx="32"
            cy="32"
            r={r}
            fill="none"
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - frac)}
            className={cn(
              'transition-[stroke-dashoffset] duration-300',
              left <= 10 ? 'stroke-lime' : 'stroke-steel',
            )}
          />
        </svg>
        <span className="metric text-[16px]">{formatDuration(left)}</span>
      </span>
      <span className="flex-1">
        <span className="block font-extrabold text-[11px] uppercase tracking-[0.08em] opacity-70">
          {finished ? 'Rest over' : 'Resting'}
        </span>
        <span className="font-display font-extrabold text-[20px]">
          {finished ? 'Next set, go!' : 'Breathe. Sip water.'}
        </span>
      </span>
      {!finished && (
        <span className="flex gap-1">
          <Button
            size="sm"
            variant="ghost"
            className="text-current"
            onClick={() => onAdjust(-15)}
            aria-label="15 seconds less"
          >
            −15
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-current"
            onClick={() => onAdjust(15)}
            aria-label="15 seconds more"
          >
            +15
          </Button>
          <Button size="sm" variant="lime" onClick={onClose}>
            Skip
          </Button>
        </span>
      )}
    </motion.div>
  )
}

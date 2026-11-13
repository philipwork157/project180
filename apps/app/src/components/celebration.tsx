import type { FinishResult } from '@project180/shared'
import { formatDuration, formatNumber, formatWeight } from '@project180/shared'
import { Button, Chip } from '@project180/ui'
import { Check, Trophy } from 'lucide-react'
import { motion } from 'motion/react'
import type { ReactNode } from 'react'

const COLORS = ['var(--lime)', 'var(--lime)', '#f5f3ed', 'var(--sand)']

// Fixed confetti layout, so it looks the same every time.
const PIECES = Array.from({ length: 18 }, (_, i) => {
  const angle = (i / 18) * Math.PI * 2
  const dist = 140 + ((i * 37) % 90)
  return {
    x: Math.cos(angle) * dist,
    y: Math.sin(angle) * dist - 40,
    rotate: (i * 47) % 360,
    color: COLORS[i % COLORS.length],
    pill: i % 3 === 0,
    delay: (i % 7) * 0.02,
  }
})

/** Full-screen "workout complete" moment on charcoal: the 180° arc closes around a lime check, numbers rise in. */
export function Celebration({
  title,
  result,
  children,
  onDone,
}: {
  title: string
  result: FinishResult
  children?: ReactNode
  onDone: () => void
}) {
  const stats = [
    { label: 'Time', value: formatDuration(result.session.durationSeconds ?? 0) },
    { label: 'Volume', value: `${formatNumber(result.session.volumeKg)} kg` },
    { label: 'Sets', value: String(result.session.setCount) },
  ]
  return (
    <motion.div
      role="dialog"
      aria-modal
      aria-label="Workout complete"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-y-auto bg-[#202321] px-5 py-10 text-[#f5f3ed]"
    >
      <div className="relative flex w-full max-w-md flex-col items-center text-center">
        <div aria-hidden className="pointer-events-none absolute top-11 left-1/2">
          {PIECES.map((p, i) => (
            <motion.span
              // biome-ignore lint/suspicious/noArrayIndexKey: fixed decorative list
              key={i}
              className="absolute block"
              style={{
                background: p.color,
                width: p.pill ? 18 : 12,
                height: p.pill ? 8 : 12,
                borderRadius: p.pill ? 4 : 999,
              }}
              initial={{ x: 0, y: 0, scale: 0.2, opacity: 1, rotate: 0 }}
              animate={{ x: p.x, y: p.y + 120, scale: 1, opacity: 0, rotate: p.rotate }}
              transition={{ duration: 1.3, delay: 0.75 + p.delay, ease: [0.1, 0.7, 0.3, 1] }}
            />
          ))}
        </div>
        <span className="relative grid size-32 place-items-center">
          <svg viewBox="0 0 128 128" className="absolute inset-0" aria-hidden fill="none">
            <circle cx="64" cy="64" r="58" stroke="#f5f3ed" strokeOpacity="0.1" strokeWidth="8" />
            <motion.circle
              cx="64"
              cy="64"
              r="58"
              stroke="var(--lime)"
              strokeWidth="8"
              strokeLinecap="round"
              transform="rotate(-90 64 64)"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.9, ease: [0.3, 0.7, 0.2, 1] }}
            />
          </svg>
          <motion.span
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: [0.4, 1.1, 1], opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.55, times: [0, 0.6, 1] }}
            className="grid size-20 place-items-center rounded-full bg-lime text-on-lime"
          >
            <Check className="size-10" strokeWidth={3} aria-hidden />
          </motion.span>
        </span>
        <Rise delay={0.15}>
          <p className="mt-6 font-bold text-[12px] text-lime uppercase tracking-[0.24em]">
            Workout complete
          </p>
          <h1 className="mt-2 font-display font-extrabold text-[34px] leading-10 tracking-tight">
            {title}
          </h1>
        </Rise>
        <Rise delay={0.25} className="mt-6 grid w-full grid-cols-3 gap-2">
          {stats.map((s) => (
            <div key={s.label} className="rounded-md bg-[#f5f3ed]/[0.07] px-2 py-3">
              <b className="metric block text-[24px]">{s.value}</b>
              <span className="font-extrabold text-[11px] text-[#f5f3ed]/60 uppercase tracking-[0.1em]">
                {s.label}
              </span>
            </div>
          ))}
        </Rise>
        {result.records.length > 0 && (
          <Rise delay={0.35} className="mt-5 flex flex-col items-center gap-2">
            <p className="flex items-center gap-2 font-bold text-lime">
              <Trophy className="size-5" aria-hidden />
              New {result.records.length === 1 ? 'record' : 'records'}
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {result.records.map((r) => (
                <Chip key={r.exerciseId} tone="lime">
                  {r.exerciseName} · {formatWeight(r.weightKg)} kg
                </Chip>
              ))}
            </div>
          </Rise>
        )}
        {children && (
          <Rise delay={0.4} className="mt-5 w-full">
            {children}
          </Rise>
        )}
        <Rise delay={0.45} className="mt-8 w-full">
          <Button variant="lime" size="lg" block onClick={onDone}>
            Done
          </Button>
        </Rise>
      </div>
    </motion.div>
  )
}

function Rise({
  delay,
  className,
  children,
}: {
  delay: number
  className?: string
  children: ReactNode
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.4, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  )
}

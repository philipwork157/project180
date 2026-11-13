import { animate, motion, useMotionValue, useReducedMotion, useTransform } from 'motion/react'
import { type ReactNode, useEffect } from 'react'
import { LogoMark, Wordmark } from './logo'

const CX = 240
const CY = 244
const R = 200
const TRACK = R + 12
const TICKS = Array.from({ length: 37 }, (_, i) => i * 5)

const polar = (deg: number, radius: number) => {
  const t = Math.PI - (deg * Math.PI) / 180
  return { x: CX + radius * Math.cos(t), y: CY - radius * Math.sin(t) }
}

/**
 * The 180° dial: fine ticks like an instrument, a thin lime line sweeping from 0° to 180°
 * and a reading that counts up with it. Sits on the bottom edge of a charcoal panel.
 */
export function TurnDial({ className }: { className?: string }) {
  const reduce = useReducedMotion()
  const progress = useMotionValue(reduce ? 1 : 0)
  const reading = useTransform(progress, (p) => `${Math.round(p * 180)}°`)
  const dotX = useTransform(progress, (p) => polar(p * 180, TRACK).x)
  const dotY = useTransform(progress, (p) => polar(p * 180, TRACK).y)

  useEffect(() => {
    if (reduce) return
    const controls = animate(progress, 1, {
      duration: 1.6,
      delay: 0.25,
      ease: [0.22, 0.8, 0.24, 1],
    })
    return () => controls.stop()
  }, [progress, reduce])

  return (
    <svg
      viewBox="0 0 480 252"
      className={className}
      fill="none"
      role="img"
      aria-label="A dial turned to 180 degrees"
    >
      <line x1="0" y1={CY} x2="480" y2={CY} stroke="#f5f3ed" strokeOpacity="0.12" />
      {TICKS.map((d) => {
        const major = d % 30 === 0
        const len = major ? 16 : d % 10 === 0 ? 9 : 5
        const a = polar(d, R)
        const b = polar(d, R - len)
        return (
          <line
            key={d}
            x1={a.x}
            y1={a.y}
            x2={b.x}
            y2={b.y}
            stroke="#f5f3ed"
            strokeOpacity={major ? 0.55 : 0.22}
            strokeWidth={major ? 1.5 : 1}
            strokeLinecap="round"
          />
        )
      })}
      {TICKS.filter((d) => d % 30 === 0).map((d) => {
        const end = d === 0 || d === 180
        const p = polar(d, R - 32)
        return (
          <text
            key={d}
            x={end ? (d === 0 ? CX - R + 6 : CX + R - 6) : p.x}
            y={end ? CY - 12 : p.y + 4}
            textAnchor={end ? (d === 0 ? 'start' : 'end') : 'middle'}
            fill="#f5f3ed"
            fillOpacity="0.45"
            fontSize="10"
            fontWeight="600"
            letterSpacing="0.06em"
            className="font-sans"
          >
            {d}°
          </text>
        )
      })}
      <path
        d={`M ${CX - TRACK} ${CY} A ${TRACK} ${TRACK} 0 0 1 ${CX + TRACK} ${CY}`}
        stroke="#f5f3ed"
        strokeOpacity="0.07"
        strokeWidth="2"
      />
      <motion.path
        d={`M ${CX - TRACK} ${CY} A ${TRACK} ${TRACK} 0 0 1 ${CX + TRACK} ${CY}`}
        stroke="var(--lime)"
        strokeWidth="2.5"
        strokeLinecap="round"
        style={{ pathLength: progress }}
      />
      <motion.circle r="5" fill="var(--lime)" cx={dotX} cy={dotY} />
      <motion.text
        x={CX}
        y={CY - 34}
        textAnchor="middle"
        fill="#f5f3ed"
        fontSize="64"
        className="font-display font-black italic"
        letterSpacing="-0.03em"
      >
        {reading}
      </motion.text>
    </svg>
  )
}

/** The 180° arc used on charcoal hero cards: a quiet full track with the lime half drawn in. */
export function TurnArc({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 400 400" className={className} aria-hidden fill="none">
      <circle cx="200" cy="200" r="170" stroke="#f5f3ed" strokeOpacity="0.06" strokeWidth="34" />
      <motion.path
        d="M200 30 A170 170 0 0 1 200 370"
        stroke="var(--lime)"
        strokeWidth="34"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1.1, ease: [0.3, 0.7, 0.2, 1], delay: 0.15 }}
      />
    </svg>
  )
}

/**
 * Sign-in for the app and the admin.
 * Phone: a charcoal band with the logo and the dial rising from its edge, then the form.
 * Desktop: the charcoal story panel on the left, the form on the right.
 */
export function AuthShell({
  title,
  subtitle,
  badge,
  story,
  help,
  children,
}: {
  title: string
  subtitle: string
  /** Next to the logo, e.g. "Admin". */
  badge?: string
  /** The line on the brand panel (desktop). */
  story: { title: string; text: string }
  /** Under the form, e.g. what to do about a forgotten password. */
  help?: ReactNode
  children: ReactNode
}) {
  const year = new Date().getFullYear()
  return (
    <div className="min-h-dvh bg-bg lg:grid lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <section className="relative flex h-[clamp(232px,34dvh,300px)] flex-col overflow-hidden bg-[#202321] px-5 pt-safe text-[#f5f3ed] lg:h-auto lg:min-h-dvh lg:px-14 lg:pt-0">
        <div className="flex items-center gap-3 pt-5 lg:pt-12">
          <span className="inline-flex items-center gap-3" aria-label="Project 180" role="img">
            <LogoMark className="size-10" />
            <span aria-hidden className="my-1 w-px self-stretch bg-current opacity-25" />
            <Wordmark />
          </span>
          {badge && (
            <span className="ml-1 rounded-pill border border-[#f5f3ed]/20 px-2.5 py-1 font-bold text-[11px] text-[#f5f3ed]/75 uppercase tracking-[0.14em]">
              {badge}
            </span>
          )}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="relative z-10 mt-[11vh] hidden max-w-[30rem] lg:block"
        >
          <h2 className="font-display font-bold text-[40px] leading-[1.08] tracking-[-0.02em]">
            {story.title}
          </h2>
          <p className="mt-4 max-w-[26rem] text-[16px] text-[#f5f3ed]/65 leading-relaxed">
            {story.text}
          </p>
        </motion.div>

        <TurnDial className="-translate-x-1/2 pointer-events-none absolute bottom-0 left-1/2 w-[300px] lg:w-[min(600px,86%)]" />
      </section>

      <main className="flex min-h-[calc(100dvh-clamp(232px,34dvh,300px))] flex-col px-5 pt-8 pb-safe lg:min-h-dvh lg:px-16 lg:pt-10">
        <div className="flex flex-1 flex-col lg:justify-center">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.05 }}
            className="mx-auto w-full max-w-[400px]"
          >
            <h1 className="font-display font-extrabold text-[28px] leading-tight tracking-[-0.015em]">
              {title}
            </h1>
            <p className="mt-1.5 text-[15px] text-ink-muted">{subtitle}</p>
            <div className="mt-7">{children}</div>
            {help && <p className="mt-5 text-center text-[13px] text-ink-muted">{help}</p>}
          </motion.div>
        </div>
        <footer className="mx-auto flex w-full max-w-[400px] items-center justify-between gap-4 py-6 text-[12px] text-ink-muted lg:max-w-none">
          <span>© {year} Project 180</span>
          <span className="font-bold uppercase tracking-[0.2em]">
            Train<span className="text-lime-text">.</span> Fuel
            <span className="text-lime-text">.</span> Feel
            <span className="text-lime-text">.</span> Live<span className="text-lime-text">.</span>
          </span>
        </footer>
      </main>
    </div>
  )
}

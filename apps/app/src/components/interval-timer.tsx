import { formatDuration } from '@project180/shared'
import { Button } from '@project180/ui'
import { Check, Pause, Play, SkipForward, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

interface Step {
  phase: 'ready' | 'work' | 'rest'
  seconds: number
  round: number
  exercise: string
  next: string | null
}

function buildSteps(names: string[], rounds: number, work: number, rest: number): Step[] {
  const steps: Step[] = [
    { phase: 'ready', seconds: 5, round: 1, exercise: names[0] ?? '', next: null },
  ]
  for (let r = 1; r <= rounds; r++) {
    names.forEach((name, i) => {
      const lastOfAll = r === rounds && i === names.length - 1
      const following = i + 1 < names.length ? names[i + 1] : r < rounds ? names[0] : null
      steps.push({
        phase: 'work',
        seconds: work,
        round: r,
        exercise: name,
        next: following ?? null,
      })
      if (rest > 0 && !lastOfAll)
        steps.push({
          phase: 'rest',
          seconds: rest,
          round: r,
          exercise: name,
          next: following ?? null,
        })
    })
  }
  return steps
}

/** A short beep for the last seconds and phase changes (silently skipped where audio isn't allowed). */
function useBeep() {
  const ctx = useRef<AudioContext | null>(null)
  return useCallback((freq: number, ms = 120) => {
    try {
      ctx.current ??= new AudioContext()
      const osc = ctx.current.createOscillator()
      const gain = ctx.current.createGain()
      osc.frequency.value = freq
      gain.gain.value = 0.08
      osc.connect(gain).connect(ctx.current.destination)
      osc.start()
      osc.stop(ctx.current.currentTime + ms / 1000)
    } catch {
      // No audio: the vibration and colours still carry it.
    }
  }, [])
}

/**
 * Full-screen interval (Tabata-style) timer for a group: work, rest, next exercise, for N rounds.
 * Charcoal in both themes; lime while working, steel while resting.
 */
export function IntervalTimer({
  title,
  exercises,
  rounds,
  workSeconds,
  restSeconds,
  onFinish,
  onClose,
}: {
  title: string
  exercises: string[]
  rounds: number
  workSeconds: number
  restSeconds: number
  /** Called once with the number of rounds finished, so the sets can be logged. */
  onFinish: (roundsDone: number) => void
  onClose: () => void
}) {
  const steps = useMemo(
    () => buildSteps(exercises, rounds, workSeconds, restSeconds),
    [exercises, rounds, workSeconds, restSeconds],
  )
  const [index, setIndex] = useState(0)
  const [endsAt, setEndsAt] = useState(() => Date.now() + (steps[0]?.seconds ?? 0) * 1000)
  const [pausedLeft, setPausedLeft] = useState<number | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [done, setDone] = useState(false)
  const beep = useBeep()
  const lastBeep = useRef<number | null>(null)
  const finished = useRef(false)

  const step = steps[index]
  const left = pausedLeft ?? Math.max(0, (endsAt - now) / 1000)
  const shown = Math.ceil(left)

  useEffect(() => {
    if (done || pausedLeft !== null) return
    const id = setInterval(() => setNow(Date.now()), 100)
    return () => clearInterval(id)
  }, [done, pausedLeft])

  // Countdown beeps in the last 3 seconds of each step.
  useEffect(() => {
    if (pausedLeft !== null || done) return
    if (shown <= 3 && shown > 0 && lastBeep.current !== shown) {
      lastBeep.current = shown
      beep(660)
    }
  }, [shown, pausedLeft, done, beep])

  // Next step when this one runs out.
  useEffect(() => {
    if (done || pausedLeft !== null || left > 0) return
    const nextIndex = index + 1
    lastBeep.current = null
    if (nextIndex >= steps.length) {
      setDone(true)
      navigator.vibrate?.([200, 80, 200, 80, 400])
      beep(990, 400)
      if (!finished.current) {
        finished.current = true
        onFinish(rounds)
      }
      return
    }
    const next = steps[nextIndex] as Step
    navigator.vibrate?.(next.phase === 'work' ? [120, 60, 120] : 200)
    beep(next.phase === 'work' ? 880 : 440, 220)
    setIndex(nextIndex)
    setEndsAt(Date.now() + next.seconds * 1000)
  }, [left, index, steps, done, pausedLeft, beep, onFinish, rounds])

  function togglePause() {
    if (pausedLeft === null) setPausedLeft(left)
    else {
      setEndsAt(Date.now() + pausedLeft * 1000)
      setNow(Date.now())
      setPausedLeft(null)
    }
  }

  function skip() {
    setPausedLeft(null)
    setEndsAt(Date.now())
    setNow(Date.now())
  }

  function stop() {
    const roundsDone = step ? (step.phase === 'ready' ? 0 : step.round - 1) : 0
    if (!finished.current && roundsDone > 0) {
      finished.current = true
      onFinish(roundsDone)
    }
    onClose()
  }

  const working = step?.phase === 'work'
  const resting = step?.phase === 'rest'
  const color = done || working ? 'var(--lime)' : resting ? 'var(--steel)' : '#f5f3ed'
  const r = 120
  const c = 2 * Math.PI * r
  const frac = step && step.seconds > 0 ? left / step.seconds : 0

  return (
    <motion.div
      role="dialog"
      aria-modal
      aria-label={`${title} interval timer`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex flex-col bg-[#202321] px-5 pt-safe pb-safe text-[#f5f3ed]"
    >
      <div className="flex items-center justify-between py-3">
        <div>
          <p className="font-extrabold text-[11px] text-lime uppercase tracking-[0.2em]">{title}</p>
          <p className="mt-0.5 font-semibold text-[14px] text-[#f5f3ed]/70">
            {done ? `All ${rounds} rounds done` : `Round ${step?.round ?? 1} of ${rounds}`} ·{' '}
            {workSeconds}s work / {restSeconds}s rest
          </p>
        </div>
        <button
          type="button"
          onClick={stop}
          aria-label="Stop the timer"
          className="grid size-11 place-items-center rounded-full bg-[#f5f3ed]/10 transition active:scale-95"
        >
          <X className="size-5" aria-hidden />
        </button>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-6">
        <AnimatePresence mode="wait">
          <motion.p
            key={done ? 'done' : `${index}-label`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="font-display font-extrabold text-[15px] uppercase tracking-[0.3em]"
            style={{ color }}
          >
            {done ? 'Done' : working ? 'Work' : resting ? 'Rest' : 'Get ready'}
          </motion.p>
        </AnimatePresence>

        <div className="relative grid size-[min(78vw,300px)] place-items-center">
          <svg viewBox="0 0 280 280" className="-rotate-90 absolute inset-0" aria-hidden>
            <circle
              cx="140"
              cy="140"
              r={r}
              fill="none"
              stroke="#f5f3ed"
              strokeOpacity="0.08"
              strokeWidth="16"
            />
            <circle
              cx="140"
              cy="140"
              r={r}
              fill="none"
              stroke={color}
              strokeWidth="16"
              strokeLinecap="round"
              strokeDasharray={c}
              strokeDashoffset={done ? 0 : c * (1 - frac)}
              style={{ transition: 'stroke 300ms' }}
            />
          </svg>
          {done ? (
            <motion.span
              initial={{ scale: 0.4 }}
              animate={{ scale: [0.4, 1.15, 1] }}
              className="grid size-28 place-items-center rounded-full bg-lime text-on-lime"
            >
              <Check className="size-14" strokeWidth={3} aria-hidden />
            </motion.span>
          ) : (
            <span className="metric text-[88px] leading-none" aria-live="off">
              {shown >= 60 ? formatDuration(shown) : shown}
            </span>
          )}
        </div>

        {!done && step && (
          <div className="text-center" aria-live="polite">
            <p className="font-display font-extrabold text-[28px] leading-8 tracking-tight">
              {step.phase === 'rest'
                ? step.next
                  ? `Next: ${step.next}`
                  : 'Last one coming'
                : step.exercise}
            </p>
            {step.phase !== 'rest' && step.next && (
              <p className="mt-1 font-semibold text-[15px] text-[#f5f3ed]/60">Then {step.next}</p>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center justify-center gap-3 py-6">
        {done ? (
          <Button variant="lime" size="lg" className="w-full max-w-sm" onClick={onClose}>
            Logged. Back to the workout
          </Button>
        ) : (
          <>
            <button
              type="button"
              onClick={togglePause}
              aria-label={pausedLeft === null ? 'Pause' : 'Resume'}
              className="grid size-20 place-items-center rounded-full bg-lime text-on-lime shadow-float transition active:scale-95"
            >
              {pausedLeft === null ? (
                <Pause className="size-8 fill-current" aria-hidden />
              ) : (
                <Play className="size-8 fill-current" aria-hidden />
              )}
            </button>
            <button
              type="button"
              onClick={skip}
              aria-label="Skip to the next step"
              className="grid size-14 place-items-center rounded-full bg-[#f5f3ed]/10 transition active:scale-95"
            >
              <SkipForward className="size-6" aria-hidden />
            </button>
          </>
        )}
      </div>
    </motion.div>
  )
}

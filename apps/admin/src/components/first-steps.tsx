// Today, for a new coach: four first steps, each ticked from what they've actually done. Hidden
// once all four are done, or when they hide it (remembered on this device).
import { firstStepsQuery } from '@project180/client'
import type { CoachFirstSteps } from '@project180/shared'
import { buttonClasses, Card, cn, IconButton } from '@project180/ui'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Check, X } from 'lucide-react'
import { useState } from 'react'

const HIDDEN_KEY = 'project180-first-steps-hidden'

const STEPS: Array<{
  key: keyof CoachFirstSteps
  title: string
  text: string
  to: '/clients' | '/programs' | '/workouts'
  action: string
}> = [
  {
    key: 'client',
    title: 'Add your first client',
    text: 'Set up their goals and program; they get a link to choose their own password.',
    to: '/clients',
    action: 'Go to Clients',
  },
  {
    key: 'program',
    title: 'Build a program',
    text: 'Start from the ready-made workouts in your library, or let Claude draft one.',
    to: '/programs',
    action: 'Go to Programs',
  },
  {
    key: 'assigned',
    title: 'Give a client their program',
    text: 'Open a client and assign it on their Program tab.',
    to: '/clients',
    action: 'Open a client',
  },
  {
    key: 'message',
    title: 'Say hello',
    text: 'Send your first message from a client’s Chat tab.',
    to: '/clients',
    action: 'Open a client',
  },
]

function readHidden() {
  try {
    return localStorage.getItem(HIDDEN_KEY) === '1'
  } catch {
    return false
  }
}

export function FirstSteps() {
  const steps = useQuery(firstStepsQuery)
  const [hidden, setHidden] = useState(readHidden)
  if (hidden || !steps.data) return null
  const done = STEPS.filter((s) => steps.data[s.key]).length
  if (done === STEPS.length) return null
  const next = STEPS.find((s) => !steps.data[s.key])

  return (
    <Card className="mb-5 flex flex-col gap-5">
      <div className="flex items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h2 className="font-display font-extrabold text-[20px]">Get started</h2>
          <p className="text-[14px] text-ink-muted">
            {done} of {STEPS.length} done. Each ticks itself once you’ve done it.
          </p>
        </div>
        <IconButton
          label="Hide this"
          icon={<X aria-hidden />}
          onClick={() => {
            try {
              localStorage.setItem(HIDDEN_KEY, '1')
            } catch {
              // Private mode: hidden until the page reloads.
            }
            setHidden(true)
          }}
        />
      </div>
      <div aria-hidden className="h-1.5 w-full overflow-hidden rounded-pill bg-surface-raised">
        <div
          className="h-full rounded-pill bg-lime transition-[width] duration-500"
          style={{ width: `${(done / STEPS.length) * 100}%` }}
        />
      </div>
      <ol className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {STEPS.map((step, i) => {
          const ticked = steps.data[step.key]
          const isNext = step === next
          return (
            <li
              key={step.key}
              className={cn(
                'flex flex-col gap-3 rounded-md bg-surface-raised p-4',
                isNext && 'ring-[1.5px] ring-brand ring-inset',
              )}
            >
              <div className="flex items-start gap-3">
                <span
                  className={cn(
                    'grid size-7 shrink-0 place-items-center rounded-full font-bold text-[13px]',
                    ticked ? 'bg-lime text-on-lime' : 'bg-surface text-ink-muted',
                  )}
                >
                  {ticked ? <Check className="size-4" strokeWidth={3} aria-hidden /> : i + 1}
                </span>
                <div className="flex min-w-0 flex-col gap-1">
                  <p
                    className={cn(
                      'font-semibold text-[15px]',
                      ticked && 'text-ink-muted line-through',
                    )}
                  >
                    {step.title}
                    <span className="sr-only">{ticked ? ' (done)' : ''}</span>
                  </p>
                  {!ticked && <p className="text-[13px] text-ink-muted">{step.text}</p>}
                </div>
              </div>
              {isNext && (
                <Link to={step.to} className={cn(buttonClasses('primary', 'sm', true), 'mt-auto')}>
                  {step.action}
                </Link>
              )}
            </li>
          )
        })}
      </ol>
    </Card>
  )
}

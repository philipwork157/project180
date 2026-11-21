// The client's check-in with their coach: a card on Today (date, and the form to fill in before
// it), the form itself in a bottom sheet, and the line on Profile.
import { ApiError, api, myCheckInQuery } from '@project180/client'
import {
  CHECK_IN_QUESTIONS,
  type CheckInAnswersInput,
  daysBetween,
  type MyCheckIn,
} from '@project180/shared'
import { Button, Field, Textarea } from '@project180/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, ClipboardCheck } from 'lucide-react'
import { useState } from 'react'
import { Sheet } from './sheet'

const dayLabel = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString('en-ZA', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  })

/** "today", "tomorrow", "in 5 days", or "3 days ago". */
function whenLabel(day: string, today: string) {
  const d = daysBetween(today, day)
  if (d === 0) return 'today'
  if (d === 1) return 'tomorrow'
  if (d > 1) return `in ${d} days`
  return d === -1 ? 'yesterday' : `${-d} days ago`
}

/** "Check-in with Cara on Monday 24 November": for Profile. */
export function checkInLine(ci: MyCheckIn) {
  const coach = ci.coachName?.split(' ')[0] || 'your coach'
  return `Next check-in with ${coach}: ${dayLabel(ci.dueDate)}`
}

/** Today: the next check-in, and the form to fill in before it (opens itself from the push). */
export function CheckInCard({ today, openOnLoad }: { today: string; openOnLoad?: boolean }) {
  const checkIn = useQuery(myCheckInQuery).data
  const [open, setOpen] = useState(Boolean(openOnLoad))
  if (!checkIn) return null
  const days = daysBetween(today, checkIn.dueDate)
  const soon = days <= 3
  const coach = checkIn.coachName?.split(' ')[0] || 'your coach'
  return (
    <section
      aria-label="Check-in"
      className="flex flex-col gap-4 rounded-lg bg-surface p-5 shadow-card md:flex-row md:items-center md:p-6"
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-sand/25 text-sand-text">
          <ClipboardCheck className="size-5" aria-hidden />
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="font-bold text-[17px]">
            Check-in with {coach} {whenLabel(checkIn.dueDate, today)}
          </h2>
          <p className="text-[14px] text-ink-muted">
            {dayLabel(checkIn.dueDate)}.{' '}
            {checkIn.answers
              ? 'Your answers are in. You can change them until then.'
              : soon
                ? 'Tell your coach how it went: it takes a minute.'
                : 'You can fill in your check-in any time before then.'}
          </p>
        </div>
      </div>
      <Button
        variant={checkIn.answers || !soon ? 'secondary' : 'primary'}
        className="md:shrink-0"
        icon={checkIn.answers ? <Check className="size-4" aria-hidden /> : undefined}
        onClick={() => setOpen(true)}
      >
        {checkIn.answers ? 'Change my answers' : 'Fill in my check-in'}
      </Button>
      <Sheet open={open} onClose={() => setOpen(false)} label="Check-in">
        {open && <CheckInForm checkIn={checkIn} onDone={() => setOpen(false)} />}
      </Sheet>
    </section>
  )
}

type Ratings = Pick<CheckInAnswersInput, 'week' | 'sleep' | 'stress' | 'hunger'>

function CheckInForm({ checkIn, onDone }: { checkIn: MyCheckIn; onDone: () => void }) {
  const qc = useQueryClient()
  const [ratings, setRatings] = useState<Partial<Ratings>>(() =>
    checkIn.answers
      ? {
          week: checkIn.answers.week,
          sleep: checkIn.answers.sleep,
          stress: checkIn.answers.stress,
          hunger: checkIn.answers.hunger,
        }
      : {},
  )
  const [wins, setWins] = useState(checkIn.answers?.wins ?? '')
  const [struggles, setStruggles] = useState(checkIn.answers?.struggles ?? '')
  const [notes, setNotes] = useState(checkIn.answers?.notes ?? '')
  const save = useMutation({
    mutationFn: (body: CheckInAnswersInput) =>
      api<{ checkIn: MyCheckIn | null }>('/me/check-in/answers', { method: 'PUT', body }),
    onSuccess: ({ checkIn: next }) => {
      qc.setQueryData(myCheckInQuery.queryKey, next)
      navigator.vibrate?.(20)
      onDone()
    },
  })
  const keys = Object.keys(CHECK_IN_QUESTIONS) as Array<keyof Ratings>
  const ready = keys.every((k) => ratings[k] !== undefined)

  return (
    <form
      className="flex flex-col gap-6 pb-6"
      onSubmit={(e) => {
        e.preventDefault()
        if (!ready) return
        save.mutate({ ...(ratings as Ratings), wins, struggles, notes })
      }}
    >
      <div className="flex flex-col gap-1">
        <h2 className="font-display font-extrabold text-[24px] leading-7">Your check-in</h2>
        <p className="text-[14px] text-ink-muted">
          How the last while went, for your coach. Your food, water, workouts and weigh-ins are
          added automatically.
        </p>
      </div>
      {keys.map((key) => {
        const q = CHECK_IN_QUESTIONS[key]
        return (
          <fieldset key={key} className="flex flex-col gap-2">
            <legend className="mb-2 font-bold text-[15px]">{q.label}</legend>
            <div className="grid grid-cols-5 gap-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  aria-pressed={ratings[key] === n}
                  onClick={() => setRatings((r) => ({ ...r, [key]: n }))}
                  className={
                    ratings[key] === n
                      ? 'tabular h-12 rounded-md bg-brand font-bold text-[16px] text-on-brand transition active:scale-[0.97]'
                      : 'tabular h-12 rounded-md bg-surface-raised font-bold text-[16px] text-ink transition hover:ring-[1.5px] hover:ring-border-strong hover:ring-inset active:scale-[0.97]'
                  }
                >
                  {n}
                </button>
              ))}
            </div>
            <div className="flex justify-between gap-2 text-[12px] text-ink-muted">
              <span>1 · {q.low}</span>
              <span>5 · {q.high}</span>
            </div>
          </fieldset>
        )
      })}
      <Field label="What went well?" hint="Optional">
        {(id) => (
          <Textarea
            id={id}
            rows={2}
            maxLength={1000}
            value={wins}
            onChange={(e) => setWins(e.target.value)}
          />
        )}
      </Field>
      <Field label="What was hard?" hint="Optional">
        {(id) => (
          <Textarea
            id={id}
            rows={2}
            maxLength={1000}
            value={struggles}
            onChange={(e) => setStruggles(e.target.value)}
          />
        )}
      </Field>
      <Field label="Anything else for your coach?" hint="Optional">
        {(id) => (
          <Textarea
            id={id}
            rows={2}
            maxLength={1000}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        )}
      </Field>
      {save.isError && (
        <p role="alert" className="font-semibold text-[14px] text-danger">
          {save.error instanceof ApiError
            ? save.error.message
            : 'Couldn’t send it. Check your signal and try again.'}
        </p>
      )}
      <Button type="submit" size="lg" block disabled={!ready} loading={save.isPending}>
        {checkIn.answers ? 'Save my answers' : 'Send to my coach'}
      </Button>
      {!ready && (
        <p className="-mt-3 text-center text-[13px] text-ink-muted">
          Pick a number for each of the four questions.
        </p>
      )}
    </form>
  )
}

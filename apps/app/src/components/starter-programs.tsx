import { ApiError, api, planQuery, starterProgramsQuery } from '@project180/client'
import { addDays, type StarterProgram, todayIn } from '@project180/shared'
import { Button, cn, DatePicker, Field } from '@project180/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarDays, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { Sheet } from './sheet'

/** The coming Monday, or today if it is Monday. */
function nextMonday(today: string) {
  const weekday = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7
  return weekday === 0 ? today : addDays(today, 7 - weekday)
}

/**
 * On your own (no coach): ready-made programs to start, one full-width row each. Tap one to pick
 * a start date in a sheet; it becomes your own copy, like a coach giving it to you.
 */
export function StarterPrograms({ timezone }: { timezone: string }) {
  const programs = useQuery(starterProgramsQuery)
  const [picked, setPicked] = useState<StarterProgram | null>(null)
  if (programs.isPending)
    return <div className="h-40 animate-pulse rounded-lg bg-surface shadow-card" />
  const list = programs.data ?? []
  if (list.length === 0) return null
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 className="font-bold text-[17px]">Pick a program</h2>
        <p className="text-[14px] text-ink-muted">
          Ready-made plans. Pick one and it fills your calendar, week by week.
        </p>
      </div>
      <ul className="flex w-full flex-col gap-3">
        {list.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              onClick={() => setPicked(p)}
              className="flex min-h-16 w-full items-center gap-3 rounded-lg bg-surface p-5 text-left shadow-card transition hover:bg-surface-raised/60 active:scale-[0.99] md:p-6"
            >
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-soft text-brand-text">
                <CalendarDays className="size-5" aria-hidden />
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="font-bold text-[17px]">{p.name}</span>
                <span className="tabular text-[13px] text-ink-muted">
                  {p.durationWeeks} week{p.durationWeeks === 1 ? '' : 's'}
                  {p.daysPerWeek > 0 && ` · ${p.daysPerWeek} days a week`}
                </span>
                {p.description && (
                  <span className="line-clamp-2 text-[14px] text-ink-muted">{p.description}</span>
                )}
              </span>
              <ChevronRight className="size-5 shrink-0 text-ink-muted" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
      <StartSheet program={picked} timezone={timezone} onClose={() => setPicked(null)} />
    </section>
  )
}

function StartSheet({
  program,
  timezone,
  onClose,
}: {
  program: StarterProgram | null
  timezone: string
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const today = todayIn(timezone)
  const monday = nextMonday(today)
  const [startDate, setStartDate] = useState(today)
  const start = useMutation({
    mutationFn: () =>
      api(`/me/starter-programs/${program?.id}/start`, {
        method: 'POST',
        body: { startDate },
      }),
    onSuccess: () => {
      onClose()
      void queryClient.invalidateQueries({ queryKey: planQuery.queryKey })
    },
  })
  const chip = (date: string, label: string) => (
    <button
      type="button"
      aria-pressed={startDate === date}
      onClick={() => setStartDate(date)}
      className={cn(
        'h-11 rounded-pill px-4 font-bold text-[14px] transition active:scale-[0.97]',
        startDate === date ? 'bg-brand text-on-brand' : 'bg-surface-raised text-ink',
      )}
    >
      {label}
    </button>
  )
  return (
    <Sheet open={program !== null} onClose={onClose} label={program?.name ?? 'Start a program'}>
      {program && (
        <div className="flex flex-col gap-5 pb-6">
          <div>
            <h2 className="font-display font-extrabold text-[24px] leading-7">{program.name}</h2>
            <p className="mt-1 text-[14px] text-ink-muted">
              {program.durationWeeks} weeks
              {program.daysPerWeek > 0 && `, ${program.daysPerWeek} training days a week`}.
              {program.description ? ` ${program.description}` : ''}
            </p>
          </div>
          <Field label="Start on">
            {(id) => (
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap gap-2">
                  {chip(today, 'Today')}
                  {monday !== today && chip(monday, 'Next Monday')}
                </div>
                <DatePicker id={id} value={startDate} onChange={setStartDate} />
              </div>
            )}
          </Field>
          {start.isError && (
            <p role="alert" className="font-semibold text-[14px] text-danger">
              {start.error instanceof ApiError
                ? start.error.message
                : 'Couldn’t start it. Check your signal and try again.'}
            </p>
          )}
          <Button size="lg" block loading={start.isPending} onClick={() => start.mutate()}>
            Start this program
          </Button>
        </div>
      )}
    </Sheet>
  )
}

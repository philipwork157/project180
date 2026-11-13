import { api, myProfileQuery, planQuery, statsQuery } from '@project180/client'
import {
  formatWeight,
  type MyStats,
  type WeighInStatus,
  weighInStatus,
  weightChange,
} from '@project180/shared'
import { Button, cn, Input } from '@project180/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Minus, Plus, Scale } from 'lucide-react'
import { motion } from 'motion/react'
import { useId, useState } from 'react'
import { Sheet } from './sheet'

/** Is a weigh-in due today (or recently missed)? From the plan and the weights already logged. */
export function useWeighInStatus(): { status: WeighInStatus | null; today: string | null } {
  const plan = useQuery(planQuery).data?.plan
  const stats = useQuery(statsQuery(1)).data
  if (!plan || !stats) return { status: null, today: plan?.today ?? null }
  return { status: weighInStatus(plan.days, plan.today, stats.bodyWeight), today: plan.today }
}

/** Log a weight for a day. Shows on every stats screen straight away; the server catches up. */
export function useLogWeight(onSaved?: () => void) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ date, weightKg }: { date: string; weightKg: number }) =>
      api('/me/checkins', {
        method: 'PUT',
        body: { clientUuid: crypto.randomUUID(), date, weightKg },
      }),
    onSuccess: (_, { date, weightKg }) => {
      queryClient.setQueriesData<MyStats>({ queryKey: ['stats'] }, (old) =>
        old
          ? {
              ...old,
              bodyWeight: [
                ...old.bodyWeight.filter((b) => b.date !== date),
                { date, weightKg },
              ].sort((a, b) => a.date.localeCompare(b.date)),
            }
          : old,
      )
      navigator.vibrate?.([20, 40, 20])
      onSaved?.()
      void queryClient.invalidateQueries({ queryKey: ['stats'] })
      void queryClient.invalidateQueries({ queryKey: myProfileQuery.queryKey })
    },
  })
}

const shortDay = (iso: string) =>
  new Intl.DateTimeFormat('en-ZA', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
    new Date(`${iso}T00:00:00Z`),
  )
const weekday = (iso: string) =>
  new Intl.DateTimeFormat('en-ZA', { weekday: 'long', timeZone: 'UTC' }).format(
    new Date(`${iso}T00:00:00Z`),
  )

/**
 * The Today screen's weigh-in: a card you can't miss on a weigh-in day (or after a missed one),
 * with one big button. After logging it turns into a small "done" card with the change.
 */
export function WeighInCard({ status, onOpen }: { status: WeighInStatus; onOpen: () => void }) {
  if (status.done && status.weightKg !== null) {
    return (
      <motion.div
        initial={{ scale: 0.97, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="relative flex items-center gap-4 overflow-hidden rounded-lg bg-surface p-4 shadow-card"
      >
        <span aria-hidden className="absolute inset-y-0 left-0 w-1.5 bg-lime" />
        <motion.span
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 500, damping: 22, delay: 0.1 }}
          className="grid size-11 shrink-0 place-items-center rounded-full bg-lime text-on-lime"
        >
          <Check className="size-5" strokeWidth={3} aria-hidden />
        </motion.span>
        <div className="min-w-0 flex-1">
          <p className="font-bold text-[15px]">Weighed in</p>
          <p className="text-[13px] text-ink-muted">
            {status.previous
              ? `${weightChange(status.previous.weightKg, status.weightKg)} since ${shortDay(status.previous.date)}`
              : 'Your first weigh-in. Nice start.'}
          </p>
        </div>
        <button
          type="button"
          onClick={onOpen}
          aria-label={`Change today's weight (${formatWeight(status.weightKg)} kg)`}
          className="metric -mr-2 rounded-md px-2 py-1 text-[24px] transition active:scale-95"
        >
          {formatWeight(status.weightKg)}
          <span className="ml-1 font-sans font-semibold text-[13px] text-ink-muted not-italic">
            kg
          </span>
        </button>
      </motion.div>
    )
  }

  const today = status.kind === 'today'
  return (
    <motion.section
      initial={{ y: -8, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      aria-label="Weigh-in"
      className="relative flex flex-col gap-4 overflow-hidden rounded-xl bg-surface p-5 shadow-card ring-1 ring-sand/40 md:flex-row md:items-center md:gap-6 md:p-6"
    >
      <span aria-hidden className="absolute inset-y-0 left-0 w-1.5 bg-sand" />
      <div className="flex min-w-0 flex-1 items-start gap-4">
        <span className="grid size-12 shrink-0 place-items-center rounded-full bg-sand/25 text-sand-text">
          <Scale className="size-6" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 className="font-display font-extrabold text-[22px] leading-7">
            {today ? 'Weigh-in today' : `Missed ${weekday(status.date)}’s weigh-in`}
          </h2>
          <p className="mt-1 text-[14px] text-ink-muted">
            {today
              ? 'Same time, same scale, before eating. Your coach tracks the trend.'
              : 'Log it now and it counts. Same scale, before eating if you can.'}
          </p>
          {status.previous && (
            <p className="mt-2 font-semibold text-[13px] text-ink-muted">
              Last time:{' '}
              <span className="tabular text-ink">{formatWeight(status.previous.weightKg)} kg</span>{' '}
              on {shortDay(status.previous.date)}
            </p>
          )}
        </div>
      </div>
      <Button
        size="lg"
        block
        className="md:w-auto md:shrink-0"
        icon={<Scale className="size-5" aria-hidden />}
        onClick={onOpen}
      >
        Log my weight
      </Button>
    </motion.section>
  )
}

/** A bottom sheet with one big number to type, and ± 0.1 kg nudges. */
export function WeighInSheet({
  open,
  date,
  status,
  onClose,
}: {
  open: boolean
  /** The day it's logged for (today). */
  date: string
  status: WeighInStatus | null
  onClose: () => void
}) {
  return (
    <Sheet open={open} onClose={onClose} label="Log your weight">
      {open && <WeighInForm date={date} status={status} onDone={onClose} />}
    </Sheet>
  )
}

function WeighInForm({
  date,
  status,
  onDone,
}: {
  date: string
  status: WeighInStatus | null
  onDone: () => void
}) {
  const last = status?.weightKg ?? status?.previous?.weightKg ?? null
  const inputId = useId()
  const [value, setValue] = useState(status?.weightKg != null ? String(status.weightKg) : '')
  const save = useLogWeight(onDone)
  const weight = Number.parseFloat(value.replace(',', '.'))
  const valid = Number.isFinite(weight) && weight >= 20 && weight <= 400
  // Nudge from what's typed, or from last time when it's empty.
  const nudge = (by: number) => {
    const from = valid ? weight : last
    if (from != null) setValue(String(Math.round((from + by) * 10) / 10))
  }

  return (
    <form
      className="flex flex-col gap-5 pb-6"
      onSubmit={(e) => {
        e.preventDefault()
        if (valid) save.mutate({ date, weightKg: weight })
      }}
    >
      <div>
        <h2 className="font-display font-extrabold text-[24px] leading-7">Log your weight</h2>
        <p className="mt-1 text-[14px] text-ink-muted">
          {status?.previous
            ? `Last time ${formatWeight(status.previous.weightKg)} kg on ${shortDay(status.previous.date)}.`
            : 'Your coach sees the trend over the weeks, not one day.'}
        </p>
      </div>

      <div className="flex items-center justify-center gap-3">
        <button
          type="button"
          aria-label="0.1 kg less"
          onClick={() => nudge(-0.1)}
          className="grid size-14 shrink-0 place-items-center rounded-full bg-surface-raised text-ink transition active:scale-90"
        >
          <Minus className="size-6" aria-hidden />
        </button>
        <label
          htmlFor={inputId}
          className="flex min-w-0 items-baseline justify-center gap-2 rounded-lg bg-surface-raised px-4 py-3 ring-1 ring-border-strong ring-inset focus-within:ring-2 focus-within:ring-brand"
        >
          <span className="sr-only">Body weight in kg</span>
          <Input
            id={inputId}
            inputMode="decimal"
            enterKeyHint="done"
            autoComplete="off"
            // The sheet opens only to type this one number.
            autoFocus
            placeholder={last != null ? formatWeight(last) : '0.0'}
            value={value}
            onChange={(e) => setValue(e.target.value.replace(/[^\d.,]/g, ''))}
            // The label around it draws the box; the input is just the big number.
            className="metric h-auto w-[5ch] min-w-0 bg-transparent px-0 text-center text-[44px] leading-none ring-0 focus:ring-0 placeholder:text-ink-muted/50"
          />
          <span className="font-bold text-[17px] text-ink-muted">kg</span>
        </label>
        <button
          type="button"
          aria-label="0.1 kg more"
          onClick={() => nudge(0.1)}
          className="grid size-14 shrink-0 place-items-center rounded-full bg-surface-raised text-ink transition active:scale-90"
        >
          <Plus className="size-6" aria-hidden />
        </button>
      </div>

      {valid && status?.previous && (
        <p className="text-center font-semibold text-[14px] text-ink-muted">
          {weightChange(status.previous.weightKg, weight)} since {shortDay(status.previous.date)}
        </p>
      )}
      {save.isError && (
        <p
          role="alert"
          className="rounded-md bg-danger/10 p-3 font-semibold text-[14px] text-danger"
        >
          Couldn’t save. Check your signal and try again.
        </p>
      )}

      <Button
        type="submit"
        size="lg"
        block
        disabled={!valid}
        loading={save.isPending}
        className={cn(!valid && 'opacity-60')}
      >
        Save weight
      </Button>
    </form>
  )
}

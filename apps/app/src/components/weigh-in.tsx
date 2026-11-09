import { api, myProfileQuery, statsQuery } from '@project180/client'
import { Button, cn } from '@project180/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Scale } from 'lucide-react'
import { useState } from 'react'

/** Log today's body weight. Logging again the same day replaces it. */
export function WeighIn({
  date,
  className,
  onDone,
  statsWeeks = 1,
}: {
  date: string
  className?: string
  onDone?: () => void
  /** Share the stats the screen already loads (body weight is in every range). */
  statsWeeks?: number
}) {
  const queryClient = useQueryClient()
  const [value, setValue] = useState('')
  const [savedNow, setSavedNow] = useState(false)
  // Already weighed in today (seen in stats): say so instead of asking again after a reload.
  const logged = useQuery(statsQuery(statsWeeks)).data?.bodyWeight.find((b) => b.date === date)
  const saved = savedNow || logged !== undefined
  const save = useMutation({
    mutationFn: (weightKg: number) =>
      api('/me/checkins', {
        method: 'PUT',
        body: { clientUuid: crypto.randomUUID(), date, weightKg },
      }),
    onSuccess: () => {
      setSavedNow(true)
      onDone?.()
      void queryClient.invalidateQueries({ queryKey: ['stats'] })
      void queryClient.invalidateQueries({ queryKey: myProfileQuery.queryKey })
    },
  })
  const weight = Number.parseFloat(value.replace(',', '.'))
  const valid = Number.isFinite(weight) && weight >= 20 && weight <= 400

  return (
    <div
      className={cn(
        'relative flex items-center gap-3 overflow-hidden rounded-lg bg-surface p-4 text-ink shadow-card',
        className,
      )}
    >
      <span aria-hidden className="absolute inset-y-0 left-0 w-1.5 bg-sand" />
      <span className="grid size-11 shrink-0 place-items-center rounded-full bg-sand/25 text-sand-text">
        <Scale className="size-5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-bold text-[15px]">
          {saved ? `Weight logged${logged ? `: ${logged.weightKg} kg` : ''}` : 'Weigh-in day'}
        </p>
        {!saved && (
          <p className="text-[13px] text-ink-muted">Same time, same scale, before eating.</p>
        )}
      </div>
      {!saved && (
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (valid) save.mutate(weight)
          }}
        >
          <input
            aria-label="Body weight in kg"
            inputMode="decimal"
            placeholder="kg"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="tabular h-11 w-20 rounded-sm bg-surface-raised px-3 text-center font-bold text-ink outline-none ring-1 ring-border ring-inset focus:ring-2 focus:ring-brand"
          />
          <Button
            type="submit"
            size="sm"
            className="h-11"
            disabled={!valid}
            loading={save.isPending}
          >
            Save
          </Button>
        </form>
      )}
    </div>
  )
}

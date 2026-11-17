// Profile: the evening reminder to log food. It's pushed (when notifications are on) and always
// shows in the bell, because many phones never turn push on.
import { api, foodRemindersQuery } from '@project180/client'
import { cn } from '@project180/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Utensils } from 'lucide-react'

export function FoodReminderSetting() {
  const queryClient = useQueryClient()
  const on = useQuery(foodRemindersQuery).data ?? false
  const save = useMutation({
    mutationFn: (next: boolean) =>
      api<{ on: boolean }>('/me/food/reminders', { method: 'PUT', body: { on: next } }),
    // Flip at once; put it back if the save fails.
    onMutate: (next) => queryClient.setQueryData(foodRemindersQuery.queryKey, next),
    onError: (_e, next) => queryClient.setQueryData(foodRemindersQuery.queryKey, !next),
  })
  return (
    <div className="flex items-center gap-3 rounded-lg bg-surface p-5 shadow-card">
      <span className="grid size-11 shrink-0 place-items-center rounded-full bg-clay/20 text-clay-text">
        <Utensils className="size-5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p id="food-reminder-label" className="font-bold text-[15px]">
          Remind me to log food
        </p>
        <p className="mt-1 text-[14px] text-ink-muted">
          At 7 pm, if you’ve logged fewer than two meals that day.
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-labelledby="food-reminder-label"
        disabled={save.isPending}
        onClick={() => save.mutate(!on)}
        className="grid h-11 w-14 shrink-0 place-items-center"
      >
        <span
          className={cn(
            'relative block h-7 w-12 rounded-pill transition-colors',
            on ? 'bg-brand' : 'bg-border-strong',
          )}
        >
          <span
            className={cn(
              'absolute top-0.5 left-0 size-6 rounded-full shadow-card transition-transform',
              on ? 'translate-x-[22px] bg-on-brand' : 'translate-x-0.5 bg-surface',
            )}
          />
        </span>
      </button>
    </div>
  )
}

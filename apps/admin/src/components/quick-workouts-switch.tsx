import { ApiError, api, personQuickWorkoutsQuery } from '@project180/client'
import type { QuickWorkoutsAccess } from '@project180/shared'
import { toast } from '@project180/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Zap } from 'lucide-react'
import { Segmented } from './controls'

/**
 * Lets a client build their own quick workout in the app (from the exercise list or one of
 * their own workouts). Off until their coach turns it on; staff can always.
 */
export function QuickWorkoutsSwitch({ userId, name }: { userId: number; name: string }) {
  const queryClient = useQueryClient()
  const access = useQuery(personQuickWorkoutsQuery(userId))
  const first = name.split(' ')[0] ?? name
  const save = useMutation({
    mutationFn: (enabled: boolean) =>
      api<{ quickWorkouts: QuickWorkoutsAccess }>(`/admin/users/${userId}/quick-workouts`, {
        method: 'PUT',
        body: { enabled },
      }),
    onSuccess: ({ quickWorkouts }) => {
      queryClient.setQueryData(personQuickWorkoutsQuery(userId).queryKey, quickWorkouts)
      toast({
        title: quickWorkouts.enabled ? 'Quick workouts turned on' : 'Quick workouts turned off',
        description: quickWorkouts.enabled
          ? `${first} can build their own workout in the app.`
          : `${first} only does the workouts you give them.`,
      })
    },
    onError: (err) =>
      toast({
        tone: 'error',
        title: 'Couldn’t change it',
        description: err instanceof ApiError ? err.message : undefined,
      }),
  })

  // Not their coach (or still loading): nothing to show.
  if (access.isError) return null
  if (!access.data) return <div className="h-20 animate-pulse rounded-md bg-surface-raised" />
  const on = access.data.enabled
  return (
    <div className="flex flex-col gap-3 rounded-md bg-surface-raised p-4 sm:flex-row sm:items-center sm:gap-5">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <Zap className="mt-0.5 size-5 shrink-0 text-clay-text" aria-hidden />
        <div className="flex min-w-0 flex-col gap-1">
          <p className="font-bold text-[14px]">Quick workouts</p>
          <p className="text-[13px] text-ink-muted">
            {on
              ? `${first} can build their own workout in the app. Each one shows in their history, starting with “Quick”.`
              : `Let ${first} build their own workout in the app, from the exercise list or one of their workouts.`}
          </p>
        </div>
      </div>
      <div className="shrink-0 self-start sm:self-center">
        <Segmented
          label={`Quick workouts for ${name}`}
          value={on ? 'on' : 'off'}
          onChange={(v) => v !== (on ? 'on' : 'off') && save.mutate(v === 'on')}
          options={[
            { value: 'on', label: 'On' },
            { value: 'off', label: 'Off' },
          ]}
        />
      </div>
    </div>
  )
}

// Exercise logged by hand on Fuel: activities and steps. Each change puts the server's day back
// in the cache at once (the target moves with what was burned); the week refreshes behind it.
import { api } from '@project180/client'
import type { ActivityKind, FoodDay } from '@project180/shared'
import { useMutation } from '@tanstack/react-query'
import { useDayReply } from './food'

export function useAddActivity(onSaved?: () => void) {
  const putDay = useDayReply()
  return useMutation({
    mutationFn: (input: {
      clientUuid: string
      date: string
      kind: ActivityKind
      minutes: number
    }) => api<{ day: FoodDay }>('/me/food/activities', { method: 'POST', body: input }),
    onSuccess: ({ day }) => {
      putDay(day)
      navigator.vibrate?.(20)
      onSaved?.()
    },
  })
}

export function useDeleteActivity() {
  const putDay = useDayReply()
  return useMutation({
    mutationFn: (id: number) =>
      api<{ day: FoodDay }>(`/me/food/activities/${id}`, { method: 'DELETE' }),
    onSuccess: ({ day }) => putDay(day),
  })
}

export function useSetSteps(onSaved?: () => void) {
  const putDay = useDayReply()
  return useMutation({
    mutationFn: (input: { date: string; steps: number }) =>
      api<{ day: FoodDay }>('/me/food/steps', { method: 'PUT', body: input }),
    onSuccess: ({ day }) => {
      putDay(day)
      onSaved?.()
    },
  })
}

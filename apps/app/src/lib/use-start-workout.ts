import { api, planQuery } from '@project180/client'
import type { SessionDetail } from '@project180/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'

export interface StartWorkout {
  workoutId: number
  enrollmentId?: number | null
  programDayId?: number | null
  scheduledDate?: string | null
}

/** Starts a workout session and opens the workout screen. */
export function useStartWorkout() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: StartWorkout) => {
      const { session } = await api<{ session: SessionDetail }>('/sessions', {
        method: 'POST',
        body: { clientUuid: crypto.randomUUID(), ...input },
      })
      return session
    },
    onSuccess: (session) => {
      queryClient.setQueryData(['sessions', session.id], session)
      // Show "in progress" straight away; don't make them wait for the whole plan to reload.
      queryClient.setQueryData(planQuery.queryKey, (old) =>
        old
          ? {
              ...old,
              activeSession: {
                id: session.id,
                workoutName: session.workoutName,
                startedAt: session.startedAt,
              },
            }
          : old,
      )
      void navigate({ to: '/workout/$sessionId', params: { sessionId: String(session.id) } })
      void queryClient.invalidateQueries({ queryKey: ['plan'] })
    },
  })
}

import { api, planQuery } from '@project180/client'
import type { QuickWorkoutInput, SessionDetail } from '@project180/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'

export interface StartWorkout {
  workoutId: number
  enrollmentId?: number | null
  programDayId?: number | null
  scheduledDate?: string | null
}

/** Once a session has started: cache it, show "in progress" at once, open the workout screen. */
function useOpenStarted() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  return (session: SessionDetail) => {
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
  }
}

/** Starts a workout session and opens the workout screen. */
export function useStartWorkout() {
  const onSuccess = useOpenStarted()
  return useMutation({
    mutationFn: async (input: StartWorkout) => {
      const { session } = await api<{ session: SessionDetail }>('/sessions', {
        method: 'POST',
        body: { clientUuid: crypto.randomUUID(), ...input },
      })
      return session
    },
    onSuccess,
  })
}

/**
 * Starts a quick workout someone built themselves. The caller keeps one clientUuid per
 * build, so a retry after poor signal returns the same session instead of a second one.
 */
export function useStartQuickWorkout() {
  const onSuccess = useOpenStarted()
  return useMutation({
    mutationFn: async (input: QuickWorkoutInput) => {
      const { session } = await api<{ session: SessionDetail }>('/sessions/quick', {
        method: 'POST',
        body: input,
      })
      return session
    },
    onSuccess,
  })
}

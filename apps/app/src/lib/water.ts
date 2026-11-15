// The phone's water log: a tap adds a glass at once (optimistic), Undo takes back the last one,
// and the daily goal can be changed here as well as by the coach.
// Taps are sent one after another (one mutation scope), and only the last reply replaces the day,
// so quick taps never flicker back while earlier ones are still on their way.
import { api, waterDayQuery } from '@project180/client'
import type { WaterDay } from '@project180/shared'
import { type QueryClient, useMutation, useQueryClient } from '@tanstack/react-query'

const WATER_KEY = ['water'] as const

function updateDay(qc: QueryClient, date: string, change: (day: WaterDay) => WaterDay) {
  qc.setQueryData<WaterDay>(waterDayQuery(date).queryKey, (day) => (day ? change(day) : day))
}

/** Puts the server's day in the cache, unless more taps are still on their way. */
function useReply() {
  const qc = useQueryClient()
  return (water: WaterDay) => {
    if (qc.isMutating({ mutationKey: WATER_KEY }) <= 1)
      qc.setQueryData(waterDayQuery(water.date).queryKey, water)
    void qc.invalidateQueries({ queryKey: ['water', 'summary'] })
  }
}

export function useAddWater() {
  const qc = useQueryClient()
  const reply = useReply()
  return useMutation({
    mutationKey: WATER_KEY,
    scope: { id: 'water' },
    mutationFn: (input: { date: string; ml: number; clientUuid: string; tempId: number }) =>
      api<{ water: WaterDay }>('/me/water', {
        method: 'POST',
        body: { clientUuid: input.clientUuid, date: input.date, ml: input.ml },
      }),
    onMutate: ({ date, ml, tempId }) => {
      navigator.vibrate?.(15)
      updateDay(qc, date, (day) => ({
        ...day,
        ml: day.ml + ml,
        logs: [...day.logs, { id: tempId, ml, createdAt: new Date().toISOString() }],
      }))
    },
    onSuccess: ({ water }) => reply(water),
    // No signal: take the glass back off so the number never lies.
    onError: (_error, { date, ml, tempId }) =>
      updateDay(qc, date, (day) => ({
        ...day,
        ml: day.ml - ml,
        logs: day.logs.filter((l) => l.id !== tempId),
      })),
  })
}

export function useUndoWater() {
  const qc = useQueryClient()
  const reply = useReply()
  return useMutation({
    mutationKey: WATER_KEY,
    scope: { id: 'water' },
    mutationFn: ({ id }: { date: string; id: number; ml: number }) =>
      api<{ water: WaterDay }>(`/me/water/${id}`, { method: 'DELETE' }),
    onMutate: ({ date, id, ml }) =>
      updateDay(qc, date, (day) => ({
        ...day,
        ml: day.ml - ml,
        logs: day.logs.filter((l) => l.id !== id),
      })),
    onSuccess: ({ water }) => reply(water),
    onError: (_error, { date }) => void qc.invalidateQueries(waterDayQuery(date)),
  })
}

/** Your daily goal in ml (null removes it). Every day you have open shows it at once. */
export function useWaterGoal(onSaved?: () => void) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (goalMl: number | null) =>
      api<{ goalMl: number | null }>('/me/water/goal', { method: 'PUT', body: { goalMl } }),
    onSuccess: ({ goalMl }) => {
      qc.setQueriesData<WaterDay>({ queryKey: ['water', 'day'] }, (day) =>
        day ? { ...day, goalMl } : day,
      )
      void qc.invalidateQueries({ queryKey: ['water', 'summary'] })
      onSaved?.()
    },
  })
}

// The phone's food log: saving, editing and deleting foods, and turning a photo into a draft.
// Every change updates the day from the server's reply at once; the rest refreshes behind it.
import {
  api,
  apiForm,
  foodDayQuery,
  foodRecentQuery,
  foodSearchQuery,
  foodStreakQuery,
  savedMealsQuery,
} from '@project180/client'
import type {
  BarcodeProduct,
  FoodDay,
  FoodPhotoDraft,
  FoodSource,
  Meal,
  SavedMeal,
} from '@project180/shared'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'

/** One food as the forms hold it, with the id made on this phone (kept across retries). */
export interface FoodDraftItem {
  clientUuid: string
  name: string
  grams: number | null
  kcal: number
  proteinG: number
  carbsG: number | null
  fatG: number | null
  fibreG?: number | null
  sugarG?: number | null
  sodiumMg?: number | null
}

export function useDayReply() {
  const queryClient = useQueryClient()
  return (day: FoodDay) => {
    queryClient.setQueryData(foodDayQuery(day.date).queryKey, day)
    void queryClient.invalidateQueries({ queryKey: ['food', 'summary'] })
    void queryClient.invalidateQueries({ queryKey: foodStreakQuery.queryKey })
    void queryClient.invalidateQueries({ queryKey: foodRecentQuery.queryKey })
  }
}

export function useAddFood(onSaved?: () => void) {
  const putDay = useDayReply()
  return useMutation({
    mutationFn: (input: {
      date: string
      meal: Meal
      source: FoodSource
      entries: FoodDraftItem[]
    }) => api<{ day: FoodDay }>('/me/food', { method: 'POST', body: input }),
    onSuccess: ({ day }) => {
      putDay(day)
      navigator.vibrate?.(20)
      onSaved?.()
    },
  })
}

export function useUpdateFood(onSaved?: () => void) {
  const putDay = useDayReply()
  return useMutation({
    mutationFn: ({
      id,
      ...changes
    }: { id: number } & Partial<Omit<FoodDraftItem, 'clientUuid'>> & {
        meal?: Meal
      }) => api<{ day: FoodDay }>(`/me/food/${id}`, { method: 'PATCH', body: changes }),
    onSuccess: ({ day }) => {
      putDay(day)
      onSaved?.()
    },
  })
}

export function useDeleteFood(onDeleted?: () => void) {
  const putDay = useDayReply()
  return useMutation({
    mutationFn: ({ id }: { id: number }) =>
      api<{ day: FoodDay }>(`/me/food/${id}`, { method: 'DELETE' }),
    onSuccess: ({ day }) => {
      putDay(day)
      onDeleted?.()
    },
  })
}

/**
 * Shrinks a photo on the phone (longest side 1024 px, JPEG) so it uploads quickly on poor signal
 * and costs less to read. Falls back to the original if the browser can't decode it.
 */
export async function shrinkPhoto(file: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, 1024 / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.82))
    return blob ? new File([blob], 'meal.jpg', { type: 'image/jpeg' }) : file
  } catch {
    return file
  }
}

/** Sends a photo (and an optional note) to be read. Saves nothing: returns a draft to check. */
export function usePhotoEstimate() {
  return useMutation({
    mutationFn: async ({ file, hint }: { file: File; hint: string }) => {
      const form = new FormData()
      form.set('photo', await shrinkPhoto(file))
      if (hint.trim()) form.set('hint', hint.trim())
      return (await apiForm<{ draft: FoodPhotoDraft }>('/me/food/photo', form)).draft
    },
  })
}

/** "12.5" or "12,5" → 12.5; empty or not a number → null. */
export function parseAmount(value: string): number | null {
  const n = Number.parseFloat(value.replace(',', '.'))
  return Number.isFinite(n) && n >= 0 ? n : null
}

export const amountText = (n: number | null | undefined) => (n == null ? '' : String(n))

/** Looks a barcode up (the server tries each provider and keeps a copy). 404 = nobody knows it. */
export function useBarcodeLookup() {
  return useMutation({
    mutationFn: async (code: string) =>
      (await api<{ product: BarcodeProduct }>(`/me/food/barcode/${code}`)).product,
  })
}

/** Searches start this many characters in, once typing pauses this long (their limits are low). */
export const SEARCH_MIN_CHARS = 2
const SEARCH_PAUSE_MS = 450

/**
 * Foods matching what's typed, from the food databases. Asks once typing pauses, keeps showing
 * the last results while the next ones load, and never asks while the box is (nearly) empty.
 */
export function useFoodSearch(query: string, enabled = true) {
  const [settled, setSettled] = useState(query.trim())
  useEffect(() => {
    const timer = setTimeout(() => setSettled(query.trim()), SEARCH_PAUSE_MS)
    return () => clearTimeout(timer)
  }, [query])
  const ready = enabled && settled.length >= SEARCH_MIN_CHARS
  const search = useQuery({
    ...foodSearchQuery(settled),
    enabled: ready,
    placeholderData: keepPreviousData,
  })
  return {
    ...search,
    /** Still typing, or waiting for the answer. */
    searching: ready && (search.isFetching || settled !== query.trim()),
    settled,
  }
}

/** Copies one meal's foods to a day and meal ("Copy yesterday's breakfast"). */
export function useCopyMeal(onSaved?: () => void) {
  const putDay = useDayReply()
  return useMutation({
    mutationFn: (input: { fromDate: string; fromMeal: Meal; date: string; meal: Meal }) =>
      api<{ day: FoodDay }>('/me/food/copy', {
        method: 'POST',
        body: { clientUuid: crypto.randomUUID(), ...input },
      }),
    onSuccess: ({ day }) => {
      putDay(day)
      navigator.vibrate?.(20)
      onSaved?.()
    },
  })
}

/** Saves a logged meal under a name, for "My meals". */
export function useSaveMeal(onSaved?: (meal: SavedMeal) => void) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { name: string; date: string; meal: Meal }) =>
      api<{ meal: SavedMeal }>('/me/food/meals', { method: 'POST', body: input }),
    onSuccess: ({ meal }) => {
      queryClient.setQueryData<SavedMeal[]>(savedMealsQuery.queryKey, (list) => [
        meal,
        ...(list ?? []),
      ])
      onSaved?.(meal)
    },
  })
}

/** Logs a saved meal into a day and meal. */
export function useLogSavedMeal(onSaved?: () => void) {
  const putDay = useDayReply()
  return useMutation({
    mutationFn: ({ id, ...input }: { id: number; date: string; meal: Meal }) =>
      api<{ day: FoodDay }>(`/me/food/meals/${id}/log`, {
        method: 'POST',
        body: { clientUuid: crypto.randomUUID(), ...input },
      }),
    onSuccess: ({ day }) => {
      putDay(day)
      navigator.vibrate?.(20)
      onSaved?.()
    },
  })
}

export function useDeleteSavedMeal() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api(`/me/food/meals/${id}`, { method: 'DELETE' }),
    onMutate: (id) =>
      queryClient.setQueryData<SavedMeal[]>(savedMealsQuery.queryKey, (list) =>
        (list ?? []).filter((m) => m.id !== id),
      ),
    onError: () => void queryClient.invalidateQueries({ queryKey: savedMealsQuery.queryKey }),
  })
}

import { ApiError, api, exerciseAlternativesQuery, exercisesQuery } from '@project180/client'
import {
  EQUIPMENT_LABELS,
  type Exercise,
  MAX_ALTERNATIVES,
  MUSCLE_GROUP_LABELS,
  searchSwaps,
} from '@project180/shared'
import { Button, IconButton, toast } from '@project180/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react'
import { useState } from 'react'
import { SearchInput } from './controls'
import { ExerciseThumb } from './exercise-photo'

/**
 * The coach's suggested swaps for an exercise, in the edit drawer. Clients see them first when
 * they tap Swap during a workout (machine taken, no equipment). Saved straight away.
 */
export function ExerciseAlternatives({ exercise }: { exercise: Exercise }) {
  const queryClient = useQueryClient()
  const key = exerciseAlternativesQuery(exercise.id).queryKey
  const current = useQuery(exerciseAlternativesQuery(exercise.id))
  const library = useQuery(exercisesQuery())
  const [adding, setAdding] = useState(false)
  const [search, setSearch] = useState('')
  const byId = new Map((library.data ?? []).map((e) => [e.id, e]))
  const ids = current.data ?? []
  const picked = ids.map((id) => byId.get(id)).filter((e): e is Exercise => Boolean(e))

  const save = useMutation({
    mutationFn: (alternativeIds: number[]) =>
      api<{ alternativeIds: number[] }>(`/exercises/${exercise.id}/alternatives`, {
        method: 'PUT',
        body: { alternativeIds },
      }),
    // Show the change at once; put it back if the save fails.
    onMutate: (alternativeIds) => {
      const before = queryClient.getQueryData(key)
      queryClient.setQueryData(key, alternativeIds)
      return { before }
    },
    onSuccess: (res, _ids, _ctx) => {
      queryClient.setQueryData(key, res.alternativeIds)
      toast({ title: 'Alternatives saved', description: exercise.name })
    },
    onError: (err, _ids, ctx) => {
      queryClient.setQueryData(key, ctx?.before)
      toast({
        tone: 'error',
        title: 'Couldn’t save the alternatives',
        description: err instanceof ApiError ? err.message : undefined,
      })
    },
  })

  const move = (i: number, by: -1 | 1) => {
    const next = [...ids]
    const [item] = next.splice(i, 1)
    if (item === undefined) return
    next.splice(i + by, 0, item)
    save.mutate(next)
  }
  const full = ids.length >= MAX_ALTERNATIVES
  const candidates = searchSwaps(
    { exerciseId: exercise.id, muscleGroup: exercise.muscleGroup },
    library.data ?? [],
    search,
    { exclude: ids, limit: 8 },
  )

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <span className="font-bold text-[13px]">Alternatives</span>
        {!adding && !full && (
          <Button
            variant="secondary"
            size="sm"
            icon={<Plus className="size-4" aria-hidden />}
            onClick={() => setAdding(true)}
          >
            Add alternative
          </Button>
        )}
      </div>
      <p className="text-[13px] text-ink-muted">
        If a client can’t do this one (machine taken, no equipment), these show first when they tap
        Swap during a workout. They can still search for any other exercise.
      </p>

      {current.isPending ? (
        <div className="h-14 animate-pulse rounded-md bg-surface-raised" />
      ) : picked.length === 0 ? (
        !adding && (
          <p className="rounded-md bg-surface-raised p-4 text-[14px] text-ink-muted">
            None yet. Clients see similar {MUSCLE_GROUP_LABELS[exercise.muscleGroup].toLowerCase()}{' '}
            exercises instead.
          </p>
        )
      ) : (
        <ol className="flex flex-col gap-2">
          {picked.map((e, i) => (
            <li key={e.id} className="flex items-center gap-3 rounded-md bg-surface-raised p-2">
              <span className="tabular w-5 shrink-0 text-center font-bold text-[13px] text-ink-muted">
                {i + 1}
              </span>
              <ExerciseThumb imageKey={e.imageKey} className="bg-surface" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-bold text-[14px]">{e.name}</span>
                <span className="block truncate text-[13px] text-ink-muted">
                  {EQUIPMENT_LABELS[e.equipment]}
                </span>
              </span>
              <span className="flex shrink-0 gap-1">
                <IconButton
                  label="Move up"
                  icon={<ArrowUp aria-hidden />}
                  size="sm"
                  disabled={i === 0}
                  onClick={() => move(i, -1)}
                />
                <IconButton
                  label="Move down"
                  icon={<ArrowDown aria-hidden />}
                  size="sm"
                  disabled={i === picked.length - 1}
                  onClick={() => move(i, 1)}
                />
                <IconButton
                  label={`Remove ${e.name}`}
                  icon={<X aria-hidden />}
                  size="sm"
                  tone="danger"
                  onClick={() => save.mutate(ids.filter((id) => id !== e.id))}
                />
              </span>
            </li>
          ))}
        </ol>
      )}

      {full && (
        <p className="font-semibold text-[13px] text-ink-muted">
          That’s the most ({MAX_ALTERNATIVES}). Remove one to add another.
        </p>
      )}

      {adding && !full && (
        <div className="flex flex-col gap-2 rounded-md bg-surface-raised p-3">
          <SearchInput
            aria-label="Search exercises"
            placeholder="Search exercises"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="[&_input]:bg-surface"
            autoFocus
          />
          {candidates.length === 0 ? (
            <p className="p-2 text-[14px] text-ink-muted">Nothing matches that.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {candidates.map((e) => (
                <li key={e.id}>
                  <button
                    type="button"
                    onClick={() => save.mutate([...ids, e.id])}
                    className="flex w-full items-center gap-3 rounded-sm p-2 text-left transition hover:bg-surface active:scale-[0.99]"
                  >
                    <ExerciseThumb imageKey={e.imageKey} className="size-9 bg-surface" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-bold text-[14px]">{e.name}</span>
                      <span className="block truncate text-[13px] text-ink-muted">
                        {EQUIPMENT_LABELS[e.equipment]} · {MUSCLE_GROUP_LABELS[e.muscleGroup]}
                      </span>
                    </span>
                    <Plus className="size-4 shrink-0 text-brand-text" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="self-end"
            onClick={() => {
              setAdding(false)
              setSearch('')
            }}
          >
            Done
          </Button>
        </div>
      )}
    </div>
  )
}

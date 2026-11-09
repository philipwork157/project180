import { ApiError, api } from '@project180/client'
import { ConfirmDialog, toast } from '@project180/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'

interface Impact {
  programs: Array<{ id: number; name: string }>
  people: string[]
  sessions: number
  loggedSets: number
  otherPeoplesSessions: number
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/**
 * "Delete for good" for a workout or program. Shows exactly what goes with it
 * (logged sessions, sets, assignments, program days) before anything is removed.
 */
export function DeleteForGood({
  kind,
  item,
  onClose,
  onDeleted,
}: {
  kind: 'workout' | 'program'
  item: { id: number; name: string } | null
  onClose: () => void
  onDeleted?: () => void
}) {
  const queryClient = useQueryClient()
  const base = kind === 'workout' ? '/workouts' : '/programs'
  const [error, setError] = useState<string>()
  const impact = useQuery({
    queryKey: [kind, item?.id, 'impact'],
    queryFn: async () => (await api<{ impact: Impact }>(`${base}/${item?.id}/impact`)).impact,
    enabled: item !== null,
    staleTime: 0,
  })
  const remove = useMutation({
    mutationFn: (id: number) => api(`${base}/${id}/permanent`, { method: 'DELETE' }),
    onSuccess: async () => {
      await Promise.all(
        ['workouts', 'programs', 'enrollments', 'plan', 'stats', 'sessions'].map((key) =>
          queryClient.invalidateQueries({ queryKey: [key] }),
        ),
      )
      toast({ title: 'Deleted for good' })
      onClose()
      onDeleted?.()
    },
  })
  const i = impact.data
  const consequences: string[] = []
  if (i) {
    if (i.people.length) consequences.push(`Taken off ${i.people.join(' and ')}’s calendar.`)
    if (i.sessions) {
      consequences.push(
        `${plural(i.sessions, 'logged workout')} and ${plural(i.loggedSets, 'set')} deleted from history and progress stats.`,
      )
    }
  }

  // A workout a program still schedules can't go: the program would silently lose a day.
  const usedIn = kind === 'workout' ? (i?.programs ?? []) : []
  const blocked = usedIn.length > 0

  return (
    <ConfirmDialog
      open={item !== null}
      title={
        blocked
          ? `${item?.name ?? 'This workout'} is still in use`
          : `Delete ${item?.name ?? ''} for good?`
      }
      hideConfirm={blocked}
      cancelLabel={blocked ? 'OK' : 'Cancel'}
      confirmLabel={consequences.length ? 'Delete everything' : 'Delete for good'}
      loading={remove.isPending}
      confirmDisabled={impact.isPending}
      onClose={() => {
        setError(undefined)
        onClose()
      }}
      onConfirm={async () => {
        if (!item) return
        setError(undefined)
        try {
          await remove.mutateAsync(item.id)
        } catch (err) {
          setError(err instanceof ApiError ? err.message : 'Could not delete it.')
        }
      }}
    >
      {blocked ? (
        <div className="flex flex-col gap-3">
          <p>
            {usedIn.length === 1
              ? 'This program schedules it'
              : `These ${usedIn.length} programs schedule it`}
            . Take it off those days, or delete the program, and then you can delete the workout.
          </p>
          <ul className="flex flex-col gap-1">
            {usedIn.map((p) => (
              <li key={p.id}>
                <Link
                  to="/programs/$programId"
                  params={{ programId: String(p.id) }}
                  onClick={onClose}
                  className="font-bold text-brand-text hover:underline"
                >
                  {p.name}
                </Link>
              </li>
            ))}
          </ul>
          <p>Want it out of the list now? Archive it instead: programs keep working.</p>
        </div>
      ) : impact.isPending ? (
        <p>Checking what’s linked to it…</p>
      ) : consequences.length ? (
        <div className="flex flex-col gap-3">
          <p>This also removes:</p>
          <ul className="list-inside list-disc text-ink">
            {consequences.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
          <p>This can’t be undone. To hide it but keep the history, archive it instead.</p>
        </div>
      ) : (
        <p>Nothing is linked to it. This can’t be undone.</p>
      )}
      {error && <p className="mt-3 font-semibold text-danger">{error}</p>}
    </ConfirmDialog>
  )
}

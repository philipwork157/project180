import { ApiError, api, programCopiesQuery } from '@project180/client'
import type { ProgramCopySummary } from '@project180/shared'
import { daysBetween, todayIn } from '@project180/shared'
import { Button, Chip, cn, Drawer, toast } from '@project180/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'

/** Ticked to start with: behind, and not changed just for them (updating would undo that). */
const preselect = (copies: ProgramCopySummary[]) =>
  new Set(copies.filter((c) => c.behind && !c.changedForThem).map((c) => c.enrollmentId))

function weekOf(startDate: string) {
  const days = daysBetween(startDate, todayIn('Africa/Johannesburg'))
  return days < 0 ? 'Starts soon' : `Week ${Math.floor(days / 7) + 1}`
}

/**
 * Brings clients' copies of a library program up to date with it. Their start date, calendar
 * and finished workouts stay; what's coming next follows the library program.
 */
export function UpdateClientsDrawer({
  programId,
  open,
  onClose,
}: {
  programId: number
  open: boolean
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const copies = useQuery({ ...programCopiesQuery(programId), enabled: open })
  const list = copies.data ?? []
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const [error, setError] = useState<string>()

  // A fresh pick each time it opens, from the latest list.
  const ready = open && copies.isSuccess
  useEffect(() => {
    if (ready && copies.data) setPicked(preselect(copies.data))
    setError(undefined)
  }, [ready, copies.data])

  const sync = useMutation({
    mutationFn: (enrollmentIds: number[]) =>
      api<{ copies: ProgramCopySummary[] }>(`/programs/${programId}/sync`, {
        method: 'POST',
        body: { enrollmentIds },
      }),
    onSuccess: ({ copies: fresh }, ids) => {
      queryClient.setQueryData(programCopiesQuery(programId).queryKey, fresh)
      void queryClient.invalidateQueries({ queryKey: ['enrollments'] })
      void queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
      toast({
        title:
          ids.length === 1
            ? 'Program updated for 1 person'
            : `Program updated for ${ids.length} people`,
        description: 'Start dates and finished workouts are kept.',
      })
      onClose()
    },
    onError: (err) =>
      setError(err instanceof ApiError ? err.message : 'Could not update their programs.'),
  })

  const toggle = (id: number) =>
    setPicked((cur) => {
      const next = new Set(cur)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const count = picked.size
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Update clients"
      description="Bring your changes into their copy. Start dates and finished workouts stay."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Not now
          </Button>
          <Button
            loading={sync.isPending}
            disabled={count === 0}
            icon={<RefreshCw className="size-4" aria-hidden />}
            onClick={() => sync.mutate([...picked])}
          >
            {count === 1 ? 'Update 1 person' : `Update ${count} people`}
          </Button>
        </>
      }
    >
      {copies.isPending ? (
        <p className="text-[14px] text-ink-muted">Loading…</p>
      ) : list.length === 0 ? (
        <p className="rounded-md bg-surface-raised p-4 text-[14px] text-ink-muted">
          Nobody is on this program right now.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {list.some((c) => c.changedForThem) && (
            <p className="rounded-md bg-sand/20 p-3 font-semibold text-[14px]">
              Some programs were changed just for that person. Updating replaces those changes, so
              they aren’t ticked.
            </p>
          )}
          <ul className="flex flex-col gap-2">
            {list.map((c) => {
              const on = picked.has(c.enrollmentId)
              return (
                <li key={c.enrollmentId}>
                  {/* biome-ignore lint/a11y/useSemanticElements: a whole-row toggle */}
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={on}
                    onClick={() => toggle(c.enrollmentId)}
                    className={cn(
                      'flex min-h-14 w-full items-center gap-3 rounded-md bg-surface-raised px-3 py-2 text-left transition active:scale-[0.99]',
                      on && 'ring-2 ring-brand ring-inset',
                    )}
                  >
                    <span
                      className={cn(
                        'grid size-6 shrink-0 place-items-center rounded-[6px] border-2 transition',
                        on ? 'border-brand bg-brand text-on-brand' : 'border-border-strong',
                      )}
                    >
                      {on && <Check className="size-4" strokeWidth={3} aria-hidden />}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="truncate font-bold text-[14px]">{c.userName}</span>
                      <span className="text-[13px] text-ink-muted">
                        Started {c.startDate} · {weekOf(c.startDate)}
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-wrap justify-end gap-2">
                      {c.changedForThem && (
                        <Chip tone="sand" className="h-6 text-[12px]">
                          Changed for them
                        </Chip>
                      )}
                      <Chip tone={c.behind ? 'clay' : 'neutral'} className="h-6 text-[12px]">
                        {c.behind ? 'Behind' : 'Up to date'}
                      </Chip>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
          {error && (
            <p role="alert" className="font-semibold text-[14px] text-danger">
              {error}
            </p>
          )}
        </div>
      )}
    </Drawer>
  )
}

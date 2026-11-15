import { api, workoutsQuery } from '@project180/client'
import { MUSCLE_GROUP_LABELS, type WorkoutSummary } from '@project180/shared'
import {
  Button,
  buttonClasses,
  Chip,
  EmptyState,
  IconButton,
  MUSCLE_GROUP_TONE,
} from '@project180/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { ArchiveRestore, Clock, ListChecks, Plus, Trash2 } from 'lucide-react'
import { motion } from 'motion/react'
import { useState } from 'react'
import { SearchInput, Segmented, Toolbar } from '../../components/controls'
import { DeleteForGood } from '../../components/delete-for-good'
import { PageHeader } from '../../components/page-header'
import { BuildWithClaude } from '../../components/workout-builder'

export const Route = createFileRoute('/_dash/workouts')({
  component: WorkoutsPage,
})

function WorkoutsPage() {
  const queryClient = useQueryClient()
  const [view, setView] = useState<'active' | 'archived'>('active')
  const [search, setSearch] = useState('')
  const [deleting, setDeleting] = useState<{ id: number; name: string } | null>(null)
  const active = useQuery(workoutsQuery(false))
  const archived = useQuery(workoutsQuery(true))
  const list = (view === 'active' ? active.data : archived.data) ?? []
  const shown = list.filter((w) => w.name.toLowerCase().includes(search.trim().toLowerCase()))
  const restore = useMutation({
    mutationFn: (id: number) => api(`/workouts/${id}/restore`, { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['workouts'] }),
  })

  const newButton = (
    <Link
      to="/workouts/$workoutId"
      params={{ workoutId: 'new' }}
      className={buttonClasses('primary')}
    >
      <Plus className="size-5" aria-hidden />
      New workout
    </Link>
  )

  return (
    <>
      <PageHeader
        title="Workouts"
        subtitle="Exercises in order, with sets, reps and rest. Clients never see this list: they get workouts through the program you assign them."
        action={
          <div className="flex flex-wrap gap-3">
            <BuildWithClaude />
            {newButton}
          </div>
        }
      />
      <Toolbar>
        <Segmented
          label="Show"
          value={view}
          onChange={setView}
          options={[
            { value: 'active', label: 'Active', count: active.data?.length },
            { value: 'archived', label: 'Archived', count: archived.data?.length },
          ]}
        />
        <SearchInput
          className="min-w-48 flex-1"
          placeholder="Search workouts"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </Toolbar>

      {shown.length === 0 ? (
        <EmptyState
          icon={<ListChecks className="size-7" aria-hidden />}
          title={search ? 'No matches' : view === 'active' ? 'No workouts yet' : 'Nothing archived'}
          action={view === 'active' && !search ? newButton : undefined}
        >
          {view === 'active' && !search
            ? 'A workout is a list of exercises with targets, like “Leg Day A”.'
            : undefined}
        </EmptyState>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((w, i) => (
            <motion.div
              key={w.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i, 8) * 0.03 }}
            >
              {view === 'active' ? (
                <div className="group relative h-full">
                  <Link
                    to="/workouts/$workoutId"
                    params={{ workoutId: String(w.id) }}
                    className="block h-full rounded-lg bg-surface p-5 pr-14 shadow-card transition hover:ring-2 hover:ring-brand"
                  >
                    <WorkoutCard workout={w} />
                  </Link>
                  <div className="absolute top-3 right-3 transition focus-within:opacity-100 md:opacity-0 md:group-hover:opacity-100">
                    <IconButton
                      label="Delete workout"
                      size="sm"
                      tone="danger"
                      icon={<Trash2 aria-hidden />}
                      onClick={() => setDeleting({ id: w.id, name: w.name })}
                    />
                  </div>
                </div>
              ) : (
                <div className="flex h-full flex-col gap-4 rounded-lg bg-surface p-5 shadow-card">
                  <WorkoutCard workout={w} />
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={<ArchiveRestore className="size-4" aria-hidden />}
                    onClick={() => restore.mutate(w.id)}
                  >
                    Restore
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-danger hover:bg-danger/10 hover:text-danger"
                    icon={<Trash2 className="size-4" aria-hidden />}
                    onClick={() => setDeleting({ id: w.id, name: w.name })}
                  >
                    Delete for good
                  </Button>
                </div>
              )}
            </motion.div>
          ))}
        </div>
      )}
      <DeleteForGood kind="workout" item={deleting} onClose={() => setDeleting(null)} />
    </>
  )
}

function WorkoutCard({ workout: w }: { workout: WorkoutSummary }) {
  return (
    <div>
      <p className="flex items-center gap-2 font-bold text-[17px]">{w.name}</p>
      <p className="mt-1 flex items-center gap-3 font-semibold text-[13px] text-ink-muted">
        <span>
          {w.exerciseCount} {w.exerciseCount === 1 ? 'exercise' : 'exercises'}
        </span>
        {w.estimatedMinutes && (
          <span className="inline-flex items-center gap-1">
            <Clock className="size-3.5" aria-hidden />
            {w.estimatedMinutes} min
          </span>
        )}
      </p>
      {w.muscleGroups.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {w.muscleGroups.map((g) => (
            <Chip key={g} tone={MUSCLE_GROUP_TONE[g]}>
              {MUSCLE_GROUP_LABELS[g]}
            </Chip>
          ))}
        </div>
      )}
    </div>
  )
}

import { api, enrollmentsQuery, programsQuery } from '@project180/client'
import type { EnrollmentSummary, ProgramSummary } from '@project180/shared'
import { Button, buttonClasses, Chip, Drawer, EmptyState } from '@project180/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { ArchiveRestore, CalendarRange, Plus, Trash2, UserPlus } from 'lucide-react'
import { motion } from 'motion/react'
import { useState } from 'react'
import { AssignForm } from '../../components/assign-form'
import { SearchInput, Segmented, Toolbar } from '../../components/controls'
import { DeleteForGood } from '../../components/delete-for-good'
import { PageHeader } from '../../components/page-header'
import { BuildProgramWithClaude } from '../../components/program-builder'

export const Route = createFileRoute('/_dash/programs')({
  component: ProgramsPage,
})

function ProgramsPage() {
  const queryClient = useQueryClient()
  const [view, setView] = useState<'active' | 'archived'>('active')
  const [search, setSearch] = useState('')
  const [deleting, setDeleting] = useState<{ id: number; name: string } | null>(null)
  const active = useQuery(programsQuery(false))
  const archived = useQuery(programsQuery(true))
  const list = (view === 'active' ? active.data : archived.data) ?? []
  const shown = list.filter((p) => p.name.toLowerCase().includes(search.trim().toLowerCase()))
  const enrollments = useQuery(enrollmentsQuery())
  const [assigning, setAssigning] = useState<ProgramSummary | null>(null)
  const onIt = (programId: number) =>
    (enrollments.data ?? []).filter(
      (e) => (e.sourceProgramId ?? e.programId) === programId && e.status === 'active',
    )
  const restore = useMutation({
    mutationFn: (id: number) => api(`/programs/${id}/restore`, { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['programs'] }),
  })

  const newButton = (
    <Link
      to="/programs/$programId"
      params={{ programId: 'new' }}
      className={buttonClasses('primary')}
    >
      <Plus className="size-5" aria-hidden />
      New program
    </Link>
  )

  return (
    <>
      <PageHeader
        title="Programs"
        subtitle="Multi-week plans that fill the calendar. Clients only see the one you assign them."
        action={
          <div className="flex flex-wrap gap-3">
            <BuildProgramWithClaude />
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
          placeholder="Search programs"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </Toolbar>
      {shown.length === 0 ? (
        <EmptyState
          icon={<CalendarRange className="size-7" aria-hidden />}
          title={search ? 'No matches' : view === 'active' ? 'No programs yet' : 'Nothing archived'}
          action={view === 'active' && !search ? newButton : undefined}
        >
          {view === 'active' && !search
            ? 'A program lays workouts and rest days across a number of weeks. Assign it to someone with a start date.'
            : undefined}
        </EmptyState>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((p, i) => (
            <motion.div
              key={p.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i, 8) * 0.03 }}
            >
              {view === 'active' ? (
                <div className="flex h-full flex-col rounded-lg bg-surface shadow-card transition hover:ring-2 hover:ring-brand">
                  <Link
                    to="/programs/$programId"
                    params={{ programId: String(p.id) }}
                    className="block flex-1 p-5"
                  >
                    <ProgramCard program={p} people={onIt(p.id)} />
                  </Link>
                  <div className="flex items-center justify-between gap-2 border-border border-t px-5 py-3">
                    <Link
                      to="/programs/$programId"
                      params={{ programId: String(p.id) }}
                      className="font-bold text-[14px] text-brand-text hover:underline"
                    >
                      Edit schedule
                    </Link>
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={<UserPlus className="size-4" aria-hidden />}
                      onClick={() => setAssigning(p)}
                    >
                      Assign
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex h-full flex-col gap-4 rounded-lg bg-surface p-5 shadow-card">
                  <ProgramCard program={p} people={[]} />
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={<ArchiveRestore className="size-4" aria-hidden />}
                    onClick={() => restore.mutate(p.id)}
                  >
                    Restore
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-danger hover:bg-danger/10 hover:text-danger"
                    icon={<Trash2 className="size-4" aria-hidden />}
                    onClick={() => setDeleting({ id: p.id, name: p.name })}
                  >
                    Delete for good
                  </Button>
                </div>
              )}
            </motion.div>
          ))}
        </div>
      )}
      <Drawer
        open={assigning !== null}
        onClose={() => setAssigning(null)}
        title="Assign program"
        description={assigning ? `${assigning.name} · ${assigning.durationWeeks} weeks` : undefined}
      >
        {assigning && <AssignForm key={assigning.id} programId={assigning.id} />}
      </Drawer>
      <DeleteForGood kind="program" item={deleting} onClose={() => setDeleting(null)} />
    </>
  )
}

function ProgramCard({
  program: p,
  people,
}: {
  program: ProgramSummary
  people: EnrollmentSummary[]
}) {
  return (
    <div>
      <p className="flex items-center gap-2 font-bold text-[17px]">{p.name}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Chip tone="brand">
          {p.durationWeeks} {p.durationWeeks === 1 ? 'week' : 'weeks'}
        </Chip>
        <Chip tone="clay">
          {p.workoutDays} {p.workoutDays === 1 ? 'workout' : 'workouts'}
        </Chip>
      </div>
      <p className="mt-3 font-semibold text-[13px] text-ink-muted">
        {people.length ? `On it: ${people.map((e) => e.userName).join(', ')}` : 'Nobody on it yet'}
      </p>
    </div>
  )
}

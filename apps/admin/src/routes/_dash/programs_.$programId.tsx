import {
  ApiError,
  api,
  enrollmentsQuery,
  programCopiesQuery,
  programQuery,
  workoutsQuery,
} from '@project180/client'
import type { ProgramDetail, ProgramInput } from '@project180/shared'
import { isOwner } from '@project180/shared'
import {
  Button,
  Card,
  cn,
  Drawer,
  Field,
  IconButton,
  Textarea,
  Tooltip,
  toast,
} from '@project180/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import {
  Archive,
  ArrowLeft,
  CopyCheck,
  RefreshCw,
  Scale,
  Trash2,
  UserPlus,
  UserRound,
  X,
} from 'lucide-react'
import { motion } from 'motion/react'
import { useState } from 'react'
import { AssignForm } from '../../components/assign-form'
import { Stepper } from '../../components/controls'
import { DeleteForGood } from '../../components/delete-for-good'
import { HistoryControls, useDraftBackup, useDraftHistory } from '../../components/draft-history'
import { useUnsavedChangesGuard } from '../../components/unsaved-changes'
import { UpdateClientsDrawer } from '../../components/update-clients'
import { WorkoutPalette } from '../../components/workout-palette'

export const Route = createFileRoute('/_dash/programs_/$programId')({
  component: ProgramEditorPage,
})

interface Cell {
  workoutId: number | null
  checkinRequired: boolean
}

interface Draft {
  name: string
  description: string
  durationWeeks: number
  cells: Record<string, Cell>
}

const keyOf = (week: number, day: number) => `${week}:${day}`
const EMPTY: Draft = {
  name: '',
  description: '',
  durationWeeks: 4,
  cells: {},
}

function fromProgram(p: ProgramDetail): Draft {
  const cells: Draft['cells'] = {}
  for (const d of p.days)
    cells[keyOf(d.weekNumber, d.dayNumber)] = {
      workoutId: d.workoutId,
      checkinRequired: d.checkinRequired,
    }
  return {
    name: p.name,
    description: p.description ?? '',
    durationWeeks: p.durationWeeks,
    cells,
  }
}

function toInput(d: Draft): ProgramInput {
  const days: NonNullable<ProgramInput['days']> = []
  for (let week = 1; week <= d.durationWeeks; week++) {
    for (let day = 1; day <= 7; day++) {
      const c = d.cells[keyOf(week, day)]
      if (c && (c.workoutId !== null || c.checkinRequired)) {
        days.push({
          weekNumber: week,
          dayNumber: day,
          workoutId: c.workoutId,
          checkinRequired: c.checkinRequired,
        })
      }
    }
  }
  return {
    name: d.name.trim(),
    description: d.description.trim() || null,
    durationWeeks: d.durationWeeks,
    days,
  }
}

function ProgramEditorPage() {
  const { programId } = Route.useParams()
  const { me } = Route.useRouteContext()
  const isNew = programId === 'new'
  const program = useQuery({ ...programQuery(Number(programId)), enabled: !isNew })
  if (!isNew && !program.data) {
    return (
      <p className="p-8 font-semibold text-ink-muted">
        {program.isError ? 'Program not found.' : 'Loading…'}
      </p>
    )
  }
  // A client's personal copy can be edited by their coach, who is the only one who sees it.
  const canEdit =
    !program.data ||
    program.data.createdBy === me.id ||
    isOwner(me.role) ||
    program.data.clientId !== null
  const client =
    program.data?.clientId != null
      ? { id: program.data.clientId, name: program.data.clientName ?? 'this client' }
      : null
  return (
    <Builder
      key={programId}
      id={isNew ? null : Number(programId)}
      initial={program.data ? fromProgram(program.data) : EMPTY}
      canEdit={canEdit}
      client={client}
    />
  )
}

function Builder({
  id,
  initial,
  canEdit,
  client,
}: {
  id: number | null
  initial: Draft
  canEdit: boolean
  /** Set when this is a client's personal copy. */
  client: { id: number; name: string } | null
}) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const workouts = useQuery(workoutsQuery(false, client?.id))
  const { draft, setDraft, undo, redo, canUndo, canRedo } = useDraftHistory<Draft>(initial)
  const [savedDraft, setSavedDraft] = useState<Draft>(initial)
  const [saved, setSaved] = useState(() => JSON.stringify(toInput(initial)))
  const [brush, setBrush] = useState<number | 'rest' | null>(null)
  const [error, setError] = useState<string>()
  const [assignOpen, setAssignOpen] = useState(false)
  const [updateOpen, setUpdateOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  // A library program: the people on their own copy of it, and how many copies are behind.
  const libraryId = id !== null && client === null ? id : null
  const copies = useQuery({ ...programCopiesQuery(libraryId ?? 0), enabled: libraryId !== null })
  const behind = (copies.data ?? []).filter((c) => c.behind).length
  const dirty = JSON.stringify(toInput(draft)) !== saved
  const names = new Map((workouts.data ?? []).map((w) => [w.id, w.name]))

  const guard = useUnsavedChangesGuard(dirty, 'program')
  // A safety copy of unsaved changes in this browser (closed tab, crash, refresh).
  const backup = useDraftBackup(`project180-draft-program-${id ?? 'new'}`, draft, dirty, (d) =>
    setDraft(d),
  )

  const update = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }))
  const setCell = (week: number, day: number, patch: Partial<Cell>) =>
    setDraft((d) => {
      const k = keyOf(week, day)
      const cur = d.cells[k] ?? { workoutId: null, checkinRequired: false }
      return { ...d, cells: { ...d.cells, [k]: { ...cur, ...patch } } }
    })
  const copyWeekToAll = (from: number) => {
    const before = draft.cells
    toast({
      title: `Week ${from} copied to every week`,
      description: 'Save to keep it.',
      action: { label: 'Undo', onClick: () => setDraft((d) => ({ ...d, cells: before })) },
    })
    setDraft((d) => {
      const cells = { ...d.cells }
      for (let week = 1; week <= d.durationWeeks; week++) {
        if (week === from) continue
        for (let day = 1; day <= 7; day++) {
          cells[keyOf(week, day)] = {
            ...(d.cells[keyOf(from, day)] ?? { workoutId: null, checkinRequired: false }),
          }
        }
      }
      return { ...d, cells }
    })
  }

  const save = useMutation({
    mutationFn: (input: ProgramInput) =>
      id
        ? api<{ program: ProgramDetail }>(`/programs/${id}`, { method: 'PUT', body: input })
        : api<{ program: ProgramDetail }>('/programs', { method: 'POST', body: input }),
  })
  const archive = useMutation({ mutationFn: () => api(`/programs/${id}`, { method: 'DELETE' }) })

  async function onSave() {
    if (!draft.name.trim()) return setError('Give the program a name')
    setError(undefined)
    try {
      const input = toInput(draft)
      const { program } = await save.mutateAsync(input)
      setSaved(JSON.stringify(input))
      setSavedDraft(draft)
      toast({ title: 'Changes saved', description: input.name })
      // People on this program keep their own copy: offer to bring the changes to them.
      if (libraryId !== null)
        void queryClient
          .fetchQuery({ ...programCopiesQuery(libraryId), staleTime: 0 })
          .then((list) => list.some((c) => c.behind) && setUpdateOpen(true))
          .catch(() => {})
      void queryClient.invalidateQueries({ queryKey: ['programs'] })
      if (!id)
        await navigate({
          to: '/programs/$programId',
          params: { programId: String(program.id) },
          replace: true,
        })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save the program.')
    }
  }

  const workoutCount = toInput(draft).days?.filter((d) => d.workoutId !== null).length ?? 0

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center gap-3">
        <Link
          to={client ? '/users' : '/programs'}
          className="grid size-11 place-items-center rounded-sm bg-surface-raised"
          aria-label={client ? 'Back to people' : 'Back to programs'}
        >
          <ArrowLeft className="size-5" aria-hidden />
        </Link>
        <input
          aria-label="Program name"
          value={draft.name}
          onChange={(e) => update({ name: e.target.value })}
          placeholder="Name this program, e.g. 4-Week Strength"
          // biome-ignore lint/a11y/noAutofocus: a new program starts by naming it
          autoFocus={!id}
          disabled={!canEdit}
          // Phones: the name takes the first line next to Back; the buttons wrap below it.
          className="min-w-0 flex-1 bg-transparent font-display font-extrabold text-[24px] leading-8 tracking-tight outline-none placeholder:text-ink-muted/60 max-sm:basis-[calc(100%-3.5rem)] sm:text-[30px] sm:leading-[38px]"
        />
        <span aria-live="polite" className="font-semibold text-[13px] text-ink-muted">
          {dirty ? 'Unsaved changes' : null}
        </span>
        {id && canEdit && (
          <>
            <IconButton
              label="Archive: hides it from lists, history is kept"
              icon={<Archive aria-hidden />}
              size="lg"
              onClick={async () => {
                await archive.mutateAsync()
                guard.allowLeave()
                toast({
                  title: 'Archived',
                  description: `${draft.name} is hidden. Restore it from Archived.`,
                })
                void queryClient.invalidateQueries({ queryKey: ['programs'] })
                await navigate({ to: '/programs' })
              }}
            />
            <IconButton
              label="Delete for good"
              icon={<Trash2 aria-hidden />}
              size="lg"
              tone="danger"
              onClick={() => setDeleting(true)}
            />
          </>
        )}
        {libraryId !== null && (copies.data?.length ?? 0) > 0 && (
          <Button
            variant="secondary"
            icon={<RefreshCw className="size-4" aria-hidden />}
            onClick={() => setUpdateOpen(true)}
            aria-label={behind > 0 ? `Update clients, ${behind} behind` : undefined}
            disabled={dirty}
            title={dirty ? 'Save your changes first' : undefined}
          >
            Update clients
            {behind > 0 && (
              <span className="tabular grid h-5 min-w-5 place-items-center rounded-pill bg-clay px-1.5 font-extrabold text-[11px] text-on-clay">
                {behind}
              </span>
            )}
          </Button>
        )}
        {id && (
          <Button
            variant="secondary"
            icon={<UserPlus className="size-4" aria-hidden />}
            onClick={() => setAssignOpen(true)}
            disabled={dirty}
            title={dirty ? 'Save your changes first' : undefined}
          >
            Assign
          </Button>
        )}
        {canEdit && (
          <HistoryControls
            canUndo={canUndo}
            canRedo={canRedo}
            onUndo={undo}
            onRedo={redo}
            dirty={dirty}
            onDiscard={() => setDraft(savedDraft)}
            what="program"
          />
        )}
        {canEdit && (
          <Button onClick={onSave} loading={save.isPending} disabled={!dirty && Boolean(id)}>
            {id ? 'Save' : 'Create program'}
          </Button>
        )}
      </header>
      {client && (
        <p className="flex flex-wrap items-center gap-2 rounded-md bg-brand-soft px-4 py-3 font-semibold text-[14px] text-brand-text">
          <UserRound className="size-4 shrink-0" aria-hidden />
          {client.name}’s own copy. Changes here only affect {client.name.split(' ')[0]}, not the
          library or anyone else. Workouts you drop in from the library are copied for them too.
        </p>
      )}
      {backup.banner}
      {error && (
        <p role="alert" className="-mt-3 font-semibold text-[14px] text-danger">
          {error}
        </p>
      )}

      {/* Phones: fill-days list, then the schedule, then settings. Desktop: tools on the left. */}
      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[300px_minmax(0,1fr)]">
        {canEdit && (
          <div className="flex flex-col gap-2">
            <WorkoutPalette workouts={workouts.data ?? []} brush={brush} onBrush={setBrush} />
            {workouts.data?.length === 0 && (
              <Link
                to="/workouts/$workoutId"
                params={{ workoutId: 'new' }}
                className="px-1 font-bold text-[13px] text-brand-text"
              >
                Build a workout first →
              </Link>
            )}
          </div>
        )}

        <section
          aria-label="Schedule"
          className="flex min-w-0 flex-col gap-3 xl:col-start-2 xl:row-span-2 xl:row-start-1"
        >
          <div className="overflow-x-auto rounded-lg bg-surface p-3 shadow-card">
            <table className="w-full min-w-[560px] table-fixed border-separate border-spacing-1">
              <thead>
                <tr>
                  <th className="sticky left-0 z-20 w-14 bg-surface" />
                  {[1, 2, 3, 4, 5, 6, 7].map((day) => (
                    <th
                      key={day}
                      className="pb-1 font-extrabold text-[11px] text-ink-muted uppercase tracking-[0.08em]"
                    >
                      Day {day}
                    </th>
                  ))}
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: draft.durationWeeks }, (_, i) => i + 1).map((week) => (
                  <tr key={week}>
                    <th
                      scope="row"
                      // Stays in view while the days scroll sideways on a phone; solid so days
                      // pass cleanly underneath.
                      className="sticky left-0 z-20 bg-surface pr-2 text-left align-middle"
                    >
                      <span className="flex flex-col">
                        <span className="font-extrabold text-[10px] text-ink-muted uppercase tracking-[0.08em]">
                          Week
                        </span>
                        <span className="tabular font-display font-extrabold text-[18px] leading-6">
                          {week}
                        </span>
                      </span>
                    </th>
                    {[1, 2, 3, 4, 5, 6, 7].map((day) => {
                      const cell = draft.cells[keyOf(week, day)] ?? {
                        workoutId: null,
                        checkinRequired: false,
                      }
                      const hasWorkout = cell.workoutId !== null
                      const label = hasWorkout
                        ? (names.get(cell.workoutId ?? 0) ?? 'Archived workout')
                        : 'Rest'
                      return (
                        <td key={day} className="p-0 align-top">
                          <motion.div
                            layout
                            className={cn(
                              'relative flex h-[76px] flex-col justify-between gap-1 rounded-md p-1.5 transition focus-within:ring-2 focus-within:ring-brand',
                              hasWorkout
                                ? 'bg-surface-raised'
                                : 'border border-border border-dashed',
                            )}
                          >
                            <span
                              aria-hidden
                              className={cn(
                                'line-clamp-2 break-words font-semibold text-[12px] leading-4',
                                hasWorkout ? 'text-ink' : 'text-ink-muted',
                              )}
                            >
                              {label}
                            </span>
                            {/* The real control, invisible over the cell: click anywhere to change. */}
                            <select
                              aria-label={`Week ${week} day ${day}: ${label}`}
                              value={cell.workoutId ?? ''}
                              disabled={!canEdit}
                              onChange={(e) =>
                                setCell(week, day, {
                                  workoutId: e.target.value ? Number(e.target.value) : null,
                                })
                              }
                              className="absolute inset-0 z-10 cursor-pointer appearance-none rounded-md opacity-0 disabled:cursor-default"
                            >
                              <option value="">Rest</option>
                              {(workouts.data ?? []).map((w) => (
                                <option key={w.id} value={w.id}>
                                  {w.name}
                                </option>
                              ))}
                              {cell.workoutId !== null && !names.has(cell.workoutId) && (
                                <option value={cell.workoutId}>Archived workout</option>
                              )}
                            </select>
                            {brush !== null && canEdit ? (
                              <button
                                type="button"
                                aria-label={`Fill week ${week} day ${day}`}
                                onClick={() =>
                                  setCell(week, day, { workoutId: brush === 'rest' ? null : brush })
                                }
                                className="absolute inset-0 z-[15] cursor-copy rounded-md hover:ring-2 hover:ring-brand"
                              />
                            ) : null}
                            <div className="relative z-20 flex">
                              <Tooltip
                                label={
                                  cell.checkinRequired
                                    ? 'Weigh-in day (click to remove)'
                                    : 'Make this a weigh-in day'
                                }
                              >
                                <button
                                  type="button"
                                  disabled={!canEdit}
                                  aria-pressed={cell.checkinRequired}
                                  aria-label={`Weigh-in on week ${week} day ${day}`}
                                  onClick={() =>
                                    setCell(week, day, { checkinRequired: !cell.checkinRequired })
                                  }
                                  className={cn(
                                    'grid size-6 place-items-center rounded-sm transition',
                                    cell.checkinRequired
                                      ? 'bg-sand/25 text-sand-text'
                                      : 'text-ink-muted/50 hover:bg-surface hover:text-ink disabled:hidden',
                                  )}
                                >
                                  <Scale className="size-3.5" aria-hidden />
                                </button>
                              </Tooltip>
                            </div>
                          </motion.div>
                        </td>
                      )
                    })}
                    <td className="align-middle">
                      {canEdit && draft.durationWeeks > 1 && (
                        <IconButton
                          label="Copy this week to every week"
                          icon={<CopyCheck aria-hidden />}
                          size="sm"
                          onClick={() => copyWeekToAll(week)}
                        />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[13px] text-ink-muted">
            Day 1 is the start date you pick when assigning. {workoutCount} workouts in total;
            dashed days are rest days. The scale marks a weigh-in day.
          </p>
        </section>

        <div className="flex flex-col gap-6 xl:col-start-1">
          <Card>
            <h2 className="mb-4 font-bold text-[17px]">Settings</h2>
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between gap-3">
                <span className="font-bold text-[13px]">Length</span>
                <Stepper
                  label="weeks"
                  suffix="wks"
                  value={draft.durationWeeks}
                  min={1}
                  max={52}
                  onChange={(v) => update({ durationWeeks: v ?? 1 })}
                />
              </div>
              <Field label="Description" hint="Optional">
                {(fid) => (
                  <Textarea
                    id={fid}
                    value={draft.description}
                    disabled={!canEdit}
                    onChange={(e) => update({ description: e.target.value })}
                  />
                )}
              </Field>
            </div>
          </Card>
        </div>
      </div>
      {id && <AssignDrawer programId={id} open={assignOpen} onClose={() => setAssignOpen(false)} />}
      {libraryId !== null && (
        <UpdateClientsDrawer
          programId={libraryId}
          open={updateOpen}
          onClose={() => setUpdateOpen(false)}
        />
      )}
      <DeleteForGood
        kind="program"
        item={deleting && id ? { id, name: draft.name || 'this program' } : null}
        onClose={() => setDeleting(false)}
        onDeleted={() => {
          guard.allowLeave()
          void navigate({ to: '/programs' })
        }}
      />
      {guard.dialog}
    </div>
  )
}

function AssignDrawer({
  programId,
  open,
  onClose,
}: {
  programId: number
  open: boolean
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const enrollments = useQuery(enrollmentsQuery(programId))
  const active = (enrollments.data ?? []).filter((e) => e.status === 'active')
  const cancel = useMutation({
    mutationFn: (id: number) => api(`/enrollments/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['enrollments'] }),
  })
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Assign program"
      description="Pick who and when. Their calendar fills in from day 1."
    >
      <AssignForm programId={programId} />
      {active.length > 0 && (
        <section className="mt-8">
          <h3 className="mb-3 font-extrabold text-[11px] text-ink-muted uppercase tracking-[0.08em]">
            On this program now
          </h3>
          <ul className="flex flex-col gap-2">
            {active.map((e) => (
              <li
                key={e.id}
                className="flex items-center gap-3 rounded-md bg-surface-raised px-3 py-2"
              >
                <span className="grid size-8 place-items-center rounded-full bg-brand-soft font-bold text-[13px] text-brand-text">
                  {e.userName.charAt(0).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold text-[14px]">{e.userName}</span>
                  <span className="text-[13px] text-ink-muted">Started {e.startDate}</span>
                </span>
                <IconButton
                  label="Stop this program for them"
                  icon={<X aria-hidden />}
                  size="sm"
                  tone="danger"
                  onClick={() => cancel.mutate(e.id)}
                />
              </li>
            ))}
          </ul>
        </section>
      )}
    </Drawer>
  )
}

import {
  ApiError,
  api,
  enrollmentsQuery,
  programCopiesQuery,
  programQuery,
  workoutsQuery,
} from '@project180/client'
import type { ProgramCell, ProgramDetail, ProgramInput } from '@project180/shared'
import {
  cellKey,
  clearWeek,
  copyDayToAllWeeks,
  EMPTY_CELL,
  isOwner,
  swapCells,
  swapWeeks,
  weekFilled,
} from '@project180/shared'
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
  ArrowLeftRight,
  CopyCheck,
  GripVertical,
  ListPlus,
  Pencil,
  RefreshCw,
  Scale,
  Trash2,
  UserPlus,
  UserRound,
  X,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { AssignForm } from '../../components/assign-form'
import { Stepper } from '../../components/controls'
import { DeleteForGood } from '../../components/delete-for-good'
import { HistoryControls, useDraftBackup, useDraftHistory } from '../../components/draft-history'
import { ProgramDayDrawer, ProgramWeekDrawer } from '../../components/program-day'
import { ProgramTips, ProgramTipsButton, useProgramTips } from '../../components/program-tips'
import { useUnsavedChangesGuard } from '../../components/unsaved-changes'
import { UpdateClientsDrawer } from '../../components/update-clients'
import { WorkoutPalette } from '../../components/workout-palette'

/**
 * The pinned Week column. The table spaces its cells 6px apart and the card has padding on the
 * left; on a phone the days scroll sideways under the column and would show through those gaps,
 * so its background reaches over them (6px all round, and back over the card's padding). Only
 * there, where the days really scroll, a 1px line at its edge marks it as pinned: it runs through
 * the row gaps (4px up and down, so it never breaks) and keeps the same 6px gap to the days as
 * everywhere else.
 */
const PINNED_FILL =
  'shadow-[0_0_0_6px_var(--surface),-22px_0_0_6px_var(--surface)] max-md:after:absolute max-md:after:inset-y-[-4px] max-md:after:right-0 max-md:after:w-px max-md:after:bg-border'

export const Route = createFileRoute('/_dash/programs_/$programId')({
  component: ProgramEditorPage,
})

type Cell = ProgramCell

interface Draft {
  name: string
  description: string
  durationWeeks: number
  cells: Record<string, Cell>
}

const keyOf = cellKey
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
  const [fillOpen, setFillOpen] = useState(false)
  // The day open in the side panel, and the day being dragged / hovered while dragging.
  const [editing, setEditing] = useState<{ week: number; day: number } | null>(null)
  const [dragFrom, setDragFrom] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState<string | null>(null)
  const tips = useProgramTips()
  // "Swap with…": the day (or week) waiting for the one it swaps with. Works by tap and by
  // keyboard, where dragging doesn't.
  const [picking, setPicking] = useState<
    { kind: 'day'; week: number; day: number } | { kind: 'week'; week: number } | null
  >(null)
  const [weekOpen, setWeekOpen] = useState<number | null>(null)
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
      const cur = d.cells[k] ?? EMPTY_CELL
      return { ...d, cells: { ...d.cells, [k]: { ...cur, ...patch } } }
    })
  const cellAt = (week: number, day: number) => draft.cells[keyOf(week, day)] ?? EMPTY_CELL
  // Drag a day onto another: they swap (workout and weigh-in), with Undo in the toast.
  const swap = (from: string, to: string) => {
    const before = draft.cells
    const after = swapCells(before, from, to)
    if (after === before) return
    const label = (k: string) => {
      const [w, d] = k.split(':')
      return `week ${w} day ${d}`
    }
    setDraft((d) => ({ ...d, cells: after }))
    toast({
      title: 'Days swapped',
      description: `${label(from)} and ${label(to)}. Save to keep it.`,
      action: { label: 'Undo', onClick: () => setDraft((d) => ({ ...d, cells: before })) },
    })
  }
  // Esc puts the fill brush down, wherever focus is.
  useEffect(() => {
    if (brush === null) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setBrush(null)
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [brush])
  useEffect(() => {
    if (picking === null) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setPicking(null)
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [picking])
  // A bulk change to the grid, with Undo in the toast.
  const changeAll = (
    title: string,
    change: (cells: Record<string, Cell>) => Record<string, Cell>,
  ) => {
    const before = draft.cells
    const after = change(before)
    if (after === before) return
    setDraft((d) => ({ ...d, cells: after }))
    toast({
      title,
      description: 'Save to keep it.',
      action: { label: 'Undo', onClick: () => setDraft((d) => ({ ...d, cells: before })) },
    })
  }
  // The day (or week) clicked while picking: swap them.
  const pickTarget = (week: number, day: number) => {
    const from = picking
    setPicking(null)
    if (!from) return
    if (from.kind === 'day') return swap(keyOf(from.week, from.day), keyOf(week, day))
    changeAll(`Week ${from.week} and week ${week} swapped`, (c) => swapWeeks(c, from.week, week))
  }
  const isPickSource = (week: number, day: number) =>
    picking !== null && picking.week === week && (picking.kind === 'week' || picking.day === day)
  const brushName =
    brush === 'rest' ? 'rest days' : brush !== null ? (names.get(brush) ?? 'this workout') : null
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
          cells[keyOf(week, day)] = { ...(d.cells[keyOf(from, day)] ?? EMPTY_CELL) }
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

      {/* Tools in one row above the schedule, which gets the whole width. */}
      <div className="flex flex-wrap items-center gap-3">
        {canEdit && (
          <Button
            variant={brush === null ? 'secondary' : 'primary'}
            icon={<ListPlus className="size-4" aria-hidden />}
            onClick={() => setFillOpen(true)}
          >
            Fill days
          </Button>
        )}
        <div className="flex items-center gap-3">
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
        {canEdit && (
          <div className="flex items-center gap-2 sm:ml-auto">
            <p className="font-semibold text-[13px] text-ink-muted">
              Click a day to change it. Drag a day onto another to swap them.
            </p>
            <ProgramTipsButton onClick={tips.show} />
          </div>
        )}
      </div>
      {canEdit && workouts.data?.length === 0 && (
        <Link
          to="/workouts/$workoutId"
          params={{ workoutId: 'new' }}
          className="-mt-3 font-bold text-[13px] text-brand-text"
        >
          Build a workout first →
        </Link>
      )}

      {brushName && (
        <div
          role="status"
          className="-mt-2 flex flex-wrap items-center gap-3 rounded-md bg-brand-soft px-4 py-2.5 font-semibold text-[14px] text-brand-text"
        >
          <ListPlus className="size-4 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1">
            Filling with <b>{brushName}</b>: click days in the schedule.
          </span>
          <Button variant="ghost" size="sm" onClick={() => setFillOpen(true)}>
            Change
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setBrush(null)}>
            Done
          </Button>
        </div>
      )}

      {picking && (
        <div
          role="status"
          className="-mt-2 flex flex-wrap items-center gap-3 rounded-md bg-brand-soft px-4 py-2.5 font-semibold text-[14px] text-brand-text"
        >
          <ArrowLeftRight className="size-4 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1">
            {picking.kind === 'day' ? (
              <>
                Click the day to swap with{' '}
                <b>
                  week {picking.week} · day {picking.day}
                </b>
                .
              </>
            ) : (
              <>
                Click any day in the week to swap with <b>week {picking.week}</b>.
              </>
            )}
          </span>
          <Button variant="secondary" size="sm" onClick={() => setPicking(null)}>
            Cancel
          </Button>
        </div>
      )}

      {canEdit && <ProgramTips open={tips.open} onClose={tips.hide} />}

      <section aria-label="Schedule" className="flex min-w-0 flex-col gap-3">
        <div className="overflow-x-auto rounded-lg bg-surface p-3 shadow-card md:p-4">
          <table className="w-full min-w-[640px] table-fixed border-separate border-spacing-1.5">
            <thead>
              <tr>
                <th className={cn('sticky left-0 z-30 w-14 bg-surface', PINNED_FILL)} />
                {[1, 2, 3, 4, 5, 6, 7].map((day) => (
                  <th
                    key={day}
                    className="pb-1 font-extrabold text-[11px] text-ink-muted uppercase tracking-[0.08em]"
                  >
                    Day {day}
                  </th>
                ))}
                <th className="w-11" />
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: draft.durationWeeks }, (_, i) => i + 1).map((week) => (
                <tr key={week}>
                  <th
                    scope="row"
                    // Stays in view while the days scroll sideways on a phone; solid so days
                    // pass cleanly underneath.
                    className={cn(
                      'sticky left-0 z-30 bg-surface pr-2 text-left align-middle',
                      PINNED_FILL,
                    )}
                  >
                    {canEdit ? (
                      <Tooltip label={`Week ${week}: copy, swap or clear`}>
                        <button
                          type="button"
                          aria-label={`Week ${week}: copy, swap or clear`}
                          onClick={() => setWeekOpen(week)}
                          className="-ml-2 flex min-h-11 flex-col rounded-md px-2 py-1 text-left transition hover:bg-surface-raised hover:text-brand-text active:scale-[0.97]"
                        >
                          <span className="font-extrabold text-[10px] text-ink-muted uppercase tracking-[0.08em]">
                            Week
                          </span>
                          <span className="tabular font-display font-extrabold text-[18px] leading-6">
                            {week}
                          </span>
                        </button>
                      </Tooltip>
                    ) : (
                      <span className="flex flex-col">
                        <span className="font-extrabold text-[10px] text-ink-muted uppercase tracking-[0.08em]">
                          Week
                        </span>
                        <span className="tabular font-display font-extrabold text-[18px] leading-6">
                          {week}
                        </span>
                      </span>
                    )}
                  </th>
                  {[1, 2, 3, 4, 5, 6, 7].map((day) => {
                    const k = keyOf(week, day)
                    const cell = cellAt(week, day)
                    const hasWorkout = cell.workoutId !== null
                    const label = hasWorkout
                      ? (names.get(cell.workoutId ?? 0) ?? 'Archived workout')
                      : 'Rest'
                    const canDrag = canEdit && brush === null && picking === null
                    return (
                      <td key={day} className="p-0 align-top">
                        {/* biome-ignore lint/a11y/noStaticElementInteractions: dragging is a mouse shortcut; the day's button below does the same by keyboard */}
                        <div
                          draggable={canDrag}
                          onDragStart={(e) => {
                            e.dataTransfer.effectAllowed = 'move'
                            e.dataTransfer.setData('text/plain', k)
                            setDragFrom(k)
                          }}
                          onDragOver={(e) => {
                            if (dragFrom === null) return
                            e.preventDefault()
                            e.dataTransfer.dropEffect = 'move'
                            if (dragOver !== k) setDragOver(k)
                          }}
                          onDragLeave={() => dragOver === k && setDragOver(null)}
                          onDrop={(e) => {
                            e.preventDefault()
                            if (dragFrom !== null) swap(dragFrom, k)
                            setDragFrom(null)
                            setDragOver(null)
                          }}
                          onDragEnd={() => {
                            setDragFrom(null)
                            setDragOver(null)
                          }}
                          className={cn(
                            'group relative flex h-[88px] flex-col justify-between gap-1 rounded-md p-2 transition focus-within:ring-2 focus-within:ring-brand',
                            hasWorkout ? 'bg-surface-raised' : 'border border-border border-dashed',
                            canEdit && 'hover:ring-2 hover:ring-brand/50',
                            canDrag && 'cursor-grab active:cursor-grabbing',
                            dragFrom === k && 'opacity-40',
                            isPickSource(week, day) && 'ring-2 ring-brand',
                            dragOver === k && dragFrom !== k && 'scale-[1.03] ring-2 ring-brand',
                          )}
                        >
                          <span
                            aria-hidden
                            className={cn(
                              'line-clamp-2 break-words font-semibold text-[13px] leading-4',
                              hasWorkout ? 'text-ink' : 'text-ink-muted',
                            )}
                          >
                            {label}
                          </span>
                          {picking !== null && !isPickSource(week, day) && (
                            <span className="pointer-events-none absolute inset-0 z-30 hidden place-items-center rounded-md bg-brand-soft/80 group-hover:grid">
                              <span className="rounded-pill bg-brand px-3 py-1 font-bold text-[12px] text-on-brand">
                                {picking.kind === 'week' ? `Swap with week ${week}` : 'Swap here'}
                              </span>
                            </span>
                          )}
                          {dragOver === k && dragFrom !== null && dragFrom !== k && (
                            // Where it lands: the two days swap.
                            <span className="pointer-events-none absolute inset-0 z-30 grid place-items-center rounded-md bg-brand-soft/80">
                              <span className="rounded-pill bg-brand px-3 py-1 font-bold text-[12px] text-on-brand">
                                Swap
                              </span>
                            </span>
                          )}
                          {/* Click anywhere on the day: fill it (brush) or open it to change. */}
                          <button
                            type="button"
                            disabled={!canEdit}
                            aria-label={
                              picking !== null
                                ? `Swap with week ${week} day ${day}`
                                : brush !== null
                                  ? `Fill week ${week} day ${day}`
                                  : `Week ${week} day ${day}: ${label}. Change`
                            }
                            onClick={() =>
                              picking !== null
                                ? pickTarget(week, day)
                                : brush !== null
                                  ? setCell(week, day, {
                                      workoutId: brush === 'rest' ? null : brush,
                                    })
                                  : setEditing({ week, day })
                            }
                            className={cn(
                              'absolute inset-0 z-10 rounded-md outline-none disabled:cursor-default',
                              picking !== null
                                ? 'cursor-pointer'
                                : brush !== null
                                  ? 'cursor-copy'
                                  : 'cursor-[inherit]',
                            )}
                          />
                          {/* Clicks anywhere on this row (the pencil included) go through to the day's button;
                              only the scale takes its own. */}
                          <div className="pointer-events-none relative z-20 flex items-end justify-between gap-2">
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
                                  'pointer-events-auto grid size-7 place-items-center rounded-sm transition',
                                  cell.checkinRequired
                                    ? 'bg-sand/25 text-sand-text'
                                    : 'text-ink-muted/50 hover:bg-surface hover:text-ink disabled:hidden',
                                )}
                              >
                                <Scale className="size-3.5" aria-hidden />
                              </button>
                            </Tooltip>
                            {canEdit && picking === null && (
                              <span
                                aria-hidden
                                className="pointer-events-none flex items-center gap-1 text-ink-muted opacity-0 transition group-focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-60"
                              >
                                {/* Phones swap from the day's panel, so no drag handle there. */}
                                <GripVertical className="size-3.5 [@media(hover:none)]:hidden" />
                                <Pencil className="size-3.5" />
                              </span>
                            )}
                          </div>
                        </div>
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
          Day 1 is the start date you pick when assigning. {workoutCount} workouts in total; dashed
          days are rest days. The scale marks a weigh-in day.
        </p>
      </section>

      <Card>
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
      </Card>

      <Drawer
        open={fillOpen}
        onClose={() => setFillOpen(false)}
        title="Fill days"
        description="Pick a workout (or rest), then click days in the schedule to fill them."
      >
        <WorkoutPalette
          inPanel
          workouts={workouts.data ?? []}
          brush={brush}
          onBrush={(b) => {
            setBrush(b)
            // Picked: out of the way, so the days can be clicked.
            if (b !== null) setFillOpen(false)
          }}
        />
      </Drawer>
      <ProgramDayDrawer
        day={editing}
        cell={editing ? cellAt(editing.week, editing.day) : EMPTY_CELL}
        workouts={workouts.data ?? []}
        onPick={(workoutId) => editing && setCell(editing.week, editing.day, { workoutId })}
        onToggleWeighIn={() =>
          editing &&
          setCell(editing.week, editing.day, {
            checkinRequired: !cellAt(editing.week, editing.day).checkinRequired,
          })
        }
        weeks={draft.durationWeeks}
        onSwap={() => editing && setPicking({ kind: 'day', ...editing })}
        onCopyToAllWeeks={() =>
          editing &&
          changeAll(`Day ${editing.day} copied to every week`, (c) =>
            copyDayToAllWeeks(c, draft.durationWeeks, editing.week, editing.day),
          )
        }
        onClose={() => setEditing(null)}
      />
      <ProgramWeekDrawer
        week={weekOpen}
        weeks={draft.durationWeeks}
        filled={weekOpen ? weekFilled(draft.cells, weekOpen) : 0}
        onCopy={() => weekOpen && copyWeekToAll(weekOpen)}
        onSwap={() => weekOpen && setPicking({ kind: 'week', week: weekOpen })}
        onClear={() =>
          weekOpen && changeAll(`Week ${weekOpen} cleared`, (c) => clearWeek(c, weekOpen))
        }
        onClose={() => setWeekOpen(null)}
      />
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

import { ApiError, api, exercisesQuery, putExercise, workoutQuery } from '@project180/client'
import {
  type Exercise,
  formatDuration,
  GROUP_KIND_LABELS,
  GROUP_KINDS,
  type GroupKind,
  HR_ZONES,
  hrZone,
  isOwner,
  MUSCLE_GROUP_LABELS,
  MUSCLE_GROUPS,
  type MuscleGroup,
  matchesExercise,
  type TrackingType,
  WORKOUT_SECTION_LABELS,
  WORKOUT_SECTIONS,
  type WorkoutDetail,
  type WorkoutInput,
  type WorkoutSection,
} from '@project180/shared'
import {
  Button,
  Card,
  Chip,
  cn,
  Field,
  IconButton,
  Input,
  MUSCLE_GROUP_TONE,
  Select,
  Textarea,
  toast,
} from '@project180/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import {
  Archive,
  ArrowLeft,
  Check,
  Copy,
  GripVertical,
  HeartPulse,
  Link2,
  ListOrdered,
  Plus,
  StickyNote,
  Trash2,
  Unlink,
  UserRound,
  X,
} from 'lucide-react'
import { AnimatePresence, Reorder, useDragControls } from 'motion/react'
import { type KeyboardEvent, type ReactNode, useMemo, useState } from 'react'
import { SearchInput, Segmented, Stepper } from '../../components/controls'
import { DeleteForGood } from '../../components/delete-for-good'
import { HistoryControls, useDraftBackup, useDraftHistory } from '../../components/draft-history'
import { useUnsavedChangesGuard } from '../../components/unsaved-changes'
import { VideoButton } from '../../components/video-dialog'

export const Route = createFileRoute('/_dash/workouts_/$workoutId')({
  component: WorkoutEditorPage,
})

interface Row {
  key: string
  exerciseId: number
  exerciseName: string
  muscleGroup: MuscleGroup
  trackingType: TrackingType
  targetSets: number | null
  targetRepsMin: number | null
  targetRepsMax: number | null
  /** Reps for each set (12, 10, 10, 8), or null to use the min–max range. */
  repsPerSet: Array<number | null> | null
  /** Bodyweight in this workout: no weight to log. */
  bodyweight: boolean
  targetSeconds: number | null
  restSeconds: number
  notes: string
  showNotes: boolean
  /** Rows sharing a number are done together (see Draft.groups). */
  group: number | null
  section: WorkoutSection
  /** Endurance targets: km, seconds per km, heart-rate zone 1–5. */
  targetDistanceKm: number | null
  targetPaceSeconds: number | null
  targetHrZone: number | null
}

const SECTION_ORDER: Record<WorkoutSection, number> = { warm_up: 0, main: 1, cool_down: 2 }

/** Warm-up first, cool-down last; order within each part is kept. */
function sortBySection(rows: Row[]): Row[] {
  return rows
    .map((r, i) => ({ r, i }))
    .sort((a, b) => SECTION_ORDER[a.r.section] - SECTION_ORDER[b.r.section] || a.i - b.i)
    .map((x) => x.r)
}

/** "5:30" → 330 seconds per km. */
function parsePace(v: string): number | null {
  const m = v.trim().match(/^(\d{1,2})(?::(\d{1,2}))?$/)
  if (!m) return null
  return Number(m[1]) * 60 + Number(m[2] ?? 0)
}
const showPace = (s: number | null) =>
  s == null ? '' : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

/** How a group of linked exercises is done. */
interface GroupSettings {
  kind: GroupKind
  rounds: number
  /** Intervals: seconds of work per exercise. */
  workSeconds: number | null
  /** Superset/circuit: rest after each round. Intervals: rest after each exercise. */
  restSeconds: number | null
}

interface Draft {
  name: string
  description: string
  estimatedMinutes: number | null
  rows: Row[]
  groups: Record<number, GroupSettings>
}

const GROUP_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

/** Groups only exist while 2+ rows share them; renumbers 1, 2, 3… in order of appearance. */
function normalizeGroups(d: Draft): Draft {
  const counts = new Map<number, number>()
  for (const r of d.rows) if (r.group !== null) counts.set(r.group, (counts.get(r.group) ?? 0) + 1)
  const renumber = new Map<number, number>()
  for (const r of d.rows) {
    if (r.group !== null && (counts.get(r.group) ?? 0) >= 2 && !renumber.has(r.group))
      renumber.set(r.group, renumber.size + 1)
  }
  const groups: Record<number, GroupSettings> = {}
  for (const [from, to] of renumber)
    groups[to] = d.groups[from] ?? {
      kind: 'superset',
      rounds: 3,
      workSeconds: null,
      restSeconds: 90,
    }
  return {
    ...d,
    rows: d.rows.map((r) => ({
      ...r,
      group: r.group !== null ? (renumber.get(r.group) ?? null) : null,
    })),
    groups,
  }
}

const REST_OPTIONS = [0, 30, 45, 60, 90, 120, 150, 180, 240, 300]

function newRow(
  e: Pick<Exercise, 'id' | 'name' | 'muscleGroup' | 'trackingType'>,
  section: WorkoutSection = 'main',
): Row {
  const timed = e.trackingType === 'time' || e.trackingType === 'distance_time'
  // Cardio is usually one continuous block: 1 set of 10 minutes, no rest.
  const cardio = timed && e.muscleGroup === 'cardio'
  return {
    key: crypto.randomUUID(),
    exerciseId: e.id,
    exerciseName: e.name,
    muscleGroup: e.muscleGroup,
    trackingType: e.trackingType,
    targetSets: cardio ? 1 : 3,
    targetRepsMin: timed ? null : 8,
    targetRepsMax: timed ? null : 12,
    repsPerSet: null,
    bodyweight: false,
    targetSeconds: cardio ? 600 : timed ? 60 : null,
    restSeconds: cardio ? 0 : 90,
    notes: '',
    showNotes: false,
    group: null,
    section,
    targetDistanceKm: null,
    targetPaceSeconds: null,
    targetHrZone: null,
  }
}

function fromWorkout(w: WorkoutDetail): Draft {
  return {
    name: w.name,
    description: w.description ?? '',
    estimatedMinutes: w.estimatedMinutes,
    rows: w.exercises.map((e) => ({
      key: crypto.randomUUID(),
      exerciseId: e.exerciseId,
      exerciseName: e.exerciseName,
      muscleGroup: e.muscleGroup,
      trackingType: e.trackingType,
      targetSets: e.targetSets,
      targetRepsMin: e.targetRepsMin,
      targetRepsMax: e.targetRepsMax,
      repsPerSet: e.targetRepsPerSet,
      bodyweight: e.bodyweight,
      targetSeconds: e.targetSeconds,
      restSeconds: e.restSeconds,
      notes: e.notes ?? '',
      showNotes: Boolean(e.notes),
      group: e.supersetGroup,
      section: e.section,
      targetDistanceKm: e.targetDistanceM != null ? e.targetDistanceM / 1000 : null,
      targetPaceSeconds: e.targetPaceSeconds,
      targetHrZone: e.targetHrZone,
    })),
    groups: Object.fromEntries(
      w.groups.map((g) => [
        g.groupNumber,
        { kind: g.kind, rounds: g.rounds, workSeconds: g.workSeconds, restSeconds: g.restSeconds },
      ]),
    ),
  }
}

const EMPTY: Draft = { name: '', description: '', estimatedMinutes: null, rows: [], groups: {} }

/** Roughly 40 seconds of work per set, plus rest. Groups: rounds × (each exercise + the group's rest). */
function estimateMinutes(rows: Row[], groups: Record<number, GroupSettings> = {}) {
  let seconds = 0
  const counted = new Set<number>()
  for (const r of rows) {
    const g = r.group !== null ? groups[r.group] : undefined
    if (!g || r.group === null) {
      seconds += (r.targetSets ?? 0) * ((r.targetSeconds ?? 40) + r.restSeconds)
      continue
    }
    if (counted.has(r.group)) continue
    counted.add(r.group)
    const members = rows.filter((x) => x.group === r.group)
    const work = members.reduce(
      (a, x) => a + (g.kind === 'interval' ? (g.workSeconds ?? 20) : (x.targetSeconds ?? 40)),
      0,
    )
    const rest =
      g.kind === 'interval' ? members.length * (g.restSeconds ?? 10) : (g.restSeconds ?? 90)
    seconds += g.rounds * (work + rest)
  }
  return Math.max(0, Math.round(seconds / 60))
}

/** Per-set reps at exactly `count` sets: blanks take the set before (or 10), extra sets copy the last. */
function fillReps(reps: Array<number | null>, count: number): number[] {
  const out: number[] = []
  for (let i = 0; i < count; i++) out.push(reps[i] || out[i - 1] || 10)
  return out
}

function toInput(d: Draft): WorkoutInput {
  return {
    name: d.name.trim(),
    description: d.description.trim() || null,
    estimatedMinutes:
      d.estimatedMinutes ?? (d.rows.length ? estimateMinutes(d.rows, d.groups) : null),
    exercises: d.rows.map((r) => {
      const g = r.group !== null ? d.groups[r.group] : undefined
      return {
        exerciseId: r.exerciseId,
        // In a group, every exercise is done once per round.
        targetSets: g ? g.rounds : (r.targetSets ?? 1),
        targetRepsMin: r.targetRepsMin,
        targetRepsMax: r.targetRepsMax,
        targetRepsPerSet: r.repsPerSet
          ? fillReps(r.repsPerSet, g ? g.rounds : (r.targetSets ?? 1))
          : null,
        bodyweight: r.bodyweight && r.trackingType === 'weight_reps',
        targetSeconds:
          g?.kind === 'interval' ? (g.workSeconds ?? r.targetSeconds) : r.targetSeconds,
        restSeconds: r.restSeconds,
        supersetGroup: g ? r.group : null,
        section: r.section,
        targetDistanceM: r.targetDistanceKm != null ? Math.round(r.targetDistanceKm * 1000) : null,
        targetPaceSeconds: r.targetPaceSeconds,
        targetHrZone: r.targetHrZone,
        notes: r.notes.trim() || null,
      }
    }),
    groups: Object.entries(d.groups).map(([n, g]) => ({
      groupNumber: Number(n),
      kind: g.kind,
      rounds: g.rounds,
      workSeconds: g.kind === 'interval' ? (g.workSeconds ?? 20) : null,
      restSeconds: g.restSeconds,
    })),
  }
}

function WorkoutEditorPage() {
  const { workoutId } = Route.useParams()
  const { me } = Route.useRouteContext()
  const isNew = workoutId === 'new'
  const workout = useQuery({ ...workoutQuery(Number(workoutId)), enabled: !isNew })
  if (!isNew && !workout.data) {
    return (
      <p className="p-8 font-semibold text-ink-muted">
        {workout.isError ? 'Workout not found.' : 'Loading…'}
      </p>
    )
  }
  return (
    <Builder
      key={workoutId}
      id={isNew ? null : Number(workoutId)}
      initial={workout.data ? fromWorkout(workout.data) : EMPTY}
      canEdit={
        !workout.data ||
        workout.data.createdBy === me.id ||
        isOwner(me.role) ||
        workout.data.clientId !== null
      }
      clientName={
        workout.data?.clientId != null ? (workout.data.clientName ?? 'this client') : null
      }
    />
  )
}

function Builder({
  id,
  initial,
  canEdit,
  clientName,
}: {
  id: number | null
  initial: Draft
  canEdit: boolean
  /** Set when this is a client's personal copy. */
  clientName: string | null
}) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { draft, setDraft, undo, redo, canUndo, canRedo } = useDraftHistory<Draft>(initial)
  const [savedDraft, setSavedDraft] = useState<Draft>(initial)
  const [saved, setSaved] = useState(() => JSON.stringify(toInput(initial)))
  const [error, setError] = useState<string>()
  const [deleting, setDeleting] = useState(false)
  const dirty = JSON.stringify(toInput(draft)) !== saved

  const update = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }))
  const updateRow = (key: string, patch: Partial<Row>) =>
    setDraft((d) => {
      const rows = d.rows.map((r) => (r.key === key ? { ...r, ...patch } : r))
      // Moving to another part: re-sort, and leave any group it was in.
      if (!patch.section) return { ...d, rows }
      return normalizeGroups({
        ...d,
        rows: sortBySection(rows.map((r) => (r.key === key ? { ...r, group: null } : r))),
      })
    })
  const [addTo, setAddTo] = useState<WorkoutSection>('main')
  const removeRow = (key: string) =>
    setDraft((d) => normalizeGroups({ ...d, rows: d.rows.filter((r) => r.key !== key) }))

  /** Joins row i with the row after it into one group (or extends/merges groups). */
  const linkNext = (i: number) =>
    setDraft((d) => {
      const a = d.rows[i]
      const b = d.rows[i + 1]
      if (!a || !b) return d
      const used = Object.keys(d.groups).map(Number)
      const target = a.group ?? b.group ?? Math.max(0, ...used) + 1
      const groups = { ...d.groups }
      if (!groups[target]) {
        const timed = a.trackingType === 'time' || a.trackingType === 'distance_time'
        groups[target] = {
          kind: timed ? 'interval' : 'superset',
          rounds: a.targetSets ?? 3,
          workSeconds: timed ? 20 : null,
          restSeconds: timed ? 10 : 90,
        }
      }
      const merge = b.group !== null && b.group !== target ? b.group : null
      const rows = d.rows.map((r, j) =>
        j === i || j === i + 1 || (merge !== null && r.group === merge)
          ? { ...r, group: target }
          : r,
      )
      return normalizeGroups({ ...d, rows, groups })
    })

  /** Splits a group between row i and the row after it. */
  const unlinkNext = (i: number) =>
    setDraft((d) => {
      const g = d.rows[i]?.group
      if (g == null) return d
      const fresh = Math.max(0, ...Object.keys(d.groups).map(Number)) + 1
      const rows = d.rows.map((r, j) => (j > i && r.group === g ? { ...r, group: fresh } : r))
      const groups = { ...d.groups, [fresh]: { ...(d.groups[g] as GroupSettings) } }
      return normalizeGroups({ ...d, rows, groups })
    })

  const updateGroup = (n: number, patch: Partial<GroupSettings>) =>
    setDraft((d) => ({
      ...d,
      groups: { ...d.groups, [n]: { ...(d.groups[n] as GroupSettings), ...patch } },
    }))
  const ungroup = (n: number) =>
    setDraft((d) =>
      normalizeGroups({
        ...d,
        rows: d.rows.map((r) => (r.group === n ? { ...r, group: null } : r)),
      }),
    )
  const addExercise = (e: Exercise) =>
    setDraft((d) => ({ ...d, rows: sortBySection([...d.rows, newRow(e, addTo)]) }))

  // Warn before leaving with unsaved changes.
  const guard = useUnsavedChangesGuard(dirty, 'workout')
  // A safety copy of unsaved changes in this browser (closed tab, crash, refresh).
  const backup = useDraftBackup(`project180-draft-workout-${id ?? 'new'}`, draft, dirty, (d) =>
    setDraft(d),
  )

  const save = useMutation({
    mutationFn: (input: WorkoutInput) =>
      id
        ? api<{ workout: WorkoutDetail }>(`/workouts/${id}`, { method: 'PUT', body: input })
        : api<{ workout: WorkoutDetail }>('/workouts', { method: 'POST', body: input }),
  })
  const archive = useMutation({ mutationFn: () => api(`/workouts/${id}`, { method: 'DELETE' }) })
  const duplicate = useMutation({
    mutationFn: () =>
      api<{ workout: WorkoutDetail }>(`/workouts/${id}/duplicate`, { method: 'POST' }),
  })

  async function onSave() {
    if (!draft.name.trim()) return setError('Give the workout a name')
    setError(undefined)
    try {
      const input = toInput(draft)
      const { workout } = await save.mutateAsync(input)
      setSaved(JSON.stringify(input))
      setSavedDraft(draft)
      toast({ title: 'Changes saved', description: input.name })
      void queryClient.invalidateQueries({ queryKey: ['workouts'] })
      if (!id)
        await navigate({
          to: '/workouts/$workoutId',
          params: { workoutId: String(workout.id) },
          replace: true,
        })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save the workout.')
    }
  }

  const estimate = estimateMinutes(draft.rows, draft.groups)
  const totalSets = draft.rows.reduce(
    (a, r) => a + ((r.group !== null ? draft.groups[r.group]?.rounds : r.targetSets) ?? 0),
    0,
  )

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center gap-3">
        <Link
          to={clientName ? '/users' : '/workouts'}
          className="grid size-11 place-items-center rounded-sm bg-surface-raised"
          aria-label={clientName ? 'Back to people' : 'Back to workouts'}
        >
          <ArrowLeft className="size-5" aria-hidden />
        </Link>
        <input
          aria-label="Workout name"
          value={draft.name}
          onChange={(e) => update({ name: e.target.value })}
          placeholder="Name this workout, e.g. Leg Day A"
          // biome-ignore lint/a11y/noAutofocus: a new workout starts by naming it
          autoFocus={!id}
          disabled={!canEdit}
          className="min-w-0 flex-1 bg-transparent font-display font-extrabold text-[30px] leading-[38px] tracking-tight outline-none placeholder:text-ink-muted/60"
        />
        <span aria-live="polite" className="font-semibold text-[13px] text-ink-muted">
          {dirty ? 'Unsaved changes' : null}
        </span>
        {id && canEdit && (
          <>
            <IconButton
              label="Make a private copy"
              icon={<Copy aria-hidden />}
              size="lg"
              onClick={async () => {
                const { workout } = await duplicate.mutateAsync()
                toast({ title: 'Copy made', description: workout.name })
                void queryClient.invalidateQueries({ queryKey: ['workouts'] })
                await navigate({
                  to: '/workouts/$workoutId',
                  params: { workoutId: String(workout.id) },
                })
              }}
            />
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
                void queryClient.invalidateQueries({ queryKey: ['workouts'] })
                await navigate({ to: '/workouts' })
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
        {canEdit && (
          <HistoryControls
            canUndo={canUndo}
            canRedo={canRedo}
            onUndo={undo}
            onRedo={redo}
            dirty={dirty}
            onDiscard={() => setDraft(savedDraft)}
            what="workout"
          />
        )}
        {canEdit && (
          <Button onClick={onSave} loading={save.isPending} disabled={!dirty && Boolean(id)}>
            {id ? 'Save' : 'Create workout'}
          </Button>
        )}
      </header>
      {clientName && (
        <p className="flex flex-wrap items-center gap-2 rounded-md bg-brand-soft px-4 py-3 font-semibold text-[14px] text-brand-text">
          <UserRound className="size-4 shrink-0" aria-hidden />
          {clientName}’s own version of this workout. Changes only affect {clientName.split(' ')[0]}
          .
        </p>
      )}
      {backup.banner}
      {error && (
        <p role="alert" className="-mt-3 font-semibold text-[14px] text-danger">
          {error}
        </p>
      )}

      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        {/* A container: exercise rows lay out by the space they actually get, not the window. */}
        <section
          aria-label="Exercises in this workout"
          className="@container flex min-w-0 flex-col gap-3"
        >
          <div className="flex flex-wrap items-center gap-2 font-semibold text-[13px] text-ink-muted">
            <span className="tabular">
              {draft.rows.length} {draft.rows.length === 1 ? 'exercise' : 'exercises'}
            </span>
            ·
            <span className="tabular">
              {totalSets} {totalSets === 1 ? 'set' : 'sets'}
            </span>
            ·<span>about {estimate} min</span>
          </div>
          {draft.rows.length === 0 ? (
            <div className="grid place-items-center rounded-lg border-2 border-border border-dashed px-6 py-16 text-center">
              <p className="font-bold text-[17px]">Add your first exercise</p>
              <p className="mt-1 max-w-sm text-[15px] text-ink-muted">
                Pick from the list on the right. Each one lands here with 3 sets of 8–12 and 90
                seconds rest; adjust as you go.
              </p>
            </div>
          ) : (
            <Reorder.Group
              axis="y"
              values={draft.rows}
              onReorder={(rows) =>
                setDraft((d) => normalizeGroups({ ...d, rows: sortBySection(rows) }))
              }
              className="flex flex-col"
            >
              <AnimatePresence initial={false}>
                {draft.rows.map((row, index) => {
                  const prev = draft.rows[index - 1]
                  const next = draft.rows[index + 1]
                  const inGroup = row.group !== null
                  const first = inGroup && prev?.group !== row.group
                  const last = inGroup && next?.group !== row.group
                  return (
                    <ExerciseRow
                      key={row.key}
                      row={row}
                      index={index}
                      sectionStart={
                        prev?.section !== row.section &&
                        (draft.rows.some((r) => r.section !== 'main') || row.section !== 'main')
                      }
                      disabled={!canEdit}
                      group={
                        row.group !== null && draft.groups[row.group]
                          ? {
                              number: row.group,
                              letter: GROUP_LETTERS[row.group - 1] ?? String(row.group),
                              settings: draft.groups[row.group] as GroupSettings,
                              first,
                              last,
                              size: draft.rows.filter((r) => r.group === row.group).length,
                            }
                          : null
                      }
                      hasNext={next !== undefined && next.section === row.section}
                      linkedToNext={inGroup && next?.group === row.group}
                      onLinkNext={() => linkNext(index)}
                      onUnlinkNext={() => unlinkNext(index)}
                      onGroupChange={(patch) => row.group !== null && updateGroup(row.group, patch)}
                      onUngroup={() => row.group !== null && ungroup(row.group)}
                      onChange={(patch) => updateRow(row.key, patch)}
                      onRemove={() => removeRow(row.key)}
                    />
                  )
                })}
              </AnimatePresence>
            </Reorder.Group>
          )}

          <Card className="mt-3">
            <h2 className="mb-4 font-bold text-[17px]">Details</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Estimated time"
                hint={`Leave empty to use the estimate (${estimate} min)`}
              >
                {(fid) => (
                  <Input
                    id={fid}
                    inputMode="numeric"
                    placeholder={`${estimate}`}
                    value={draft.estimatedMinutes ?? ''}
                    disabled={!canEdit}
                    onChange={(e) => {
                      const n = Number.parseInt(e.target.value, 10)
                      update({ estimatedMinutes: Number.isNaN(n) ? null : n })
                    }}
                  />
                )}
              </Field>
              <div className="sm:col-span-2">
                <Field label="Description" hint="Optional: the goal or a warm-up reminder">
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
            </div>
          </Card>
        </section>

        {canEdit && <ExercisePicker onAdd={addExercise} addTo={addTo} onAddTo={setAddTo} />}
      </div>
      <DeleteForGood
        kind="workout"
        item={deleting && id ? { id, name: draft.name || 'this workout' } : null}
        onClose={() => setDeleting(false)}
        onDeleted={() => {
          guard.allowLeave()
          void navigate({ to: '/workouts' })
        }}
      />
      {guard.dialog}
    </div>
  )
}

interface RowGroup {
  number: number
  letter: string
  settings: GroupSettings
  first: boolean
  last: boolean
  size: number
}

function ExerciseRow({
  row,
  index,
  sectionStart,
  disabled,
  group,
  hasNext,
  linkedToNext,
  onLinkNext,
  onUnlinkNext,
  onGroupChange,
  onUngroup,
  onChange,
  onRemove,
}: {
  row: Row
  index: number
  /** First row of a warm-up / main / cool-down part: show its heading. */
  sectionStart: boolean
  disabled: boolean
  group: RowGroup | null
  hasNext: boolean
  linkedToNext: boolean
  onLinkNext: () => void
  onUnlinkNext: () => void
  onGroupChange: (patch: Partial<GroupSettings>) => void
  onUngroup: () => void
  onChange: (patch: Partial<Row>) => void
  onRemove: () => void
}) {
  const controls = useDragControls()
  const hasVideo = Boolean(
    useQuery(exercisesQuery()).data?.find((e) => e.id === row.exerciseId)?.videoUrl,
  )
  const timed = row.trackingType === 'time' || row.trackingType === 'distance_time'
  // In a group every exercise is done once per round.
  const setCount = group ? group.settings.rounds : (row.targetSets ?? 1)
  const parse = (v: string) => {
    const n = Number.parseInt(v, 10)
    return Number.isNaN(n) ? null : n
  }

  return (
    <Reorder.Item
      value={row}
      // Animate position only: a full layout animation squashes the card while a note opens.
      layout="position"
      dragListener={false}
      dragControls={controls}
      initial={{ opacity: 0, y: -8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, x: 40, transition: { duration: 0.15 } }}
      className={cn(
        'relative flex flex-col',
        group ? 'pl-4' : '',
        !group || group.last ? 'pb-3' : '',
      )}
    >
      {group && (
        <span
          aria-hidden
          className={cn(
            'absolute left-0 w-1 bg-brand',
            group.first ? 'top-0 rounded-t-full' : 'top-0',
            group.last ? 'bottom-3 rounded-b-full' : 'bottom-0',
          )}
        />
      )}
      {sectionStart && <SectionHeading section={row.section} />}
      {group?.first && (
        <GroupHeader
          group={group}
          disabled={disabled}
          onChange={onGroupChange}
          onUngroup={onUngroup}
        />
      )}
      <div className="rounded-lg bg-surface p-4 shadow-card">
        <div className="flex flex-wrap items-end gap-x-4 gap-y-3 @6xl:flex-nowrap">
          {/* Identity: grip, number, name */}
          <div className="flex min-w-0 flex-1 basis-56 items-center gap-3 self-center">
            <button
              type="button"
              aria-label={`Drag to reorder ${row.exerciseName}`}
              onPointerDown={(e) => !disabled && controls.start(e)}
              className="grid h-10 w-6 shrink-0 cursor-grab touch-none place-items-center text-ink-muted active:cursor-grabbing"
            >
              <GripVertical className="size-5" aria-hidden />
            </button>
            <span className="tabular grid size-8 shrink-0 place-items-center rounded-full bg-brand-soft font-extrabold text-[13px] text-brand-text">
              {index + 1}
            </span>
            <div className="min-w-0">
              <p className="truncate font-bold text-[16px]">{row.exerciseName}</p>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <Chip tone={MUSCLE_GROUP_TONE[row.muscleGroup]} className="h-6 text-[12px]">
                  {MUSCLE_GROUP_LABELS[row.muscleGroup]}
                </Chip>
                {row.trackingType === 'weight_reps' && (
                  <button
                    type="button"
                    aria-pressed={row.bodyweight}
                    disabled={disabled}
                    onClick={() => onChange({ bodyweight: !row.bodyweight })}
                    title="Bodyweight: they log reps only, no weight"
                    className={cn(
                      'inline-flex h-6 items-center gap-1 rounded-pill px-2.5 font-bold text-[12px] transition',
                      row.bodyweight
                        ? 'bg-lime text-on-lime'
                        : 'border border-border-strong border-dashed text-ink-muted hover:text-ink',
                    )}
                  >
                    {row.bodyweight && <Check className="size-3" strokeWidth={3} aria-hidden />}
                    Bodyweight
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Targets: every control is 40px tall under an 11px label, so they line up */}
          {!group && (
            <RowField label="Sets">
              <Stepper
                label="sets"
                value={row.targetSets}
                min={1}
                max={20}
                onChange={(v) =>
                  onChange(
                    row.repsPerSet
                      ? { targetSets: v, repsPerSet: fillReps(row.repsPerSet, v ?? 1) }
                      : { targetSets: v },
                  )
                }
              />
            </RowField>
          )}

          {group?.settings.kind === 'interval' ? null : timed && row.muscleGroup === 'cardio' ? (
            <RowField label="Minutes">
              <Input
                // Re-mount when the value changes elsewhere, so the box shows it.
                key={row.targetSeconds ?? 'none'}
                compact
                className="tabular w-20 text-center font-bold"
                inputMode="decimal"
                placeholder="10"
                disabled={disabled}
                defaultValue={row.targetSeconds != null ? +(row.targetSeconds / 60).toFixed(2) : ''}
                onBlur={(e) => {
                  const n = Number.parseFloat(e.target.value.replace(',', '.'))
                  onChange({
                    targetSeconds: Number.isFinite(n) && n > 0 ? Math.round(n * 60) : null,
                  })
                }}
                aria-label="Target minutes, without stopping"
              />
            </RowField>
          ) : timed ? (
            <RowField label="Seconds">
              <Input
                compact
                className="tabular w-20 text-center font-bold"
                inputMode="numeric"
                disabled={disabled}
                value={row.targetSeconds ?? ''}
                onChange={(e) => onChange({ targetSeconds: parse(e.target.value) })}
                aria-label="Target seconds"
              />
            </RowField>
          ) : (
            <RowField label="Reps">
              {/* Same width in both modes, so every row's columns line up. */}
              <div className="flex w-[150px] items-center gap-1.5">
                {row.repsPerSet ? (
                  <span
                    className="tabular flex h-10 min-w-0 flex-1 items-center justify-center truncate rounded-sm border border-border-strong px-2 font-bold text-[14px]"
                    title="Reps for each set: edit them below"
                  >
                    {fillReps(row.repsPerSet, setCount).join(' · ')}
                  </span>
                ) : (
                  <>
                    <Input
                      compact
                      className="tabular w-12 px-0 text-center font-bold"
                      inputMode="numeric"
                      placeholder="min"
                      disabled={disabled}
                      value={row.targetRepsMin ?? ''}
                      onChange={(e) => onChange({ targetRepsMin: parse(e.target.value) })}
                      aria-label="Minimum reps"
                    />
                    <span className="text-ink-muted">–</span>
                    <Input
                      compact
                      className="tabular w-12 px-0 text-center font-bold"
                      inputMode="numeric"
                      placeholder="max"
                      disabled={disabled}
                      value={row.targetRepsMax ?? ''}
                      onChange={(e) => onChange({ targetRepsMax: parse(e.target.value) })}
                      aria-label="Maximum reps"
                    />
                  </>
                )}
                {!disabled && (
                  <IconButton
                    size="sm"
                    label={
                      row.repsPerSet
                        ? 'Use one range for every set'
                        : 'Set the reps set by set (12, 10, 10, 8)'
                    }
                    icon={<ListOrdered aria-hidden />}
                    active={Boolean(row.repsPerSet)}
                    aria-pressed={Boolean(row.repsPerSet)}
                    className="shrink-0"
                    onClick={() =>
                      onChange(
                        row.repsPerSet
                          ? { repsPerSet: null }
                          : {
                              repsPerSet: Array.from(
                                { length: setCount },
                                () => row.targetRepsMax ?? row.targetRepsMin ?? 10,
                              ),
                            },
                      )
                    }
                  />
                )}
              </div>
            </RowField>
          )}

          {!group && (
            <RowField label="Rest">
              <Select
                compact
                className="w-28"
                value={row.restSeconds}
                disabled={disabled}
                onChange={(e) => onChange({ restSeconds: Number(e.target.value) })}
              >
                {REST_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s === 0 ? 'None' : formatDuration(s)}
                  </option>
                ))}
              </Select>
            </RowField>
          )}

          {(row.trackingType === 'distance_time' || row.trackingType === 'time') &&
            group?.settings.kind !== 'interval' && (
              <>
                {row.trackingType === 'distance_time' && (
                  <>
                    <RowField label="Distance (km)">
                      <Input
                        compact
                        className="tabular w-20 text-center font-bold"
                        inputMode="decimal"
                        disabled={disabled}
                        defaultValue={row.targetDistanceKm ?? ''}
                        onBlur={(e) => {
                          const n = Number.parseFloat(e.target.value.replace(',', '.'))
                          onChange({ targetDistanceKm: Number.isFinite(n) ? n : null })
                        }}
                        aria-label="Target distance in km"
                      />
                    </RowField>
                    <RowField label="Pace (/km)">
                      <Input
                        compact
                        className="tabular w-20 text-center font-bold"
                        placeholder="5:30"
                        disabled={disabled}
                        defaultValue={showPace(row.targetPaceSeconds)}
                        onBlur={(e) => onChange({ targetPaceSeconds: parsePace(e.target.value) })}
                        aria-label="Target pace per km, minutes:seconds"
                      />
                    </RowField>
                  </>
                )}
                <RowField label="Heart-rate zone">
                  <Select
                    compact
                    className="w-40"
                    value={row.targetHrZone ?? ''}
                    disabled={disabled}
                    onChange={(e) =>
                      onChange({ targetHrZone: e.target.value ? Number(e.target.value) : null })
                    }
                    aria-label="Heart-rate zone"
                  >
                    <option value="">Any</option>
                    {([1, 2, 3, 4, 5] as const).map((z) => (
                      <option key={z} value={z}>
                        Zone {z} · {HR_ZONES[z].name}
                      </option>
                    ))}
                  </Select>
                </RowField>
              </>
            )}

          <RowField label="Part">
            <Select
              compact
              className="w-32"
              value={row.section}
              disabled={disabled}
              onChange={(e) => onChange({ section: e.target.value as WorkoutSection })}
            >
              {WORKOUT_SECTIONS.map((sct) => (
                <option key={sct} value={sct}>
                  {WORKOUT_SECTION_LABELS[sct]}
                </option>
              ))}
            </Select>
          </RowField>

          {!disabled && (
            <div className="ml-auto flex h-10 items-center gap-1">
              <VideoButton
                exerciseId={row.exerciseId}
                name={row.exerciseName}
                hasVideo={hasVideo}
              />
              <IconButton
                label={row.showNotes ? 'Hide note' : 'Add a note'}
                icon={<StickyNote aria-hidden />}
                size="sm"
                className={cn(row.notes && 'text-sand-text')}
                onClick={() => onChange({ showNotes: !row.showNotes })}
              />
              <IconButton
                label="Remove from workout"
                icon={<X aria-hidden />}
                size="sm"
                tone="danger"
                onClick={onRemove}
              />
            </div>
          )}
        </div>
        {hrZone(row.targetHrZone) && (
          <p className="mt-3 flex items-start gap-2 rounded-md bg-steel/10 px-3 py-2.5 text-[13px]">
            <HeartPulse className="mt-0.5 size-4 shrink-0 text-steel-text" aria-hidden />
            <span>
              <span className="font-bold">
                Zone {row.targetHrZone} · {hrZone(row.targetHrZone)?.name} (
                {hrZone(row.targetHrZone)?.percent} of max heart rate).
              </span>{' '}
              {hrZone(row.targetHrZone)?.feel}
            </span>
          </p>
        )}
        {row.repsPerSet && !timed && (
          <div className="mt-3 flex flex-wrap items-end gap-2 rounded-md bg-surface-raised px-3 py-2.5">
            <span className="mr-1 self-center font-extrabold text-[11px] text-ink-muted uppercase tracking-[0.08em]">
              Reps per set
            </span>
            {fillReps(row.repsPerSet, setCount).map((n, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: one box per set number
              <div key={i} className="flex flex-col items-center gap-1">
                <span className="font-bold text-[11px] text-ink-muted" aria-hidden>
                  Set {i + 1}
                </span>
                <Input
                  aria-label={`Set ${i + 1} reps`}
                  compact
                  className="tabular w-12 px-0 text-center font-bold"
                  inputMode="numeric"
                  disabled={disabled}
                  value={row.repsPerSet?.[i] ?? ''}
                  placeholder={String(n)}
                  onChange={(e) => {
                    const next = [...fillReps(row.repsPerSet ?? [], setCount)] as Array<
                      number | null
                    >
                    next[i] = parse(e.target.value)
                    onChange({ repsPerSet: next })
                  }}
                />
              </div>
            ))}
            <span className="self-center pl-1 text-[12px] text-ink-muted">
              Change the number of sets with Sets.
            </span>
          </div>
        )}
        {row.showNotes && (
          <Input
            className="mt-3"
            aria-label={`Note for ${row.exerciseName}`}
            placeholder="e.g. Pause 1 second at the bottom"
            value={row.notes}
            disabled={disabled}
            onChange={(e) => onChange({ notes: e.target.value })}
          />
        )}
      </div>
      {hasNext && !disabled && (
        <div className={cn('flex h-8 items-center', group && !group.last ? '' : '-mb-1')}>
          <button
            type="button"
            onClick={linkedToNext ? onUnlinkNext : onLinkNext}
            title={
              linkedToNext
                ? 'Do these two separately again'
                : 'Do this and the next exercise back to back. Then pick superset, circuit or intervals, and the rounds.'
            }
            className={cn(
              'mx-auto inline-flex h-7 items-center gap-1.5 rounded-pill px-3 font-bold text-[12px] transition',
              linkedToNext
                ? 'text-ink-muted hover:bg-danger/10 hover:text-danger'
                : 'text-ink-muted opacity-70 hover:bg-brand-soft hover:text-brand-text hover:opacity-100',
            )}
          >
            {linkedToNext ? (
              <Unlink className="size-3.5" aria-hidden />
            ) : (
              <Link2 className="size-3.5" aria-hidden />
            )}
            {linkedToNext ? 'Split from next' : 'Superset with next'}
          </button>
        </div>
      )}
    </Reorder.Item>
  )
}

const SECTION_HINTS: Record<WorkoutSection, string> = {
  warm_up: 'Gets the body ready. Not counted in volume or records.',
  main: 'The workout itself.',
  cool_down: 'Stretch and bring the heart rate down.',
}

function SectionHeading({ section }: { section: WorkoutSection }) {
  return (
    <div className="mt-3 mb-2 flex items-baseline gap-3 first:mt-0">
      <h3 className="font-extrabold text-[12px] text-ink uppercase tracking-[0.16em]">
        {WORKOUT_SECTION_LABELS[section]}
      </h3>
      <span className="font-semibold text-[12px] text-ink-muted">{SECTION_HINTS[section]}</span>
    </div>
  )
}

const INTERVAL_WORK = [10, 15, 20, 30, 40, 45, 60]
const INTERVAL_REST = [0, 5, 10, 15, 20, 30, 45, 60]

/** Above the first exercise of a group: what kind, how many rounds, and the timing. */
function GroupHeader({
  group,
  disabled,
  onChange,
  onUngroup,
}: {
  group: RowGroup
  disabled: boolean
  onChange: (patch: Partial<GroupSettings>) => void
  onUngroup: () => void
}) {
  const g = group.settings
  const interval = g.kind === 'interval'
  return (
    <div className="mb-2 flex flex-wrap items-end gap-x-4 gap-y-3 rounded-lg bg-brand-soft px-4 py-3">
      <div className="flex items-center gap-2 self-center">
        <span className="grid size-8 place-items-center rounded-full bg-brand font-display font-extrabold text-[14px] text-on-brand">
          {group.letter}
        </span>
        <div>
          <p className="font-bold text-[15px] text-brand-text">{GROUP_KIND_LABELS[g.kind]}</p>
          <p className="font-semibold text-[12px] text-ink-muted">
            {group.size} exercises, back to back
          </p>
        </div>
      </div>
      <RowField label="Type">
        <Select
          compact
          className="w-36"
          value={g.kind}
          disabled={disabled}
          onChange={(e) => {
            const kind = e.target.value as GroupKind
            onChange(
              kind === 'interval'
                ? {
                    kind,
                    workSeconds: g.workSeconds ?? 20,
                    restSeconds: g.restSeconds && g.restSeconds <= 60 ? g.restSeconds : 10,
                    rounds: g.rounds || 8,
                  }
                : { kind, restSeconds: g.restSeconds ?? 90 },
            )
          }}
        >
          {GROUP_KINDS.map((k) => (
            <option key={k} value={k}>
              {GROUP_KIND_LABELS[k]}
            </option>
          ))}
        </Select>
      </RowField>
      <RowField label="Rounds">
        <Stepper
          label="rounds"
          value={g.rounds}
          min={1}
          max={50}
          onChange={(v) => onChange({ rounds: v ?? 1 })}
        />
      </RowField>
      {interval ? (
        <>
          <RowField label="Work">
            <Select
              compact
              className="w-24"
              value={g.workSeconds ?? 20}
              disabled={disabled}
              onChange={(e) => onChange({ workSeconds: Number(e.target.value) })}
            >
              {INTERVAL_WORK.map((s) => (
                <option key={s} value={s}>
                  {s}s
                </option>
              ))}
            </Select>
          </RowField>
          <RowField label="Rest">
            <Select
              compact
              className="w-24"
              value={g.restSeconds ?? 10}
              disabled={disabled}
              onChange={(e) => onChange({ restSeconds: Number(e.target.value) })}
            >
              {INTERVAL_REST.map((s) => (
                <option key={s} value={s}>
                  {s === 0 ? 'None' : `${s}s`}
                </option>
              ))}
            </Select>
          </RowField>
        </>
      ) : (
        <RowField label="Rest after round">
          <Select
            compact
            className="w-28"
            value={g.restSeconds ?? 90}
            disabled={disabled}
            onChange={(e) => onChange({ restSeconds: Number(e.target.value) })}
          >
            {REST_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s === 0 ? 'None' : formatDuration(s)}
              </option>
            ))}
          </Select>
        </RowField>
      )}
      {!disabled && (
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto h-10"
          icon={<Unlink className="size-4" aria-hidden />}
          onClick={onUngroup}
        >
          Ungroup
        </Button>
      )}
    </div>
  )
}

function RowField({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex shrink-0 flex-col gap-1.5">
      <span className="font-extrabold text-[11px] text-ink-muted uppercase leading-[14px] tracking-[0.08em]">
        {label}
      </span>
      {children}
    </div>
  )
}

/** Search, filter by muscle, click to add. Enter adds the top match. */
function ExercisePicker({
  onAdd,
  addTo,
  onAddTo,
}: {
  onAdd: (e: Exercise) => void
  addTo: WorkoutSection
  onAddTo: (section: WorkoutSection) => void
}) {
  const queryClient = useQueryClient()
  const exercises = useQuery(exercisesQuery())
  const [search, setSearch] = useState('')
  const [group, setGroup] = useState<MuscleGroup | null>(null)
  const [flash, setFlash] = useState<number | null>(null)

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase()
    const found = (exercises.data ?? []).filter(
      (e) => (!group || e.muscleGroup === group) && matchesExercise(e, q),
    )
    // Name matches first, then ones found by their search words.
    return q
      ? [
          ...found.filter((e) => e.name.toLowerCase().includes(q)),
          ...found.filter((e) => !e.name.toLowerCase().includes(q)),
        ]
      : found
  }, [exercises.data, search, group])
  const exact = matches.some((e) => e.name.toLowerCase() === search.trim().toLowerCase())

  const create = useMutation({
    mutationFn: (name: string) =>
      api<{ exercise: Exercise }>('/exercises', {
        method: 'POST',
        body: { name, muscleGroup: group ?? 'full_body' },
      }),
  })

  function add(e: Exercise) {
    onAdd(e)
    setFlash(e.id)
    setTimeout(() => setFlash(null), 600)
  }

  async function quickCreate() {
    const name = search.trim()
    if (!name) return
    const { exercise } = await create.mutateAsync(name)
    putExercise(queryClient, exercise, true)
    void queryClient.invalidateQueries({ queryKey: ['exercises'] })
    add(exercise)
    setSearch('')
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return
    e.preventDefault()
    const first = matches[0]
    if (first) add(first)
    else void quickCreate()
  }

  return (
    <Card className="xl:sticky xl:top-8">
      <h2 className="font-bold text-[17px]">Add exercises</h2>
      <p className="mt-1 mb-3 text-[13px] text-ink-muted">
        Click to add. Enter adds the top match.
      </p>
      <div className="mb-3">
        <Segmented
          label="Add to"
          value={addTo}
          onChange={onAddTo}
          options={WORKOUT_SECTIONS.map((sct) => ({
            value: sct,
            label: WORKOUT_SECTION_LABELS[sct],
          }))}
        />
      </div>
      <SearchInput
        placeholder="Search or type a new name"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        onKeyDown={onKeyDown}
        autoFocus
      />
      <div className="mt-3 flex flex-wrap gap-1.5">
        {MUSCLE_GROUPS.map((g) => (
          <button
            key={g}
            type="button"
            aria-pressed={group === g}
            onClick={() => setGroup(group === g ? null : g)}
            className={cn(
              'h-7 rounded-pill px-3 font-bold text-[12px] transition',
              group === g
                ? 'bg-brand text-on-brand'
                : 'bg-surface-raised text-ink-muted hover:text-ink',
            )}
          >
            {MUSCLE_GROUP_LABELS[g]}
          </button>
        ))}
      </div>
      <ul className="-mx-2 mt-3 max-h-[52vh] overflow-y-auto">
        {matches.map((e) => (
          <li key={e.id} className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => add(e)}
              className={cn(
                'flex min-w-0 flex-1 items-center gap-3 rounded-md px-2 py-2 text-left transition hover:bg-surface-raised',
                flash === e.id && 'bg-lime/30',
              )}
            >
              <span
                className={cn(
                  'size-2.5 shrink-0 rounded-full',
                  toneDot[MUSCLE_GROUP_TONE[e.muscleGroup]],
                )}
              />
              <span className="flex-1 truncate font-semibold text-[15px]">{e.name}</span>
              <Plus className="size-4 text-brand-text" aria-hidden />
            </button>
            <VideoButton exerciseId={e.id} name={e.name} hasVideo={Boolean(e.videoUrl)} />
          </li>
        ))}
      </ul>
      {search.trim() && !exact && (
        <Button
          variant="secondary"
          block
          className="mt-3"
          loading={create.isPending}
          icon={<Plus className="size-4" aria-hidden />}
          onClick={quickCreate}
        >
          Create “{search.trim()}”{group ? ` (${MUSCLE_GROUP_LABELS[group]})` : ''}
        </Button>
      )}
      {matches.length === 0 && !search.trim() && (
        <p className="mt-3 text-[14px] text-ink-muted">
          No exercises yet. Type a name to create one.
        </p>
      )}
    </Card>
  )
}

const toneDot: Record<string, string> = {
  neutral: 'bg-ink-muted',
  brand: 'bg-brand',
  lime: 'bg-lime',
  clay: 'bg-clay',
  steel: 'bg-steel',
  sand: 'bg-sand',
  mauve: 'bg-mauve',
}

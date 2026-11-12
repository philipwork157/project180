import { ApiError, api, exercisesQuery } from '@project180/client'
import {
  EQUIPMENT,
  EQUIPMENT_LABELS,
  EXERCISE_CATEGORIES,
  EXERCISE_CATEGORY_LABELS,
  type Exercise,
  type ExerciseCategory,
  type ExerciseInput,
  exerciseInput,
  exercisePhotos,
  isOwner,
  MUSCLE_GROUP_LABELS,
  MUSCLE_GROUPS,
  type MuscleGroup,
  matchesExercise,
  TRACKING_TYPE_LABELS,
  TRACKING_TYPES,
} from '@project180/shared'
import {
  Button,
  Card,
  Chip,
  ConfirmDialog,
  cn,
  Drawer,
  EmptyState,
  Field,
  IconButton,
  Input,
  MUSCLE_GROUP_TONE,
  Select,
  Textarea,
  toast,
} from '@project180/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { Archive, ArchiveRestore, Dumbbell, Pencil, Plus, Trash2 } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { SearchInput, Segmented, Toolbar } from '../../components/controls'
import { ExerciseAlternatives } from '../../components/exercise-alternatives'
import { ExercisePhotos, ExerciseThumb } from '../../components/exercise-photo'
import { ExerciseVideo } from '../../components/exercise-video'
import { PageHeader } from '../../components/page-header'
import { VideoButton } from '../../components/video-dialog'

export const Route = createFileRoute('/_dash/exercises')({
  component: ExercisesPage,
})

function ExercisesPage() {
  const { me } = Route.useRouteContext()
  const queryClient = useQueryClient()
  const [view, setView] = useState<'active' | 'archived'>('active')
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<Exercise | null>(null)
  const [panelOpen, setPanelOpen] = useState(false)
  const [deleting, setDeleting] = useState<Exercise | null>(null)
  const [group, setGroup] = useState<(typeof MUSCLE_GROUPS)[number] | null>(null)
  const [category, setCategory] = useState<ExerciseCategory | 'all'>('all')
  const [photo, setPhoto] = useState<'any' | 'with' | 'without'>('any')
  const openNew = () => {
    setEditing(null)
    setError(undefined)
    setPanelOpen(true)
  }
  const openEdit = (ex: Exercise) => {
    setEditing(ex)
    setError(undefined)
    setPanelOpen(true)
  }
  const [error, setError] = useState<string>()
  const active = useQuery(exercisesQuery(false))
  const archived = useQuery(exercisesQuery(true))
  const list = (view === 'active' ? active.data : archived.data) ?? []
  // Each filter's counts reflect the other filters, so the numbers always match what you'd see.
  const hasPhoto = (e: Exercise) => exercisePhotos(e.imageKey).length > 0
  const byPhoto = (e: Exercise) => photo === 'any' || (photo === 'with') === hasPhoto(e)
  const bySearch = (e: Exercise) => matchesExercise(e, search)
  const byGroup = (e: Exercise) => !group || e.muscleGroup === group
  const byCategory = (e: Exercise) => category === 'all' || e.category === category
  const shown = list.filter((e) => byGroup(e) && byCategory(e) && bySearch(e) && byPhoto(e))
  const forTypes = list.filter((e) => byGroup(e) && bySearch(e) && byPhoto(e))
  const forGroups = list.filter((e) => byCategory(e) && bySearch(e) && byPhoto(e))
  const forPhotos = list.filter((e) => byGroup(e) && byCategory(e) && bySearch(e))
  const groupCount = (g: MuscleGroup) => forGroups.filter((e) => e.muscleGroup === g).length
  const withPhotos = shown.filter(hasPhoto).length

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['exercises'] })
  const save = useMutation({
    mutationFn: (input: ExerciseInput) =>
      editing
        ? api(`/exercises/${editing.id}`, { method: 'PATCH', body: input })
        : api('/exercises', { method: 'POST', body: input }),
    onSuccess: invalidate,
  })
  const archive = useMutation({
    mutationFn: (id: number) => api(`/exercises/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  })
  const restore = useMutation({
    mutationFn: (id: number) => api(`/exercises/${id}/restore`, { method: 'POST' }),
    onSuccess: invalidate,
  })

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const raw = Object.fromEntries(new FormData(form))
    const parsed = exerciseInput.safeParse({
      ...raw,
      instructions: raw.instructions || null,
      keywords: raw.keywords || null,
    })
    if (!parsed.success) return setError(parsed.error.issues[0]?.message)
    setError(undefined)
    try {
      await save.mutateAsync(parsed.data)
      toast({ title: editing ? 'Exercise saved' : 'Exercise added', description: parsed.data.name })
      setEditing(null)
      form.reset()
      setPanelOpen(false)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save that exercise.')
    }
  }

  const canEdit = (ex: Exercise) => ex.createdBy === me.id || isOwner(me.role)

  return (
    <>
      <PageHeader
        title="Exercises"
        subtitle="The building blocks of every workout."
        action={
          <Button icon={<Plus className="size-5" aria-hidden />} onClick={openNew}>
            New exercise
          </Button>
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
          placeholder="Search exercises"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </Toolbar>
      <div className="mb-3">
        <Segmented
          label="Type"
          value={category}
          onChange={setCategory}
          options={[
            { value: 'all', label: 'All types', count: forTypes.length },
            ...EXERCISE_CATEGORIES.map((c) => ({
              value: c,
              label: EXERCISE_CATEGORY_LABELS[c],
              count: forTypes.filter((e) => e.category === c).length,
            })),
          ]}
        />
      </div>
      {/* biome-ignore lint/a11y/useSemanticElements: a row of filter pills, not a form fieldset */}
      <div
        role="group"
        className="mb-4 flex flex-wrap items-center gap-1.5"
        aria-label="Filter by muscle group"
      >
        <span className="mr-1 font-extrabold text-[11px] text-ink-muted uppercase tracking-[0.08em]">
          Muscle group
        </span>
        <FilterChip
          active={group === null}
          onClick={() => setGroup(null)}
          label="All"
          count={forGroups.length}
        />
        {/* Groups with nothing in the chosen type are hidden (no Chest under Cardio), except the one picked. */}
        {MUSCLE_GROUPS.filter((g) => groupCount(g) > 0 || group === g).map((g) => (
          <FilterChip
            key={g}
            active={group === g}
            onClick={() => setGroup(group === g ? null : g)}
            label={MUSCLE_GROUP_LABELS[g]}
            count={groupCount(g)}
          />
        ))}
      </div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="font-semibold text-[14px] text-ink-muted" aria-live="polite">
          Showing <span className="font-bold text-ink">{shown.length}</span>{' '}
          {group ? `${MUSCLE_GROUP_LABELS[group].toLowerCase()} ` : ''}
          {category !== 'all' ? `${EXERCISE_CATEGORY_LABELS[category].toLowerCase()} ` : ''}
          exercise{shown.length === 1 ? '' : 's'} · {withPhotos} with photos
        </p>
        {/* biome-ignore lint/a11y/useSemanticElements: a row of filter pills, not a form fieldset */}
        <div
          role="group"
          className="flex flex-wrap items-center gap-1.5"
          aria-label="Filter by photo"
        >
          <span className="mr-1 font-extrabold text-[11px] text-ink-muted uppercase tracking-[0.08em]">
            Photos
          </span>
          <FilterChip active={photo === 'any'} onClick={() => setPhoto('any')} label="Any" />
          <FilterChip
            active={photo === 'with'}
            onClick={() => setPhoto('with')}
            label="Has a photo"
            count={forPhotos.filter(hasPhoto).length}
          />
          <FilterChip
            active={photo === 'without'}
            onClick={() => setPhoto('without')}
            label="Needs a photo"
            count={forPhotos.filter((e) => !hasPhoto(e)).length}
          />
        </div>
      </div>

      {shown.length === 0 ? (
        <EmptyState
          icon={<Dumbbell className="size-7" aria-hidden />}
          title={emptyTitle(
            view,
            search || (group || category !== 'all' || photo !== 'any' ? 'filter' : ''),
          )}
          action={
            view === 'active' && !search && !group && category === 'all' && photo === 'any' ? (
              <Button icon={<Plus className="size-5" aria-hidden />} onClick={openNew}>
                New exercise
              </Button>
            ) : undefined
          }
        >
          {view === 'active' && !search && !group && category === 'all' && photo === 'any'
            ? 'Add the moves you do, like Hip Thrust or Barbell Squat. You’ll pick from these when building workouts.'
            : undefined}
        </EmptyState>
      ) : (
        <Card className="overflow-hidden p-0 md:p-0">
          <div className="hidden grid-cols-[2fr_1fr_1fr_1fr_164px] gap-4 border-border border-b px-5 py-3 font-extrabold text-[11px] text-ink-muted uppercase tracking-[0.08em] md:grid">
            <span>Exercise</span>
            <span>Muscle group</span>
            <span>Equipment</span>
            <span>Tracked by</span>
            <span className="sr-only">Actions</span>
          </div>
          <ul className="divide-y divide-border">
            {shown.map((ex) => (
              <li
                key={ex.id}
                className={cn(
                  'group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-5 py-3.5 transition hover:bg-surface-raised/50 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_164px]',
                  editing?.id === ex.id && panelOpen && 'bg-brand-soft/50',
                )}
              >
                <div className="col-span-2 flex min-w-0 items-center gap-3 md:col-span-1">
                  <ExerciseThumb imageKey={ex.imageKey} />
                  <div className="min-w-0">
                    {canEdit(ex) && view === 'active' ? (
                      <button
                        type="button"
                        onClick={() => openEdit(ex)}
                        className="flex max-w-full items-center gap-2 truncate text-left font-bold text-[16px] hover:text-brand-text"
                      >
                        {ex.name}
                      </button>
                    ) : (
                      <p className="flex items-center gap-2 truncate font-bold text-[16px]">
                        {ex.name}
                      </p>
                    )}
                    {ex.instructions && (
                      <p className="truncate text-[13px] text-ink-muted">{ex.instructions}</p>
                    )}
                  </div>
                </div>
                <div className="flex min-w-0 flex-wrap gap-2">
                  <Chip tone={MUSCLE_GROUP_TONE[ex.muscleGroup]}>
                    {MUSCLE_GROUP_LABELS[ex.muscleGroup]}
                  </Chip>
                  <Chip className="md:hidden">{EQUIPMENT_LABELS[ex.equipment]}</Chip>
                </div>
                <span className="hidden font-semibold text-[14px] md:block">
                  {EQUIPMENT_LABELS[ex.equipment]}
                </span>
                <span className="hidden font-semibold text-[14px] text-ink-muted md:block">
                  {TRACKING_TYPE_LABELS[ex.trackingType]}
                </span>
                <div className="flex justify-end gap-1 max-md:-mr-2">
                  <VideoButton exerciseId={ex.id} name={ex.name} hasVideo={Boolean(ex.videoUrl)} />
                  {canEdit(ex) &&
                    (view === 'active' ? (
                      <>
                        <IconButton
                          label="Edit"
                          icon={<Pencil aria-hidden />}
                          size="sm"
                          className="max-md:hidden"
                          onClick={() => openEdit(ex)}
                        />
                        <IconButton
                          label="Archive: hides it from lists, history is kept"
                          icon={<Archive aria-hidden />}
                          size="sm"
                          onClick={() => archive.mutate(ex.id)}
                        />
                        <IconButton
                          label="Delete for good"
                          icon={<Trash2 aria-hidden />}
                          size="sm"
                          tone="danger"
                          onClick={() => setDeleting(ex)}
                        />
                      </>
                    ) : (
                      <>
                        <Button
                          variant="secondary"
                          size="sm"
                          icon={<ArchiveRestore className="size-4" aria-hidden />}
                          onClick={() => restore.mutate(ex.id)}
                        >
                          Restore
                        </Button>
                        <IconButton
                          label="Delete for good"
                          icon={<Trash2 aria-hidden />}
                          size="sm"
                          tone="danger"
                          onClick={() => setDeleting(ex)}
                        />
                      </>
                    ))}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <DeleteExercise
        exercise={deleting}
        onClose={() => setDeleting(null)}
        onArchive={(id) => archive.mutate(id)}
        canArchive={view === 'active'}
      />

      <Drawer
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        title={editing ? 'Edit exercise' : 'New exercise'}
        description={editing ? editing.name : 'Add it once, then use it in any workout.'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setPanelOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="exercise-form" loading={save.isPending}>
              {editing ? 'Save changes' : 'Add exercise'}
            </Button>
          </>
        }
      >
        {/* key resets the form's default values when switching exercise */}
        <form
          id="exercise-form"
          key={editing?.id ?? 'new'}
          onSubmit={onSubmit}
          className="flex flex-col gap-5"
        >
          <Field label="Name">
            {(id) => (
              <Input
                id={id}
                name="name"
                placeholder="Hip Thrust"
                defaultValue={editing?.name}
                autoFocus
                required
              />
            )}
          </Field>
          <div className="flex flex-col gap-1.5">
            <span className="font-bold text-[13px]">Muscle group</span>
            <MuscleGroupPicker defaultValue={editing?.muscleGroup ?? group ?? 'legs'} />
          </div>
          <Field label="Type" hint="Mobility & stretching suits warm-ups and cool-downs.">
            {(id) => (
              <Select id={id} name="category" defaultValue={editing?.category ?? 'strength'}>
                {EXERCISE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {EXERCISE_CATEGORY_LABELS[c]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Equipment">
              {(id) => (
                <Select id={id} name="equipment" defaultValue={editing?.equipment ?? 'barbell'}>
                  {EQUIPMENT.map((e) => (
                    <option key={e} value={e}>
                      {EQUIPMENT_LABELS[e]}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Track by">
              {(id) => (
                <Select
                  id={id}
                  name="trackingType"
                  defaultValue={editing?.trackingType ?? 'weight_reps'}
                >
                  {TRACKING_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {TRACKING_TYPE_LABELS[t]}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>
          <Field
            label="Search words"
            hint="Optional. Other names and the muscles it works, so search finds it."
          >
            {(id) => (
              <Input
                id={id}
                name="keywords"
                placeholder="hamstring curl, hamstrings"
                defaultValue={editing?.keywords ?? ''}
              />
            )}
          </Field>
          <Field label="Form cues" hint="Optional. Shown during the workout." error={error}>
            {(id) => (
              <Textarea
                id={id}
                name="instructions"
                placeholder="Drive through your heels…"
                defaultValue={editing?.instructions ?? ''}
              />
            )}
          </Field>
        </form>
        {editing ? (
          <div className="mt-6 border-border border-t pt-6">
            <ExercisePhotos exercise={editing} />
            <div className="mt-6">
              <ExerciseVideo exercise={editing} />
            </div>
            <div className="mt-6">
              <ExerciseAlternatives exercise={editing} />
            </div>
          </div>
        ) : (
          <p className="mt-6 border-border border-t pt-6 text-[13px] text-ink-muted">
            Save the exercise first, then add photos, a video and alternatives.
          </p>
        )}
      </Drawer>
    </>
  )
}

/** Tappable muscle-group chips that post as the form field `muscleGroup`. */
function MuscleGroupPicker({ defaultValue }: { defaultValue: (typeof MUSCLE_GROUPS)[number] }) {
  const [value, setValue] = useState(defaultValue)
  return (
    <div role="radiogroup" aria-label="Muscle group" className="flex flex-wrap gap-1.5">
      <input type="hidden" name="muscleGroup" value={value} />
      {MUSCLE_GROUPS.map((g) => (
        // biome-ignore lint/a11y/useSemanticElements: a styled pill group; the hidden input carries the value
        <button
          key={g}
          type="button"
          role="radio"
          aria-checked={value === g}
          onClick={() => setValue(g)}
          className={cn(
            'h-9 rounded-pill px-3.5 font-bold text-[13px] transition',
            value === g
              ? 'bg-brand text-on-brand'
              : 'bg-surface-raised text-ink-muted hover:text-ink',
          )}
        >
          {MUSCLE_GROUP_LABELS[g]}
        </button>
      ))}
    </div>
  )
}

function emptyTitle(view: 'active' | 'archived', search: string) {
  if (search) return 'No matches'
  return view === 'active' ? 'No exercises yet' : 'Nothing archived'
}

interface Usage {
  workouts: Array<{ id: number; name: string; archived: boolean }>
  loggedSets: number
  /** Past workouts it was in (or swapped out of), even with nothing logged. */
  pastWorkouts: number
}

/** Delete for good, but only if no workout uses it and nothing has been logged with it. */
function DeleteExercise({
  exercise,
  onClose,
  onArchive,
  canArchive,
}: {
  exercise: Exercise | null
  onClose: () => void
  onArchive: (id: number) => void
  canArchive: boolean
}) {
  const queryClient = useQueryClient()
  const usage = useQuery({
    queryKey: ['exercises', exercise?.id, 'usage'],
    queryFn: async () => (await api<{ usage: Usage }>(`/exercises/${exercise?.id}/usage`)).usage,
    enabled: exercise !== null,
    staleTime: 0,
  })
  const [error, setError] = useState<string>()
  const remove = useMutation({
    mutationFn: (id: number) => api(`/exercises/${id}/permanent`, { method: 'DELETE' }),
    onSuccess: (_, id) => {
      // Drop it from every cached exercise list now; refresh in the background.
      queryClient.setQueriesData<Exercise[]>({ queryKey: ['exercises'] }, (list) =>
        Array.isArray(list) ? list.filter((e) => e.id !== id) : list,
      )
      void queryClient.invalidateQueries({ queryKey: ['exercises'] })
      toast({ title: 'Exercise deleted' })
      onClose()
    },
  })
  const u = usage.data
  const inUse = Boolean(u && (u.workouts.length > 0 || u.loggedSets > 0 || u.pastWorkouts > 0))

  return (
    <ConfirmDialog
      open={exercise !== null}
      title={inUse ? `${exercise?.name} is in use` : `Delete ${exercise?.name}?`}
      confirmLabel="Delete for good"
      loading={remove.isPending}
      confirmDisabled={usage.isPending || inUse}
      onClose={() => {
        setError(undefined)
        onClose()
      }}
      extraAction={
        inUse && exercise && canArchive ? (
          <Button
            variant="secondary"
            onClick={() => {
              onArchive(exercise.id)
              onClose()
            }}
          >
            Archive instead
          </Button>
        ) : undefined
      }
      onConfirm={async () => {
        if (!exercise) return
        setError(undefined)
        try {
          await remove.mutateAsync(exercise.id)
        } catch (err) {
          setError(err instanceof ApiError ? err.message : 'Could not delete it.')
        }
      }}
    >
      {usage.isPending ? (
        <p>Checking where it’s used…</p>
      ) : inUse && u ? (
        <div className="flex flex-col gap-3">
          <p>
            It can’t be deleted because that would break workouts and history. Archive it to hide it
            from lists.
          </p>
          {u.workouts.length > 0 && (
            <div>
              <p className="font-bold text-ink">
                Used in {u.workouts.length === 1 ? 'this workout' : 'these workouts'}:
              </p>
              <ul className="mt-1 list-inside list-disc">
                {u.workouts.map((w) => (
                  <li key={w.id}>
                    {w.name}
                    {w.archived ? ' (archived)' : ''}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {u.loggedSets > 0 && (
            <p>
              <b className="text-ink">{u.loggedSets}</b> logged{' '}
              {u.loggedSets === 1 ? 'set' : 'sets'} in workout history.
            </p>
          )}
          {u.loggedSets === 0 && u.pastWorkouts > 0 && (
            <p>
              In <b className="text-ink">{u.pastWorkouts}</b> past{' '}
              {u.pastWorkouts === 1 ? 'workout' : 'workouts'}, with nothing logged.
            </p>
          )}
        </div>
      ) : (
        <p>Nothing uses it yet. This can’t be undone.</p>
      )}
      {error && <p className="mt-3 font-semibold text-danger">{error}</p>}
    </ConfirmDialog>
  )
}

function FilterChip({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean
  onClick: () => void
  label: string
  count?: number
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-pill px-3 font-bold text-[13px] transition',
        active ? 'bg-brand text-on-brand' : 'bg-surface text-ink-muted shadow-card hover:text-ink',
      )}
    >
      {label}
      {count !== undefined && (
        <span
          className={cn(
            'tabular font-semibold text-[12px]',
            active ? 'opacity-80' : 'text-ink-muted/80',
          )}
        >
          {count}
        </span>
      )}
    </button>
  )
}

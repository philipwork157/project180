import { ApiError, quickWorkoutOptionsQuery, swapOptionsQuery } from '@project180/client'
import {
  EQUIPMENT_LABELS,
  estimateQuickMinutes,
  exercisePhotos,
  GROUP_KIND_LABELS,
  GROUP_KINDS,
  linkQuickNext,
  MUSCLE_GROUP_LABELS,
  type MuscleGroup,
  matchesExercise,
  moveQuick,
  newQuickTarget,
  QUICK_MAX_EXERCISES,
  QUICK_MAX_MINUTES,
  QUICK_MAX_REPS,
  QUICK_MAX_SECONDS,
  QUICK_MAX_SETS,
  QUICK_MIN_SECONDS,
  type QuickGroup,
  type QuickGroups,
  type QuickTarget,
  type QuickWorkoutSource,
  quickGroupsFrom,
  quickPayload,
  quickReps,
  quickTargetFrom,
  quickUsesMinutes,
  quickWorkoutName,
  repsLabel,
  type SwapCandidate,
  settleQuick,
  type TrackingType,
  ungroupQuick,
  unlinkQuickNext,
  updateQuickGroup,
  withQuickDistance,
  withQuickReps,
  withQuickRest,
  withQuickSeconds,
  withQuickSets,
} from '@project180/shared'
import { Button, cn, IconButton, Input, toast } from '@project180/ui'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Dumbbell,
  GripVertical,
  Link2,
  Minus,
  Play,
  Plus,
  Search,
  Trash2,
  Unlink,
  Zap,
} from 'lucide-react'
import { AnimatePresence, motion, Reorder, useDragControls } from 'motion/react'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { useStartQuickWorkout } from '../lib/use-start-workout'
import { Sheet } from './sheet'

/** Just enough of an exercise to show it in the builder. */
interface QuickExercise {
  id: number
  name: string
  muscleGroup: MuscleGroup
  trackingType: TrackingType
  imageKey: string | null
}

interface QuickItem {
  key: string
  exercise: QuickExercise
  target: QuickTarget
  /** Timed exercises: shown in minutes (cardio) or seconds (holds); they can switch. */
  minutes: boolean
}

interface Draft {
  items: QuickItem[]
  /** Supersets, circuits and intervals, by group number (target.supersetGroup). */
  groups: QuickGroups
  /** Started from one of their workouts: its name comes along. */
  source: { id: number; name: string } | null
  /** The new session's id: a retry after poor signal returns the same session. */
  clientUuid: string
}

const emptyDraft = (): Draft => ({
  items: [],
  groups: {},
  source: null,
  clientUuid: crypto.randomUUID(),
})
const RESULTS_SHOWN = 60
const GROUP_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

/**
 * "Build a quick workout": the entry point on Today plus the builder sheet. The draft lives
 * here, so closing the sheet by accident keeps what was picked.
 * prominent = nothing else to do today (rest day, done, no program): a full card.
 * Otherwise a quieter row under today's workout, so the program stays the main thing.
 */
export function QuickWorkoutEntry({ prominent }: { prominent: boolean }) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const start = useStartQuickWorkout()
  const close = () => setOpen(false)

  return (
    <>
      {prominent ? (
        <section className="flex flex-col gap-4 rounded-xl bg-surface p-5 shadow-card sm:flex-row sm:items-center md:p-6">
          <span className="grid size-12 shrink-0 place-items-center rounded-full bg-clay/20 text-clay-text">
            <Zap className="size-6" aria-hidden />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <h2 className="font-bold text-[17px]">Want to train anyway?</h2>
            <p className="text-[14px] text-ink-muted">
              Build a quick workout from your exercises, or start from one of your workouts.
            </p>
          </div>
          <Button
            size="lg"
            className="w-full sm:w-auto"
            icon={<Plus className="size-5" aria-hidden />}
            onClick={() => setOpen(true)}
          >
            {draft.items.length ? 'Back to your workout' : 'Build a quick workout'}
          </Button>
        </section>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="group flex min-h-14 w-full items-center gap-3 rounded-lg bg-surface px-4 py-3 text-left shadow-card transition hover:ring-2 hover:ring-brand/30 active:scale-[0.99]"
        >
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-clay/20 text-clay-text">
            <Zap className="size-5" aria-hidden />
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="font-bold text-[15px]">
              {draft.items.length ? 'Back to your quick workout' : 'Or build a quick workout'}
            </span>
            <span className="truncate text-[13px] text-ink-muted">
              Pick your own exercises for an extra session.
            </span>
          </span>
          <ChevronRight
            className="size-5 shrink-0 text-ink-muted transition group-hover:translate-x-0.5"
            aria-hidden
          />
        </button>
      )}

      <Sheet open={open} onClose={close} label="Build a quick workout">
        <Builder
          draft={draft}
          onChange={setDraft}
          starting={start.isPending}
          error={
            start.error
              ? start.error instanceof ApiError
                ? start.error.message
                : 'Couldn’t start it. Check your signal and try again.'
              : null
          }
          onStart={() => {
            const { exercises, groups } = quickPayload(draft)
            start.mutate(
              {
                clientUuid: draft.clientUuid,
                name: quickWorkoutName(
                  draft.items.map((i) => i.exercise.muscleGroup),
                  draft.source?.name,
                ),
                sourceWorkoutId: draft.source?.id ?? null,
                exercises,
                groups,
              },
              {
                onSuccess: () => {
                  close()
                  setDraft(emptyDraft())
                },
              },
            )
          }}
        />
      </Sheet>
    </>
  )
}

function newItem(e: QuickExercise, target: QuickTarget): QuickItem {
  return {
    key: crypto.randomUUID(),
    exercise: e,
    target,
    minutes: quickUsesMinutes(e.muscleGroup, e.trackingType, target.targetSeconds),
  }
}

function Builder({
  draft,
  onChange,
  starting,
  error,
  onStart,
}: {
  draft: Draft
  onChange: (draft: Draft) => void
  starting: boolean
  error: string | null
  onStart: () => void
}) {
  // On a phone the list and the exercise picker take turns; on wider screens they sit side by side.
  const [view, setView] = useState<'list' | 'add'>(draft.items.length ? 'list' : 'add')
  const sources = useQuery(quickWorkoutOptionsQuery)
  const top = useRef<HTMLDivElement>(null)
  // Switching between the list and the picker starts at the top, not mid-way down the last one.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when the view changes
  useEffect(() => {
    top.current?.scrollIntoView({ block: 'start' })
  }, [view])
  const items = draft.items
  const chosen = new Set(items.map((i) => i.exercise.id))
  const full = items.length >= QUICK_MAX_EXERCISES

  /** Order and groups change together; the source name goes once the list is empty. */
  const apply = (next: { items: QuickItem[]; groups: QuickGroups }) =>
    onChange({ ...draft, ...next, source: next.items.length ? draft.source : null })

  const add = (e: SwapCandidate) => {
    if (chosen.has(e.id)) {
      const at = items.findIndex((i) => i.exercise.id === e.id)
      apply(
        settleQuick(
          { items: items.filter((i) => i.exercise.id !== e.id), groups: draft.groups },
          at,
        ),
      )
      return
    }
    if (full) return
    apply({
      items: [...items, newItem(e, newQuickTarget(e.id, e.trackingType, e.muscleGroup))],
      groups: draft.groups,
    })
  }

  const startFrom = (w: QuickWorkoutSource) => {
    const previous = draft
    onChange({
      ...draft,
      source: { id: w.id, name: w.name },
      groups: quickGroupsFrom(w.groups),
      items: w.exercises.map((x) =>
        newItem(
          {
            id: x.exerciseId,
            name: x.exerciseName,
            muscleGroup: x.muscleGroup,
            trackingType: x.trackingType,
            imageKey: x.imageKey,
          },
          quickTargetFrom(x),
        ),
      ),
    })
    setView('list')
    if (previous.items.length)
      toast({
        title: `Loaded ${w.name}`,
        description: 'Your earlier picks were replaced.',
        action: { label: 'Undo', onClick: () => onChange(previous) },
      })
  }

  const payload = quickPayload(draft)
  const minutes = estimateQuickMinutes(payload.exercises, payload.groups)
  const summary = items.length
    ? `${items.length} ${items.length === 1 ? 'exercise' : 'exercises'} · ~${minutes} min`
    : 'Add at least one exercise'

  return (
    <div ref={top} className="flex scroll-mt-20 flex-col gap-5 pt-1">
      <div className="flex flex-col gap-1 pr-14">
        <h2 className="font-display font-extrabold text-[24px] leading-7">Quick workout</h2>
        <p className="font-semibold text-[14px] text-ink-muted">
          Pick exercises, set your sets and reps, then start. Your coach sees it with your other
          workouts.
        </p>
      </div>

      {sources.data && sources.data.workouts.length > 0 && (
        <div className="flex flex-col gap-2">
          <Label>Start from one of your workouts</Label>
          <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5 md:mx-0 md:flex-wrap md:px-0">
            {sources.data.workouts.map((w) => {
              const on = draft.source?.id === w.id
              return (
                <button
                  key={w.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => startFrom(w)}
                  className={cn(
                    'inline-flex h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-pill px-4 font-bold text-[14px] transition active:scale-[0.97]',
                    on
                      ? 'bg-brand text-on-brand'
                      : 'bg-surface-raised text-ink hover:ring-[1.5px] hover:ring-border-strong hover:ring-inset',
                  )}
                >
                  {on && <Check className="size-4" strokeWidth={3} aria-hidden />}
                  {w.name}
                  <span className={cn('font-semibold', on ? 'opacity-80' : 'text-ink-muted')}>
                    {w.exercises.length}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className={cn('flex min-w-0 flex-col gap-4', view === 'list' && 'max-md:hidden')}>
          <button
            type="button"
            onClick={() => setView('list')}
            className="-ml-2 inline-flex h-11 items-center gap-2 self-start rounded-sm px-2 font-bold text-[14px] text-ink-muted transition hover:text-ink md:hidden"
          >
            <ArrowLeft className="size-4" aria-hidden />
            Your workout ({items.length})
          </button>
          <ExercisePicker chosen={chosen} full={full} onPick={add} />
        </div>

        <div className={cn('flex min-w-0 flex-col gap-4', view === 'add' && 'max-md:hidden')}>
          <div className="flex items-baseline justify-between gap-3">
            <Label>
              Your workout
              {draft.source && <span className="normal-case"> · from {draft.source.name}</span>}
            </Label>
            {items.length > 0 && (
              <button
                type="button"
                onClick={() => onChange({ ...draft, items: [], groups: {}, source: null })}
                className="h-11 shrink-0 font-bold text-[13px] text-ink-muted hover:text-ink"
              >
                Clear
              </button>
            )}
          </div>

          {items.length === 0 ? (
            <p className="rounded-md border-[1.5px] border-border-strong border-dashed p-4 text-[14px] text-ink-muted">
              Nothing yet. Add exercises, or start from one of your workouts above.
            </p>
          ) : (
            <>
              {items.length > 1 && (
                <p className="flex flex-wrap items-center gap-x-1 gap-y-1 text-[13px] text-ink-muted">
                  Drag
                  <GripVertical className="size-4" aria-hidden />
                  to change the order. Tap
                  <span className="inline-flex items-center gap-1 font-bold text-ink">
                    <Link2 className="size-3.5" aria-hidden />
                    Superset
                  </span>
                  between two to do them back to back.
                </p>
              )}
              <WorkoutList draft={draft} onChange={apply} />
            </>
          )}

          <Button
            variant="secondary"
            size="lg"
            block
            className="md:hidden"
            icon={<Plus className="size-5" aria-hidden />}
            onClick={() => setView('add')}
          >
            Add exercises
          </Button>

          <div className="flex flex-col gap-3 max-md:sticky max-md:bottom-0 max-md:z-10 max-md:-mx-5 max-md:border-border max-md:border-t max-md:bg-surface max-md:px-5 max-md:pt-3 max-md:pb-safe md:sticky md:bottom-0 md:z-10 md:bg-surface md:pt-3 md:pb-4">
            {error && (
              <p
                role="alert"
                className="rounded-md bg-danger/10 p-3 font-semibold text-[14px] text-danger"
              >
                {error}
              </p>
            )}
            <Button
              size="lg"
              block
              loading={starting}
              disabled={items.length === 0}
              icon={<Play className="size-5 fill-current" aria-hidden />}
              onClick={onStart}
            >
              Start workout
            </Button>
            <p className="pb-3 text-center font-semibold text-[13px] text-ink-muted md:pb-0">
              {summary}
            </p>
          </div>
        </div>
      </div>

      {/* Phone, while picking: a way back to the list that's always in thumb reach. */}
      {view === 'add' && (
        <div className="sticky bottom-0 z-10 -mx-5 border-border border-t bg-surface px-5 pt-3 pb-safe md:hidden">
          <Button size="lg" block className="mb-3" onClick={() => setView('list')}>
            {items.length ? `Done · ${summary}` : 'Done'}
          </Button>
        </div>
      )}
    </div>
  )
}

/** The chosen exercises: drag to reorder, link neighbours into a superset/circuit/intervals. */
function WorkoutList({
  draft,
  onChange,
}: {
  draft: Draft
  onChange: (next: { items: QuickItem[]; groups: QuickGroups }) => void
}) {
  const { items, groups } = draft
  // While dragging, the order changes freely; groups are tidied when it's dropped.
  const state = { items, groups }

  return (
    <Reorder.Group
      axis="y"
      values={items}
      onReorder={(next) => onChange({ items: next, groups })}
      className="flex select-none flex-col"
    >
      <AnimatePresence initial={false}>
        {items.map((item, index) => {
          const g = item.target.supersetGroup ?? null
          const prev = items[index - 1]
          const next = items[index + 1]
          const settings = g !== null ? groups[g] : undefined
          const inGroup = settings !== undefined
          return (
            <ItemRow
              key={item.key}
              item={item}
              index={index}
              group={
                inGroup && g !== null
                  ? {
                      number: g,
                      letter: GROUP_LETTERS[g - 1] ?? String(g),
                      settings,
                      first: prev?.target.supersetGroup !== g,
                      last: next?.target.supersetGroup !== g,
                      size: items.filter((i) => i.target.supersetGroup === g).length,
                    }
                  : null
              }
              hasNext={next !== undefined}
              linkedToNext={inGroup && next?.target.supersetGroup === g}
              onDragEnd={() => {
                const at = items.findIndex((i) => i.key === item.key)
                onChange(settleQuick(state, at))
              }}
              onMove={(by) => onChange(moveQuick(state, index, index + by))}
              onLinkNext={() => onChange(linkQuickNext(state, index))}
              onUnlinkNext={() => onChange(unlinkQuickNext(state, index))}
              onGroupChange={(patch) => g !== null && onChange(updateQuickGroup(state, g, patch))}
              onUngroup={() => g !== null && onChange(ungroupQuick(state, g))}
              onChange={(patch) =>
                onChange({
                  items: items.map((i) => (i.key === item.key ? { ...i, ...patch } : i)),
                  groups,
                })
              }
              onRemove={() =>
                onChange(
                  settleQuick({ items: items.filter((i) => i.key !== item.key), groups }, index),
                )
              }
            />
          )
        })}
      </AnimatePresence>
    </Reorder.Group>
  )
}

interface RowGroup {
  number: number
  letter: string
  settings: QuickGroup
  first: boolean
  last: boolean
  size: number
}

function ItemRow({
  item,
  index,
  group,
  hasNext,
  linkedToNext,
  onDragEnd,
  onMove,
  onLinkNext,
  onUnlinkNext,
  onGroupChange,
  onUngroup,
  onChange,
  onRemove,
}: {
  item: QuickItem
  index: number
  group: RowGroup | null
  hasNext: boolean
  linkedToNext: boolean
  onDragEnd: () => void
  onMove: (by: -1 | 1) => void
  onLinkNext: () => void
  onUnlinkNext: () => void
  onGroupChange: (patch: Partial<QuickGroup>) => void
  onUngroup: () => void
  onChange: (patch: Partial<QuickItem>) => void
  onRemove: () => void
}) {
  const controls = useDragControls()
  const { exercise: e, target: t } = item
  const timed = e.trackingType === 'time' || e.trackingType === 'distance_time'
  const hasReps = e.trackingType === 'weight_reps' || e.trackingType === 'reps'
  const interval = group?.settings.kind === 'interval'
  const coachReps = repsLabel({
    targetRepsPerSet: t.targetRepsPerSet,
    targetRepsMin: t.targetRepsMin ?? null,
    targetRepsMax: t.targetRepsMax ?? null,
  })
  const showCoachReps = hasReps && coachReps !== String(quickReps(t))
  const setTarget = (target: QuickTarget) => onChange({ target })
  const seconds = t.targetSeconds ?? (item.minutes ? 1200 : 30)

  return (
    <Reorder.Item
      value={item}
      layout="position"
      dragListener={false}
      dragControls={controls}
      onDragEnd={onDragEnd}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -16, transition: { duration: 0.15 } }}
      className={cn('relative flex flex-col', group && 'pl-3', (!group || group.last) && 'pb-2')}
    >
      {group && (
        <span
          aria-hidden
          className={cn(
            'absolute left-0 w-1 bg-brand',
            group.first ? 'top-0 rounded-t-full' : 'top-0',
            group.last ? 'bottom-2 rounded-b-full' : 'bottom-0',
          )}
        />
      )}
      {group?.first && <GroupHeader group={group} onChange={onGroupChange} onUngroup={onUngroup} />}
      <div className="flex flex-col gap-3 rounded-md bg-surface-raised p-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label={`Move ${e.name}: drag, or use the up and down arrow keys`}
            onPointerDown={(ev) => controls.start(ev)}
            onKeyDown={(ev) => {
              if (ev.key === 'ArrowUp') {
                ev.preventDefault()
                onMove(-1)
              }
              if (ev.key === 'ArrowDown') {
                ev.preventDefault()
                onMove(1)
              }
            }}
            className="-ml-1 grid h-11 w-8 shrink-0 cursor-grab touch-none place-items-center rounded-sm text-ink-muted transition hover:bg-surface hover:text-ink active:cursor-grabbing"
          >
            <GripVertical className="size-5" aria-hidden />
          </button>
          <span className="tabular w-4 shrink-0 text-center font-display font-extrabold text-[15px] text-ink-muted">
            {index + 1}
          </span>
          <Thumb imageKey={e.imageKey} />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-bold text-[15px]">{e.name}</span>
            <span className="mt-0.5 block truncate font-semibold text-[13px] text-ink-muted">
              {MUSCLE_GROUP_LABELS[e.muscleGroup]}
              {showCoachReps && ` · ${coachReps} reps`}
            </span>
          </span>
          <IconButton
            label={`Remove ${e.name}`}
            icon={<Trash2 aria-hidden />}
            size="lg"
            className="bg-surface"
            onClick={onRemove}
          />
        </div>
        <div className="flex flex-wrap gap-2 sm:pl-10">
          {/* In a group, sets follow the group's rounds. */}
          {!group && (
            <TapStepper
              label="Sets"
              value={t.targetSets}
              min={1}
              max={QUICK_MAX_SETS}
              onChange={(n) => setTarget(withQuickSets(t, n))}
            />
          )}
          {hasReps && (
            <TapStepper
              label="Reps"
              value={quickReps(t)}
              min={1}
              max={QUICK_MAX_REPS}
              onChange={(n) => setTarget(withQuickReps(t, n))}
            />
          )}
          {timed && !interval && (
            <div className="flex items-center gap-1">
              {item.minutes ? (
                <TapStepper
                  label="Minutes"
                  value={Math.max(1, Math.round(seconds / 60))}
                  min={1}
                  max={QUICK_MAX_MINUTES}
                  step={5}
                  onChange={(n) => setTarget(withQuickSeconds(t, n * 60))}
                />
              ) : (
                <TapStepper
                  label="Seconds"
                  value={seconds}
                  min={QUICK_MIN_SECONDS}
                  max={QUICK_MAX_SECONDS}
                  step={15}
                  onChange={(n) => setTarget(withQuickSeconds(t, n))}
                />
              )}
              <button
                type="button"
                onClick={() => onChange({ minutes: !item.minutes })}
                aria-label={item.minutes ? 'Use seconds instead' : 'Use minutes instead'}
                className="h-11 rounded-pill px-3 font-bold text-[12px] text-ink-muted transition hover:bg-surface hover:text-ink"
              >
                {item.minutes ? 'in sec' : 'in min'}
              </button>
            </div>
          )}
          {e.trackingType === 'distance_time' && (
            <TapStepper
              label="Km"
              value={(t.targetDistanceM ?? 0) / 1000}
              min={0}
              max={1000}
              step={0.5}
              decimal
              onChange={(n) => setTarget(withQuickDistance(t, n))}
            />
          )}
          {!group && (
            <TapStepper
              label="Rest s"
              value={t.restSeconds ?? 90}
              min={0}
              max={900}
              step={15}
              onChange={(n) => setTarget(withQuickRest(t, n))}
            />
          )}
        </div>
      </div>
      {hasNext && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={linkedToNext ? onUnlinkNext : onLinkNext}
            className={cn(
              'inline-flex h-11 items-center gap-1.5 rounded-pill px-4 font-bold text-[13px] transition',
              linkedToNext
                ? 'text-ink-muted hover:bg-danger/10 hover:text-danger'
                : 'text-ink-muted hover:bg-brand-soft hover:text-brand-text',
            )}
          >
            {linkedToNext ? (
              <Unlink className="size-4" aria-hidden />
            ) : (
              <Link2 className="size-4" aria-hidden />
            )}
            {linkedToNext ? 'Split' : 'Superset with next'}
          </button>
        </div>
      )}
    </Reorder.Item>
  )
}

const GROUP_HINTS: Record<QuickGroup['kind'], string> = {
  superset: 'Back to back, then rest. Rest is after each round.',
  circuit: 'Every exercise once, then rest. Repeat for each round.',
  interval: 'Work and rest on a timer, like Tabata.',
}

/** A group's settings: what kind, how many rounds, and rest. */
function GroupHeader({
  group,
  onChange,
  onUngroup,
}: {
  group: RowGroup
  onChange: (patch: Partial<QuickGroup>) => void
  onUngroup: () => void
}) {
  const g = group.settings
  const interval = g.kind === 'interval'
  return (
    <div className="mb-2 flex flex-col gap-3 rounded-md bg-brand-soft p-3">
      <div className="flex items-center gap-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand font-display font-extrabold text-[14px] text-on-brand">
          {group.letter}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p className="font-bold text-[15px] text-brand-text">
            {GROUP_KIND_LABELS[g.kind]} · {group.size} exercises
          </p>
          <p className="text-[12px] text-ink-muted">{GROUP_HINTS[g.kind]}</p>
        </div>
        <IconButton
          label="Undo this group"
          icon={<Unlink aria-hidden />}
          size="lg"
          className="bg-surface"
          onClick={onUngroup}
        />
      </div>
      <fieldset
        aria-label="Group type"
        className="no-scrollbar flex min-w-0 gap-2 overflow-x-auto border-0"
      >
        {GROUP_KINDS.map((k) => (
          <button
            key={k}
            type="button"
            aria-pressed={g.kind === k}
            onClick={() => g.kind !== k && onChange({ kind: k })}
            className={cn(
              'inline-flex h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-pill px-4 font-bold text-[14px] transition active:scale-[0.97]',
              g.kind === k ? 'bg-brand text-on-brand' : 'bg-surface text-ink hover:text-brand-text',
            )}
          >
            {g.kind === k && <Check className="size-4" strokeWidth={3} aria-hidden />}
            {GROUP_KIND_LABELS[k]}
          </button>
        ))}
      </fieldset>
      <div className="flex flex-wrap gap-2">
        <TapStepper
          label="Rounds"
          value={g.rounds}
          min={1}
          max={QUICK_MAX_SETS}
          onChange={(n) => onChange({ rounds: n })}
        />
        {interval && (
          <TapStepper
            label="Work s"
            value={g.workSeconds ?? 20}
            min={5}
            max={3600}
            step={5}
            onChange={(n) => onChange({ workSeconds: n })}
          />
        )}
        <TapStepper
          label="Rest s"
          value={g.restSeconds ?? (interval ? 10 : 90)}
          min={0}
          max={3600}
          step={interval ? 5 : 15}
          onChange={(n) => onChange({ restSeconds: n })}
        />
      </div>
    </div>
  )
}

/** − value + with 44px buttons, and the number keypad when typing. */
function TapStepper({
  label,
  value,
  min,
  max,
  step = 1,
  decimal = false,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  decimal?: boolean
  onChange: (value: number) => void
}) {
  const [text, setText] = useState<string | null>(null)
  const clampTo = (n: number) => Math.min(max, Math.max(min, n))
  const shown = decimal ? String(Math.round(value * 10) / 10) : String(value)
  const btn =
    'grid size-11 shrink-0 place-items-center rounded-full text-ink transition hover:bg-surface-raised active:scale-90 disabled:opacity-40'
  return (
    <div className="flex items-center rounded-pill bg-surface p-0.5 ring-1 ring-border ring-inset">
      <button
        type="button"
        className={btn}
        aria-label={`Less: ${label.toLowerCase()}`}
        disabled={value <= min}
        onClick={() => onChange(clampTo(Math.round((value - step) * 10) / 10))}
      >
        <Minus className="size-4" aria-hidden />
      </button>
      <label className="flex min-w-10 flex-col items-center gap-0.5">
        <span className="whitespace-nowrap font-extrabold text-[10px] text-ink-muted uppercase leading-none tracking-[0.08em]">
          {label}
        </span>
        <input
          inputMode={decimal ? 'decimal' : 'numeric'}
          enterKeyHint="done"
          value={text ?? shown}
          onFocus={(ev) => {
            setText(shown)
            ev.target.select()
          }}
          onBlur={() => setText(null)}
          onChange={(ev) => {
            setText(ev.target.value)
            const n = decimal
              ? Number.parseFloat(ev.target.value.replace(',', '.'))
              : Number.parseInt(ev.target.value, 10)
            if (!Number.isNaN(n)) onChange(clampTo(n))
          }}
          className="metric w-10 bg-transparent text-center text-[17px] leading-none outline-none"
        />
      </label>
      <button
        type="button"
        className={btn}
        aria-label={`More: ${label.toLowerCase()}`}
        disabled={value >= max}
        onClick={() => onChange(clampTo(Math.round((value + step) * 10) / 10))}
      >
        <Plus className="size-4" aria-hidden />
      </button>
    </div>
  )
}

function ExercisePicker({
  chosen,
  full,
  onPick,
}: {
  chosen: Set<number>
  full: boolean
  onPick: (e: SwapCandidate) => void
}) {
  const options = useQuery(swapOptionsQuery)
  const [query, setQuery] = useState('')
  const [group, setGroup] = useState<MuscleGroup | null>(null)
  const all = options.data?.exercises ?? []
  const groups = [...new Set(all.map((e) => e.muscleGroup))].sort((a, b) =>
    MUSCLE_GROUP_LABELS[a].localeCompare(MUSCLE_GROUP_LABELS[b]),
  )
  const matches = all.filter(
    (e) => (!group || e.muscleGroup === group) && matchesExercise(e, query),
  )
  const shown = matches.slice(0, RESULTS_SHOWN)

  return (
    <div className="flex flex-col gap-4">
      <Label>Add exercises</Label>
      <div className="relative">
        <Search
          className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-3 size-[18px] text-ink-muted"
          aria-hidden
        />
        <Input
          type="search"
          inputMode="search"
          enterKeyHint="search"
          autoComplete="off"
          placeholder="Search exercises or muscles"
          aria-label="Search exercises"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-12 pl-10 text-[16px]"
        />
      </div>

      {groups.length > 1 && (
        <fieldset
          aria-label="Muscle group"
          className="no-scrollbar -mx-5 flex min-w-0 gap-2 overflow-x-auto border-0 px-5 md:mx-0 md:flex-wrap md:px-0"
        >
          {[null, ...groups].map((g) => {
            const on = group === g
            return (
              <button
                key={g ?? 'all'}
                type="button"
                aria-pressed={on}
                onClick={() => setGroup(g)}
                className={cn(
                  'inline-flex h-11 shrink-0 items-center whitespace-nowrap rounded-pill px-4 font-bold text-[14px] transition active:scale-[0.97]',
                  on
                    ? 'bg-brand text-on-brand'
                    : 'bg-surface-raised text-ink hover:ring-[1.5px] hover:ring-border-strong hover:ring-inset',
                )}
              >
                {g ? MUSCLE_GROUP_LABELS[g] : 'All'}
              </button>
            )
          })}
        </fieldset>
      )}

      {full && (
        <p className="rounded-md bg-surface-raised p-3 font-semibold text-[14px]">
          That’s the most one workout can hold ({QUICK_MAX_EXERCISES}).
        </p>
      )}

      {options.isPending ? (
        <div className="flex flex-col gap-2" aria-hidden>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-md bg-surface-raised" />
          ))}
        </div>
      ) : options.isError ? (
        <div className="flex flex-col items-start gap-3 rounded-md bg-surface-raised p-4">
          <p className="font-semibold text-[14px]">
            Couldn’t load the exercises. Check your signal and try again.
          </p>
          <Button variant="secondary" size="sm" onClick={() => void options.refetch()}>
            Try again
          </Button>
        </div>
      ) : shown.length === 0 ? (
        <p className="rounded-md bg-surface-raised p-4 text-[14px] text-ink-muted">
          Nothing matches{query.trim() ? ` “${query.trim()}”` : ''}. Try another name or a muscle,
          like “chest”.
        </p>
      ) : (
        <>
          <ul className="grid grid-cols-1 gap-2 xl:grid-cols-2">
            {shown.map((e) => (
              <PickRow
                key={e.id}
                exercise={e}
                on={chosen.has(e.id)}
                disabled={full && !chosen.has(e.id)}
                onPick={() => onPick(e)}
              />
            ))}
          </ul>
          {matches.length > shown.length && (
            <p className="text-center font-semibold text-[13px] text-ink-muted">
              Showing {shown.length} of {matches.length}. Search to find the rest.
            </p>
          )}
        </>
      )}
    </div>
  )
}

function PickRow({
  exercise: e,
  on,
  disabled,
  onPick,
}: {
  exercise: SwapCandidate
  on: boolean
  disabled: boolean
  onPick: () => void
}) {
  return (
    <li>
      <button
        type="button"
        aria-pressed={on}
        onClick={onPick}
        disabled={disabled}
        className={cn(
          'flex min-h-16 w-full items-center gap-3 rounded-md bg-surface-raised p-2 pr-3 text-left transition active:scale-[0.98]',
          'hover:ring-2 hover:ring-brand/40 disabled:opacity-50',
          on && 'ring-2 ring-brand',
        )}
      >
        <Thumb imageKey={e.imageKey} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-bold text-[15px]">{e.name}</span>
          <span className="mt-0.5 block truncate font-semibold text-[13px] text-ink-muted">
            {EQUIPMENT_LABELS[e.equipment]} · {MUSCLE_GROUP_LABELS[e.muscleGroup]}
          </span>
        </span>
        <span
          className={cn(
            'grid size-9 shrink-0 place-items-center rounded-full transition',
            on ? 'bg-lime text-on-lime' : 'bg-surface text-ink-muted',
          )}
        >
          {on ? (
            <motion.span initial={{ scale: 0.5 }} animate={{ scale: [0.5, 1.15, 1] }}>
              <Check className="size-[18px]" strokeWidth={3} aria-label="Added" />
            </motion.span>
          ) : (
            <Plus className="size-[18px]" aria-label="Add" />
          )}
        </span>
      </button>
    </li>
  )
}

function Thumb({ imageKey }: { imageKey: string | null }) {
  const photo = exercisePhotos(imageKey)[0]
  return (
    <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-sm bg-surface text-ink-muted">
      {photo ? (
        <img src={photo} alt="" loading="lazy" className="size-full object-cover" />
      ) : (
        <Dumbbell className="size-5" aria-hidden />
      )}
    </span>
  )
}

function Label({ children }: { children: ReactNode }) {
  return (
    <h3 className="font-extrabold text-[11px] text-ink-muted uppercase tracking-[0.08em]">
      {children}
    </h3>
  )
}

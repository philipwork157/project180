import { swapOptionsQuery } from '@project180/client'
import {
  EQUIPMENT_LABELS,
  exercisePhotos,
  MUSCLE_GROUP_LABELS,
  type SwapCandidate,
  searchSwaps,
  swapSuggestions,
  type WorkoutExerciseItem,
} from '@project180/shared'
import { Button, cn, Input } from '@project180/ui'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeftRight, Dumbbell, LoaderCircle, Search, Undo2 } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { Sheet } from './sheet'

/**
 * Swap an exercise mid-workout (machine taken, no equipment): the coach's picks first,
 * then what you used before, then similar exercises, and a search over everything.
 */
export function SwapSheet({
  exercise: ex,
  inWorkout,
  logged,
  pendingId,
  error,
  onSwap,
  onClose,
}: {
  /** The exercise to swap; null = closed. */
  exercise: WorkoutExerciseItem | null
  /** Every exercise already in the workout (not offered). */
  inWorkout: number[]
  /** Sets already logged on it: they stay with it. */
  logged: number
  /** The exercise being swapped to while it saves. */
  pendingId: number | null
  error: string | null
  onSwap: (replacementId: number) => void
  onClose: () => void
}) {
  return (
    <Sheet
      open={ex !== null}
      onClose={onClose}
      label={ex ? `Swap ${ex.exerciseName}` : 'Swap exercise'}
    >
      {ex && (
        <SwapPicker
          key={ex.exerciseId}
          ex={ex}
          inWorkout={inWorkout}
          logged={logged}
          pendingId={pendingId}
          error={error}
          onSwap={onSwap}
        />
      )}
    </Sheet>
  )
}

function SwapPicker({
  ex,
  inWorkout,
  logged,
  pendingId,
  error,
  onSwap,
}: {
  ex: WorkoutExerciseItem
  inWorkout: number[]
  logged: number
  pendingId: number | null
  error: string | null
  onSwap: (replacementId: number) => void
}) {
  const options = useQuery(swapOptionsQuery)
  const [query, setQuery] = useState('')
  const original = ex.swappedFrom ?? null
  const exclude = [...inWorkout, ...(original ? [original.exerciseId] : [])]
  const sections = options.data
    ? swapSuggestions(ex, options.data, {
        exclude,
        forExerciseId: original?.exerciseId ?? ex.exerciseId,
      })
    : null
  const results =
    options.data && query.trim()
      ? searchSwaps(ex, options.data.exercises, query, { exclude })
      : null
  const remaining = Math.max(1, ex.targetSets - logged)
  const busy = pendingId !== null

  const row = (c: SwapCandidate) => (
    <CandidateRow
      key={c.id}
      candidate={c}
      pending={pendingId === c.id}
      disabled={busy}
      onPick={() => onSwap(c.id)}
    />
  )

  return (
    <div className="flex flex-col gap-5 pb-6">
      <div className="flex flex-col gap-1">
        <h2 className="font-display font-extrabold text-[24px] leading-7">
          Swap {ex.exerciseName}
        </h2>
        <p className="font-semibold text-[14px] text-ink-muted">
          {logged > 0
            ? `Your ${logged} logged ${logged === 1 ? 'set stays' : 'sets stay'} as ${ex.exerciseName}. The other ${remaining} ${remaining === 1 ? 'set moves' : 'sets move'} to the new exercise.`
            : 'Same sets, reps and rest. Only the exercise changes.'}
        </p>
      </div>

      {original && inWorkout.includes(original.exerciseId) === false && (
        <Button
          variant="secondary"
          size="lg"
          block
          icon={
            pendingId === original.exerciseId ? (
              <LoaderCircle className="size-[18px] animate-spin" aria-hidden />
            ) : (
              <Undo2 className="size-[18px]" aria-hidden />
            )
          }
          disabled={busy}
          onClick={() => onSwap(original.exerciseId)}
        >
          Back to {original.exerciseName}
        </Button>
      )}

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
          placeholder="Search all exercises"
          aria-label="Search all exercises"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-12 pl-10 text-[16px]"
        />
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-md bg-danger/10 p-3 font-semibold text-[14px] text-danger"
        >
          {error}
        </p>
      )}

      {options.isPending ? (
        <div className="flex flex-col gap-2" aria-hidden>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-md bg-surface-raised" />
          ))}
        </div>
      ) : options.isError || !sections ? (
        <div className="flex flex-col items-start gap-3 rounded-md bg-surface-raised p-4">
          <p className="font-semibold text-[14px]">
            Couldn’t load the exercises. Check your signal and try again.
          </p>
          <Button variant="secondary" size="sm" onClick={() => void options.refetch()}>
            Try again
          </Button>
        </div>
      ) : results ? (
        <Section title={`${results.length === 40 ? '40+' : results.length} found`}>
          {results.length ? (
            results.map(row)
          ) : (
            <p className="rounded-md bg-surface-raised p-4 text-[14px] text-ink-muted">
              Nothing matches “{query.trim()}”. Try another name or a muscle, like “chest”.
            </p>
          )}
        </Section>
      ) : (
        <>
          {sections.coach.length > 0 && (
            <Section title="Your coach suggests">{sections.coach.map(row)}</Section>
          )}
          {sections.mine.length > 0 && (
            <Section title="You used before">{sections.mine.map(row)}</Section>
          )}
          {sections.similar.length > 0 && (
            <Section title={`More ${MUSCLE_GROUP_LABELS[ex.muscleGroup].toLowerCase()} exercises`}>
              {sections.similar.map(row)}
            </Section>
          )}
          {sections.coach.length + sections.mine.length + sections.similar.length === 0 && (
            <p className="rounded-md bg-surface-raised p-4 text-[14px] text-ink-muted">
              Search above to find another exercise.
            </p>
          )}
        </>
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="font-extrabold text-[11px] text-ink-muted uppercase tracking-[0.08em]">
        {title}
      </h3>
      <ul className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">{children}</ul>
    </section>
  )
}

function CandidateRow({
  candidate: c,
  pending,
  disabled,
  onPick,
}: {
  candidate: SwapCandidate
  pending: boolean
  disabled: boolean
  onPick: () => void
}) {
  const photo = exercisePhotos(c.imageKey)[0]
  return (
    <li>
      <button
        type="button"
        onClick={onPick}
        disabled={disabled}
        className={cn(
          'flex min-h-16 w-full items-center gap-3 rounded-md bg-surface-raised p-2 pr-3 text-left transition active:scale-[0.98]',
          'hover:ring-2 hover:ring-brand/40 disabled:opacity-60',
          pending && 'ring-2 ring-brand disabled:opacity-100',
        )}
      >
        <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-sm bg-surface text-ink-muted">
          {photo ? (
            <img src={photo} alt="" loading="lazy" className="size-full object-cover" />
          ) : (
            <Dumbbell className="size-5" aria-hidden />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-bold text-[15px]">{c.name}</span>
          <span className="mt-0.5 block truncate font-semibold text-[13px] text-ink-muted">
            {EQUIPMENT_LABELS[c.equipment]} · {MUSCLE_GROUP_LABELS[c.muscleGroup]}
          </span>
        </span>
        {pending ? (
          <LoaderCircle
            className="size-5 shrink-0 animate-spin text-brand-text"
            aria-label="Swapping"
          />
        ) : (
          <ArrowLeftRight className="size-[18px] shrink-0 text-ink-muted" aria-hidden />
        )}
      </button>
    </li>
  )
}

import { ApiError, api, workoutBuilderQuery, workoutQuery } from '@project180/client'
import { repsLabel, type WorkoutBuildResult } from '@project180/shared'
import { Button, buttonClasses, Drawer, Field, Spinner, Textarea, toast } from '@project180/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Check, Sparkles } from 'lucide-react'
import { useState } from 'react'

const EXAMPLES = [
  '45 min upper body, dumbbells only, beginner',
  'Full body at home, no equipment, 30 minutes',
  'Glutes and hamstrings, gym, intermediate, finish with a core circuit',
]

/**
 * "Build with Claude" on the Workouts page: shown only when the owner has it on and the site
 * has a Claude key. It creates a new workout; the coach then edits it in the normal editor.
 */
export function BuildWithClaude() {
  const available = useQuery(workoutBuilderQuery).data?.available ?? false
  const [open, setOpen] = useState(false)
  if (!available) return null
  return (
    <>
      <Button
        variant="secondary"
        icon={<Sparkles className="size-5" aria-hidden />}
        onClick={() => setOpen(true)}
      >
        Build with Claude
      </Button>
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title="Build with Claude"
        description="Describe the workout. Claude builds a new one from your exercise library; you check and change it in the editor."
      >
        {open && <BuilderForm onClose={() => setOpen(false)} />}
      </Drawer>
    </>
  )
}

function BuilderForm({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient()
  const [prompt, setPrompt] = useState('')
  const [error, setError] = useState<string>()
  const [result, setResult] = useState<WorkoutBuildResult | null>(null)
  const build = useMutation({
    mutationFn: () =>
      api<WorkoutBuildResult>('/workout-builder', { method: 'POST', body: { prompt } }),
    onSuccess: (r) => {
      queryClient.setQueryData(workoutQuery(r.workout.id).queryKey, r.workout)
      void queryClient.invalidateQueries({ queryKey: ['workouts'] })
      toast({ title: 'Workout created', description: r.workout.name })
      setResult(r)
    },
    onError: (err) =>
      setError(err instanceof ApiError ? err.message : 'Couldn’t reach the server. Try again.'),
  })

  if (result)
    return <BuildResult result={result} onAgain={() => setResult(null)} onClose={onClose} />

  const tooShort = prompt.trim().length < 10
  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault()
        setError(undefined)
        if (!tooShort) build.mutate()
      }}
    >
      <Field
        label="What should it be?"
        hint="Time, equipment, level and focus help most."
        error={error}
      >
        {(id) => (
          <Textarea
            id={id}
            rows={5}
            maxLength={1000}
            placeholder="e.g. 45 min upper body, dumbbells only, beginner"
            value={prompt}
            disabled={build.isPending}
            onChange={(e) => setPrompt(e.target.value)}
          />
        )}
      </Field>
      <div className="flex flex-col gap-2">
        <span className="font-extrabold text-[11px] text-ink-muted uppercase tracking-[0.08em]">
          Try one
        </span>
        <div className="flex flex-wrap gap-2">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              disabled={build.isPending}
              onClick={() => setPrompt(ex)}
              className="min-h-10 rounded-pill bg-surface-raised px-4 py-2 text-left font-semibold text-[13px] transition hover:ring-[1.5px] hover:ring-border-strong hover:ring-inset active:scale-[0.98] disabled:opacity-50"
            >
              {ex}
            </button>
          ))}
        </div>
      </div>
      {build.isPending && (
        <p
          className="flex items-center gap-3 rounded-md bg-surface-raised p-4 text-[14px]"
          aria-live="polite"
        >
          <Spinner />
          Claude is picking exercises from your library. This takes 20 to 60 seconds.
        </p>
      )}
      <p className="text-[13px] text-ink-muted">
        Your description and the names of your exercises are sent to Claude. Nothing about your
        clients is. It only creates a new workout; nothing you already have changes.
      </p>
      <div className="flex flex-wrap items-center justify-end gap-3">
        <Button variant="ghost" onClick={onClose} disabled={build.isPending}>
          Cancel
        </Button>
        <Button
          type="submit"
          loading={build.isPending}
          disabled={tooShort}
          icon={<Sparkles className="size-4" aria-hidden />}
        >
          Build workout
        </Button>
      </div>
    </form>
  )
}

function BuildResult({
  result,
  onAgain,
  onClose,
}: {
  result: WorkoutBuildResult
  onAgain: () => void
  onClose: () => void
}) {
  const w = result.workout
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start gap-3 rounded-md bg-surface-raised p-4">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-lime text-on-lime">
          <Check className="size-5" strokeWidth={3} aria-hidden />
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <p className="font-bold text-[15px]">Created “{w.name}”</p>
          <p className="text-[14px] text-ink-muted">
            {w.exercises.length} exercises
            {w.estimatedMinutes ? ` · about ${w.estimatedMinutes} min` : ''}. It’s a new workout in
            your library: check it in the editor before you assign it.
          </p>
        </div>
      </div>
      <ol className="flex w-full flex-col">
        {w.exercises.map((e, i) => (
          <li
            // biome-ignore lint/suspicious/noArrayIndexKey: a read-only list that never reorders; the same exercise can appear twice
            key={`${e.exerciseId}-${i}`}
            className="flex items-center gap-3 border-border border-t py-2.5 text-[14px] first:border-t-0"
          >
            <span className="tabular w-6 shrink-0 text-ink-muted">{i + 1}</span>
            <span className="min-w-0 flex-1 truncate font-semibold">{e.exerciseName}</span>
            <span className="tabular shrink-0 text-ink-muted">
              {e.targetSets} × {e.targetSeconds ? `${e.targetSeconds}s` : repsLabel(e)}
            </span>
          </li>
        ))}
      </ol>
      {result.missing.length > 0 && (
        <div className="flex flex-col gap-1 rounded-md bg-sand/20 p-4 text-[14px]">
          <p className="font-bold text-sand-text">Not in your library</p>
          <p>
            Claude would also have used: {result.missing.join(', ')}. Nothing was added; add them
            under Exercises if you want them, then swap them in.
          </p>
        </div>
      )}
      {result.note && <p className="text-[14px] text-ink-muted">{result.note}</p>}
      <div className="flex flex-wrap items-center justify-end gap-3">
        <Button variant="ghost" onClick={onAgain}>
          Build another
        </Button>
        <Link
          to="/workouts/$workoutId"
          params={{ workoutId: String(w.id) }}
          onClick={onClose}
          className={buttonClasses('primary')}
        >
          Open in the editor
        </Link>
      </div>
    </div>
  )
}

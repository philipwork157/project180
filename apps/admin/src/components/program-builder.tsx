import { ApiError, api, programBuilderQuery, programQuery } from '@project180/client'
import type { ProgramBuildResult } from '@project180/shared'
import {
  Button,
  buttonClasses,
  DictateButton,
  Drawer,
  Field,
  Spinner,
  Textarea,
  toast,
} from '@project180/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Check, Sparkles } from 'lucide-react'
import { useState } from 'react'

const EXAMPLES = [
  'A basic 4 week program',
  'A fully fledged 4 week program, 3 days a week, gym: pre-mobility, main work, abs, cardio and a cool-down every day',
  '8 weeks fat loss at home, no equipment, 4 days a week, 30 min sessions, core finisher',
  '12 week strength block, upper/lower split, 4 days, intermediate, weekly weigh-in',
]

/**
 * "Build with Claude" on the Programs page: shown when building programs with Claude is on
 * and the site has a Claude key. It only creates a new program (plus new workouts where the library
 * has nothing that fits); the coach then edits it in the normal program editor.
 */
export function BuildProgramWithClaude() {
  const available = useQuery(programBuilderQuery).data?.available ?? false
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
        title="Build a program with Claude"
        description="Describe the program. Claude lays it out over the weeks using your workouts (and new ones from your exercise library where needed); you check and change it in the editor."
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
  const [result, setResult] = useState<ProgramBuildResult | null>(null)
  const build = useMutation({
    mutationFn: () =>
      api<ProgramBuildResult>('/program-builder', { method: 'POST', body: { prompt } }),
    onSuccess: (r) => {
      queryClient.setQueryData(programQuery(r.program.id).queryKey, r.program)
      void queryClient.invalidateQueries({ queryKey: ['programs'] })
      if (r.newWorkouts.length > 0) void queryClient.invalidateQueries({ queryKey: ['workouts'] })
      toast({ title: 'Program created', description: r.program.name })
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
        hint="Weeks, days per week, equipment, level and goal help most. Ask for a fully fledged program to get mobility, abs, cardio and a cool-down every day, or name the parts in the order you want them."
        error={error}
      >
        {(id) => (
          <Textarea
            id={id}
            rows={5}
            maxLength={1000}
            placeholder="e.g. A fully fledged 4 week program: pre-mobility, main work, abs, cardio, cool-down"
            value={prompt}
            disabled={build.isPending}
            onChange={(e) => setPrompt(e.target.value)}
          />
        )}
      </Field>
      <DictateButton
        value={prompt}
        onChange={setPrompt}
        maxLength={1000}
        disabled={build.isPending}
      />
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
          Claude is planning the weeks and picking workouts. This can take a minute or two.
        </p>
      )}
      <p className="text-[13px] text-ink-muted">
        Your description and the names of your workouts and exercises are sent to Claude. Nothing
        about your clients is. It only creates a new program (and new workouts if it needs them);
        nothing you already have changes.
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
          Build program
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
  result: ProgramBuildResult
  onAgain: () => void
  onClose: () => void
}) {
  const p = result.program
  const workoutDays = p.days.filter((d) => d.workoutId !== null).length
  const perWeek = Math.round((workoutDays / p.durationWeeks) * 10) / 10
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start gap-3 rounded-md bg-surface-raised p-4">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-lime text-on-lime">
          <Check className="size-5" strokeWidth={3} aria-hidden />
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <p className="font-bold text-[15px]">Created “{p.name}”</p>
          <p className="text-[14px] text-ink-muted">
            {p.durationWeeks} {p.durationWeeks === 1 ? 'week' : 'weeks'} · {workoutDays} workouts
            (about {perWeek} a week). It’s a new program in your library: check the schedule in the
            editor before you assign it.
          </p>
        </div>
      </div>
      {result.newWorkouts.length > 0 && (
        <WorkoutList
          title="New workouts made for it"
          items={result.newWorkouts.map((w) => ({
            ...w,
            detail: `${w.exercises} exercises`,
          }))}
          onClose={onClose}
        />
      )}
      {result.reusedWorkouts.length > 0 && (
        <WorkoutList
          title="Your workouts it uses (unchanged)"
          items={result.reusedWorkouts}
          onClose={onClose}
        />
      )}
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
          to="/programs/$programId"
          params={{ programId: String(p.id) }}
          onClick={onClose}
          className={buttonClasses('primary')}
        >
          Open in the editor
        </Link>
      </div>
    </div>
  )
}

function WorkoutList({
  title,
  items,
  onClose,
}: {
  title: string
  items: Array<{ id: number; name: string; detail?: string }>
  onClose: () => void
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-extrabold text-[11px] text-ink-muted uppercase tracking-[0.08em]">
        {title}
      </span>
      <ul className="mt-1 flex w-full flex-col">
        {items.map((w) => (
          <li key={w.id} className="border-border border-t first:border-t-0">
            <Link
              to="/workouts/$workoutId"
              params={{ workoutId: String(w.id) }}
              onClick={onClose}
              className="flex min-h-11 items-center gap-3 py-2.5 text-[14px] hover:text-brand-text"
            >
              <span className="min-w-0 flex-1 truncate font-semibold">{w.name}</span>
              {w.detail && <span className="tabular shrink-0 text-ink-muted">{w.detail}</span>}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

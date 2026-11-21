// Fuel's Exercise card (the MyFitnessPal way): finished workouts, activities and steps for the
// day, each with its estimate. What's burned is added to the day's calories.
import { ApiError } from '@project180/client'
import {
  ACTIVITY_KIND_LABELS,
  ACTIVITY_KINDS,
  type ActivityKind,
  type DayBurn,
  kcalLabel,
  MAX_ACTIVITY_MINUTES,
  MAX_STEPS,
  STEP_BASELINE,
} from '@project180/shared'
import { Button, cn, Field, IconButton, Input } from '@project180/ui'
import { Activity, Dumbbell, Flame, Footprints, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useAddActivity, useDeleteActivity, useSetSteps } from '../lib/burn'
import { Sheet } from './sheet'

const numberLabel = (n: number) => new Intl.NumberFormat('en-ZA').format(n)

export function ExerciseCard({
  burned,
  date,
  hasTarget,
}: {
  burned: DayBurn
  date: string
  hasTarget: boolean
}) {
  const [adding, setAdding] = useState(false)
  const [stepping, setStepping] = useState(false)
  const remove = useDeleteActivity()
  const clearSteps = useSetSteps()
  const empty =
    burned.workouts.length === 0 && burned.activities.length === 0 && burned.steps === null

  return (
    <section
      aria-label="Exercise"
      className="flex min-w-0 flex-col gap-3 rounded-lg bg-surface p-5 shadow-card md:p-6"
    >
      <header className="flex items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-clay/20 text-clay-text">
          <Flame className="size-5" aria-hidden />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h2 className="font-bold text-[17px]">Exercise</h2>
          <p className="tabular text-[13px] text-ink-muted">
            {burned.kcal > 0
              ? `${kcalLabel(burned.kcal)} kcal burned${hasTarget ? ', added to your calories' : ''}`
              : 'Workouts, activities and steps'}
          </p>
        </div>
      </header>

      {burned.needsWeight && (
        <p className="rounded-md bg-sand/20 p-3 text-[13px]">
          Log your weight on Today first, so we can work out what you burn.
        </p>
      )}

      {!empty && (
        <ul className="flex w-full flex-col">
          {burned.workouts.map((w) => (
            <Row
              key={`w${w.sessionId}`}
              icon={<Dumbbell aria-hidden />}
              title={w.name}
              detail={w.minutes ? `${w.minutes} min workout` : 'Workout'}
              kcal={w.kcal}
            />
          ))}
          {burned.activities.map((a) => (
            <Row
              key={`a${a.id}`}
              icon={<Activity aria-hidden />}
              title={ACTIVITY_KIND_LABELS[a.kind]}
              detail={`${a.minutes} min`}
              kcal={a.kcal}
              action={
                <IconButton
                  label={`Remove ${ACTIVITY_KIND_LABELS[a.kind].toLowerCase()}`}
                  icon={<Trash2 aria-hidden />}
                  tone="danger"
                  className="size-11"
                  disabled={remove.isPending}
                  onClick={() => remove.mutate(a.id)}
                />
              }
            />
          ))}
          {burned.steps !== null && (
            <Row
              icon={<Footprints aria-hidden />}
              title={`${numberLabel(burned.steps)} steps`}
              detail={
                burned.stepsKcal > 0
                  ? `Above the first ${numberLabel(STEP_BASELINE)}`
                  : `The first ${numberLabel(STEP_BASELINE)} are already in your calories`
              }
              kcal={burned.stepsKcal}
              onClick={() => setStepping(true)}
              action={
                <IconButton
                  label="Remove steps"
                  icon={<Trash2 aria-hidden />}
                  tone="danger"
                  className="size-11"
                  disabled={clearSteps.isPending}
                  onClick={() => clearSteps.mutate({ date, steps: 0 })}
                />
              }
            />
          )}
        </ul>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Button
          variant="secondary"
          icon={<Plus className="size-4" aria-hidden />}
          onClick={() => setAdding(true)}
        >
          Activity
        </Button>
        <Button
          variant="secondary"
          icon={<Footprints className="size-4" aria-hidden />}
          onClick={() => setStepping(true)}
        >
          {burned.steps === null ? 'Steps' : 'Edit steps'}
        </Button>
      </div>

      {(remove.isError || clearSteps.isError) && (
        <p role="alert" className="font-semibold text-[13px] text-danger">
          Couldn’t remove that. Check your signal and try again.
        </p>
      )}
      {!empty && (
        <p className="text-[13px] text-ink-muted">
          Tap steps to change them, or the bin to remove.
        </p>
      )}

      <ActivitySheet open={adding} date={date} onClose={() => setAdding(false)} />
      <StepsSheet
        open={stepping}
        date={date}
        steps={burned.steps}
        onClose={() => setStepping(false)}
      />
    </section>
  )
}

function Row({
  icon,
  title,
  detail,
  kcal,
  action,
  onClick,
}: {
  icon: React.ReactNode
  title: string
  detail: string
  kcal: number
  action?: React.ReactNode
  onClick?: () => void
}) {
  const body = (
    <>
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-raised text-ink-muted [&>svg]:size-4">
        {icon}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate font-semibold text-[15px]">{title}</span>
        <span className="text-[13px] text-ink-muted">{detail}</span>
      </span>
      <span className="tabular shrink-0 font-bold text-[13px]">{kcalLabel(kcal)} kcal</span>
    </>
  )
  return (
    <li className="flex min-h-12 items-center gap-3 border-border border-t py-2.5">
      {onClick ? (
        <button
          type="button"
          onClick={onClick}
          className="flex min-w-0 flex-1 items-center gap-3 text-left transition active:scale-[0.99]"
        >
          {body}
        </button>
      ) : (
        <span className="flex min-w-0 flex-1 items-center gap-3">{body}</span>
      )}
      {action}
    </li>
  )
}

const QUICK_MINUTES = [15, 30, 45, 60]

function ActivitySheet({
  open,
  date,
  onClose,
}: {
  open: boolean
  date: string
  onClose: () => void
}) {
  const [kind, setKind] = useState<ActivityKind | null>(null)
  const [minutes, setMinutes] = useState('30')
  const [clientUuid, setClientUuid] = useState(() => crypto.randomUUID())
  const add = useAddActivity(() => {
    close()
  })
  function close() {
    setKind(null)
    setMinutes('30')
    setClientUuid(crypto.randomUUID())
    add.reset()
    onClose()
  }
  const mins = Number.parseInt(minutes, 10)
  const valid = kind !== null && mins >= 1 && mins <= MAX_ACTIVITY_MINUTES

  return (
    <Sheet open={open} onClose={close} label="Add activity">
      <form
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault()
          if (valid) add.mutate({ clientUuid, date, kind, minutes: mins })
        }}
      >
        <div className="flex flex-col gap-1">
          <h2 className="font-bold text-[22px]">Add activity</h2>
          <p className="text-[14px] text-ink-muted">
            Anything outside your workouts. It’s added to today’s calories.
          </p>
        </div>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 font-bold text-[14px]">What did you do?</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {ACTIVITY_KINDS.map((k) => (
              <label
                key={k}
                className={cn(
                  'flex min-h-11 cursor-pointer items-center rounded-md px-3 py-2 font-semibold text-[14px] transition active:scale-[0.98] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand',
                  kind === k
                    ? 'bg-brand text-on-brand'
                    : 'bg-surface-raised text-ink hover:ring-[1.5px] hover:ring-border-strong hover:ring-inset',
                )}
              >
                <input
                  type="radio"
                  name="activity-kind"
                  value={k}
                  checked={kind === k}
                  onChange={() => setKind(k)}
                  className="sr-only"
                />
                {ACTIVITY_KIND_LABELS[k]}
              </label>
            ))}
          </div>
        </fieldset>
        <Field label="Minutes">
          {(id) => (
            <div className="flex flex-col gap-2">
              <Input
                id={id}
                inputMode="numeric"
                value={minutes}
                onChange={(e) => setMinutes(e.target.value.replace(/\D/g, ''))}
              />
              <div className="flex flex-wrap gap-2">
                {QUICK_MINUTES.map((m) => (
                  <Button
                    key={m}
                    variant={String(m) === minutes ? 'primary' : 'secondary'}
                    size="sm"
                    className="h-11 min-w-16"
                    onClick={() => setMinutes(String(m))}
                  >
                    {m} min
                  </Button>
                ))}
              </div>
            </div>
          )}
        </Field>
        {add.isError && (
          <p role="alert" className="font-semibold text-[14px] text-danger">
            {add.error instanceof ApiError ? add.error.message : 'Couldn’t save it. Try again.'}
          </p>
        )}
        <Button type="submit" size="lg" block disabled={!valid} loading={add.isPending}>
          Add {kind ? ACTIVITY_KIND_LABELS[kind].toLowerCase() : 'activity'}
        </Button>
      </form>
    </Sheet>
  )
}

function StepsSheet({
  open,
  date,
  steps,
  onClose,
}: {
  open: boolean
  date: string
  steps: number | null
  onClose: () => void
}) {
  const [value, setValue] = useState('')
  const save = useSetSteps(() => close())
  function close() {
    setValue('')
    save.reset()
    onClose()
  }
  const shown = value === '' && steps !== null ? String(steps) : value
  const n = Number.parseInt(shown, 10)
  const valid = Number.isFinite(n) && n >= 0 && n <= MAX_STEPS

  return (
    <Sheet open={open} onClose={close} label="Steps">
      <form
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault()
          if (valid) save.mutate({ date, steps: n })
        }}
      >
        <div className="flex flex-col gap-1">
          <h2 className="font-bold text-[22px]">Steps</h2>
          <p className="text-[14px] text-ink-muted">
            Copy them from your phone’s health app or your watch. The first{' '}
            {numberLabel(STEP_BASELINE)} are already in your daily calories; the rest are added.
          </p>
        </div>
        <Field label="Steps today">
          {(id) => (
            <Input
              id={id}
              inputMode="numeric"
              placeholder="8000"
              value={shown}
              onChange={(e) => setValue(e.target.value.replace(/\D/g, ''))}
            />
          )}
        </Field>
        {save.isError && (
          <p role="alert" className="font-semibold text-[14px] text-danger">
            {save.error instanceof ApiError ? save.error.message : 'Couldn’t save. Try again.'}
          </p>
        )}
        <div className="grid grid-cols-1 gap-2">
          <Button type="submit" size="lg" block disabled={!valid} loading={save.isPending}>
            Save steps
          </Button>
          {steps !== null && (
            <Button
              variant="ghost"
              block
              className="text-danger"
              disabled={save.isPending}
              onClick={() => save.mutate({ date, steps: 0 })}
            >
              Clear steps
            </Button>
          )}
        </div>
      </form>
    </Sheet>
  )
}

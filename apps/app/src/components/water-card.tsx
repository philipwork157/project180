import {
  formatWater,
  litresToMl,
  MAX_WATER_GOAL_ML,
  MIN_WATER_GOAL_ML,
  WATER_GOAL_PRESETS_ML,
  WATER_QUICK_ML,
  type WaterDay,
  waterProgress,
} from '@project180/shared'
import { Button, ChoiceChips, ConfirmDialog, cn, Field, IconButton, Input } from '@project180/ui'
import { Check, ChevronRight, Droplet, Pencil, Trash2, Undo2 } from 'lucide-react'
import { motion } from 'motion/react'
import { useState } from 'react'
import { useAddWater, useClearWater, useUndoWater, useWaterGoal } from '../lib/water'
import { Sheet } from './sheet'

/**
 * Water for the day: how much against the goal, a glass or a bottle in one tap, and Undo. Every
 * drink is listed in a sheet ("3 drinks logged"), where any one can be removed or the day cleared.
 * Steel is the water colour; lime only when the goal is reached.
 */
export function WaterCard({ water, isToday }: { water: WaterDay; isToday: boolean }) {
  const [editingGoal, setEditingGoal] = useState(false)
  const [listing, setListing] = useState(false)
  const add = useAddWater()
  const undo = useUndoWater()
  const progress = waterProgress(water.ml, water.goalMl)
  const reached = progress !== null && progress >= 1
  const last = water.logs.at(-1)
  // A glass still on its way has a temporary (negative) id: wait for it before undoing.
  const canUndo = last !== undefined && last.id > 0 && !undo.isPending

  return (
    <section
      aria-label="Water"
      className="flex flex-col gap-4 rounded-lg bg-surface p-5 shadow-card md:p-6"
    >
      <header className="flex items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-steel/20 text-steel-text">
          <Droplet className="size-5" aria-hidden />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h2 className="font-bold text-[17px]">Water</h2>
          <p className="text-[13px] text-ink-muted">
            {water.goalMl === null
              ? 'No daily goal yet'
              : `Goal ${formatWater(water.goalMl)} a day`}
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-11 shrink-0 px-3"
          icon={water.goalMl === null ? undefined : <Pencil className="size-4" aria-hidden />}
          onClick={() => setEditingGoal(true)}
        >
          {water.goalMl === null ? 'Set a goal' : 'Change'}
        </Button>
      </header>

      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-3">
          <p className="flex items-baseline gap-2" aria-live="polite">
            <span className="metric text-[36px] leading-none">{formatWater(water.ml)}</span>
            {water.goalMl !== null && (
              <span className="font-semibold text-[15px] text-ink-muted">
                / {formatWater(water.goalMl)}
              </span>
            )}
          </p>
          {water.goalMl !== null && (
            <span className="shrink-0 text-[13px] text-ink-muted">
              {reached ? (
                <span className="inline-flex items-center gap-1 font-bold text-lime-text">
                  <Check className="size-3.5" strokeWidth={3} aria-hidden />
                  Goal reached
                </span>
              ) : (
                `${formatWater(water.goalMl - water.ml)} to go`
              )}
            </span>
          )}
        </div>
        {progress !== null && (
          // The numbers above say the same for screen readers.
          <div aria-hidden className="h-2 w-full overflow-hidden rounded-pill bg-surface-raised">
            <motion.div
              className={cn('h-full rounded-pill', reached ? 'bg-lime' : 'bg-steel')}
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(progress, 1) * 100}%` }}
              transition={{ type: 'spring', stiffness: 120, damping: 22 }}
            />
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        {WATER_QUICK_ML.map((ml) => (
          <Button
            key={ml}
            variant="secondary"
            className="min-w-0 flex-1"
            icon={<Droplet className="size-4 text-steel-text" aria-hidden />}
            onClick={() =>
              add.mutate({
                date: water.date,
                ml,
                clientUuid: crypto.randomUUID(),
                tempId: -Date.now() - Math.random(),
              })
            }
          >
            +{formatWater(ml)}
          </Button>
        ))}
        <IconButton
          label={last ? `Undo the last ${formatWater(last.ml)}` : 'Undo'}
          icon={<Undo2 aria-hidden />}
          className="size-11 shrink-0 bg-surface-raised"
          disabled={!canUndo}
          onClick={() => last && undo.mutate({ date: water.date, id: last.id, ml: last.ml })}
        />
      </div>
      {water.logs.length > 0 && (
        <button
          type="button"
          onClick={() => setListing(true)}
          className="-mx-2 -my-1 flex min-h-11 items-center gap-2 rounded-md px-2 text-left text-[14px] transition hover:bg-surface-raised active:scale-[0.99]"
        >
          <span className="min-w-0 flex-1 text-ink-muted">
            {water.logs.length === 1 ? '1 drink logged' : `${water.logs.length} drinks logged`}
          </span>
          <span className="inline-flex shrink-0 items-center gap-1 font-bold text-brand-text">
            See or remove
            <ChevronRight className="size-4" aria-hidden />
          </span>
        </button>
      )}
      {add.isError && (
        <p role="alert" className="font-semibold text-[13px] text-danger">
          Couldn’t save that. Check your signal and try again.
        </p>
      )}
      {!isToday && water.logs.length === 0 && (
        <p className="text-[13px] text-ink-muted">Forgot to log? Add it to this day here.</p>
      )}

      <WaterLogSheet
        open={listing}
        water={water}
        isToday={isToday}
        onClose={() => setListing(false)}
      />
      <WaterGoalSheet
        open={editingGoal}
        goalMl={water.goalMl}
        onClose={() => setEditingGoal(false)}
      />
    </section>
  )
}

const timeLabel = new Intl.DateTimeFormat('en-ZA', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Africa/Johannesburg',
})

/** Every drink on the day, newest first: remove any one, or clear the whole day. */
function WaterLogSheet({
  open,
  water,
  isToday,
  onClose,
}: {
  open: boolean
  water: WaterDay
  isToday: boolean
  onClose: () => void
}) {
  const [clearing, setClearing] = useState(false)
  const remove = useUndoWater()
  const clear = useClearWater(() => {
    setClearing(false)
    onClose()
  })
  const logs = [...water.logs].reverse()

  return (
    <Sheet open={open} onClose={onClose} label="Water logged">
      <div className="flex flex-col gap-5 pb-6">
        <div className="flex flex-col gap-1">
          <h2 className="font-display font-extrabold text-[24px] leading-7">
            {isToday ? 'Water today' : 'Water this day'}
          </h2>
          <p className="text-[14px] text-ink-muted">
            {formatWater(water.ml)} in total. Added too much? Remove that drink.
          </p>
        </div>
        {logs.length === 0 ? (
          <p className="rounded-md bg-surface-raised p-4 text-[14px] text-ink-muted">
            Nothing logged on this day.
          </p>
        ) : (
          <ul className="flex w-full flex-col">
            {logs.map((log) => (
              <li
                key={log.id}
                className="flex min-h-14 items-center gap-3 border-border border-t py-1.5 first:border-t-0"
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-steel/20 text-steel-text">
                  <Droplet className="size-4" aria-hidden />
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="tabular font-semibold text-[15px]">{formatWater(log.ml)}</span>
                  <span className="tabular text-[13px] text-ink-muted">
                    {timeLabel.format(new Date(log.createdAt))}
                  </span>
                </span>
                <IconButton
                  label={`Remove ${formatWater(log.ml)}`}
                  icon={<Trash2 aria-hidden />}
                  tone="danger"
                  className="size-11 shrink-0"
                  // A drink still on its way has a temporary (negative) id.
                  disabled={log.id < 0}
                  onClick={() => remove.mutate({ date: water.date, id: log.id, ml: log.ml })}
                />
              </li>
            ))}
          </ul>
        )}
        {remove.isError && (
          <p role="alert" className="font-semibold text-[14px] text-danger">
            Couldn’t remove that. Check your signal and try again.
          </p>
        )}
        {logs.length > 1 && (
          <Button
            variant="ghost"
            block
            className="text-danger"
            icon={<Trash2 className="size-4" aria-hidden />}
            onClick={() => setClearing(true)}
          >
            Clear the day
          </Button>
        )}
      </div>
      <ConfirmDialog
        open={clearing}
        title="Clear all water for this day?"
        confirmLabel="Clear the day"
        loading={clear.isPending}
        onConfirm={() => clear.mutate(water.date)}
        onClose={() => setClearing(false)}
      >
        All {logs.length} drinks ({formatWater(water.ml)}) are removed. You can add them again
        after.
      </ConfirmDialog>
    </Sheet>
  )
}

const PRESET_OPTIONS = WATER_GOAL_PRESETS_ML.map((ml) => ({
  value: String(ml),
  label: formatWater(ml),
}))

const litresText = (ml: number | null) => (ml === null ? '' : String(ml / 1000))

function WaterGoalSheet({
  open,
  goalMl,
  onClose,
}: {
  open: boolean
  goalMl: number | null
  onClose: () => void
}) {
  return (
    <Sheet open={open} onClose={onClose} label="Daily water goal">
      {open && <GoalForm goalMl={goalMl} onDone={onClose} />}
    </Sheet>
  )
}

function GoalForm({ goalMl, onDone }: { goalMl: number | null; onDone: () => void }) {
  const [text, setText] = useState(litresText(goalMl ?? 3000))
  const save = useWaterGoal(onDone)
  const ml = litresToMl(text)
  const invalid = ml === null || ml < MIN_WATER_GOAL_ML || ml > MAX_WATER_GOAL_ML
  const preset =
    ml !== null && PRESET_OPTIONS.some((o) => o.value === String(ml)) ? String(ml) : null

  return (
    <form
      className="flex flex-col gap-5 pb-6"
      onSubmit={(e) => {
        e.preventDefault()
        if (!invalid) save.mutate(ml)
      }}
    >
      <div>
        <h2 className="font-display font-extrabold text-[24px] leading-7">Daily water goal</h2>
        <p className="mt-1 text-[14px] text-ink-muted">
          How much to drink a day. Your coach can change it too.
        </p>
      </div>
      <ChoiceChips
        label="Pick a goal"
        options={PRESET_OPTIONS}
        value={preset}
        onChange={(v) => v && setText(litresText(Number(v)))}
        className="no-scrollbar -mx-5 flex-nowrap overflow-x-auto px-5 md:mx-0 md:px-0 [&>button]:shrink-0 [&>button]:whitespace-nowrap"
      />
      <Field
        label="Litres a day"
        hint={`Between ${formatWater(MIN_WATER_GOAL_ML)} and ${formatWater(MAX_WATER_GOAL_ML)}.`}
        error={text !== '' && invalid ? 'Enter litres, e.g. 3 or 2.5' : undefined}
      >
        {(id) => (
          <Input
            id={id}
            inputMode="decimal"
            enterKeyHint="done"
            autoComplete="off"
            value={text}
            onChange={(e) => setText(e.target.value.replace(/[^\d.,]/g, ''))}
            className="tabular"
          />
        )}
      </Field>
      {save.isError && (
        <p role="alert" className="font-semibold text-[14px] text-danger">
          Couldn’t save. Check your signal and try again.
        </p>
      )}
      <Button type="submit" size="lg" block disabled={invalid} loading={save.isPending}>
        Save goal
      </Button>
      {goalMl !== null && (
        <Button
          type="button"
          variant="ghost"
          className="self-center"
          disabled={save.isPending}
          onClick={() => save.mutate(null)}
        >
          Remove the goal
        </Button>
      )}
    </form>
  )
}

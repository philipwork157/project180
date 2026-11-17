import { type FoodEntry, roundGrams, roundKcal } from '@project180/shared'
import { Button, ConfirmDialog } from '@project180/ui'
import { Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useDeleteFood, useUpdateFood } from '../lib/food'
import { FoodForm, MealPicker } from './food-form'
import { Sheet } from './sheet'

/** Change a food already logged (its numbers or its meal), or delete it. */
export function EditFoodSheet({
  entry,
  onClose,
}: {
  entry: FoodEntry | null
  onClose: () => void
}) {
  return (
    <Sheet open={entry !== null} onClose={onClose} label="Edit food">
      {entry && <EditFood key={entry.id} entry={entry} onDone={onClose} />}
    </Sheet>
  )
}

function EditFood({ entry, onDone }: { entry: FoodEntry; onDone: () => void }) {
  const [meal, setMeal] = useState(entry.meal)
  // Ate more or less than logged: scale every number at once (the form restarts with them).
  const [portion, setPortion] = useState(1)
  const scaled = scaleEntry(entry, portion)
  const [confirming, setConfirming] = useState(false)
  const update = useUpdateFood(onDone)
  const remove = useDeleteFood(onDone)
  return (
    <div className="flex flex-col gap-5 pb-6">
      <div className="pr-12">
        <h2 className="font-display font-extrabold text-[24px] leading-7">Edit food</h2>
        {entry.source === 'photo' && (
          <p className="mt-1 text-[14px] text-ink-muted">Estimated from a photo.</p>
        )}
      </div>
      <MealPicker value={meal} onChange={setMeal} />
      <div className="flex flex-col gap-2">
        <p className="font-bold text-[14px]">How much did you have?</p>
        <div className="no-scrollbar flex gap-2 overflow-x-auto">
          {PORTIONS.map((p) => (
            <Button
              key={p}
              size="sm"
              variant={p === portion ? 'primary' : 'secondary'}
              className="h-11 min-w-16 shrink-0 whitespace-nowrap"
              onClick={() => setPortion(p)}
            >
              {portionLabel(p)}
            </Button>
          ))}
        </div>
      </div>
      <FoodForm
        key={portion}
        initial={scaled}
        submitLabel="Save changes"
        saving={update.isPending}
        error={update.isError ? 'Couldn’t save. Check your signal and try again.' : null}
        onSubmit={({ clientUuid: _uuid, ...food }) =>
          update.mutate({ id: entry.id, meal, ...food })
        }
        extra={
          <Button
            variant="ghost"
            icon={<Trash2 className="size-4" aria-hidden />}
            className="self-start text-danger hover:bg-danger/10"
            onClick={() => setConfirming(true)}
          >
            Delete this food
          </Button>
        }
      />
      <ConfirmDialog
        open={confirming}
        title={`Delete ${entry.name}?`}
        confirmLabel="Delete"
        loading={remove.isPending}
        onClose={() => setConfirming(false)}
        onConfirm={() => remove.mutate({ id: entry.id })}
      >
        {remove.isError
          ? 'Couldn’t delete it. Check your signal and try again.'
          : 'It comes off this day’s totals.'}
      </ConfirmDialog>
    </div>
  )
}

const PORTIONS = [0.5, 0.75, 1, 1.5, 2, 3]
const portionLabel = (p: number) =>
  p === 1 ? 'As logged' : p === 0.5 ? 'Half' : p === 0.75 ? '¾' : `${p}×`

/** A food's numbers for a portion of what was logged (1 = unchanged). */
function scaleEntry(entry: FoodEntry, portion: number): FoodEntry {
  if (portion === 1) return entry
  const g = (v: number | null) => (v === null ? null : roundGrams(v * portion))
  return {
    ...entry,
    grams: g(entry.grams),
    kcal: roundKcal(entry.kcal * portion),
    proteinG: roundGrams(entry.proteinG * portion),
    carbsG: g(entry.carbsG),
    fatG: g(entry.fatG),
    fibreG: g(entry.fibreG),
    sugarG: g(entry.sugarG),
    sodiumMg: entry.sodiumMg === null ? null : Math.round(entry.sodiumMg * portion),
  }
}

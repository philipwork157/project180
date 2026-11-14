import type { FoodEntry } from '@project180/shared'
import { Button, ConfirmDialog } from '@project180/ui'
import { Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useDeleteFood, useUpdateFood } from '../lib/food'
import { FoodForm, MealPicker } from './food-form'
import { Sheet } from './sheet'

/** Change a food already logged (its numbers or its meal), or delete it. */
export function EditFoodSheet({ entry, onClose }: { entry: FoodEntry | null; onClose: () => void }) {
  return (
    <Sheet open={entry !== null} onClose={onClose} label="Edit food">
      {entry && <EditFood key={entry.id} entry={entry} onDone={onClose} />}
    </Sheet>
  )
}

function EditFood({ entry, onDone }: { entry: FoodEntry; onDone: () => void }) {
  const [meal, setMeal] = useState(entry.meal)
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
      <FoodForm
        initial={entry}
        submitLabel="Save changes"
        saving={update.isPending}
        error={update.isError ? 'Couldn’t save. Check your signal and try again.' : null}
        onSubmit={({ clientUuid: _uuid, ...food }) => update.mutate({ id: entry.id, meal, ...food })}
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

import { MEAL_LABELS, MEALS, type Meal } from '@project180/shared'
import { Button, ChoiceChips, Field, Input } from '@project180/ui'
import { type ReactNode, useState } from 'react'
import { amountText, type FoodDraftItem, parseAmount } from '../lib/food'

const MEAL_OPTIONS = MEALS.map((m) => ({ value: m, label: MEAL_LABELS[m] }))

/** Breakfast, Lunch, Dinner, Snacks: one always picked. Scrolls sideways on a narrow phone. */
export function MealPicker({ value, onChange }: { value: Meal; onChange: (meal: Meal) => void }) {
  return (
    <ChoiceChips
      label="Meal"
      options={MEAL_OPTIONS}
      value={value}
      onChange={(m) => m && onChange(m)}
      className="no-scrollbar -mx-5 flex-nowrap overflow-x-auto px-5 md:mx-0 md:px-0 [&>button]:shrink-0 [&>button]:whitespace-nowrap"
    />
  )
}

/** A number field with the phone's number keypad. */
export function AmountInput({
  id,
  value,
  onChange,
  placeholder,
  compact,
  label,
}: {
  id?: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  compact?: boolean
  /** For fields without a visible label (the photo review's small boxes). */
  label?: string
}) {
  return (
    <Input
      id={id}
      inputMode="decimal"
      enterKeyHint="next"
      autoComplete="off"
      aria-label={label}
      compact={compact}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/[^\d.,]/g, ''))}
      className="tabular"
    />
  )
}

interface FormValues {
  name: string
  grams: string
  kcal: string
  proteinG: string
  carbsG: string
  fatG: string
}

const toValues = (food?: Partial<FoodDraftItem>): FormValues => ({
  name: food?.name ?? '',
  grams: amountText(food?.grams),
  kcal: amountText(food?.kcal),
  proteinG: amountText(food?.proteinG),
  carbsG: amountText(food?.carbsG),
  fatG: amountText(food?.fatG),
})

/**
 * Name, amount and the numbers for one food. Calories or protein is enough; carbs, fat and the
 * amount are optional. The id it saves with stays the same if Save is tapped again after a
 * dropped connection, so the food is never saved twice.
 */
export function FoodForm({
  initial,
  submitLabel,
  saving,
  error,
  onSubmit,
  extra,
}: {
  initial?: Partial<FoodDraftItem>
  submitLabel: string
  saving: boolean
  error?: string | null
  onSubmit: (food: FoodDraftItem) => void
  /** Shown under the fields (the meal picker, a delete button). */
  extra?: ReactNode
}) {
  const [values, setValues] = useState(() => toValues(initial))
  const [clientUuid] = useState(() => initial?.clientUuid ?? crypto.randomUUID())
  const [tried, setTried] = useState(false)
  const set = (key: keyof FormValues) => (value: string) =>
    setValues((v) => ({ ...v, [key]: value }))
  const kcal = parseAmount(values.kcal)
  const proteinG = parseAmount(values.proteinG)
  const nameError = values.name.trim() ? undefined : 'Give it a name'
  const numbersError = kcal !== null || proteinG !== null ? undefined : 'Add calories or protein'
  const valid = !nameError && !numbersError

  return (
    <form
      className="flex flex-col gap-5"
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        setTried(true)
        if (!valid) return
        onSubmit({
          clientUuid,
          name: values.name.trim(),
          grams: parseAmount(values.grams),
          kcal: kcal ?? 0,
          proteinG: proteinG ?? 0,
          carbsG: parseAmount(values.carbsG),
          fatG: parseAmount(values.fatG),
        })
      }}
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Field label="Food" error={tried ? nameError : undefined}>
          {(id) => (
            <Input
              id={id}
              autoComplete="off"
              enterKeyHint="next"
              maxLength={120}
              placeholder="e.g. Chicken wrap"
              value={values.name}
              onChange={(e) => set('name')(e.target.value)}
            />
          )}
        </Field>
        <Field label="Amount (g)" hint="Optional">
          {(id) => <AmountInput id={id} value={values.grams} onChange={set('grams')} />}
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Field label="Calories (kcal)" error={tried ? numbersError : undefined}>
          {(id) => <AmountInput id={id} value={values.kcal} onChange={set('kcal')} />}
        </Field>
        <Field label="Protein (g)">
          {(id) => <AmountInput id={id} value={values.proteinG} onChange={set('proteinG')} />}
        </Field>
        <Field label="Carbs (g)" hint="Optional">
          {(id) => <AmountInput id={id} value={values.carbsG} onChange={set('carbsG')} />}
        </Field>
        <Field label="Fat (g)" hint="Optional">
          {(id) => <AmountInput id={id} value={values.fatG} onChange={set('fatG')} />}
        </Field>
      </div>
      {extra}
      {error && (
        <p
          role="alert"
          className="rounded-md bg-danger/10 p-3 font-semibold text-[14px] text-danger"
        >
          {error}
        </p>
      )}
      <Button type="submit" size="lg" block loading={saving}>
        {submitLabel}
      </Button>
    </form>
  )
}

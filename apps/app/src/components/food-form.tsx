import { MEAL_LABELS, MEALS, type Meal, type NutrientKey, perGram } from '@project180/shared'
import { Button, ChoiceChips, Field, Input } from '@project180/ui'
import { Plus } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import {
  amountText,
  type FoodDraftItem,
  followGrams,
  type NutrientText,
  nutrientText,
  parseAmount,
} from '../lib/food'

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
  onBlur,
}: {
  id?: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  compact?: boolean
  /** For fields without a visible label (the photo review's small boxes). */
  label?: string
  onBlur?: () => void
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
      onBlur={onBlur}
      className="tabular"
    />
  )
}

/**
 * Name, amount and the numbers for one food. Calories or protein is enough; carbs, fat and the
 * amount are optional. Once there's an amount and a number, changing the amount scales every
 * number with it (a 100 g banana becomes 150 g with half as much again of everything). The id it saves with stays the same if Save is tapped again after a
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
  const [name, setName] = useState(initial?.name ?? '')
  const [amounts, setAmounts] = useState(() => ({
    grams: amountText(initial?.grams),
    numbers: nutrientText(initial ?? {}),
    basis: perGram(initial ?? {}, initial?.grams),
  }))
  const values: NutrientText & { name: string; grams: string } = {
    ...amounts.numbers,
    name,
    grams: amounts.grams,
  }
  const [clientUuid] = useState(() => initial?.clientUuid ?? crypto.randomUUID())
  const [tried, setTried] = useState(false)
  // Fibre, sugar and sodium tucked away unless the food already has some.
  const [more, setMore] = useState(
    () => initial?.fibreG != null || initial?.sugarG != null || initial?.sodiumMg != null,
  )
  // The amount: every number follows it. A number: kept as typed, and the amount follows it next.
  const onGrams = (grams: string) => setAmounts((a) => followGrams(a, { grams }))
  const set = (key: NutrientKey) => (value: string) =>
    setAmounts((a) => followGrams(a, { key, value }))
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
          fibreG: parseAmount(values.fibreG),
          sugarG: parseAmount(values.sugarG),
          sodiumMg: parseAmount(values.sodiumMg),
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
              onChange={(e) => setName(e.target.value)}
            />
          )}
        </Field>
        <Field
          label="Amount (g)"
          hint={amounts.basis ? 'The numbers follow the amount' : 'Optional'}
        >
          {(id) => (
            <AmountInput
              id={id}
              value={values.grams}
              onChange={onGrams}
              onBlur={() => setAmounts((a) => followGrams(a, { settle: true }))}
            />
          )}
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
      {more ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Field label="Fibre (g)" hint="Optional">
            {(id) => <AmountInput id={id} value={values.fibreG} onChange={set('fibreG')} />}
          </Field>
          <Field label="Sugar (g)" hint="Optional">
            {(id) => <AmountInput id={id} value={values.sugarG} onChange={set('sugarG')} />}
          </Field>
          <Field label="Sodium (mg)" hint="Optional">
            {(id) => <AmountInput id={id} value={values.sodiumMg} onChange={set('sodiumMg')} />}
          </Field>
        </div>
      ) : (
        <Button
          variant="ghost"
          className="self-start"
          icon={<Plus className="size-4" aria-hidden />}
          onClick={() => setMore(true)}
        >
          Fibre, sugar and sodium
        </Button>
      )}
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

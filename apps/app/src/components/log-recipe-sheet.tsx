import {
  formatAmount,
  gramsLabel,
  kcalLabel,
  MEAL_LABELS,
  type Meal,
  mealForHour,
  type Recipe,
  recipePortion,
  todayIn,
} from '@project180/shared'
import { Button, IconButton } from '@project180/ui'
import { Minus, Plus } from 'lucide-react'
import { useState } from 'react'
import { useLogRecipe } from '../lib/recipes'
import { MealPicker } from './food-form'
import { Sheet } from './sheet'

const STEP = 0.5
const MAX_PORTIONS = 6

/** Adds what you ate of a recipe to today's food: which meal and how many servings. */
export function LogRecipeSheet({
  recipe,
  timezone,
  open,
  onClose,
  onLogged,
}: {
  recipe: Recipe
  timezone: string
  open: boolean
  onClose: () => void
  onLogged: (meal: Meal) => void
}) {
  return (
    <Sheet open={open} onClose={onClose} label={`Log ${recipe.title}`}>
      {open && <LogRecipe recipe={recipe} timezone={timezone} onLogged={onLogged} />}
    </Sheet>
  )
}

function LogRecipe({
  recipe,
  timezone,
  onLogged,
}: {
  recipe: Recipe
  timezone: string
  onLogged: (meal: Meal) => void
}) {
  const [meal, setMeal] = useState<Meal>(() => mealForHour(new Date().getHours()))
  const [servings, setServings] = useState(1)
  // Made once per opening, so a retry on poor signal never logs it twice.
  const [clientUuid] = useState(() => crypto.randomUUID())
  const portion = recipePortion(recipe, servings)
  const log = useLogRecipe(() => onLogged(meal))

  return (
    <div className="flex flex-col gap-5 pb-6">
      <div>
        <h2 className="font-display font-extrabold text-[24px] leading-7">Log it to Fuel</h2>
        <p className="mt-1 text-[14px] text-ink-muted">{recipe.title}, added to today.</p>
      </div>
      <MealPicker value={meal} onChange={setMeal} />

      <div className="flex items-center gap-4 rounded-md bg-surface-raised p-4">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="font-extrabold text-[11px] text-ink-muted uppercase tracking-[0.08em]">
            Servings you ate
          </p>
          <p className="tabular text-[14px] text-ink-muted">
            {kcalLabel(portion.kcal)} kcal · {gramsLabel(portion.proteinG)} g protein
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <IconButton
            label="Less"
            icon={<Minus aria-hidden />}
            className="size-11 bg-surface"
            disabled={servings <= STEP}
            onClick={() => setServings((s) => Math.max(STEP, s - STEP))}
          />
          <output className="metric w-12 text-center text-[28px] leading-none" aria-live="polite">
            {formatAmount(servings)}
          </output>
          <IconButton
            label="More"
            icon={<Plus aria-hidden />}
            className="size-11 bg-surface"
            disabled={servings >= MAX_PORTIONS}
            onClick={() => setServings((s) => Math.min(MAX_PORTIONS, s + STEP))}
          />
        </div>
      </div>

      <Button
        size="lg"
        block
        loading={log.isPending}
        onClick={() => log.log({ recipe, servings, meal, date: todayIn(timezone), clientUuid })}
      >
        Add to {MEAL_LABELS[meal]}
      </Button>
      {log.isError && (
        <p className="font-semibold text-[14px] text-danger" role="alert">
          Couldn’t save. Check your signal and try again.
        </p>
      )}
    </div>
  )
}

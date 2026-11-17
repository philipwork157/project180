import { recipePageQuery } from '@project180/client'
import {
  gramsLabel,
  kcalLabel,
  type Meal,
  minutesLabel,
  proteinShare,
  type Recipe,
  type RecipeCategory,
  recipeKindLabel,
  recipePhoto,
} from '@project180/shared'
import { cn, IconButton } from '@project180/ui'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  Apple,
  Baby,
  ChefHat,
  ChevronRight,
  Clock,
  Cookie,
  CookingPot,
  CupSoda,
  Dumbbell,
  Egg,
  Heart,
  Sandwich,
  Zap,
} from 'lucide-react'
import { motion } from 'motion/react'
import { useSaveRecipe } from '../lib/recipes'

const MEAL_ICON: Record<Meal, typeof Egg> = {
  breakfast: Egg,
  lunch: Sandwich,
  dinner: CookingPot,
  snack: Apple,
}

export function MealIcon({ meal, className }: { meal: Meal; className?: string }) {
  const Icon = MEAL_ICON[meal]
  return (
    <span
      className={cn(
        'grid size-10 shrink-0 place-items-center rounded-full bg-surface-raised text-ink',
        className,
      )}
    >
      <Icon className="size-5" aria-hidden />
    </span>
  )
}

const CATEGORY_ICON: Partial<Record<RecipeCategory, typeof Egg>> = {
  smoothie: CupSoda,
  pre_workout: Zap,
  post_workout: Dumbbell,
  baking: Cookie,
  toddler: Baby,
}

/** A recipe's icon: its kind (smoothie, baking, toddler…), or its meal for everyday meals. */
export function RecipeIcon({ recipe, className }: { recipe: Recipe; className?: string }) {
  const Icon = CATEGORY_ICON[recipe.category]
  if (!Icon) return <MealIcon meal={recipe.meal} className={className} />
  return (
    <span
      className={cn(
        'grid size-10 shrink-0 place-items-center rounded-full bg-surface-raised text-ink',
        className,
      )}
    >
      <Icon className="size-5" aria-hidden />
    </span>
  )
}

/** The heart: saves a recipe to your list. Pops when you save it. */
export function SaveRecipeButton({
  recipe,
  size = 'md',
  className,
}: {
  recipe: Recipe
  size?: 'md' | 'lg'
  className?: string
}) {
  const save = useSaveRecipe()
  return (
    <IconButton
      label={recipe.saved ? `Remove ${recipe.title} from saved` : `Save ${recipe.title}`}
      active={recipe.saved}
      size={size}
      className={cn('size-11 shrink-0', className)}
      icon={
        <motion.span
          key={String(recipe.saved)}
          initial={recipe.saved ? { scale: 0.6 } : false}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 500, damping: 18 }}
          className="grid place-items-center"
        >
          <Heart
            aria-hidden
            className={cn('size-5', recipe.saved && 'fill-current text-brand-text')}
          />
        </motion.span>
      }
      onClick={() => save.mutate({ id: recipe.id, saved: !recipe.saved })}
    />
  )
}

/**
 * One recipe in the list: what it is, how long, and its protein and calories per serving.
 * banner = some recipes in the list have photos, so the ones without show a quiet placeholder
 * and the cards in a row stay the same shape.
 */
export function RecipeCard({ recipe, banner = false }: { recipe: Recipe; banner?: boolean }) {
  const minutes = recipe.prepMinutes + recipe.cookMinutes
  const share = proteinShare(recipe.kcal, recipe.proteinG)
  const photo = recipePhoto(recipe.imageKey)
  return (
    <article className="relative flex w-full min-w-0 flex-col gap-4 rounded-lg bg-surface p-5 shadow-card transition hover:shadow-float active:scale-[0.99] md:p-6">
      {(photo || banner) && (
        <div className="-mx-5 -mt-5 md:-mx-6 md:-mt-6 grid aspect-[16/9] place-items-center overflow-hidden rounded-t-lg bg-surface-raised text-ink-muted">
          {photo ? (
            <img
              src={photo}
              alt=""
              loading="lazy"
              decoding="async"
              className="size-full object-cover"
            />
          ) : (
            <ChefHat className="size-10 opacity-40" aria-hidden />
          )}
        </div>
      )}
      <header className="flex items-center gap-3">
        <RecipeIcon recipe={recipe} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="font-extrabold text-[11px] text-ink-muted uppercase tracking-[0.08em]">
            {recipeKindLabel(recipe).replace(/ recipe$/, '')}
          </p>
          {minutes > 0 && (
            <p className="flex items-center gap-1.5 text-[13px] text-ink-muted">
              <Clock className="size-3.5 text-steel-text" aria-hidden />
              {minutesLabel(minutes)}
            </p>
          )}
        </div>
        {/* Above the card-wide link, so the heart gets its own taps. */}
        <SaveRecipeButton recipe={recipe} className="relative z-10 -mr-2" />
      </header>
      <div className="flex flex-col gap-1">
        <h2 className="font-bold text-[18px] leading-snug">
          <Link
            to="/recipes/$recipeId"
            params={{ recipeId: String(recipe.id) }}
            className="after:absolute after:inset-0 after:rounded-lg hover:text-brand-text"
          >
            {recipe.title}
          </Link>
        </h2>
        {recipe.summary && (
          <p className="line-clamp-2 text-[14px] text-ink-muted">{recipe.summary}</p>
        )}
      </div>
      <dl className="mt-auto flex flex-wrap items-end gap-x-5 gap-y-2 border-border border-t pt-4">
        <div className="flex flex-col gap-1">
          <dt className="font-extrabold text-[11px] text-ink-muted uppercase tracking-[0.08em]">
            Protein
          </dt>
          <dd className="flex items-baseline gap-1">
            <span className="metric text-[28px] leading-none">{gramsLabel(recipe.proteinG)}</span>
            <span className="font-semibold text-[13px] text-ink-muted">g</span>
          </dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="font-extrabold text-[11px] text-ink-muted uppercase tracking-[0.08em]">
            Calories
          </dt>
          <dd className="flex items-baseline gap-1">
            <span className="metric text-[28px] leading-none">{kcalLabel(recipe.kcal)}</span>
            <span className="font-semibold text-[13px] text-ink-muted">kcal</span>
          </dd>
        </div>
        {share !== null && (
          <p className="ml-auto self-center rounded-pill bg-brand-soft px-3 py-1 font-bold text-[12px] text-brand-text">
            {share}% protein
          </p>
        )}
      </dl>
    </article>
  )
}

/** The way in from Fuel: a card that opens the recipes. */
export function RecipesEntryCard() {
  // Just the counts: one recipe on the page is enough.
  const recipes = useQuery(recipePageQuery({ adult: '1', pageSize: 1 }))
  const count = recipes.data?.counts.adult ?? 0
  const saved = recipes.data?.counts.saved ?? 0
  return (
    <Link
      to="/recipes"
      className="flex items-center gap-3 rounded-lg bg-surface p-5 shadow-card transition hover:bg-surface-raised/60 active:scale-[0.99] md:p-6"
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-soft text-brand-text">
        <ChefHat className="size-5" aria-hidden />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="font-bold text-[17px]">Recipes</span>
        <span className="text-[13px] text-ink-muted">
          {count === 0
            ? 'High-protein meals to cook at home'
            : `${count} high-protein ${count === 1 ? 'meal' : 'meals'} to cook${saved ? ` · ${saved} saved` : ''}`}
        </span>
      </span>
      <ChevronRight className="size-5 shrink-0 text-ink-muted" aria-hidden />
    </Link>
  )
}

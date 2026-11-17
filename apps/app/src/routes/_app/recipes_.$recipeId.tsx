import { recipeQuery } from '@project180/client'
import {
  gramsLabel,
  ingredientLabel,
  kcalLabel,
  MAX_RECIPE_SERVINGS,
  MEAL_LABELS,
  type Meal,
  minutesLabel,
  proteinShare,
  type Recipe,
  recipeKindLabel,
  recipePhoto,
} from '@project180/shared'
import { Button, cn, IconButton } from '@project180/ui'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate, useRouter } from '@tanstack/react-router'
import {
  ArrowLeft,
  Baby,
  Check,
  ChefHat,
  Clock,
  ExternalLink,
  Lightbulb,
  Minus,
  Plus,
  Utensils,
} from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'
import { LogRecipeSheet } from '../../components/log-recipe-sheet'
import { SaveRecipeButton } from '../../components/recipe-card'

export const Route = createFileRoute('/_app/recipes_/$recipeId')({
  component: RecipePage,
})

const smallCaps = 'font-extrabold text-[11px] text-ink-muted uppercase tracking-[0.08em]'

function RecipePage() {
  const { me } = Route.useRouteContext()
  const { recipeId } = Route.useParams()
  const router = useRouter()
  const navigate = useNavigate()
  const recipe = useQuery(recipeQuery(Number(recipeId)))
  const back = () =>
    router.history.canGoBack()
      ? router.history.back()
      : void navigate({ to: '/recipes', replace: true })

  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-start gap-3 pt-4 pb-1">
        <IconButton label="Back" icon={<ArrowLeft aria-hidden />} size="lg" onClick={back} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className={smallCaps}>{recipe.data ? recipeKindLabel(recipe.data) : 'Recipe'}</p>
          <h1 className="font-display font-extrabold text-[30px] leading-[34px] tracking-tight">
            {recipe.data?.title ?? (recipe.isError ? 'Recipe' : '…')}
          </h1>
        </div>
        {recipe.data && <SaveRecipeButton recipe={recipe.data} size="lg" />}
      </header>

      {recipe.isError ? (
        <div className="flex flex-col items-start gap-3 rounded-lg bg-surface p-5 shadow-card md:p-6">
          <p className="text-[14px] text-ink-muted">
            This recipe isn’t available. It may have been taken down.
          </p>
          <Link to="/recipes" className="font-bold text-[15px] text-brand-text">
            See all recipes
          </Link>
        </div>
      ) : !recipe.data ? (
        <div className="h-80 animate-pulse rounded-lg bg-surface" />
      ) : (
        <RecipeDetail recipe={recipe.data} timezone={me.timezone} />
      )}
    </div>
  )
}

function RecipeDetail({ recipe, timezone }: { recipe: Recipe; timezone: string }) {
  const [cookFor, setCookFor] = useState(recipe.servings)
  const [have, setHave] = useState<Set<number>>(() => new Set())
  const [done, setDone] = useState<Set<number>>(() => new Set())
  const [logging, setLogging] = useState(false)
  const [logged, setLogged] = useState<Meal | null>(null)
  const factor = cookFor / recipe.servings
  const share = proteinShare(recipe.kcal, recipe.proteinG)
  const photo = recipePhoto(recipe.imageKey)
  const toddler = recipe.category === 'toddler'
  const toggle = (set: Set<number>, i: number) => {
    const next = new Set(set)
    if (next.has(i)) next.delete(i)
    else next.add(i)
    navigator.vibrate?.(8)
    return next
  }
  const openLog = () => {
    setLogged(null)
    setLogging(true)
  }

  return (
    <>
      {recipe.summary && <p className="-mt-2 text-[15px] text-ink-muted">{recipe.summary}</p>}
      {/* Phone: numbers, ingredients, then the method. Laptop: numbers and ingredients on the
          left, the method beside them, so you can read both while cooking. */}
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
        <div className="flex flex-col gap-5">
          {photo && (
            <img
              src={photo}
              alt={recipe.title}
              decoding="async"
              className="aspect-[4/3] w-full rounded-lg bg-surface object-cover shadow-card"
            />
          )}
          <section
            aria-label="Per serving"
            className="flex flex-col gap-5 rounded-lg bg-surface p-5 shadow-card md:p-6"
          >
            <div className="flex items-end justify-between gap-4">
              <div className="flex flex-col gap-1">
                <p className={smallCaps}>Protein per serving</p>
                <p className="flex items-baseline gap-1.5">
                  <span className="metric text-[44px] leading-none">
                    {gramsLabel(recipe.proteinG)}
                  </span>
                  <span className="font-semibold text-[15px] text-ink-muted">g</span>
                </p>
              </div>
              {share !== null && (
                <p className="rounded-pill bg-brand-soft px-3 py-1 font-bold text-[13px] text-brand-text">
                  {share}% of calories
                </p>
              )}
            </div>
            <dl className="grid grid-cols-3 gap-2">
              <Stat label="Calories" value={kcalLabel(recipe.kcal)} unit="kcal" />
              <Stat
                label="Carbs"
                value={recipe.carbsG === null ? '–' : gramsLabel(recipe.carbsG)}
                unit={recipe.carbsG === null ? '' : 'g'}
              />
              <Stat
                label="Fat"
                value={recipe.fatG === null ? '–' : gramsLabel(recipe.fatG)}
                unit={recipe.fatG === null ? '' : 'g'}
              />
            </dl>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[14px]">
              <span className="flex items-center gap-2">
                <Clock className="size-4 text-steel-text" aria-hidden />
                <span>
                  <b>{minutesLabel(recipe.prepMinutes)}</b>{' '}
                  <span className="text-ink-muted">prep</span>
                </span>
              </span>
              {recipe.cookMinutes > 0 && (
                <span>
                  <b>{minutesLabel(recipe.cookMinutes)}</b>{' '}
                  <span className="text-ink-muted">cooking</span>
                </span>
              )}
              <span className="flex items-center gap-2">
                <Utensils className="size-4 text-ink-muted" aria-hidden />
                <span>
                  Makes <b>{recipe.servings}</b>
                </span>
              </span>
            </div>
            {/* Toddler recipes are for the little one, not for your own food log. */}
            {toddler ? (
              <p className="flex items-start gap-3 rounded-md bg-sand/15 p-4 text-[14px]">
                <Baby className="mt-0.5 size-5 shrink-0 text-sand-text" aria-hidden />
                <span>
                  For little ones from about 12 months. No added salt or sugar; cut everything small
                  and soft, and sit with them while they eat. Numbers are per toddler serving.
                </span>
              </p>
            ) : (
              <>
                <Button
                  size="lg"
                  block
                  icon={<Plus className="size-5" aria-hidden />}
                  onClick={openLog}
                >
                  Log a serving
                </Button>
                <LoggedNote meal={logged} />
              </>
            )}
          </section>

          <section
            aria-label="Ingredients"
            className="flex flex-col gap-4 rounded-lg bg-surface p-5 shadow-card md:p-6"
          >
            <header className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-col gap-1">
                <h2 className="font-bold text-[17px]">Ingredients</h2>
                <p className="text-[13px] text-ink-muted">Tap what you have to tick it off.</p>
              </div>
              <div className="flex items-center gap-2 rounded-pill bg-surface-raised p-1">
                <IconButton
                  label="Cook for fewer"
                  icon={<Minus aria-hidden />}
                  className="size-11 rounded-pill bg-surface"
                  disabled={cookFor <= 1}
                  onClick={() => setCookFor((n) => Math.max(1, n - 1))}
                />
                <output aria-live="polite" className="min-w-16 text-center text-[13px] leading-4">
                  <span className="metric block text-[20px] leading-6">{cookFor}</span>
                  {cookFor === 1 ? 'serving' : 'servings'}
                </output>
                <IconButton
                  label="Cook for more"
                  icon={<Plus aria-hidden />}
                  className="size-11 rounded-pill bg-surface"
                  disabled={cookFor >= MAX_RECIPE_SERVINGS}
                  onClick={() => setCookFor((n) => Math.min(MAX_RECIPE_SERVINGS, n + 1))}
                />
              </div>
            </header>
            <ul className="flex w-full flex-col">
              {recipe.ingredients.map((ing, i) => {
                const on = have.has(i)
                return (
                  // biome-ignore lint/suspicious/noArrayIndexKey: ingredients have no id; the list never reorders here
                  <li key={i}>
                    <button
                      type="button"
                      aria-pressed={on}
                      onClick={() => setHave((s) => toggle(s, i))}
                      className="flex min-h-12 w-full items-center gap-3 border-border border-t py-2.5 text-left transition active:scale-[0.99]"
                    >
                      <CheckDot on={on} />
                      <span
                        className={cn(
                          'text-[15px] transition',
                          on && 'text-ink-muted line-through decoration-ink-muted/60',
                        )}
                      >
                        {ingredientLabel(ing, factor)}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        </div>

        <div className="flex flex-col gap-5">
          <section
            aria-label="Method"
            className="flex flex-col gap-4 rounded-lg bg-surface p-5 shadow-card md:p-6"
          >
            <header className="flex flex-col gap-1">
              <h2 className="font-bold text-[17px]">Method</h2>
              <p className="text-[13px] text-ink-muted">Tap a step when it’s done.</p>
            </header>
            <ol className="flex w-full flex-col gap-2">
              {recipe.steps.map((step, i) => {
                const on = done.has(i)
                return (
                  // biome-ignore lint/suspicious/noArrayIndexKey: steps have no id; the list never reorders here
                  <li key={i}>
                    <button
                      type="button"
                      aria-pressed={on}
                      onClick={() => setDone((s) => toggle(s, i))}
                      className={cn(
                        'flex w-full items-start gap-4 rounded-md p-3 text-left transition hover:bg-surface-raised/60 active:scale-[0.99]',
                        on && 'opacity-60',
                      )}
                    >
                      <span
                        className={cn(
                          'grid size-8 shrink-0 place-items-center rounded-full font-display font-extrabold text-[15px] transition',
                          on ? 'bg-lime text-on-lime' : 'bg-surface-raised text-ink',
                        )}
                      >
                        {on ? <Check className="size-4" strokeWidth={3} aria-hidden /> : i + 1}
                      </span>
                      <span className="pt-1 text-[15px] leading-6">
                        <span className="sr-only">Step {i + 1}: </span>
                        {step}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ol>
          </section>

          {recipe.tips && (
            <section
              aria-label="Tips"
              className="flex gap-3 rounded-lg bg-surface p-5 shadow-card md:p-6"
            >
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-sand/25 text-sand-text">
                <Lightbulb className="size-5" aria-hidden />
              </span>
              <div className="flex min-w-0 flex-col gap-1">
                <h2 className="font-bold text-[17px]">Tips</h2>
                <p className="whitespace-pre-line text-[15px] text-ink-muted">{recipe.tips}</p>
              </div>
            </section>
          )}

          {/* At the end of the method on a phone: cooked it, log it, without scrolling back up. */}
          {!toddler && (
            <Button
              size="lg"
              block
              variant="secondary"
              className="lg:hidden"
              icon={<ChefHat className="size-5" aria-hidden />}
              onClick={openLog}
            >
              Made it? Log a serving
            </Button>
          )}

          {recipe.sourceName && (
            <p className="text-[13px] text-ink-muted">
              Adapted from{' '}
              {recipe.sourceUrl ? (
                <a
                  href={recipe.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-bold text-brand-text"
                >
                  {recipe.sourceName}
                  <ExternalLink className="size-3.5" aria-hidden />
                </a>
              ) : (
                <b>{recipe.sourceName}</b>
              )}
            </p>
          )}
        </div>
      </div>

      <LogRecipeSheet
        recipe={recipe}
        timezone={timezone}
        open={logging}
        onClose={() => setLogging(false)}
        onLogged={(meal) => {
          setLogging(false)
          setLogged(meal)
        }}
      />
    </>
  )
}

function Stat({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-md bg-surface-raised p-3">
      <dt className={smallCaps}>{label}</dt>
      <dd className="flex items-baseline gap-1">
        <span className="metric text-[22px] leading-none">{value}</span>
        {unit && <span className="font-semibold text-[12px] text-ink-muted">{unit}</span>}
      </dd>
    </div>
  )
}

function CheckDot({ on }: { on: boolean }) {
  return (
    <span
      className={cn(
        'grid size-6 shrink-0 place-items-center rounded-full transition',
        on ? 'bg-lime text-on-lime' : 'ring-[1.5px] ring-border-strong ring-inset',
      )}
    >
      <AnimatePresence initial={false}>
        {on && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
            transition={{ type: 'spring', stiffness: 600, damping: 22 }}
          >
            <Check className="size-3.5" strokeWidth={3} aria-hidden />
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  )
}

/** After logging: where it went, with a way to see it. */
function LoggedNote({ meal }: { meal: Meal | null }) {
  return (
    <AnimatePresence>
      {meal && (
        <motion.p
          role="status"
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          className="-mt-2 flex items-center gap-2 text-[14px]"
        >
          <span className="grid size-5 place-items-center rounded-full bg-lime text-on-lime">
            <Check className="size-3" strokeWidth={3} aria-hidden />
          </span>
          <span>
            Added to <b>{MEAL_LABELS[meal]}</b>.
          </span>
          <Link to="/fuel" className="font-bold text-brand-text">
            See Fuel
          </Link>
        </motion.p>
      )}
    </AnimatePresence>
  )
}

import { recipePageQuery } from '@project180/client'
import {
  MEAL_LABELS,
  type Meal,
  RECIPE_CATEGORIES,
  RECIPE_CATEGORY_LABELS,
  RECIPE_PAGE_SIZE,
  RECIPE_SORT_LABELS,
  RECIPE_SORTS,
  type RecipeCategory,
  type RecipeCounts,
  type RecipeListQuery,
  type RecipeSort,
  recipePhoto,
} from '@project180/shared'
import { Button, cn, IconButton, Input, Select } from '@project180/ui'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { ArrowLeft, Baby, ChefHat, ChevronLeft, ChevronRight, Heart, Search } from 'lucide-react'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { RecipeCard } from '../../components/recipe-card'

/** The chips: everything (not toddler), saved, a meal, or a kind of recipe. */
const MEAL_CHIPS = ['breakfast', 'lunch', 'dinner'] as const satisfies readonly Meal[]
type Show = 'all' | 'saved' | (typeof MEAL_CHIPS)[number] | Exclude<RecipeCategory, 'meal'>
const CATEGORY_CHIPS = RECIPE_CATEGORIES.filter(
  (c): c is Exclude<RecipeCategory, 'meal'> => c !== 'meal',
)
const SHOWS: readonly Show[] = ['all', 'saved', ...MEAL_CHIPS, ...CATEGORY_CHIPS]

interface RecipesSearch {
  show?: Show
  q?: string
  sort?: RecipeSort
  page?: number
}

export const Route = createFileRoute('/_app/recipes')({
  // Kept in the address, so coming back from a recipe lands on the same chip and page.
  validateSearch: (search: Record<string, unknown>): RecipesSearch => ({
    show: SHOWS.includes(search.show as Show) ? (search.show as Show) : undefined,
    q: typeof search.q === 'string' && search.q ? search.q.slice(0, 80) : undefined,
    sort: RECIPE_SORTS.includes(search.sort as RecipeSort)
      ? (search.sort as RecipeSort)
      : undefined,
    page: Number(search.page) > 1 ? Math.floor(Number(search.page)) : undefined,
  }),
  component: RecipesPage,
})

function showLabel(show: Show): string {
  if (show === 'all') return 'All'
  if (show === 'saved') return 'Saved'
  if ((MEAL_CHIPS as readonly string[]).includes(show)) return MEAL_LABELS[show as Meal]
  return RECIPE_CATEGORY_LABELS[show as RecipeCategory]
}

function showCount(show: Show, c: RecipeCounts): number {
  if (show === 'all') return c.adult
  if (show === 'saved') return c.saved
  if ((MEAL_CHIPS as readonly string[]).includes(show)) return c.meal[show as Meal]
  return c.category[show as RecipeCategory]
}

/** The API filters for a chip. */
function showParams(show: Show): RecipeListQuery {
  if (show === 'all') return { adult: '1' }
  if (show === 'saved') return { saved: '1' }
  if ((MEAL_CHIPS as readonly string[]).includes(show)) return { meal: show as Meal, adult: '1' }
  return { category: show as RecipeCategory }
}

/** The value after it stops changing for a moment (search as you type, one request). */
function useSettled<T>(value: T, ms = 250) {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setSettled(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return settled
}

function RecipesPage() {
  const navigate = useNavigate({ from: Route.fullPath })
  const search = Route.useSearch()
  const show = search.show ?? 'all'
  const sort = search.sort ?? 'name'
  const page = search.page ?? 1
  const [text, setText] = useState(search.q ?? '')
  const q = useSettled(text.trim())
  const top = useRef<HTMLDivElement>(null)

  const set = (next: RecipesSearch) =>
    void navigate({ search: (prev) => ({ ...prev, ...next }), replace: true })
  // A new search starts at page 1.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when the settled search changes
  useEffect(() => {
    if ((search.q ?? '') !== q) set({ q: q || undefined, page: undefined })
  }, [q])

  const query = useQuery(
    recipePageQuery({ ...showParams(show), q: search.q, sort, page, pageSize: RECIPE_PAGE_SIZE }),
  )
  const data = query.data
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1
  // Once any recipe on the page has a photo, every card gets the photo space so rows line up.
  const banner = data?.recipes.some((r) => recipePhoto(r.imageKey) !== null) ?? false
  const goTo = (p: number) => {
    set({ page: p > 1 ? p : undefined })
    top.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  const chips = SHOWS.filter(
    (s) => s === 'all' || s === 'saved' || s === show || (data && showCount(s, data.counts) > 0),
  )
  const nothingAtAll = data && !search.q && data.counts.adult + data.counts.category.toddler === 0

  return (
    <div ref={top} className="flex scroll-mt-4 flex-col gap-5">
      <header className="flex items-center gap-3 pt-4 pb-1">
        <IconButton
          label="Back to Fuel"
          icon={<ArrowLeft aria-hidden />}
          size="lg"
          onClick={() => void navigate({ to: '/fuel' })}
        />
        <div className="min-w-0">
          <p className="font-extrabold text-[11px] text-ink-muted uppercase tracking-[0.08em]">
            Fuel
          </p>
          <h1 className="mt-1 font-display font-extrabold text-[30px] leading-[34px] tracking-tight">
            Recipes
          </h1>
        </div>
      </header>

      {query.isError && !data ? (
        <p className="rounded-md bg-surface p-4 text-[14px] text-ink-muted shadow-card">
          Couldn’t load the recipes. Check your signal and try again.
        </p>
      ) : !data ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-72 animate-pulse rounded-lg bg-surface" />
          ))}
        </div>
      ) : nothingAtAll ? (
        <Empty
          icon={<ChefHat className="size-6" aria-hidden />}
          title="Recipes are on the way"
          text="High-protein meals to cook at home will show up here, with how much protein and how many calories are in each serving."
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
            <div className="relative">
              <Search
                className="pointer-events-none absolute top-1/2 left-4 size-[18px] -translate-y-1/2 text-ink-muted"
                aria-hidden
              />
              <Input
                type="search"
                inputMode="search"
                aria-label="Search recipes"
                placeholder="Search: chicken, oats, smoothie…"
                value={text}
                onChange={(e) => setText(e.target.value)}
                className="pl-11"
              />
            </div>
            <Select
              aria-label="Sort recipes"
              value={sort}
              onChange={(e) =>
                set({
                  sort: e.target.value === 'name' ? undefined : (e.target.value as RecipeSort),
                  page: undefined,
                })
              }
            >
              {RECIPE_SORTS.map((s) => (
                <option key={s} value={s}>
                  {RECIPE_SORT_LABELS[s]}
                </option>
              ))}
            </Select>
          </div>

          {/* biome-ignore lint/a11y/useSemanticElements: a row of filter pills, not a form fieldset */}
          <div
            role="group"
            aria-label="Show"
            className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0"
          >
            {chips.map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={show === s}
                onClick={() => set({ show: s === 'all' ? undefined : s, page: undefined })}
                className={cn(
                  'inline-flex h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-pill px-4 font-bold text-[14px] transition active:scale-[0.97]',
                  show === s
                    ? 'bg-brand text-on-brand'
                    : 'bg-surface text-ink shadow-card hover:bg-surface-raised',
                )}
              >
                {s === 'saved' && (
                  <Heart className={cn('size-4', show === s && 'fill-current')} aria-hidden />
                )}
                {s === 'toddler' && <Baby className="size-4" aria-hidden />}
                {showLabel(s)}
                <span className="tabular font-semibold text-[12px] opacity-70">
                  {showCount(s, data.counts)}
                </span>
              </button>
            ))}
          </div>

          {show === 'toddler' && <ToddlerNote />}

          {data.recipes.length === 0 ? (
            show === 'saved' && !search.q ? (
              <Empty
                icon={<Heart className="size-6" aria-hidden />}
                title="Nothing saved yet"
                text="Tap the heart on a recipe you love to keep it here."
              />
            ) : (
              <Empty
                icon={<Search className="size-6" aria-hidden />}
                title="No recipes match"
                text="Try another word, or show all recipes."
                action={
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setText('')
                      set({ show: undefined, q: undefined, page: undefined })
                    }}
                  >
                    Show all recipes
                  </Button>
                }
              />
            )
          ) : (
            <>
              <ul
                className={cn(
                  'grid grid-cols-1 gap-5 transition-opacity sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4',
                  query.isPlaceholderData && 'opacity-60',
                )}
              >
                {data.recipes.map((r) => (
                  <li key={r.id} className="flex">
                    <RecipeCard recipe={r} banner={banner} />
                  </li>
                ))}
              </ul>
              {pages > 1 && (
                <Pager
                  page={data.page}
                  pages={pages}
                  total={data.total}
                  size={data.pageSize}
                  onGo={goTo}
                />
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}

/** Previous / page x of y / next, with how many recipes in total. */
function Pager({
  page,
  pages,
  total,
  size,
  onGo,
}: {
  page: number
  pages: number
  total: number
  size: number
  onGo: (page: number) => void
}) {
  const from = (page - 1) * size + 1
  const to = Math.min(total, page * size)
  return (
    <nav
      aria-label="Recipe pages"
      className="flex flex-col gap-3 rounded-lg bg-surface p-4 shadow-card sm:flex-row sm:items-center sm:justify-between md:px-6"
    >
      <p className="tabular text-center font-semibold text-[14px] text-ink-muted sm:text-left">
        {from}–{to} of {total} recipes · page {page} of {pages}
      </p>
      <div className="grid grid-cols-2 gap-2 sm:flex">
        <Button
          variant="secondary"
          icon={<ChevronLeft className="size-5" aria-hidden />}
          disabled={page <= 1}
          onClick={() => onGo(page - 1)}
        >
          Previous
        </Button>
        <Button
          variant="secondary"
          className="flex-row-reverse"
          icon={<ChevronRight className="size-5" aria-hidden />}
          disabled={page >= pages}
          onClick={() => onGo(page + 1)}
        >
          Next
        </Button>
      </div>
    </nav>
  )
}

/** Shown above the toddler recipes: these are for little ones, not for your own food log. */
function ToddlerNote() {
  return (
    <div className="flex items-start gap-3 rounded-lg bg-surface p-4 shadow-card md:p-5">
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-sand/20 text-sand-text">
        <Baby className="size-5" aria-hidden />
      </span>
      <div className="flex min-w-0 flex-col gap-1">
        <p className="font-bold text-[15px]">For little ones from about 12 months</p>
        <p className="text-[14px] text-ink-muted">
          No added salt or sugar. Cut food into small, soft pieces, never whole nuts, grapes or
          cherry tomatoes, and always sit with them while they eat. Check new foods and allergies
          with your clinic.
        </p>
      </div>
    </div>
  )
}

function Empty({
  icon,
  title,
  text,
  action,
}: {
  icon: ReactNode
  title: string
  text: string
  action?: ReactNode
}) {
  return (
    <div className="flex w-full flex-col items-center gap-2 rounded-lg bg-surface px-5 py-12 text-center shadow-card">
      <span className="grid size-14 place-items-center rounded-full bg-surface-raised text-ink-muted">
        {icon}
      </span>
      <p className="mt-2 font-bold text-[17px]">{title}</p>
      <p className="max-w-sm text-[14px] text-ink-muted">{text}</p>
      {action && <div className="mt-3">{action}</div>}
    </div>
  )
}

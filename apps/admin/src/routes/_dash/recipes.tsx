import { ApiError, api, putRecipe, recipePageQuery } from '@project180/client'
import {
  gramsLabel,
  ingredientLabel,
  ingredientLine,
  isOwner,
  kcalLabel,
  MEAL_LABELS,
  MEALS,
  type Meal,
  minutesLabel,
  parseIngredientLines,
  parseStepLines,
  proteinShare,
  RECIPE_CATEGORIES,
  RECIPE_CATEGORY_LABELS,
  type Recipe,
  type RecipeCategory,
  type RecipePage,
  recipeInput,
  recipeKindLabel,
} from '@project180/shared'
import {
  Button,
  Card,
  Chip,
  ConfirmDialog,
  cn,
  Drawer,
  EmptyState,
  Field,
  IconButton,
  Input,
  Select,
  Textarea,
  toast,
} from '@project180/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { Archive, ArchiveRestore, ChefHat, Clock, Pencil, Plus, Trash2 } from 'lucide-react'
import { type FormEvent, useEffect, useState } from 'react'
import { SearchInput, Segmented, Toolbar } from '../../components/controls'
import { PageHeader } from '../../components/page-header'
import { RecipePhotoField, RecipeThumb } from '../../components/recipe-photo'

const ADMIN_PAGE_SIZE = 20

/** The value after it stops changing for a moment (search as you type, one request). */
function useSettled<T>(value: T, ms = 250) {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setSettled(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return settled
}

export const Route = createFileRoute('/_dash/recipes')({
  component: RecipesPage,
})

function RecipesPage() {
  const { me } = Route.useRouteContext()
  const queryClient = useQueryClient()
  const [view, setView] = useState<'active' | 'archived'>('active')
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<RecipeCategory | 'all'>('all')
  const [page, setPage] = useState(1)
  const [editing, setEditing] = useState<Recipe | null>(null)
  const [panelOpen, setPanelOpen] = useState(false)
  const [deleting, setDeleting] = useState<Recipe | null>(null)
  const q = useSettled(search.trim())
  // A new search, tab or category starts at page 1.
  // biome-ignore lint/correctness/useExhaustiveDependencies: resets when the filters change
  useEffect(() => setPage(1), [q, view, category])
  const list = useQuery(
    recipePageQuery({
      q: q || undefined,
      category: category === 'all' ? undefined : category,
      archived: view === 'archived' ? '1' : undefined,
      page,
      pageSize: ADMIN_PAGE_SIZE,
    }),
  )
  // Only the counts: how many active and archived recipes there are.
  const activeCount = useQuery(recipePageQuery({ pageSize: 1 }))
  const archivedCount = useQuery(recipePageQuery({ archived: '1', pageSize: 1 }))
  const total = (p?: RecipePage) => (p ? p.counts.adult + p.counts.category.toddler : undefined)
  const shown = list.data?.recipes ?? []
  const pages = list.data ? Math.max(1, Math.ceil(list.data.total / list.data.pageSize)) : 1
  const counts = list.data?.counts
  const canEdit = (r: Recipe) => r.createdBy === me.id || isOwner(me.role)

  const openNew = () => {
    setEditing(null)
    setPanelOpen(true)
  }
  const openEdit = (r: Recipe) => {
    setEditing(r)
    setPanelOpen(true)
  }
  const archive = useMutation({
    mutationFn: (r: Recipe) =>
      api<{ recipe: Recipe }>(`/recipes/${r.id}/${r.archived ? 'restore' : 'archive'}`, {
        method: 'POST',
      }),
    onSuccess: ({ recipe }) => {
      putRecipe(queryClient, recipe)
      toast({
        title: recipe.archived ? 'Recipe archived' : 'Recipe restored',
        description: recipe.archived ? `${recipe.title} is hidden from the app.` : recipe.title,
      })
    },
  })
  const remove = useMutation({
    mutationFn: (r: Recipe) => api(`/recipes/${r.id}`, { method: 'DELETE' }),
    onSuccess: (_, r) => {
      void queryClient.invalidateQueries({ queryKey: ['recipes', 'page'] })
      toast({ title: 'Recipe deleted', description: r.title })
      setDeleting(null)
    },
  })

  return (
    <>
      <PageHeader
        title="Recipes"
        subtitle="High-protein meals everyone can cook and log from the phone app."
        action={
          <Button icon={<Plus className="size-5" aria-hidden />} onClick={openNew}>
            New recipe
          </Button>
        }
      />
      <Toolbar>
        <Segmented
          label="Show"
          value={view}
          onChange={setView}
          options={[
            { value: 'active', label: 'Active', count: total(activeCount.data) },
            { value: 'archived', label: 'Archived', count: total(archivedCount.data) },
          ]}
        />
        <Segmented
          label="Category"
          value={category}
          onChange={setCategory}
          options={[
            { value: 'all', label: 'All', count: total(list.data) },
            ...RECIPE_CATEGORIES.map((c) => ({
              value: c,
              label: RECIPE_CATEGORY_LABELS[c],
              count: counts?.category[c],
            })),
          ]}
        />
        <SearchInput
          className="min-w-48 flex-1"
          placeholder="Search by name or ingredient"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </Toolbar>

      {list.isPending ? (
        <div className="h-64 animate-pulse rounded-lg bg-surface" />
      ) : shown.length === 0 ? (
        <EmptyState
          icon={<ChefHat className="size-7" aria-hidden />}
          title={
            search || category !== 'all'
              ? 'No matches'
              : view === 'active'
                ? 'No recipes yet'
                : 'Nothing archived'
          }
          action={
            view === 'active' && !search && category === 'all' ? (
              <Button icon={<Plus className="size-5" aria-hidden />} onClick={openNew}>
                New recipe
              </Button>
            ) : undefined
          }
        >
          {view === 'active' && !search && category === 'all'
            ? 'Add a meal once and every client sees it under Fuel, with the protein per serving, a shopping list that scales and one tap to log it.'
            : undefined}
        </EmptyState>
      ) : (
        <Card className="overflow-hidden p-0 md:p-0">
          <div className="hidden grid-cols-[minmax(0,2.5fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_132px] gap-4 border-border border-b px-5 py-3 font-extrabold text-[11px] text-ink-muted uppercase tracking-[0.08em] md:grid">
            <span>Recipe</span>
            <span>Kind</span>
            <span>Per serving</span>
            <span>Time</span>
            <span className="sr-only">Actions</span>
          </div>
          <ul className="divide-y divide-border">
            {shown.map((r) => {
              const share = proteinShare(r.kcal, r.proteinG)
              return (
                <li
                  key={r.id}
                  className={cn(
                    'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-5 py-3.5 transition hover:bg-surface-raised/50 md:grid-cols-[minmax(0,2.5fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_132px]',
                    editing?.id === r.id && panelOpen && 'bg-brand-soft/50',
                  )}
                >
                  <div className="col-span-2 flex min-w-0 items-center gap-3 md:col-span-1">
                    <RecipeThumb imageKey={r.imageKey} />
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      {canEdit(r) ? (
                        <button
                          type="button"
                          onClick={() => openEdit(r)}
                          className="truncate text-left font-bold text-[16px] hover:text-brand-text"
                        >
                          {r.title}
                        </button>
                      ) : (
                        <p className="truncate font-bold text-[16px]">{r.title}</p>
                      )}
                      {r.summary && (
                        <p className="truncate text-[13px] text-ink-muted">{r.summary}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <Chip>{recipeKindLabel(r).replace(/ recipe$/, '')}</Chip>
                    <span className="tabular font-semibold text-[13px] text-ink-muted md:hidden">
                      {gramsLabel(r.proteinG)} g protein · {kcalLabel(r.kcal)} kcal
                    </span>
                  </div>
                  <div className="hidden min-w-0 flex-col gap-0.5 md:flex">
                    <span className="tabular font-bold text-[14px]">
                      {gramsLabel(r.proteinG)} g protein
                    </span>
                    <span className="tabular text-[13px] text-ink-muted">
                      {kcalLabel(r.kcal)} kcal{share !== null ? ` · ${share}% protein` : ''}
                    </span>
                  </div>
                  <span className="hidden items-center gap-2 font-semibold text-[14px] text-ink-muted md:flex">
                    <Clock className="size-4 text-steel-text" aria-hidden />
                    {minutesLabel(r.prepMinutes + r.cookMinutes)}
                  </span>
                  <div className="flex justify-end gap-1 max-md:-mr-2">
                    {canEdit(r) && (
                      <>
                        {!r.archived && (
                          <IconButton
                            label="Edit"
                            icon={<Pencil aria-hidden />}
                            size="sm"
                            onClick={() => openEdit(r)}
                          />
                        )}
                        <IconButton
                          label={
                            r.archived
                              ? 'Restore: show it in the app again'
                              : 'Archive: hides it from the app, keeps it here'
                          }
                          icon={
                            r.archived ? <ArchiveRestore aria-hidden /> : <Archive aria-hidden />
                          }
                          size="sm"
                          onClick={() => archive.mutate(r)}
                        />
                        <IconButton
                          label="Delete for good"
                          icon={<Trash2 aria-hidden />}
                          size="sm"
                          tone="danger"
                          onClick={() => setDeleting(r)}
                        />
                      </>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
          {pages > 1 && (
            <nav
              aria-label="Recipe pages"
              className="flex flex-col items-center gap-3 border-border border-t px-5 py-3 sm:flex-row sm:justify-between"
            >
              <p className="tabular font-semibold text-[13px] text-ink-muted">
                {(page - 1) * ADMIN_PAGE_SIZE + 1}–
                {Math.min(list.data?.total ?? 0, page * ADMIN_PAGE_SIZE)} of {list.data?.total}{' '}
                recipes
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Previous
                </Button>
                <span className="tabular min-w-24 text-center font-bold text-[13px]">
                  Page {page} of {pages}
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page >= pages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </nav>
          )}
        </Card>
      )}

      <ConfirmDialog
        open={deleting !== null}
        title={`Delete ${deleting?.title ?? 'this recipe'}?`}
        confirmLabel="Delete for good"
        loading={remove.isPending}
        onClose={() => setDeleting(null)}
        extraAction={
          deleting && !deleting.archived ? (
            <Button
              variant="secondary"
              onClick={() => {
                archive.mutate(deleting)
                setDeleting(null)
              }}
            >
              Archive instead
            </Button>
          ) : undefined
        }
        onConfirm={() => deleting && remove.mutate(deleting)}
      >
        <p>
          It disappears from everyone’s phone, and from their saved recipes. Servings already logged
          stay in their food log. This can’t be undone.
        </p>
      </ConfirmDialog>

      <Drawer
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        title={editing ? 'Edit recipe' : 'New recipe'}
        description={editing ? editing.title : 'Clients find it under Fuel → Recipes.'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setPanelOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="recipe-form">
              {editing ? 'Save changes' : 'Add recipe'}
            </Button>
          </>
        }
      >
        <div className="mb-5">
          {editing ? (
            <RecipePhotoField key={editing.id} recipe={editing} />
          ) : (
            <p className="rounded-md bg-surface-raised p-4 text-[13px] text-ink-muted">
              You can add a photo once the recipe is added.
            </p>
          )}
        </div>
        {/* key starts a fresh form for each recipe */}
        <RecipeForm
          key={editing?.id ?? 'new'}
          recipe={editing}
          onSaved={(recipe) => {
            putRecipe(queryClient, recipe)
            toast({ title: editing ? 'Recipe saved' : 'Recipe added', description: recipe.title })
            setPanelOpen(false)
          }}
        />
      </Drawer>
    </>
  )
}

/** Whole numbers and decimals typed with a comma or a point; empty = null. */
const num = (v: string) => {
  const t = v.trim().replace(',', '.')
  return t === '' ? null : Number(t)
}

function RecipeForm({
  recipe,
  onSaved,
}: {
  recipe: Recipe | null
  onSaved: (recipe: Recipe) => void
}) {
  const text = (n: number | null | undefined) => (n === null || n === undefined ? '' : String(n))
  const [form, setForm] = useState({
    title: recipe?.title ?? '',
    summary: recipe?.summary ?? '',
    meal: recipe?.meal ?? ('dinner' as Meal),
    category: recipe?.category ?? ('meal' as RecipeCategory),
    servings: text(recipe?.servings ?? 2),
    prepMinutes: text(recipe?.prepMinutes ?? 10),
    cookMinutes: text(recipe?.cookMinutes ?? 15),
    kcal: text(recipe?.kcal),
    proteinG: text(recipe?.proteinG),
    carbsG: text(recipe?.carbsG),
    fatG: text(recipe?.fatG),
    ingredients: recipe?.ingredients.map(ingredientLine).join('\n') ?? '',
    steps: recipe?.steps.join('\n') ?? '',
    tips: recipe?.tips ?? '',
    sourceName: recipe?.sourceName ?? '',
    sourceUrl: recipe?.sourceUrl ?? '',
  })
  const [error, setError] = useState<string>()
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [key]: e.target.value }))
  const ingredients = parseIngredientLines(form.ingredients)
  const steps = parseStepLines(form.steps)
  const kcal = num(form.kcal)
  const protein = num(form.proteinG)
  const carbs = num(form.carbsG)
  const fat = num(form.fatG)
  const share = kcal !== null && protein !== null ? proteinShare(kcal, protein) : null
  // Protein, carbs and fat add up to roughly the calories (4, 4 and 9 kcal a gram).
  const fromMacros =
    protein !== null && carbs !== null && fat !== null ? protein * 4 + carbs * 4 + fat * 9 : null
  const offBy = kcal && fromMacros !== null ? Math.abs(fromMacros - kcal) / Math.max(kcal, 1) : null

  const save = useMutation({
    mutationFn: (input: unknown) =>
      recipe
        ? api<{ recipe: Recipe }>(`/recipes/${recipe.id}`, { method: 'PUT', body: input })
        : api<{ recipe: Recipe }>('/recipes', { method: 'POST', body: input }),
    onSuccess: ({ recipe }) => onSaved(recipe),
    onError: (err) =>
      setError(err instanceof ApiError ? err.message : 'Couldn’t save the recipe. Try again.'),
  })

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    const parsed = recipeInput.safeParse({
      ...form,
      servings: num(form.servings),
      prepMinutes: num(form.prepMinutes) ?? 0,
      cookMinutes: num(form.cookMinutes) ?? 0,
      kcal,
      proteinG: protein,
      carbsG: carbs,
      fatG: fat,
      ingredients,
      steps,
    })
    if (!parsed.success) {
      const issue = parsed.error.issues[0]
      const field = String(issue?.path[0] ?? '')
      return setError(issue ? `${FIELD_NAMES[field] ?? field}: ${issue.message}` : 'Check the form')
    }
    setError(undefined)
    save.mutate(parsed.data)
  }

  return (
    <form id="recipe-form" onSubmit={onSubmit} className="flex flex-col gap-5">
      <Field label="Name">
        {(id) => (
          <Input
            id={id}
            value={form.title}
            onChange={set('title')}
            placeholder="Chicken and jasmine rice bowl"
            autoFocus
            required
          />
        )}
      </Field>
      <Field label="Short description" hint="Optional. One line shown on the recipe card.">
        {(id) => (
          <Textarea
            id={id}
            rows={2}
            value={form.summary}
            onChange={set('summary')}
            placeholder="Meal-prep staple: four lunches in 30 minutes."
          />
        )}
      </Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Kind" hint="Toddler recipes only show under Toddler in the app.">
          {(id) => (
            <Select
              id={id}
              value={form.category}
              onChange={(e) =>
                setForm((f) => ({ ...f, category: e.target.value as RecipeCategory }))
              }
            >
              {RECIPE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {RECIPE_CATEGORY_LABELS[c]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Meal" hint="Where a logged serving goes.">
          {(id) => (
            <Select
              id={id}
              value={form.meal}
              onChange={(e) => setForm((f) => ({ ...f, meal: e.target.value as Meal }))}
            >
              {MEALS.map((m) => (
                <option key={m} value={m}>
                  {MEAL_LABELS[m]}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <NumberField label="Servings" value={form.servings} onChange={set('servings')} />
        <NumberField label="Prep (min)" value={form.prepMinutes} onChange={set('prepMinutes')} />
        <NumberField label="Cook (min)" value={form.cookMinutes} onChange={set('cookMinutes')} />
      </div>

      <fieldset className="flex flex-col gap-4 rounded-md bg-surface-raised p-4">
        <legend className="float-left mb-1 font-bold text-[13px]">Per serving</legend>
        <div className="clear-both grid grid-cols-2 gap-4 sm:grid-cols-4">
          <NumberField label="Calories" value={form.kcal} onChange={set('kcal')} decimal raised />
          <NumberField
            label="Protein (g)"
            value={form.proteinG}
            onChange={set('proteinG')}
            decimal
            raised
          />
          <NumberField
            label="Carbs (g)"
            value={form.carbsG}
            onChange={set('carbsG')}
            decimal
            raised
          />
          <NumberField label="Fat (g)" value={form.fatG} onChange={set('fatG')} decimal raised />
        </div>
        <p className="text-[13px] text-ink-muted">
          {share !== null ? (
            <>
              <b className="text-ink">{share}%</b> of the calories come from protein.
            </>
          ) : (
            'Carbs and fat are optional.'
          )}
          {offBy !== null && offBy > 0.15 && fromMacros !== null && (
            <span className="mt-1 block font-semibold text-clay-text">
              Protein, carbs and fat add up to about {kcalLabel(fromMacros)} kcal. Check the
              numbers.
            </span>
          )}
        </p>
      </fieldset>

      <Field
        label="Ingredients"
        hint="One per line, amount first, for all the servings: “600 g chicken breast”, “1½ cups jasmine rice”, “2 eggs”. Amounts scale on the phone."
      >
        {(id) => (
          <Textarea
            id={id}
            rows={8}
            value={form.ingredients}
            onChange={set('ingredients')}
            placeholder={'600 g chicken breast\n1½ cups jasmine rice\n1 avocado\nsalt and pepper'}
          />
        )}
      </Field>
      {ingredients.length > 0 && (
        <div className="-mt-2 flex flex-col gap-2 rounded-md bg-surface-raised p-4">
          <p className="font-extrabold text-[11px] text-ink-muted uppercase tracking-[0.08em]">
            The phone shows ({ingredients.length})
          </p>
          <ul className="flex flex-wrap gap-2">
            {ingredients.map((i, n) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: a preview of typed lines; may repeat
              <li key={n}>
                <Chip className="bg-surface">{ingredientLabel(i)}</Chip>
              </li>
            ))}
          </ul>
        </div>
      )}
      <Field label="Method" hint="One step per line. Numbers in front are fine.">
        {(id) => (
          <Textarea
            id={id}
            rows={7}
            value={form.steps}
            onChange={set('steps')}
            placeholder={
              'Rinse the rice and cook it.\nSeason and grill the chicken.\nShare between four boxes.'
            }
          />
        )}
      </Field>
      <Field label="Tips" hint="Optional. Swaps, storage, meal-prep notes.">
        {(id) => <Textarea id={id} rows={3} value={form.tips} onChange={set('tips')} />}
      </Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Adapted from" hint="Optional credit, e.g. a website or a cookbook.">
          {(id) => <Input id={id} value={form.sourceName} onChange={set('sourceName')} />}
        </Field>
        <Field label="Link" hint="Optional. https:// only.">
          {(id) => (
            <Input
              id={id}
              type="url"
              inputMode="url"
              value={form.sourceUrl}
              onChange={set('sourceUrl')}
              placeholder="https://"
            />
          )}
        </Field>
      </div>
      {save.isPending && <p className="text-[13px] text-ink-muted">Saving…</p>}
      {error && (
        <p
          role="alert"
          className="rounded-md bg-danger/10 p-4 font-semibold text-[14px] text-danger"
        >
          {error}
        </p>
      )}
    </form>
  )
}

const FIELD_NAMES: Record<string, string> = {
  title: 'Name',
  summary: 'Description',
  servings: 'Servings',
  prepMinutes: 'Prep',
  cookMinutes: 'Cook',
  kcal: 'Calories',
  proteinG: 'Protein',
  carbsG: 'Carbs',
  fatG: 'Fat',
  ingredients: 'Ingredients',
  steps: 'Method',
  tips: 'Tips',
  sourceName: 'Adapted from',
  sourceUrl: 'Link',
}

function NumberField({
  label,
  value,
  onChange,
  decimal = false,
  raised = false,
}: {
  label: string
  value: string
  onChange: (e: { target: { value: string } }) => void
  decimal?: boolean
  /** On a raised block: a lighter field so it still stands out. */
  raised?: boolean
}) {
  return (
    <Field label={label}>
      {(id) => (
        <Input
          id={id}
          inputMode={decimal ? 'decimal' : 'numeric'}
          value={value}
          onChange={onChange}
          className={cn('tabular', raised && 'bg-surface')}
        />
      )}
    </Field>
  )
}

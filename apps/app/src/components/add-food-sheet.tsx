import {
  ApiError,
  foodFavouritesQuery,
  foodRecentQuery,
  foodSetupQuery,
  savedMealsQuery,
} from '@project180/client'
import {
  type BarcodeProduct,
  type FoodPhotoDraft,
  type FoodSearchResult,
  gramsLabel,
  kcalLabel,
  MEAL_LABELS,
  type Meal,
  type NutrientKey,
  type Nutrients,
  normalizeFoodQuery,
  perGram,
  type RecentFood,
  type SavedMeal,
  scaleExtras,
  scaleLabel,
  sumMacros,
} from '@project180/shared'
import {
  Button,
  Chip,
  ConfirmDialog,
  cn,
  Field,
  IconButton,
  Input,
  Spinner,
  Textarea,
} from '@project180/ui'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowLeft,
  Bookmark,
  Camera,
  History,
  MessageSquareText,
  PenLine,
  Plus,
  ScanBarcode,
  Search,
  Sparkles,
  Star,
  Trash2,
  X,
  Zap,
} from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import {
  amountText,
  type FoodDraftItem,
  followGrams,
  lookUpFood,
  type NutrientText,
  nutrientText,
  parseAmount,
  parseNutrients,
  SEARCH_MIN_CHARS,
  useAddFood,
  useBarcodeLookup,
  useDeleteSavedMeal,
  useDescribeFood,
  useFavourite,
  useFoodSearch,
  useLogSavedMeal,
  usePhotoEstimate,
} from '../lib/food'
import { BarcodeScanner } from './barcode-scanner'
import { AmountInput, FoodForm, MealPicker } from './food-form'
import { Sheet } from './sheet'

/** A draft to check: from a photo, or from a barcode (which has no photo count). */
type ReviewDraft = Omit<FoodPhotoDraft, 'photosLeft'> & { photosLeft?: number }

type Step =
  | { kind: 'menu' }
  | { kind: 'form'; initial?: Partial<FoodDraftItem> }
  | { kind: 'quick' }
  | { kind: 'reading' }
  | { kind: 'describe'; text: string }
  | { kind: 'thinking'; text: string }
  | { kind: 'scan'; error?: string }
  | { kind: 'looking'; code: string }
  | { kind: 'missing'; code: string; message: string }
  | {
      kind: 'review'
      draft: ReviewDraft
      source: 'photo' | 'barcode' | 'search' | 'describe'
      credit?: BarcodeProduct['source']
    }

/** A product's label values as a draft: one food, the printed serving (or 100 g) to start. */
function productDraft(
  product: Pick<BarcodeProduct, 'name' | 'brand' | 'per100g' | 'servingG'>,
): ReviewDraft {
  const grams = product.servingG ?? 100
  const amount = scaleLabel(product.per100g, grams)
  return {
    kind: 'label',
    items: [
      {
        name: product.brand ? `${product.name} (${product.brand})` : product.name,
        grams,
        ...amount,
        ...scaleExtras(product.per100g, grams),
        confidence: 'high',
      },
    ],
    label: { per100g: product.per100g, servingG: product.servingG },
    note: null,
  }
}

/** Add food to a day: take a photo, type it in, or pick something eaten lately. */
export function AddFoodSheet({
  open,
  date,
  meal,
  onClose,
}: {
  open: boolean
  date: string
  /** The meal it opens on (the person can change it). */
  meal: Meal
  onClose: () => void
}) {
  return (
    <Sheet open={open} onClose={onClose} label="Add food">
      {open && <AddFood date={date} initialMeal={meal} onDone={onClose} />}
    </Sheet>
  )
}

function AddFood({
  date,
  initialMeal,
  onDone,
}: {
  date: string
  initialMeal: Meal
  onDone: () => void
}) {
  const [meal, setMeal] = useState(initialMeal)
  const [step, setStep] = useState<Step>({ kind: 'menu' })
  // Kept while looking at a result, so Back shows the same list.
  const [query, setQuery] = useState('')
  const [preview, setPreview] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const setup = useQuery(foodSetupQuery).data
  const recent = useQuery(foodRecentQuery).data ?? []
  const estimate = usePhotoEstimate()
  const describe = useDescribeFood()
  const favourites = useQuery(foodFavouritesQuery).data ?? []
  const { star, unstar } = useFavourite()
  const lookup = useBarcodeLookup()
  const add = useAddFood(onDone)
  const meals = useQuery(savedMealsQuery).data ?? []
  const logMeal = useLogSavedMeal(onDone)

  // Frees the preview photo's memory when it changes or the sheet closes.
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview)
    },
    [preview],
  )

  const onPhoto = (file: File | undefined) => {
    if (!file) return
    setPreview(URL.createObjectURL(file))
    setStep({ kind: 'reading' })
    estimate.mutate(
      // No note: the review step is where a wrong guess gets fixed.
      { file, hint: '' },
      {
        onSuccess: (draft) => setStep({ kind: 'review', draft, source: 'photo' }),
        onError: () => setStep({ kind: 'menu' }),
      },
    )
  }

  const onDescribe = (text: string) => {
    setStep({ kind: 'thinking', text })
    describe.mutate(text, {
      onSuccess: (draft) => setStep({ kind: 'review', draft, source: 'describe' }),
      onError: () => setStep({ kind: 'describe', text }),
    })
  }

  const onPickResult = (food: FoodSearchResult) =>
    setStep({ kind: 'review', draft: productDraft(food), source: 'search', credit: food.source })

  const onCode = (code: string) => {
    setStep({ kind: 'looking', code })
    lookup.mutate(code, {
      onSuccess: (product) =>
        setStep({
          kind: 'review',
          draft: productDraft(product),
          source: 'barcode',
          credit: product.source,
        }),
      onError: (err) =>
        err instanceof ApiError && err.status === 404
          ? setStep({ kind: 'missing', code, message: err.message })
          : setStep({
              kind: 'scan',
              error:
                err instanceof ApiError
                  ? err.message
                  : 'Couldn’t look that up. Check your signal and try again.',
            }),
    })
  }

  const back =
    step.kind === 'form' ||
    step.kind === 'describe' ||
    step.kind === 'review' ||
    step.kind === 'scan' ||
    step.kind === 'missing' ? (
      <button
        type="button"
        onClick={() => {
          add.reset()
          setStep({ kind: 'menu' })
        }}
        className="-ml-2 inline-flex h-11 items-center gap-2 self-start rounded-sm px-2 font-bold text-[14px] text-ink-muted"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Back
      </button>
    ) : null

  return (
    <div className="flex flex-col gap-5 pb-6">
      {/* The phone's own camera (or photo library). Always here, so "Take another photo" works. */}
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          onPhoto(e.target.files?.[0])
          e.target.value = ''
        }}
      />
      {back}
      <div className="pr-12">
        <h2 className="font-display font-extrabold text-[24px] leading-7">
          {step.kind === 'review'
            ? step.source === 'photo' || step.source === 'describe'
              ? 'Check the estimate'
              : 'Check the amount'
            : step.kind === 'describe' || step.kind === 'thinking'
              ? 'Describe what you ate'
              : step.kind === 'scan' || step.kind === 'looking'
                ? 'Scan a barcode'
                : `Add to ${MEAL_LABELS[meal]}`}
        </h2>
        {step.kind === 'review' && (
          <p className="mt-1 text-[14px] text-ink-muted">
            {step.source === 'search'
              ? 'From the food database. Set how much you ate, then save.'
              : step.source === 'barcode'
                ? 'From the product’s label. Set how much you ate, then save.'
                : step.source === 'describe'
                  ? 'Estimated from what you wrote. Fix anything that looks off, then save.'
                  : 'These are estimates from your photo. Fix anything that looks off, then save.'}
          </p>
        )}
      </div>
      {step.kind !== 'reading' &&
        step.kind !== 'thinking' &&
        step.kind !== 'scan' &&
        step.kind !== 'looking' && <MealPicker value={meal} onChange={setMeal} />}

      {step.kind === 'menu' && (setup?.search || recent.length > 0) && (
        <SearchBox value={query} onChange={setQuery} canSearch={!!setup?.search} />
      )}

      {step.kind === 'menu' && query.trim().length >= SEARCH_MIN_CHARS && (
        <SearchResults
          query={query}
          canSearch={!!setup?.search}
          recent={recent}
          onPickRecent={(f) => setStep({ kind: 'form', initial: f })}
          onPick={onPickResult}
          onTypeIn={() => setStep({ kind: 'form', initial: { name: query.trim() } })}
        />
      )}

      {step.kind === 'menu' && query.trim().length < SEARCH_MIN_CHARS && (
        <>
          <AddWays
            photos={!!setup?.photos}
            barcode={!!setup?.barcode}
            onPhoto={() => fileInput.current?.click()}
            onScan={() => setStep({ kind: 'scan' })}
            onType={() => setStep({ kind: 'form' })}
            onDescribe={() => setStep({ kind: 'describe', text: '' })}
          />
          {estimate.isError && (
            <p
              role="alert"
              className="rounded-md bg-danger/10 p-3 font-semibold text-[14px] text-danger"
            >
              {estimate.error instanceof ApiError
                ? estimate.error.message
                : 'Couldn’t send the photo. Check your signal and try again.'}
            </p>
          )}
          <Button
            variant="ghost"
            className="self-start"
            icon={<Zap className="size-4" aria-hidden />}
            onClick={() => setStep({ kind: 'quick' })}
          >
            Quick add calories
          </Button>
          {meals.length > 0 && (
            <SavedMealsList
              meals={meals}
              busyId={logMeal.isPending ? (logMeal.variables?.id ?? null) : null}
              error={logMeal.isError ? 'Couldn’t add it. Check your signal and try again.' : null}
              onPick={(m) => logMeal.mutate({ id: m.id, date, meal })}
            />
          )}
          {favourites.length > 0 && (
            <RecentList
              title="Favourites"
              icon={<Star className="size-3.5" aria-hidden />}
              foods={favourites}
              starred={() => true}
              onStar={(f) => {
                const fav = favourites.find((x) => x.name === f.name)
                if (fav) unstar.mutate(fav.id)
              }}
              onPick={(f) => setStep({ kind: 'form', initial: f })}
            />
          )}
          {recent.length > 0 && (
            <RecentList
              foods={recent}
              starred={(f) => favourites.some((x) => x.name === f.name)}
              onStar={(f) => {
                const fav = favourites.find((x) => x.name === f.name)
                if (fav) unstar.mutate(fav.id)
                else star.mutate(f)
              }}
              onPick={(f) => setStep({ kind: 'form', initial: f })}
            />
          )}
          {(star.isError || unstar.isError) && (
            <p role="alert" className="font-semibold text-[13px] text-danger">
              {star.error instanceof ApiError
                ? star.error.message
                : 'Couldn’t change your favourites. Try again.'}
            </p>
          )}
        </>
      )}

      {step.kind === 'quick' && (
        <QuickAdd
          saving={add.isPending}
          error={add.isError ? 'Couldn’t save. Check your signal and try again.' : null}
          onSubmit={(food) => add.mutate({ date, meal, source: 'manual', entries: [food] })}
        />
      )}

      {step.kind === 'form' && (
        <FoodForm
          initial={step.initial}
          submitLabel="Save food"
          saving={add.isPending}
          error={add.isError ? 'Couldn’t save. Check your signal and try again.' : null}
          onSubmit={(food) => add.mutate({ date, meal, source: 'manual', entries: [food] })}
        />
      )}

      {step.kind === 'describe' && (
        <DescribeForm
          initial={step.text}
          error={
            describe.isError
              ? describe.error instanceof ApiError
                ? describe.error.message
                : 'Couldn’t work it out. Check your signal and try again.'
              : null
          }
          onSubmit={onDescribe}
        />
      )}

      {step.kind === 'thinking' && (
        <div className="flex flex-col items-center gap-3 py-10" aria-live="polite">
          <p className="inline-flex items-center gap-3 font-bold text-[15px]">
            <Spinner />
            Working it out…
          </p>
          <p className="max-w-sm text-center text-[13px] text-ink-muted">“{step.text}”</p>
        </div>
      )}

      {step.kind === 'reading' && (
        <div className="flex flex-col items-center gap-4 py-6" aria-live="polite">
          {preview && (
            <img
              src={preview}
              alt=""
              className="aspect-square w-40 rounded-lg object-cover shadow-card"
            />
          )}
          <p className="inline-flex items-center gap-3 font-bold text-[15px]">
            <Spinner />
            Reading your photo…
          </p>
          <p className="text-center text-[13px] text-ink-muted">This takes a few seconds.</p>
        </div>
      )}

      {step.kind === 'scan' && (
        <>
          {step.error && (
            <p
              role="alert"
              className="rounded-md bg-danger/10 p-3 font-semibold text-[14px] text-danger"
            >
              {step.error}
            </p>
          )}
          <BarcodeScanner onCode={onCode} />
        </>
      )}

      {step.kind === 'looking' && (
        <div className="flex flex-col items-center gap-3 py-10" aria-live="polite">
          <p className="inline-flex items-center gap-3 font-bold text-[15px]">
            <Spinner />
            Looking up {step.code}…
          </p>
        </div>
      )}

      {step.kind === 'missing' && (
        <div className="flex flex-col gap-4">
          <p className="rounded-md bg-surface-raised p-4 text-[15px]">
            {step.message}
            <span className="tabular mt-1 block text-[13px] text-ink-muted">
              Barcode {step.code}
            </span>
          </p>
          {setup?.photos && (
            <Button
              size="lg"
              block
              icon={<Camera className="size-5" aria-hidden />}
              onClick={() => fileInput.current?.click()}
            >
              Photograph the label
            </Button>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Button
              variant="secondary"
              size="lg"
              block
              icon={<ScanBarcode className="size-5" aria-hidden />}
              onClick={() => setStep({ kind: 'scan' })}
            >
              Scan another
            </Button>
            <Button
              variant="secondary"
              size="lg"
              block
              icon={<PenLine className="size-5" aria-hidden />}
              onClick={() => setStep({ kind: 'form' })}
            >
              Type it in
            </Button>
          </div>
        </div>
      )}

      {step.kind === 'review' && (
        <PhotoReview
          // A new draft (another photo or barcode) starts a fresh review.
          key={step.credit ? `${step.credit.provider}-${step.draft.items[0]?.name}` : 'photo'}
          draft={step.draft}
          credit={step.credit}
          retakeLabel={
            step.source === 'barcode'
              ? 'Scan another'
              : step.source === 'search'
                ? 'Search again'
                : step.source === 'describe'
                  ? 'Describe it again'
                  : 'Take another photo'
          }
          saving={add.isPending}
          error={add.isError ? 'Couldn’t save. Check your signal and try again.' : null}
          onRetake={() => {
            if (step.source === 'barcode') return setStep({ kind: 'scan' })
            if (step.source === 'search') return setStep({ kind: 'menu' })
            if (step.source === 'describe') return setStep({ kind: 'describe', text: '' })
            setStep({ kind: 'menu' })
            fileInput.current?.click()
          }}
          onSave={(entries) => add.mutate({ date, meal, source: step.source, entries })}
        />
      )}
    </div>
  )
}

/** The search box at the top of Add food: the food database, and foods eaten lately. */
function SearchBox({
  value,
  onChange,
  canSearch,
}: {
  value: string
  onChange: (value: string) => void
  canSearch: boolean
}) {
  return (
    <div className="relative">
      <Search
        className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-ink-muted"
        aria-hidden
      />
      <Input
        type="search"
        enterKeyHint="search"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        maxLength={60}
        aria-label={canSearch ? 'Search foods' : 'Search foods you’ve had'}
        placeholder={canSearch ? 'Search foods, e.g. eggs' : 'Search foods you’ve had'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          // Enter just closes the phone's keyboard; the search runs as you type.
          if (e.key === 'Enter') e.currentTarget.blur()
        }}
        className="pr-12 pl-11 [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <IconButton
          label="Clear search"
          icon={<X aria-hidden />}
          className="absolute top-0 right-0 size-11"
          onClick={() => onChange('')}
        />
      )}
    </div>
  )
}

/** Matches for what's typed: foods eaten lately first, then the food database. */
function SearchResults({
  query,
  canSearch,
  recent,
  onPickRecent,
  onPick,
  onTypeIn,
}: {
  query: string
  canSearch: boolean
  recent: RecentFood[]
  onPickRecent: (f: RecentFood) => void
  onPick: (f: FoodSearchResult) => void
  onTypeIn: () => void
}) {
  const search = useFoodSearch(query, canSearch)
  const typed = normalizeFoodQuery(query)
  const mine = recent.filter((f) => normalizeFoodQuery(f.name).includes(typed)).slice(0, 3)
  const results = search.data ?? []
  // Only "nothing found" once the answer is for what's in the box now.
  const answered = !search.searching && !search.isPlaceholderData && search.isSuccess
  const credits = [...new Set(results.map((r) => r.source.label))]

  return (
    <div className="flex flex-col gap-5">
      {mine.length > 0 && <RecentList title="You’ve had" foods={mine} onPick={onPickRecent} />}
      {canSearch && (
        <section className="flex flex-col gap-2" aria-busy={search.searching}>
          <h3 className="inline-flex min-h-5 items-center gap-2 font-extrabold text-[11px] text-ink-muted uppercase tracking-[0.08em]">
            <Search className="size-3.5" aria-hidden />
            Food database
            {search.searching && <Spinner className="size-3.5" />}
          </h3>
          {search.isError && !search.searching ? (
            <p
              role="alert"
              className="rounded-md bg-danger/10 p-3 font-semibold text-[14px] text-danger"
            >
              {search.error instanceof ApiError
                ? search.error.message
                : 'Couldn’t search. Check your signal and try again.'}
            </p>
          ) : answered && results.length === 0 ? (
            <p className="rounded-md bg-surface-raised p-4 text-[15px]">
              Nothing found for “{query.trim()}”. Try another word, or type it in.
            </p>
          ) : (
            <ul
              className={cn(
                'flex w-full flex-col transition-opacity',
                search.isPlaceholderData && 'opacity-60',
              )}
            >
              {results.map((f) => (
                <li key={f.id}>
                  <button
                    type="button"
                    onClick={() => onPick(f)}
                    className="flex min-h-14 w-full items-center gap-3 border-border border-b py-2.5 text-left transition active:scale-[0.99]"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 font-semibold text-[15px]">{f.name}</span>
                      <span className="tabular mt-0.5 block truncate text-[13px] text-ink-muted">
                        {f.brand ? `${f.brand} · ` : ''}
                        {kcalLabel(f.per100g.kcal)} kcal · {gramsLabel(f.per100g.proteinG)} g
                        protein per 100 g
                      </span>
                    </span>
                    <span
                      aria-hidden
                      className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-soft text-brand-text"
                    >
                      <Plus className="size-5" />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {credits.length > 0 && (
            <p className="text-[12px] text-ink-muted">Food data from {credits.join(' and ')}</p>
          )}
        </section>
      )}
      <Button
        variant="secondary"
        size="lg"
        block
        icon={<PenLine className="size-5" aria-hidden />}
        onClick={onTypeIn}
      >
        Type in “{query.trim()}”
      </Button>
    </div>
  )
}

const WAY_COLUMNS = {
  1: 'grid-cols-1',
  2: 'grid-cols-2',
  3: 'grid-cols-3',
  4: 'grid-cols-2 md:grid-cols-4',
} as const

/**
 * The ways to add food, side by side as equal tiles so the choice reads at a glance.
 * The photo is the quickest, so it carries the brand fill; the others are quiet.
 */
function AddWays({
  photos,
  barcode,
  onPhoto,
  onScan,
  onType,
  onDescribe,
}: {
  photos: boolean
  barcode: boolean
  onPhoto: () => void
  onScan: () => void
  onType: () => void
  onDescribe: () => void
}) {
  const ways = [
    photos && {
      key: 'photo',
      icon: Camera,
      label: 'Photo',
      hint: 'Meal or label',
      onClick: onPhoto,
      primary: true,
    },
    barcode && {
      key: 'barcode',
      icon: ScanBarcode,
      label: 'Barcode',
      hint: 'Packaged food',
      onClick: onScan,
      primary: false,
    },
    // Same Claude as photos (and the same daily limit): only where photos work.
    photos && {
      key: 'describe',
      icon: MessageSquareText,
      label: 'Describe',
      hint: 'Say what you ate',
      onClick: onDescribe,
      primary: false,
    },
    {
      key: 'type',
      icon: PenLine,
      label: 'Type it in',
      hint: 'Enter by hand',
      onClick: onType,
      primary: false,
    },
  ].filter((w) => !!w)

  return (
    <div className="flex flex-col gap-2">
      <div
        className={cn('grid gap-2 md:gap-3', WAY_COLUMNS[ways.length as keyof typeof WAY_COLUMNS])}
      >
        {ways.map(({ key, icon: Icon, label, hint, onClick, primary }) => (
          <button
            key={key}
            type="button"
            onClick={onClick}
            className={cn(
              'group flex min-h-[104px] min-w-0 flex-col items-center justify-center gap-2 rounded-lg px-2 py-4 text-center transition duration-150 active:scale-[0.97] md:min-h-0 md:flex-row md:justify-start md:gap-4 md:px-5 md:py-5 md:text-left',
              primary
                ? 'bg-brand text-on-brand shadow-brand hover:bg-brand-pressed'
                : 'bg-surface-raised text-ink ring-[1.5px] ring-transparent ring-inset hover:ring-border-strong',
            )}
          >
            <span
              className={cn(
                'grid size-11 shrink-0 place-items-center rounded-full md:size-12',
                primary ? 'bg-on-brand/12' : 'bg-surface',
              )}
            >
              <Icon className="size-[22px]" aria-hidden />
            </span>
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="font-bold text-[15px] leading-tight md:text-[16px]">{label}</span>
              <span
                className={cn(
                  'text-[12px] leading-tight md:text-[13px]',
                  primary ? 'text-on-brand/75' : 'text-ink-muted',
                )}
              >
                {hint}
              </span>
            </span>
          </button>
        ))}
      </div>
      {photos && (
        <p className="text-[12px] text-ink-muted">
          Photos are read for the numbers, then thrown away.
        </p>
      )}
    </div>
  )
}

function RecentList({
  foods,
  onPick,
  title = 'Recent',
  icon = <History className="size-3.5" aria-hidden />,
  starred,
  onStar,
}: {
  foods: RecentFood[]
  onPick: (f: RecentFood) => void
  title?: string
  icon?: React.ReactNode
  /** Favourites: whether a food is starred, and starring or unstarring it. */
  starred?: (f: RecentFood) => boolean
  onStar?: (f: RecentFood) => void
}) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="inline-flex items-center gap-2 font-extrabold text-[11px] text-ink-muted uppercase tracking-[0.08em]">
        {icon}
        {title}
      </h3>
      <ul className="flex w-full flex-col">
        {foods.slice(0, 8).map((f) => (
          <li key={f.name} className="flex items-center gap-1 border-border border-b">
            <button
              type="button"
              onClick={() => onPick(f)}
              className="group flex min-h-14 min-w-0 flex-1 items-center gap-3 py-2.5 text-left transition active:scale-[0.99]"
            >
              <span className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-4">
                <span className="min-w-0 truncate font-semibold text-[15px] sm:flex-1">
                  {f.name}
                </span>
                <span className="tabular shrink-0 text-[13px] text-ink-muted">
                  {kcalLabel(f.kcal)} kcal · {gramsLabel(f.proteinG)} g protein
                </span>
              </span>
              <span
                aria-hidden
                className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-soft text-brand-text transition group-hover:bg-brand group-hover:text-on-brand"
              >
                <Plus className="size-5" />
              </span>
            </button>
            {onStar && (
              <IconButton
                label={starred?.(f) ? `Unstar ${f.name}` : `Star ${f.name}`}
                icon={
                  <Star aria-hidden className={cn(starred?.(f) && 'fill-current text-lime-text')} />
                }
                className="size-11 shrink-0"
                onClick={() => onStar(f)}
              />
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

/** "Describe": what you ate in your own words, worked out into foods to check. */
function DescribeForm({
  initial,
  error,
  onSubmit,
}: {
  initial: string
  error: string | null
  onSubmit: (text: string) => void
}) {
  const [text, setText] = useState(initial)
  const ready = text.trim().length >= 2
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (ready) onSubmit(text.trim())
      }}
    >
      <Field label="What did you eat?" hint="Amounts help: “2 eggs”, “a cup”, “150 g”.">
        {(id) => (
          <Textarea
            id={id}
            rows={3}
            maxLength={500}
            autoFocus
            placeholder="2 scrambled eggs, a slice of toast with butter and a coffee with milk"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        )}
      </Field>
      {error && (
        <p
          role="alert"
          className="rounded-md bg-danger/10 p-3 font-semibold text-[14px] text-danger"
        >
          {error}
        </p>
      )}
      <Button
        type="submit"
        size="lg"
        block
        disabled={!ready}
        icon={<Sparkles className="size-5" aria-hidden />}
      >
        Work it out
      </Button>
      <p className="text-center text-[12px] text-ink-muted">Counts as one of today’s photos.</p>
    </form>
  )
}

interface ReviewRow {
  clientUuid: string
  name: string
  grams: string
  numbers: NutrientText
  /** Per-gram values: change the grams and every number follows (null without a weight). */
  basis: Nutrients | null
  low: boolean
  /** Fibre, sugar and sodium shown. */
  more: boolean
  /** The name it came with: renaming it offers "Look it up". */
  original: string
  /** Where "Look it up" found the numbers. */
  found?: string
}

const rowOf = (i: FoodPhotoDraft['items'][number]): ReviewRow => ({
  clientUuid: crypto.randomUUID(),
  name: i.name,
  grams: amountText(i.grams),
  numbers: nutrientText(i),
  basis: perGram(i, i.grams),
  low: i.confidence === 'low',
  more: false,
  original: i.name,
})

const itemOf = (r: ReviewRow): FoodDraftItem => {
  const n = parseNutrients(r.numbers)
  return {
    clientUuid: r.clientUuid,
    name: r.name.trim(),
    grams: parseAmount(r.grams),
    kcal: n.kcal ?? 0,
    proteinG: n.proteinG ?? 0,
    carbsG: n.carbsG,
    fatG: n.fatG,
    fibreG: n.fibreG,
    sugarG: n.sugarG,
    sodiumMg: n.sodiumMg,
  }
}

/** The editable draft from a photo. A nutrition label gets one "how much did you eat" box. */
function PhotoReview({
  draft,
  credit,
  retakeLabel,
  saving,
  error,
  onRetake,
  onSave,
}: {
  draft: ReviewDraft
  /** Where a barcode product's data came from (some licences require the credit). */
  credit?: BarcodeProduct['source']
  retakeLabel: string
  saving: boolean
  error: string | null
  onRetake: () => void
  onSave: (entries: FoodDraftItem[]) => void
}) {
  const [rows, setRows] = useState<ReviewRow[]>(() => draft.items.map(rowOf))
  const label = draft.kind === 'label' ? draft.label : null
  const [eaten, setEaten] = useState(() => amountText(label?.servingG ?? (label ? 100 : null)))
  const [looking, setLooking] = useState<string | null>(null)
  const [lookError, setLookError] = useState<string | null>(null)

  if (draft.kind === 'not_food' || rows.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <p className="rounded-md bg-surface-raised p-4 text-[15px]">
          {draft.kind === 'not_food'
            ? 'That doesn’t look like food. Try another photo.'
            : 'Nothing left to save. Take another photo or type it in.'}
        </p>
        <Button size="lg" block icon={<Camera className="size-5" aria-hidden />} onClick={onRetake}>
          {retakeLabel}
        </Button>
      </div>
    )
  }

  // "Look it up": real numbers for the (renamed) food at its amount: the food database first,
  // Claude only when the database knows nothing.
  const lookUp = async (i: number) => {
    const r = rows[i]
    if (!r?.name.trim()) return
    setLooking(r.clientUuid)
    setLookError(null)
    try {
      const res = await lookUpFood(r.name, parseAmount(r.grams))
      setRow(i, (row) => ({
        ...row,
        grams: amountText(res.grams),
        numbers: nutrientText(res.numbers),
        basis: perGram(res.numbers, res.grams) ?? row.basis,
        low: false,
        original: row.name,
        found: res.from,
      }))
    } catch (err) {
      setLookError(
        err instanceof ApiError ? err.message : `Couldn’t find “${r.name}”. Check the numbers.`,
      )
    } finally {
      setLooking(null)
    }
  }
  const setRow = (i: number, change: (r: ReviewRow) => ReviewRow) =>
    setRows((list) => list.map((r, n) => (n === i ? change(r) : r)))
  const rename = (i: number) => (name: string) => setRow(i, (r) => ({ ...r, name }))
  // Change the grams and every number follows; change a number and it's kept as typed.
  const onGrams = (i: number) => (grams: string) =>
    setRow(i, (r) => ({ ...r, ...followGrams(r, { grams }) }))
  const onNumber = (i: number, key: NutrientKey) => (value: string) =>
    setRow(i, (r) => ({ ...r, ...followGrams(r, { key, value }) }))
  // A label: the one food follows the amount eaten, from the label's own values per 100 g.
  const onEaten = (value: string) => {
    setEaten(value)
    const grams = parseAmount(value)
    if (!label || grams === null) return
    const numbers = { ...scaleLabel(label.per100g, grams), ...scaleExtras(label.per100g, grams) }
    setRows((list) =>
      list.map((r, n) =>
        n === 0
          ? {
              ...r,
              grams: amountText(grams),
              numbers: nutrientText(numbers),
              basis: perGram(numbers, grams) ?? r.basis,
            }
          : r,
      ),
    )
  }
  const items = rows.map(itemOf)
  const totals = sumMacros(items)
  const named = items.every((i) => i.name)

  return (
    <div className="flex flex-col gap-5">
      {draft.note && (
        <p className="rounded-md bg-sand/20 p-3 text-[14px] text-sand-text">{draft.note}</p>
      )}
      {label && (
        <div className="flex flex-col gap-4 rounded-md bg-surface-raised p-4">
          <p className="text-[14px] text-ink-muted">
            Label per 100 g:{' '}
            <span className="tabular text-ink">
              {kcalLabel(label.per100g.kcal)} kcal · {gramsLabel(label.per100g.proteinG)} g protein
              · {gramsLabel(label.per100g.carbsG)} g carbs · {gramsLabel(label.per100g.fatG)} g fat
            </span>
          </p>
          <Field label="How much did you eat? (g)">
            {(id) => <AmountInput id={id} value={eaten} onChange={onEaten} />}
          </Field>
        </div>
      )}
      <ul className="flex w-full flex-col gap-3">
        {rows.map((r, i) => (
          <li key={r.clientUuid} className="flex flex-col gap-3 rounded-lg bg-surface-raised p-4">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <Input
                  aria-label="Food"
                  value={r.name}
                  maxLength={120}
                  onChange={(e) => rename(i)(e.target.value)}
                  className="bg-surface font-semibold"
                />
              </div>
              <IconButton
                label={`Remove ${r.name || 'food'}`}
                icon={<Trash2 aria-hidden />}
                tone="danger"
                className="size-11"
                onClick={() => setRows((list) => list.filter((_, n) => n !== i))}
              />
            </div>
            {r.low && (
              <Chip tone="sand" className="self-start">
                Not sure about this one: check it
              </Chip>
            )}
            {(r.name.trim() !== r.original || r.low) && r.name.trim() && (
              <Button
                variant="secondary"
                size="sm"
                className="h-11 self-start"
                loading={looking === r.clientUuid}
                icon={<Search className="size-4" aria-hidden />}
                onClick={() => void lookUp(i)}
              >
                Look up “{r.name.trim().slice(0, 30)}”
              </Button>
            )}
            {r.found && <p className="text-[12px] text-ink-muted">Numbers from {r.found}.</p>}
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              <SmallAmount
                label="Grams"
                value={r.grams}
                onChange={onGrams(i)}
                onBlur={() =>
                  setRow(i, (row) => ({ ...row, ...followGrams(row, { settle: true }) }))
                }
              />
              <SmallAmount label="kcal" value={r.numbers.kcal} onChange={onNumber(i, 'kcal')} />
              <SmallAmount
                label="Protein g"
                value={r.numbers.proteinG}
                onChange={onNumber(i, 'proteinG')}
              />
              <SmallAmount
                label="Carbs g"
                value={r.numbers.carbsG}
                onChange={onNumber(i, 'carbsG')}
              />
              <SmallAmount label="Fat g" value={r.numbers.fatG} onChange={onNumber(i, 'fatG')} />
            </div>
            {r.more ? (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                <SmallAmount
                  label="Fibre g"
                  value={r.numbers.fibreG}
                  onChange={onNumber(i, 'fibreG')}
                />
                <SmallAmount
                  label="Sugar g"
                  value={r.numbers.sugarG}
                  onChange={onNumber(i, 'sugarG')}
                />
                <SmallAmount
                  label="Sodium mg"
                  value={r.numbers.sodiumMg}
                  onChange={onNumber(i, 'sodiumMg')}
                />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setRow(i, (row) => ({ ...row, more: true }))}
                className="-my-1 flex min-h-11 items-center gap-1 self-start font-semibold text-[13px] text-brand-text"
              >
                <Plus className="size-4" aria-hidden />
                Fibre, sugar and sodium
              </button>
            )}
            <p className="text-[12px] text-ink-muted">
              {r.basis
                ? 'Change the grams and the numbers follow.'
                : 'Add the grams to scale the numbers.'}
            </p>
          </li>
        ))}
      </ul>
      {lookError && (
        <p role="alert" className="font-semibold text-[13px] text-danger">
          {lookError}
        </p>
      )}
      <p className="tabular text-center font-semibold text-[14px] text-ink-muted">
        Adds {kcalLabel(totals.kcal)} kcal · {gramsLabel(totals.proteinG)} g protein
      </p>
      {error && (
        <p
          role="alert"
          className="rounded-md bg-danger/10 p-3 font-semibold text-[14px] text-danger"
        >
          {error}
        </p>
      )}
      <Button size="lg" block loading={saving} disabled={!named} onClick={() => onSave(items)}>
        Save {items.length === 1 ? 'food' : `${items.length} foods`}
      </Button>
      {credit && (
        <p className="text-center text-[13px] text-ink-muted">
          Product data from{' '}
          {credit.url ? (
            <a
              href={credit.url}
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-brand-text underline underline-offset-2"
            >
              {credit.label}
            </a>
          ) : (
            credit.label
          )}
        </p>
      )}
      {draft.photosLeft !== undefined && draft.photosLeft <= 3 && (
        <p className="text-center text-[13px] text-ink-muted">
          {draft.photosLeft === 0
            ? 'That was your last photo for today.'
            : `${draft.photosLeft} photo${draft.photosLeft === 1 ? '' : 's'} left today.`}
        </p>
      )}
    </div>
  )
}

function SmallAmount({
  label,
  value,
  onChange,
  onBlur,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  onBlur?: () => void
}) {
  const id = useId()
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label
        htmlFor={id}
        className="font-extrabold text-[11px] text-ink-muted uppercase tracking-[0.08em]"
      >
        {label}
      </label>
      <AmountInput id={id} value={value} onChange={onChange} onBlur={onBlur} />
    </div>
  )
}

/** Your saved meals: one tap logs the whole meal. */
function SavedMealsList({
  meals,
  busyId,
  error,
  onPick,
}: {
  meals: SavedMeal[]
  busyId: number | null
  error: string | null
  onPick: (m: SavedMeal) => void
}) {
  const [deleting, setDeleting] = useState<SavedMeal | null>(null)
  const remove = useDeleteSavedMeal()
  return (
    <section className="flex flex-col gap-2">
      <h3 className="inline-flex items-center gap-2 font-extrabold text-[11px] text-ink-muted uppercase tracking-[0.08em]">
        <Bookmark className="size-3.5" aria-hidden />
        My meals
      </h3>
      <ul className="flex w-full flex-col">
        {meals.map((m) => (
          <li key={m.id} className="flex items-center gap-2 border-border border-b">
            <button
              type="button"
              disabled={busyId !== null}
              onClick={() => onPick(m)}
              className="group flex min-h-14 min-w-0 flex-1 items-center gap-3 py-2.5 text-left transition active:scale-[0.99]"
            >
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate font-semibold text-[15px]">{m.name}</span>
                <span className="tabular truncate text-[13px] text-ink-muted">
                  {m.items.length} {m.items.length === 1 ? 'food' : 'foods'} · {kcalLabel(m.kcal)}{' '}
                  kcal · {gramsLabel(m.proteinG)} g protein
                </span>
              </span>
              <span
                aria-hidden
                className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-soft text-brand-text transition group-hover:bg-brand group-hover:text-on-brand"
              >
                {busyId === m.id ? <Spinner /> : <Plus className="size-5" />}
              </span>
            </button>
            <IconButton
              label={`Delete ${m.name}`}
              icon={<Trash2 aria-hidden />}
              tone="danger"
              className="size-11"
              onClick={() => setDeleting(m)}
            />
          </li>
        ))}
      </ul>
      {error && (
        <p role="alert" className="font-semibold text-[14px] text-danger">
          {error}
        </p>
      )}
      <ConfirmDialog
        open={deleting !== null}
        title={`Delete ${deleting?.name ?? 'this meal'}?`}
        confirmLabel="Delete"
        onConfirm={() => {
          if (deleting) remove.mutate(deleting.id)
          setDeleting(null)
        }}
        onClose={() => setDeleting(null)}
      >
        <p>It comes off My meals. Foods you already logged with it stay.</p>
      </ConfirmDialog>
    </section>
  )
}

/** Just a number of calories (and protein, if known): for when you don't know the details. */
function QuickAdd({
  saving,
  error,
  onSubmit,
}: {
  saving: boolean
  error: string | null
  onSubmit: (food: FoodDraftItem) => void
}) {
  const [kcal, setKcal] = useState('')
  const [protein, setProtein] = useState('')
  const [name, setName] = useState('')
  const [clientUuid] = useState(() => crypto.randomUUID())
  const k = parseAmount(kcal)
  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault()
        if (k === null || k <= 0) return
        onSubmit({
          clientUuid,
          name: name.trim() || 'Quick add',
          grams: null,
          kcal: k,
          proteinG: parseAmount(protein) ?? 0,
          carbsG: null,
          fatG: null,
        })
      }}
    >
      <p className="text-[14px] text-ink-muted">
        Don’t know the details? Add the calories and move on.
      </p>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Calories (kcal)">
          {(id) => <AmountInput id={id} value={kcal} onChange={setKcal} />}
        </Field>
        <Field label="Protein (g)" hint="Optional">
          {(id) => <AmountInput id={id} value={protein} onChange={setProtein} />}
        </Field>
      </div>
      <Field label="What was it?" hint="Optional">
        {(id) => (
          <Input
            id={id}
            maxLength={120}
            placeholder="Quick add"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        )}
      </Field>
      {error && (
        <p
          role="alert"
          className="rounded-md bg-danger/10 p-3 font-semibold text-[14px] text-danger"
        >
          {error}
        </p>
      )}
      <Button type="submit" size="lg" block loading={saving} disabled={k === null || k <= 0}>
        Add {k ? `${kcalLabel(k)} kcal` : 'calories'}
      </Button>
    </form>
  )
}

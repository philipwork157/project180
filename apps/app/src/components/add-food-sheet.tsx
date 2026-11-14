import { ApiError, foodRecentQuery, foodSetupQuery } from '@project180/client'
import {
  type BarcodeProduct,
  type FoodPhotoDraft,
  gramsLabel,
  kcalLabel,
  type Meal,
  MEAL_LABELS,
  type RecentFood,
  scaleLabel,
  sumMacros,
} from '@project180/shared'
import { Button, Chip, Field, IconButton, Input, Spinner } from '@project180/ui'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Camera, History, PenLine, ScanBarcode, Trash2 } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import {
  amountText,
  type FoodDraftItem,
  parseAmount,
  useAddFood,
  useBarcodeLookup,
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
  | { kind: 'reading' }
  | { kind: 'scan'; error?: string }
  | { kind: 'looking'; code: string }
  | { kind: 'missing'; code: string; message: string }
  | {
      kind: 'review'
      draft: ReviewDraft
      source: 'photo' | 'barcode'
      credit?: BarcodeProduct['source']
    }

/** A product's label values as a draft: one food, the printed serving (or 100 g) to start. */
function productDraft(product: BarcodeProduct): ReviewDraft {
  const grams = product.servingG ?? 100
  const amount = scaleLabel(product.per100g, grams)
  return {
    kind: 'label',
    items: [
      {
        name: product.brand ? `${product.name} (${product.brand})` : product.name,
        grams,
        ...amount,
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
  const [hint, setHint] = useState('')
  const [preview, setPreview] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const setup = useQuery(foodSetupQuery).data
  const recent = useQuery(foodRecentQuery).data ?? []
  const estimate = usePhotoEstimate()
  const lookup = useBarcodeLookup()
  const add = useAddFood(onDone)

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
      { file, hint },
      {
        onSuccess: (draft) => setStep({ kind: 'review', draft, source: 'photo' }),
        onError: () => setStep({ kind: 'menu' }),
      },
    )
  }

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
            ? step.source === 'barcode'
              ? 'Check the amount'
              : 'Check the estimate'
            : step.kind === 'scan' || step.kind === 'looking'
              ? 'Scan a barcode'
              : `Add to ${MEAL_LABELS[meal]}`}
        </h2>
        {step.kind === 'review' && (
          <p className="mt-1 text-[14px] text-ink-muted">
            {step.source === 'barcode'
              ? 'From the product’s label. Set how much you ate, then save.'
              : 'These are estimates from your photo. Fix anything that looks off, then save.'}
          </p>
        )}
      </div>
      {step.kind !== 'reading' && step.kind !== 'scan' && step.kind !== 'looking' && (
        <MealPicker value={meal} onChange={setMeal} />
      )}

      {step.kind === 'menu' && (
        <>
          {setup?.photos && (
            <section className="flex flex-col gap-4 rounded-lg bg-surface-raised p-4">
              <Field label="Note for the photo" hint="Optional. Weights and cooking help a lot.">
                {(id) => (
                  <Input
                    id={id}
                    maxLength={200}
                    autoComplete="off"
                    placeholder="e.g. 200 g chicken, fried in oil"
                    value={hint}
                    onChange={(e) => setHint(e.target.value)}
                    className="bg-surface"
                  />
                )}
              </Field>
              <Button
                size="lg"
                block
                icon={<Camera className="size-5" aria-hidden />}
                onClick={() => fileInput.current?.click()}
              >
                Take a photo
              </Button>
              <p className="text-[13px] text-ink-muted">
                A meal or a nutrition label. Your photo is read, then thrown away.
              </p>
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
            </section>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {setup?.barcode && (
              <Button
                variant="secondary"
                size="lg"
                block
                icon={<ScanBarcode className="size-5" aria-hidden />}
                onClick={() => setStep({ kind: 'scan' })}
              >
                Scan a barcode
              </Button>
            )}
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
          {recent.length > 0 && <RecentList foods={recent} onPick={(f) => setStep({ kind: 'form', initial: f })} />}
        </>
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
          retakeLabel={step.source === 'barcode' ? 'Scan another' : 'Take another photo'}
          saving={add.isPending}
          error={add.isError ? 'Couldn’t save. Check your signal and try again.' : null}
          onRetake={() => {
            if (step.source === 'barcode') return setStep({ kind: 'scan' })
            setStep({ kind: 'menu' })
            fileInput.current?.click()
          }}
          onSave={(entries) => add.mutate({ date, meal, source: step.source, entries })}
        />
      )}
    </div>
  )
}

function RecentList({ foods, onPick }: { foods: RecentFood[]; onPick: (f: RecentFood) => void }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="inline-flex items-center gap-2 font-extrabold text-[11px] text-ink-muted uppercase tracking-[0.08em]">
        <History className="size-3.5" aria-hidden />
        Recent
      </h3>
      <ul className="flex w-full flex-col">
        {foods.slice(0, 8).map((f) => (
          <li key={f.name}>
            <button
              type="button"
              onClick={() => onPick(f)}
              className="flex min-h-12 w-full items-center gap-3 border-border border-b py-2 text-left transition active:scale-[0.99]"
            >
              <span className="min-w-0 flex-1 truncate font-semibold text-[15px]">{f.name}</span>
              <span className="tabular shrink-0 text-[13px] text-ink-muted">
                {kcalLabel(f.kcal)} kcal · {gramsLabel(f.proteinG)} g protein
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

interface ReviewRow {
  clientUuid: string
  name: string
  grams: string
  kcal: string
  proteinG: string
  carbsG: string
  fatG: string
  low: boolean
}

const rowOf = (i: FoodPhotoDraft['items'][number]): ReviewRow => ({
  clientUuid: crypto.randomUUID(),
  name: i.name,
  grams: amountText(i.grams),
  kcal: amountText(i.kcal),
  proteinG: amountText(i.proteinG),
  carbsG: amountText(i.carbsG),
  fatG: amountText(i.fatG),
  low: i.confidence === 'low',
})

const itemOf = (r: ReviewRow): FoodDraftItem => ({
  clientUuid: r.clientUuid,
  name: r.name.trim(),
  grams: parseAmount(r.grams),
  kcal: parseAmount(r.kcal) ?? 0,
  proteinG: parseAmount(r.proteinG) ?? 0,
  carbsG: parseAmount(r.carbsG),
  fatG: parseAmount(r.fatG),
})

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

  const update = (i: number, key: keyof ReviewRow) => (value: string) =>
    setRows((list) => list.map((r, n) => (n === i ? { ...r, [key]: value } : r)))
  // A label: the one food follows the amount eaten.
  const onEaten = (value: string) => {
    setEaten(value)
    const grams = parseAmount(value)
    if (!label || grams === null) return
    const m = scaleLabel(label.per100g, grams)
    setRows((list) =>
      list.map((r, n) =>
        n === 0
          ? {
              ...r,
              grams: amountText(grams),
              kcal: amountText(m.kcal),
              proteinG: amountText(m.proteinG),
              carbsG: amountText(m.carbsG),
              fatG: amountText(m.fatG),
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
                  onChange={(e) => update(i, 'name')(e.target.value)}
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
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              <SmallAmount label="Grams" value={r.grams} onChange={update(i, 'grams')} />
              <SmallAmount label="kcal" value={r.kcal} onChange={update(i, 'kcal')} />
              <SmallAmount label="Protein g" value={r.proteinG} onChange={update(i, 'proteinG')} />
              <SmallAmount label="Carbs g" value={r.carbsG} onChange={update(i, 'carbsG')} />
              <SmallAmount label="Fat g" value={r.fatG} onChange={update(i, 'fatG')} />
            </div>
          </li>
        ))}
      </ul>
      <p className="tabular text-center font-semibold text-[14px] text-ink-muted">
        Adds {kcalLabel(totals.kcal)} kcal · {gramsLabel(totals.proteinG)} g protein
      </p>
      {error && (
        <p role="alert" className="rounded-md bg-danger/10 p-3 font-semibold text-[14px] text-danger">
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
}: {
  label: string
  value: string
  onChange: (value: string) => void
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
      <AmountInput id={id} value={value} onChange={onChange} />
    </div>
  )
}

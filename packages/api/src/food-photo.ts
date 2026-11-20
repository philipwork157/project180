// Food photo estimates: the shrunk photo goes to the Claude API with a plain fetch (no SDK in
// the Worker), comes back as a fixed JSON shape (structured outputs), and is checked here
// before the phone sees it. The photo is never stored or logged.
import { type Db, foodPhotoUses } from '@project180/db'
import {
  DEFAULT_FOOD_PHOTOS_PER_DAY,
  type FoodPhotoDraft,
  type FoodPhotoItem,
  MAX_FOODS_PER_ADD,
  PHOTO_CONFIDENCE,
  readClaudeUsage,
  roundGrams,
  roundKcal,
} from '@project180/shared'
import { and, eq, lt, sql } from 'drizzle-orm'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import type { ClaudeMeter } from './claude-calls'
import { isTestSite } from './email'
import type { Bindings } from './env'

const API_URL = 'https://api.anthropic.com/v1/messages'
const TIMEOUT_MS = 30_000

export const PHOTO_TYPES = new Set(['image/jpeg', 'image/webp', 'image/png'])
export const PHOTO_MAX_BYTES = 2 * 1024 * 1024

export const foodPhotosConfigured = (env: Bindings) => Boolean(env.ANTHROPIC_API_KEY)

const INSTRUCTIONS = `You estimate nutrition from a photo for a fitness coaching app in South Africa.

Decide what the photo shows:
- "meal": food or drink. List each separate food you can see, with a short everyday name a South African would use (for example pap, boerewors, biltong, rusks, vetkoek, bobotie, chakalaka). Estimate the grams on the plate and the calories, protein, carbs and fat for that amount. Count likely cooking oil, butter and sauce in the food it is on.
- "label": a nutrition information label on packaging. Read the per 100 g values exactly as printed (convert kJ to kcal by dividing by 4.184 if only kJ is shown), and the serving size in grams if printed. Put one item for one serving (or 100 g when no serving is printed).
- "not_food": anything else. Return no items.

Rules:
- If the person adds a note, trust it over what you see (for example the weight or how it was cooked).
- Use realistic portions. When unsure, say so with confidence "low" rather than guessing wildly.
- Numbers only, no ranges. Calories are kcal; protein, carbs, fat, fibre and sugar are grams; sodium is milligrams.
- Give fibre, sugar and sodium for each food too (typical values for that food and portion); null only when you truly can't tell. On a label, copy them when printed, otherwise null.
- note: one short sentence when something matters (hidden oil, a portion that is hard to judge), otherwise null.`

const nullableNumber = { type: ['number', 'null'] }
const macros = {
  type: 'object',
  properties: {
    kcal: { type: 'number' },
    protein_g: { type: 'number' },
    carbs_g: { type: 'number' },
    fat_g: { type: 'number' },
    fibre_g: nullableNumber,
    sugar_g: nullableNumber,
    sodium_mg: nullableNumber,
  },
  required: ['kcal', 'protein_g', 'carbs_g', 'fat_g', 'fibre_g', 'sugar_g', 'sodium_mg'],
  additionalProperties: false,
}

/** The JSON shape Claude must answer in. */
const REPLY_SCHEMA = {
  type: 'object',
  properties: {
    kind: { type: 'string', enum: ['meal', 'label', 'not_food'] },
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          grams: nullableNumber,
          kcal: { type: 'number' },
          protein_g: { type: 'number' },
          carbs_g: nullableNumber,
          fat_g: nullableNumber,
          fibre_g: nullableNumber,
          sugar_g: nullableNumber,
          sodium_mg: nullableNumber,
          confidence: { type: 'string', enum: [...PHOTO_CONFIDENCE] },
        },
        required: [
          'name',
          'grams',
          'kcal',
          'protein_g',
          'carbs_g',
          'fat_g',
          'fibre_g',
          'sugar_g',
          'sodium_mg',
          'confidence',
        ],
        additionalProperties: false,
      },
    },
    label: {
      anyOf: [
        {
          type: 'object',
          properties: { per_100g: macros, serving_g: nullableNumber },
          required: ['per_100g', 'serving_g'],
          additionalProperties: false,
        },
        { type: 'null' },
      ],
    },
    note: { type: ['string', 'null'] },
  },
  required: ['kind', 'items', 'label', 'note'],
  additionalProperties: false,
}

// Checked again here: never trust a model's numbers blindly. Out-of-range values are clamped.
const amount = (max: number) =>
  z
    .number()
    .finite()
    .transform((n) => Math.min(max, Math.max(0, n)))
const replySchema = z.object({
  kind: z.enum(['meal', 'label', 'not_food']),
  items: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(120),
        grams: amount(5000).nullable(),
        kcal: amount(5000),
        protein_g: amount(500),
        carbs_g: amount(1000).nullable(),
        fat_g: amount(500).nullable(),
        // Older answers (and models that skip them) have no extras: missing means unknown.
        fibre_g: amount(200).nullable().catch(null),
        sugar_g: amount(500).nullable().catch(null),
        sodium_mg: amount(20000).nullable().catch(null),
        confidence: z.enum(PHOTO_CONFIDENCE).catch('low'),
      }),
    )
    .max(30),
  label: z
    .object({
      per_100g: z.object({
        kcal: amount(1000),
        protein_g: amount(100),
        carbs_g: amount(100),
        fat_g: amount(100),
        fibre_g: amount(100).nullable().catch(null),
        sugar_g: amount(100).nullable().catch(null),
        sodium_mg: amount(40000).nullable().catch(null),
      }),
      serving_g: amount(5000).nullable(),
    })
    .nullable()
    .catch(null),
  note: z.string().trim().max(300).nullable().catch(null),
})

/** Turns Claude's JSON text into a draft, or null when it isn't the shape we asked for. */
export function parseFoodPhotoReply(text: string): Omit<FoodPhotoDraft, 'photosLeft'> | null {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return null
  }
  const parsed = replySchema.safeParse(raw)
  if (!parsed.success) return null
  const r = parsed.data
  const items: FoodPhotoItem[] =
    r.kind === 'not_food'
      ? []
      : r.items.slice(0, MAX_FOODS_PER_ADD).map((i) => ({
          name: i.name,
          grams: i.grams === null ? null : roundGrams(i.grams),
          kcal: roundKcal(i.kcal),
          proteinG: roundGrams(i.protein_g),
          carbsG: i.carbs_g === null ? null : roundGrams(i.carbs_g),
          fatG: i.fat_g === null ? null : roundGrams(i.fat_g),
          fibreG: i.fibre_g == null ? null : roundGrams(i.fibre_g),
          sugarG: i.sugar_g == null ? null : roundGrams(i.sugar_g),
          sodiumMg: i.sodium_mg == null ? null : Math.round(i.sodium_mg),
          confidence: i.confidence,
        }))
  const label =
    r.kind === 'label' && r.label
      ? {
          per100g: {
            kcal: roundKcal(r.label.per_100g.kcal),
            proteinG: roundGrams(r.label.per_100g.protein_g),
            carbsG: roundGrams(r.label.per_100g.carbs_g),
            fatG: roundGrams(r.label.per_100g.fat_g),
            fibreG: r.label.per_100g.fibre_g == null ? null : roundGrams(r.label.per_100g.fibre_g),
            sugarG: r.label.per_100g.sugar_g == null ? null : roundGrams(r.label.per_100g.sugar_g),
            sodiumMg:
              r.label.per_100g.sodium_mg == null ? null : Math.round(r.label.per_100g.sodium_mg),
          },
          servingG: r.label.serving_g === null ? null : roundGrams(r.label.serving_g),
        }
      : null
  return { kind: r.kind, items, label, note: r.note || null }
}

/** Base64 for the API, in slices so a large photo never overflows the call stack. */
export function toBase64(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(s)
}

interface ClaudeResponse {
  stop_reason?: string
  content?: Array<{ type: string; text?: string }>
  usage?: { input_tokens?: number; output_tokens?: number }
}

/**
 * Logs why a photo couldn't be read (`[food-photo]` in the Worker log: the `bun run dev`
 * terminal locally, `wrangler tail` or the Cloudflare dashboard on a deployed site) and answers
 * a friendly 502. On local and dev sites the reason is added to the message, so it shows in the
 * app. Never logs the photo or the person's note.
 */
function unreadable(
  env: Bindings,
  meter: ClaudeMeter,
  reason: string,
  detail?: unknown,
): HTTPException {
  console.error(`[food-photo] ${reason}`, detail ?? '')
  meter.outcome = 'failed'
  meter.failReason = reason.slice(0, 300)
  const message = 'Couldn’t read that photo. Try again or type it in.'
  return new HTTPException(502, {
    message: isTestSite(env) ? `${message} (${reason})` : message,
  })
}

/**
 * Asks Claude what's in the photo. Throws a friendly 502/503 when it can't answer. `meter` is
 * filled in as it goes (tokens, time, outcome) so the call can be saved either way.
 */
export async function estimateFoodPhoto(
  env: Bindings,
  photo: { bytes: Uint8Array; type: string },
  hint: string,
  meter: ClaudeMeter,
): Promise<Omit<FoodPhotoDraft, 'photosLeft'>> {
  const key = env.ANTHROPIC_API_KEY
  if (!key) throw new HTTPException(503, { message: 'Photo estimates aren’t set up yet.' })
  const { model } = meter
  meter.hadNote = Boolean(hint)
  const started = Date.now()
  const fail = (reason: string, detail?: unknown) => {
    meter.durationMs = Date.now() - started
    return unreadable(env, meter, reason, detail)
  }
  let res: Response
  try {
    res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        // Room for the model's own thinking before the short JSON answer.
        max_tokens: 4000,
        system: INSTRUCTIONS,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: { type: 'base64', media_type: photo.type, data: toBase64(photo.bytes) },
              },
              {
                type: 'text',
                text: hint ? `Note from the person: ${hint}` : 'No note from the person.',
              },
            ],
          },
        ],
        output_config: { format: { type: 'json_schema', schema: REPLY_SCHEMA } },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (err) {
    const timedOut = err instanceof Error && err.name === 'TimeoutError'
    throw fail(
      timedOut ? `Claude took longer than ${TIMEOUT_MS / 1000}s` : 'could not reach Claude',
      err,
    )
  }
  if (!res.ok) {
    // Claude's own error text says what's wrong (bad key, no credit, unknown model …).
    const body = (await res.json().catch(() => null)) as {
      error?: { type?: string; message?: string }
    } | null
    const why = body?.error?.message ?? res.statusText
    meter.requestId = res.headers.get('request-id')
    throw fail(`Claude answered ${res.status} ${body?.error?.type ?? ''}: ${why}`, {
      model,
      requestId: res.headers.get('request-id'),
    })
  }
  meter.requestId = res.headers.get('request-id')
  const data = (await res.json().catch(() => null)) as ClaudeResponse | null
  meter.usage = readClaudeUsage(data?.usage)
  const text = data?.content?.find((b) => b.type === 'text')?.text
  if (!text)
    throw fail(`no answer from Claude (stop: ${data?.stop_reason ?? 'none'})`, {
      model,
      blocks: data?.content?.map((b) => b.type),
    })
  if (data?.stop_reason === 'max_tokens')
    throw fail('Claude’s answer was cut off (max_tokens)', { model, usage: data.usage })
  const draft = parseFoodPhotoReply(text)
  if (!draft)
    throw fail('Claude’s answer wasn’t in the expected shape', {
      model,
      // Only on local and dev sites: the start of what came back, to see what went wrong.
      answer: isTestSite(env) ? text.slice(0, 500) : undefined,
    })
  meter.durationMs = Date.now() - started
  meter.outcome = draft.kind === 'not_food' ? 'not_food' : 'ok'
  meter.kind = draft.kind
  meter.items = draft.items.length
  console.log(
    `[food-photo] read ${draft.items.length} food(s) with ${model} in ${Date.now() - started} ms`,
    data?.usage ?? '',
  )
  return draft
}

/**
 * Counts one photo against today's cap and says how many are left, or answers 429 when the cap
 * is reached. Counted before calling Claude, so a burst of taps can't slip past it.
 */
export async function claimPhoto(
  db: Db,
  userId: number,
  date: string,
  perDay = DEFAULT_FOOD_PHOTOS_PER_DAY,
): Promise<number> {
  const [row] = await db
    .insert(foodPhotoUses)
    .values({ userId, date, count: 1 })
    .onConflictDoUpdate({
      target: [foodPhotoUses.userId, foodPhotoUses.date],
      set: { count: sql`${foodPhotoUses.count} + 1` },
      setWhere: lt(foodPhotoUses.count, perDay),
    })
    .returning({ count: foodPhotoUses.count })
  if (!row)
    throw new HTTPException(429, {
      message: 'You’ve reached today’s photo limit. Type it in instead.',
    })
  return perDay - row.count
}

/** Gives a photo back when Claude couldn't read it, so a failure doesn't use up the cap. */
export async function releasePhoto(db: Db, userId: number, date: string) {
  await db
    .update(foodPhotoUses)
    .set({ count: sql`max(${foodPhotoUses.count} - 1, 0)` })
    .where(and(eq(foodPhotoUses.userId, userId), eq(foodPhotoUses.date, date)))
}

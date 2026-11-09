import { HTTPException } from 'hono/http-exception'
import type { z } from 'zod'

export function notFound(what = 'Not found'): never {
  throw new HTTPException(404, { message: what })
}

export function forbidden(message = 'Not allowed'): never {
  throw new HTTPException(403, { message })
}

/** Parses a JSON body with a Zod schema, answering 400 with the first problem. */
export async function parseBody<S extends z.ZodType>(
  req: Request,
  schema: S,
): Promise<z.output<S>> {
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    throw new HTTPException(400, { message: 'Expected a JSON body' })
  }
  const result = schema.safeParse(raw)
  if (!result.success) {
    const issue = result.error.issues[0]
    const field = issue?.path.join('.')
    throw new HTTPException(400, {
      message: field ? `${field}: ${issue?.message}` : (issue?.message ?? 'Invalid input'),
    })
  }
  return result.data
}

/** 409: it can't be done until something else changes first. */
export function conflict(message: string): never {
  throw new HTTPException(409, { message })
}

export function parseId(value: string): number {
  const n = Number(value)
  if (!Number.isInteger(n) || n <= 0) notFound()
  return n
}

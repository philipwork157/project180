import type { Bindings } from './env'

export const originOf = (url: string) => {
  try {
    return new URL(url.trim()).origin
  } catch {
    return null
  }
}

export const sameOrigin = (origin: string, requestUrl: string) => origin === originOf(requestUrl)

/** Sites allowed to send us forms: our own address and the ones Better Auth trusts. */
export function allowedOrigins(env: Bindings) {
  const list = [env.BETTER_AUTH_URL, ...(env.TRUSTED_ORIGINS?.split(',') ?? [])]
  return new Set(list.map((u) => (u ? originOf(u) : null)).filter((o): o is string => o !== null))
}

/**
 * The address of the app that sent this request (phone app or admin), for links in emails:
 * the request's Origin when it's one of ours, otherwise this Worker's own address.
 */
export function requestOrigin(env: Bindings, origin: string | undefined, requestUrl: string) {
  if (origin && (allowedOrigins(env).has(origin) || sameOrigin(origin, requestUrl))) return origin
  return originOf(env.BETTER_AUTH_URL) ?? originOf(requestUrl) ?? ''
}

/** The phone app's address (links in invitations always open the app, even when sent from the admin). */
export function appOrigin(env: Bindings) {
  return originOf(env.APP_URL || env.BETTER_AUTH_URL || '') ?? ''
}

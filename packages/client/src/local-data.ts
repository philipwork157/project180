/** Saved on this device per person: unfinished workouts (app) and unsaved editor drafts (admin). */
const PERSONAL_PREFIXES = ['project180-workout-', 'project180-draft-']
/** Whose data that is (their user id), so it's only ever shown to them again. */
const OWNER_KEY = 'project180-local-owner'

/**
 * Removes what the last person left on this device (on sign-out and sign-in). Device settings
 * like the theme stay.
 */
export function forgetLocalData() {
  try {
    for (const key of Object.keys(localStorage)) {
      if (PERSONAL_PREFIXES.some((p) => key.startsWith(p))) localStorage.removeItem(key)
    }
    localStorage.removeItem(OWNER_KEY)
  } catch {
    // Storage unavailable (private mode): nothing saved.
  }
}

/**
 * After signing in: keeps what's saved on this device only if it belongs to the person who just
 * signed in (signed out by the server mid-workout, then back in: their unsent sets are still
 * there). Anyone else's is removed, so a shared phone never shows the last person's data.
 */
export function claimLocalData(userId: number | string | null | undefined) {
  const id = userId == null ? '' : String(userId)
  try {
    if (!id || localStorage.getItem(OWNER_KEY) !== id) forgetLocalData()
    if (id) localStorage.setItem(OWNER_KEY, id)
  } catch {
    // Storage unavailable (private mode): nothing saved.
  }
}

/** Marks what's saved on this device as this person's (they're signed in and using it). */
export function rememberLocalOwner(userId: number) {
  try {
    localStorage.setItem(OWNER_KEY, String(userId))
  } catch {
    // Storage unavailable (private mode): nothing saved.
  }
}

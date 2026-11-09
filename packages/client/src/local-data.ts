/** Saved on this device per person: unfinished workouts (app) and unsaved editor drafts (admin). */
const PERSONAL_PREFIXES = ['project180-workout-', 'project180-draft-']

/**
 * Removes what the last person left on this device (on sign-out, sign-in and when signed out by
 * the server). Device settings like the theme stay.
 */
export function forgetLocalData() {
  try {
    for (const key of Object.keys(localStorage)) {
      if (PERSONAL_PREFIXES.some((p) => key.startsWith(p))) localStorage.removeItem(key)
    }
  } catch {
    // Storage unavailable (private mode): nothing saved.
  }
}

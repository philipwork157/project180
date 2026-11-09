export type ThemePreference = 'system' | 'light' | 'dark'

const KEY = 'project180-theme'

export function getThemePreference(): ThemePreference {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : 'system'
  } catch {
    return 'system'
  }
}

/** 'system' follows the phone; light/dark override it. */
export function applyTheme(pref: ThemePreference) {
  const root = document.documentElement
  if (pref === 'system') delete root.dataset.theme
  else root.dataset.theme = pref

  const dark =
    pref === 'dark' || (pref === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', dark ? '#161817' : '#f5f3ed')
}

/**
 * Switches the theme with one calm cross-fade of the whole page, instead of every card,
 * border and button running its own colour transition at a different speed.
 */
function switchSmoothly(change: () => void) {
  const root = document.documentElement
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
  // Element transitions off while the colours swap; the view transition does the fade.
  root.classList.add('theme-switching')
  const done = () => requestAnimationFrame(() => root.classList.remove('theme-switching'))
  const doc = document as Document & {
    startViewTransition?: (cb: () => void) => { finished: Promise<void> }
  }
  if (doc.startViewTransition && !reduced) {
    doc.startViewTransition(change).finished.finally(done)
  } else {
    change()
    done()
  }
}

export function setThemePreference(pref: ThemePreference) {
  try {
    if (pref === 'system') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, pref)
  } catch {
    // Private mode: the choice lasts until the app closes.
  }
  switchSmoothly(() => applyTheme(pref))
}

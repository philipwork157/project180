// Apply the saved theme before first paint, so there's no flash. Loaded as a plain blocking
// script from index.html (not inline, so the Content-Security-Policy can forbid inline scripts).
try {
  const t = localStorage.getItem('project180-theme')
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t
} catch {
  // Storage blocked (private browsing): the system theme is used.
}

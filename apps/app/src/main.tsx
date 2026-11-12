import { ApiError, applyTheme, forgetLocalData, getThemePreference } from '@project180/client'
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createRouter, RouterProvider } from '@tanstack/react-router'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { routeTree } from './routeTree.gen'
// Fonts are bundled with the app (no Google Fonts): they work offline on a new phone and no
// third party sees who opens the app. Only the weights the design uses.
import '@fontsource/archivo/500.css'
import '@fontsource/archivo/600.css'
import '@fontsource/archivo/700.css'
import '@fontsource/archivo/800.css'
import '@fontsource/archivo/900.css'
import '@fontsource/archivo/700-italic.css'
import '@fontsource/archivo/800-italic.css'
import '@fontsource/archivo/900-italic.css'
import '@fontsource/plus-jakarta-sans/400.css'
import '@fontsource/plus-jakarta-sans/500.css'
import '@fontsource/plus-jakarta-sans/600.css'
import '@fontsource/plus-jakarta-sans/700.css'
import '@fontsource/plus-jakarta-sans/800.css'
import './styles.css'

/** Signed out on the server (expired, or signed out on another device): back to the login screen. */
function onApiError(err: unknown) {
  if (!(err instanceof ApiError) || err.status !== 401) return
  if (window.location.pathname === '/login') return
  queryClient.clear()
  forgetLocalData()
  void router.navigate({ to: '/login', replace: true })
}

const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: onApiError }),
  mutationCache: new MutationCache({ onError: onApiError }),
  defaultOptions: {
    // Never retry "not signed in" or "not found"; retry once for network blips.
    queries: {
      staleTime: 30_000,
      retry: (n, err) => n < 1 && !(err instanceof ApiError && err.status < 500),
    },
  },
})

const router = createRouter({
  routeTree,
  context: { queryClient },
  defaultPreload: 'intent',
  scrollRestoration: true,
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

applyTheme(getThemePreference())

const root = document.getElementById('root')
if (!root) throw new Error('Missing #root')

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
)

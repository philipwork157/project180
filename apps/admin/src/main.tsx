import { ApiError, applyTheme, forgetLocalData, getThemePreference } from '@project180/client'
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createRouter, RouterProvider } from '@tanstack/react-router'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { routeTree } from './routeTree.gen'
import './styles.css'

/** Signed out on the server (expired after 7 days, or signed out elsewhere): back to login. */
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

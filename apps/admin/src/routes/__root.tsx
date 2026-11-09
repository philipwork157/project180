import { EmptyState, Toaster } from '@project180/ui'
import type { QueryClient } from '@tanstack/react-query'
import { createRootRouteWithContext, Link, Outlet } from '@tanstack/react-router'

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: () => (
    <>
      <Outlet />
      <Toaster />
    </>
  ),
  notFoundComponent: () => (
    <div className="mx-auto max-w-md p-8">
      <EmptyState
        title="Nothing here"
        action={
          <Link to="/" className="font-bold text-brand-text">
            Back to the overview
          </Link>
        }
      >
        That page doesn't exist.
      </EmptyState>
    </div>
  ),
})

import { buttonClasses, EmptyState } from '@project180/ui'
import type { QueryClient } from '@tanstack/react-query'
import { createRootRouteWithContext, Link, Outlet } from '@tanstack/react-router'

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: Outlet,
  notFoundComponent: () => (
    <div className="mx-auto max-w-md p-4 pt-safe">
      <EmptyState
        title="Nothing here"
        action={
          <Link to="/" className={buttonClasses('primary')}>
            Back to today
          </Link>
        }
      >
        That page doesn't exist.
      </EmptyState>
    </div>
  ),
})

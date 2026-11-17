import { createFileRoute, redirect } from '@tanstack/react-router'

/** The old People page: clients now live at /clients (old links and bookmarks still work). */
export const Route = createFileRoute('/_dash/users')({
  beforeLoad: () => {
    throw redirect({ to: '/clients', replace: true })
  },
})

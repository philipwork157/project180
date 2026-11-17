import { createFileRoute, redirect } from '@tanstack/react-router'

/**
 * The old Messages page: each chat is now the Chat tab of its client's page, and unread chats
 * show on Today and in the Clients list. Old links (and notifications) still land right.
 */
export const Route = createFileRoute('/_dash/messages')({
  validateSearch: (search: Record<string, unknown>): { client?: number } => {
    const id = Number(search.client)
    return Number.isInteger(id) && id > 0 ? { client: id } : {}
  },
  beforeLoad: ({ search }) => {
    if (search.client)
      throw redirect({
        to: '/clients/$clientId',
        params: { clientId: String(search.client) },
        search: { tab: 'chat' },
        replace: true,
      })
    throw redirect({ to: '/clients', replace: true })
  },
})

import { createFileRoute, redirect } from '@tanstack/react-router'

/** The old progress page: now the Progress tab of the client page (or My training for you). */
export const Route = createFileRoute('/_dash/users_/$userId')({
  beforeLoad: ({ context, params }) => {
    if (Number(params.userId) === context.me.id)
      throw redirect({ to: '/my-training', search: { tab: 'progress' }, replace: true })
    throw redirect({
      to: '/clients/$clientId',
      params: { clientId: params.userId },
      search: { tab: 'progress' },
      replace: true,
    })
  },
})

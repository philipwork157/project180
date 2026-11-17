// Today: an invitation from a coach, for someone training on their own. Accepting joins the
// coach's business: everything they logged stays and the coach can see it and set their goals.
import { ApiError, api, myInvitationsQuery } from '@project180/client'
import type { InvitationForMe } from '@project180/shared'
import { Button, ConfirmDialog } from '@project180/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { UserPlus } from 'lucide-react'
import { useState } from 'react'

export function InvitationCards() {
  const invitations = useQuery(myInvitationsQuery)
  if (!invitations.data?.length) return null
  return (
    <div className="flex w-full flex-col gap-4">
      {invitations.data.map((invite) => (
        <InvitationCard key={invite.id} invite={invite} />
      ))}
    </div>
  )
}

function InvitationCard({ invite }: { invite: InvitationForMe }) {
  const queryClient = useQueryClient()
  const [confirming, setConfirming] = useState(false)
  const accept = useMutation({
    mutationFn: () => api(`/me/invitations/${invite.id}/accept`, { method: 'POST' }),
    onSuccess: () => {
      setConfirming(false)
      // Who coaches them changes what most screens show: refresh everything behind the scenes.
      void queryClient.invalidateQueries()
    },
  })
  const decline = useMutation({
    mutationFn: () =>
      api<{ invitations: InvitationForMe[] }>(`/me/invitations/${invite.id}/decline`, {
        method: 'POST',
      }),
    onSuccess: ({ invitations }) =>
      queryClient.setQueryData(myInvitationsQuery.queryKey, invitations),
  })
  const error = accept.error ?? decline.error

  return (
    <section
      aria-label="Invitation from a coach"
      className="flex flex-col gap-4 rounded-lg border-lime border-l-4 bg-surface p-5 shadow-card md:p-6"
    >
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-lime/25 text-lime-text">
          <UserPlus className="size-5" aria-hidden />
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="font-bold text-[17px]">
            {invite.coachName} invited you to train with {invite.businessName}
          </h2>
          <p className="text-[14px] text-ink-muted">
            They’ll give you your program and daily targets, and you can chat with them. Everything
            you’ve logged stays yours.
          </p>
        </div>
      </div>
      {error && (
        <p role="alert" className="font-semibold text-[13px] text-danger">
          {error instanceof ApiError ? error.message : 'Couldn’t do that. Try again.'}
        </p>
      )}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Button size="lg" block onClick={() => setConfirming(true)}>
          Accept
        </Button>
        <Button
          variant="ghost"
          size="lg"
          block
          loading={decline.isPending}
          onClick={() => decline.mutate()}
        >
          No thanks
        </Button>
      </div>
      <ConfirmDialog
        open={confirming}
        tone="primary"
        title={`Train with ${invite.coachName}?`}
        confirmLabel="Accept"
        loading={accept.isPending}
        onConfirm={() => accept.mutate()}
        onClose={() => !accept.isPending && setConfirming(false)}
      >
        {invite.coachName} will see your workouts, food, weigh-ins and progress, and will set your
        goal weight, activity level and daily targets from now on. You can chat with them in the
        Coach tab.
      </ConfirmDialog>
    </section>
  )
}

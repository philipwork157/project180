// Clients page: the people still waiting to join. Add client only sets the account up; the
// coach sends the link from here when they're ready: Email the link, or Copy the link (a set-up
// account, for WhatsApp). Someone already training on their own gets a plain invitation and
// accepts it in the app. Plain invitations can be cancelled.
import { ApiError, api, invitationsQuery } from '@project180/client'
import { INVITE_DAYS, type Invitation, timeAgo } from '@project180/shared'
import { Card, ConfirmDialog, IconButton, toast } from '@project180/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Copy, Mail, X } from 'lucide-react'
import { useState } from 'react'

type Reply = { invitations: Invitation[]; link?: string }

function useSetInvitations() {
  const qc = useQueryClient()
  return (invitations: Invitation[]) => {
    qc.setQueryData(invitationsQuery.queryKey, invitations)
    // The first-steps card ticks "add your first client" once someone's invited.
    void qc.invalidateQueries({ queryKey: ['overview', 'first-steps'] })
  }
}

const onError = (err: Error) =>
  toast({
    title: 'Couldn’t send it',
    description: err instanceof ApiError ? err.message : 'Try again.',
    tone: 'error',
  })

/** Invitations still waiting for an answer. Hidden when there are none. */
export function PendingInvitations() {
  const invitations = useQuery(invitationsQuery)
  const setInvitations = useSetInvitations()
  const [cancelling, setCancelling] = useState<Invitation | null>(null)
  const email = useMutation({
    mutationFn: (invite: Invitation) =>
      api<Reply>(`/admin/invitations/${invite.id}/resend`, { method: 'POST' }),
    onSuccess: ({ invitations }, invite) => {
      setInvitations(invitations)
      toast({
        title: invite.emailedAt ? 'Emailed again' : 'Link emailed',
        description: `A fresh link is on its way to ${invite.email}.`,
      })
    },
    onError,
  })
  // A set-up account's link, to paste into WhatsApp or a message. A fresh link each time.
  const copy = useMutation({
    mutationFn: (invite: Invitation) =>
      api<Reply>(`/admin/invitations/${invite.id}/link`, { method: 'POST' }),
    onSuccess: async ({ invitations, link }, invite) => {
      setInvitations(invitations)
      const first = invite.name.split(' ')[0] ?? invite.name
      const message = `Hi ${first}, I’ve set you up on Project 180: your program and goals are ready.\n\nTap this link to choose your password and you’re in:\n${link}\n\nIt works for ${INVITE_DAYS} days. On your phone, “Add to Home Screen” once you’re in to install the app.`
      const copied =
        Boolean(link) &&
        (await navigator.clipboard.writeText(message).then(
          () => true,
          () => false,
        ))
      toast(
        copied
          ? {
              title: 'Message copied',
              description: `Paste it into WhatsApp for ${first}. Any older link stopped working.`,
            }
          : { title: 'Couldn’t copy it', description: 'Try again.', tone: 'error' },
      )
    },
    onError,
  })
  const cancel = useMutation({
    mutationFn: (invite: Invitation) =>
      api<Reply>(`/admin/invitations/${invite.id}`, { method: 'DELETE' }),
    onSuccess: ({ invitations }, invite) => {
      setInvitations(invitations)
      setCancelling(null)
      toast({
        title: 'Invitation cancelled',
        description: `${invite.name}’s link no longer works.`,
      })
    },
  })

  if (!invitations.data?.length) return null
  const now = Date.now()
  return (
    <Card className="mb-5 p-0 md:p-0">
      <div className="flex flex-col gap-1 px-5 pt-5 md:px-6">
        <h2 className="font-bold text-[16px]">Waiting to join ({invitations.data.length})</h2>
        {invitations.data.some((i) => !i.emailedAt) && (
          <p className="text-[13px] text-ink-muted">
            Send each person their link when you’re ready: email it, or copy it for WhatsApp.
          </p>
        )}
      </div>
      <ul className="flex w-full flex-col">
        {invitations.data.map((invite) => {
          const expired = new Date(invite.expiresAt).getTime() < now
          return (
            <li
              key={invite.id}
              className="flex min-h-16 items-center gap-3 border-border border-t px-5 py-3 first:border-t-0 md:px-6"
            >
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-steel/20 text-steel-text">
                <Mail className="size-4" aria-hidden />
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                {invite.userId ? (
                  <Link
                    to="/clients/$clientId"
                    params={{ clientId: String(invite.userId) }}
                    className="truncate font-semibold text-[15px] hover:underline"
                  >
                    {invite.name}
                  </Link>
                ) : (
                  <span className="truncate font-semibold text-[15px]">{invite.name}</span>
                )}
                <span className="truncate text-[13px] text-ink-muted">
                  {invite.email}
                  {invite.coachName && ` · for ${invite.coachName}`}
                </span>
                {/* Its own line, so it never gets cut off on a phone. */}
                <span className="text-[13px] text-ink-muted">
                  {!invite.emailedAt ? (
                    <b className="text-sand-text">Not sent yet</b>
                  ) : expired ? (
                    <b className="text-clay-text">Link expired</b>
                  ) : (
                    `${invite.userId ? 'Set up · ' : ''}emailed ${timeAgo(invite.emailedAt)}`
                  )}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-1">
                <IconButton
                  label={invite.emailedAt ? 'Email the link again' : 'Email the link'}
                  icon={<Mail aria-hidden />}
                  disabled={email.isPending}
                  onClick={() => email.mutate(invite)}
                />
                {invite.userId && (
                  <IconButton
                    label="Copy the link (for WhatsApp)"
                    icon={<Copy aria-hidden />}
                    disabled={copy.isPending}
                    onClick={() => copy.mutate(invite)}
                  />
                )}
                {/* A set-up account stays a client: resend its link instead. */}
                {!invite.userId && (
                  <IconButton
                    label="Cancel invitation"
                    icon={<X aria-hidden />}
                    tone="danger"
                    onClick={() => setCancelling(invite)}
                  />
                )}
              </span>
            </li>
          )
        })}
      </ul>
      <ConfirmDialog
        open={cancelling !== null}
        title={`Cancel ${cancelling?.name ?? 'this'}’s invitation?`}
        confirmLabel="Cancel invitation"
        cancelLabel="Keep it"
        loading={cancel.isPending}
        onConfirm={() => cancelling && cancel.mutate(cancelling)}
        onClose={() => !cancel.isPending && setCancelling(null)}
      >
        The link in their email stops working. You can invite them again later.
      </ConfirmDialog>
    </Card>
  )
}

// Clients page: invite someone by email (a Drawer), and the invitations still waiting for an
// answer, each with Resend and Cancel. Someone new signs up from the email's link; someone
// already training on their own accepts in the app and keeps everything they logged.
import { ApiError, api, coachesQuery, invitationsQuery } from '@project180/client'
import { INVITE_DAYS, type Invitation, isOwner, type Me, timeAgo } from '@project180/shared'
import {
  Button,
  Card,
  ConfirmDialog,
  Drawer,
  Field,
  IconButton,
  Input,
  Select,
  toast,
} from '@project180/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Mail, RotateCw, X } from 'lucide-react'
import { type FormEvent, useState } from 'react'

type Reply = { invitations: Invitation[] }

function useSetInvitations() {
  const qc = useQueryClient()
  return (invitations: Invitation[]) => {
    qc.setQueryData(invitationsQuery.queryKey, invitations)
    // The first-steps card ticks "add your first client" once someone's invited.
    void qc.invalidateQueries({ queryKey: ['overview', 'first-steps'] })
  }
}

export function InviteDrawer({
  open,
  onClose,
  me,
}: {
  open: boolean
  onClose: () => void
  me: Me
}) {
  const owner = isOwner(me.role)
  const coaches = useQuery({ ...coachesQuery, enabled: owner && open })
  const setInvitations = useSetInvitations()
  const [error, setError] = useState<string>()
  const send = useMutation({
    mutationFn: (body: { name: string; email: string; coachId?: number }) =>
      api<Reply>('/admin/invitations', { method: 'POST', body }),
    onSuccess: ({ invitations }, body) => {
      setInvitations(invitations)
      toast({ title: 'Invitation sent', description: `${body.name} gets an email with a link.` })
      onClose()
    },
    onError: (err) =>
      setError(err instanceof ApiError ? err.message : 'Couldn’t send it. Try again.'),
  })

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    setError(undefined)
    const coachId = Number(form.get('coach'))
    send.mutate({
      name: String(form.get('name')),
      email: String(form.get('email')),
      ...(owner && coachId ? { coachId } : {}),
    })
  }

  return (
    <Drawer
      open={open}
      onClose={() => {
        if (send.isPending) return
        setError(undefined)
        onClose()
      }}
      title="Invite a client"
      description={`They get an email with a link that works for ${INVITE_DAYS} days. No passwords to hand out: they choose their own.`}
    >
      <form id="invite-form" onSubmit={onSubmit} className="flex flex-col gap-4">
        <Field label="Their name">
          {(id) => <Input id={id} name="name" autoComplete="off" required autoFocus />}
        </Field>
        <Field
          label="Email"
          hint="Already using the app on their own? They accept on their Today screen and keep everything they’ve logged."
        >
          {(id) => <Input id={id} name="email" type="email" autoComplete="off" required />}
        </Field>
        {owner && (
          <Field label="Coach">
            {(id) => (
              <Select id={id} name="coach" defaultValue={me.id}>
                {(coaches.data ?? [{ id: me.id, name: me.name }]).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.id === me.id ? `${c.name} (you)` : c.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}
        {error && (
          <p role="alert" className="font-semibold text-[14px] text-danger">
            {error}
          </p>
        )}
        <Button
          type="submit"
          size="lg"
          block
          loading={send.isPending}
          icon={<Mail className="size-5" aria-hidden />}
        >
          Send invitation
        </Button>
      </form>
    </Drawer>
  )
}

/** Invitations still waiting for an answer. Hidden when there are none. */
export function PendingInvitations() {
  const invitations = useQuery(invitationsQuery)
  const setInvitations = useSetInvitations()
  const [cancelling, setCancelling] = useState<Invitation | null>(null)
  const resend = useMutation({
    mutationFn: (invite: Invitation) =>
      api<Reply>(`/admin/invitations/${invite.id}/resend`, { method: 'POST' }),
    onSuccess: ({ invitations }, invite) => {
      setInvitations(invitations)
      toast({ title: 'Sent again', description: `A fresh link is on its way to ${invite.name}.` })
    },
    onError: (err) =>
      toast({
        title: 'Couldn’t send it',
        description: err instanceof ApiError ? err.message : 'Try again.',
        tone: 'error',
      }),
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
      <h2 className="px-5 pt-5 font-bold text-[16px] md:px-6">
        Waiting for an answer ({invitations.data.length})
      </h2>
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
                <span className="truncate font-semibold text-[15px]">{invite.name}</span>
                <span className="truncate text-[13px] text-ink-muted">
                  {invite.email}
                  {invite.coachName && ` · for ${invite.coachName}`}
                  {' · '}
                  {expired ? (
                    <b className="text-clay-text">link expired</b>
                  ) : (
                    `sent ${timeAgo(invite.createdAt)}`
                  )}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-1">
                <IconButton
                  label={expired ? 'Send a new link' : 'Send again'}
                  icon={<RotateCw aria-hidden />}
                  disabled={resend.isPending}
                  onClick={() => resend.mutate(invite)}
                />
                <IconButton
                  label="Cancel invitation"
                  icon={<X aria-hidden />}
                  tone="danger"
                  onClick={() => setCancelling(invite)}
                />
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

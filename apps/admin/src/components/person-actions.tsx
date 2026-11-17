// Account actions for one person, used on the client page: block or unblock, delete for good,
// change their coach (owners) and set a temporary password.
import {
  ApiError,
  adminOverviewQuery,
  api,
  coachesQuery,
  personActivityQuery,
  usersQuery,
} from '@project180/client'
import {
  type DeletePersonResult,
  type DirectoryPerson,
  generateTempPassword,
  isStaff,
  TEMP_PASSWORD_DAYS,
  type UserSummary,
} from '@project180/shared'
import { Button, ConfirmDialog, Field, IconButton, Input, Select, toast } from '@project180/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Ban, RefreshCw, ShieldCheck, Trash2, UserRoundCog } from 'lucide-react'
import { useId, useState } from 'react'

/**
 * Block someone's access (or let them back in): they're signed out everywhere and can't sign
 * in, but their account and everything they logged stay. Coaches block their own clients;
 * owners also block coaches.
 */
export function BlockButton({ user }: { user: UserSummary }) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const first = user.name.split(' ')[0] ?? user.name
  const blocking = !user.blocked
  const change = useMutation({
    mutationFn: () =>
      api<{ blocked: boolean }>(`/admin/users/${user.id}/access`, {
        method: 'POST',
        body: { blocked: blocking },
      }),
    onSuccess: ({ blocked }) => {
      setOpen(false)
      const patch = <T extends UserSummary>(u: T): T =>
        u.id === user.id ? { ...u, blocked, signedIn: blocked ? false : u.signedIn } : u
      queryClient.setQueryData(usersQuery.queryKey, (list) => list?.map(patch))
      queryClient.setQueriesData<{ people: DirectoryPerson[] }>(
        { queryKey: ['admin', 'users', 'directory'] },
        (page) => (page ? { ...page, people: page.people.map(patch) } : page),
      )
      void queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
      void queryClient.invalidateQueries({ queryKey: adminOverviewQuery.queryKey })
      toast({
        title: blocked ? `${user.name} is blocked` : `${user.name} can sign in again`,
        description: blocked
          ? 'Signed out on every device. Everything they logged is kept.'
          : 'Their account, program and history are just as they were.',
      })
    },
    onError: (err) =>
      toast({
        tone: 'error',
        title: blocking ? 'Couldn’t block' : 'Couldn’t unblock',
        description: err instanceof ApiError ? err.message : undefined,
      }),
  })
  return (
    <>
      <IconButton
        label={blocking ? `Block ${user.name}` : `Unblock ${user.name}`}
        icon={blocking ? <Ban aria-hidden /> : <ShieldCheck aria-hidden />}
        size="lg"
        active={!blocking}
        onClick={() => setOpen(true)}
      />
      <ConfirmDialog
        open={open}
        title={blocking ? `Block ${user.name}?` : `Let ${user.name} back in?`}
        confirmLabel={blocking ? 'Block' : 'Unblock'}
        tone={blocking ? 'danger' : 'primary'}
        loading={change.isPending}
        onConfirm={() => change.mutate()}
        onClose={() => setOpen(false)}
      >
        {blocking
          ? `${first} is signed out on every device straight away, gets no more notifications and can’t sign in until you unblock them. Their account, program and everything they logged stay as they are.`
          : `${first} can sign in again with their password, and everything is as they left it.`}
      </ConfirmDialog>
    </>
  )
}

/** Owners only: delete someone and everything they logged (a coach's clients come to you). */
export function DeletePersonButton({
  user,
  clients,
  onDeleted,
}: {
  user: UserSummary
  clients: number
  /** After it's gone (the client page goes back to the list). */
  onDeleted?: () => void
}) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const first = user.name.split(' ')[0] ?? user.name
  const coach = isStaff(user.role)
  const remove = useMutation({
    mutationFn: () => api<DeletePersonResult>(`/admin/users/${user.id}`, { method: 'DELETE' }),
    onSuccess: ({ removed, handedOver }) => {
      setOpen(false)
      queryClient.setQueryData(usersQuery.queryKey, (list) => list?.filter((u) => u.id !== user.id))
      // Their clients and library moved to you: refresh those in the background.
      void queryClient.invalidateQueries({ queryKey: usersQuery.queryKey })
      void queryClient.invalidateQueries({ queryKey: ['workouts'] })
      void queryClient.invalidateQueries({ queryKey: ['programs'] })
      void queryClient.invalidateQueries({ queryKey: adminOverviewQuery.queryKey })
      const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`
      onDeleted?.()
      toast({
        title: `${user.name} deleted`,
        description: coach
          ? `${plural(handedOver.clients, 'client')}, ${plural(handedOver.workouts, 'workout')} and ${plural(handedOver.programs, 'program')} are yours now.`
          : `${plural(removed.workouts, 'workout')} and ${plural(removed.checkins, 'weigh-in')} removed.`,
      })
    },
    onError: (err) =>
      toast({
        tone: 'error',
        title: 'Couldn’t delete',
        description: err instanceof ApiError ? err.message : undefined,
      }),
  })
  return (
    <>
      <IconButton
        label={`Delete ${user.name}`}
        icon={<Trash2 aria-hidden />}
        size="lg"
        onClick={() => setOpen(true)}
      />
      <ConfirmDialog
        open={open}
        title={`Delete ${user.name} for good?`}
        confirmLabel="Delete for good"
        loading={remove.isPending}
        onConfirm={() => remove.mutate()}
        onClose={() => setOpen(false)}
      >
        {coach
          ? `${first}’s account goes. Their exercises, workouts and programs move to you${clients > 0 ? `, and so ${clients === 1 ? 'does their client' : `do their ${clients} clients`}` : ''}. Nothing anyone uses is lost.`
          : `${first}’s account and everything they logged go: workouts, sets, weigh-ins, their program and how they used the app. This can’t be undone.`}
      </ConfirmDialog>
    </>
  )
}

/** Owners: hand a client to another coach. */
export function CoachPicker({ user }: { user: UserSummary }) {
  const queryClient = useQueryClient()
  const coaches = useQuery(coachesQuery)
  const change = useMutation({
    mutationFn: (coachId: number) =>
      api(`/admin/users/${user.id}/coach`, { method: 'PATCH', body: { coachId } }),
    onSuccess: (_, coachId) => {
      const name = coaches.data?.find((c) => c.id === coachId)?.name
      queryClient.setQueryData(usersQuery.queryKey, (list) =>
        list?.map((u) => (u.id === user.id ? { ...u, coachId, coachName: name ?? null } : u)),
      )
      void queryClient.invalidateQueries({ queryKey: usersQuery.queryKey })
      toast({ title: 'Coach changed', description: `${user.name} is now coached by ${name}.` })
    },
    onError: (err) =>
      toast({
        tone: 'error',
        title: 'Couldn’t change the coach',
        description: err instanceof ApiError ? err.message : undefined,
      }),
  })
  const selectId = useId()
  return (
    <label
      htmlFor={selectId}
      className="flex items-center gap-2 font-semibold text-[13px] text-ink-muted"
    >
      <UserRoundCog className="size-4" aria-hidden />
      <span className="sr-only">Coach for {user.name}</span>
      <Select
        id={selectId}
        compact
        className="w-40"
        value={user.coachId ?? ''}
        disabled={change.isPending || !coaches.data}
        onChange={(e) => e.target.value && change.mutate(Number(e.target.value))}
      >
        {user.coachId === null && <option value="">No coach</option>}
        {coaches.data?.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </Select>
    </label>
  )
}

export function PasswordForm({
  userId,
  temporary,
  onDone,
}: {
  userId: number
  temporary: boolean
  onDone: () => void
}) {
  const queryClient = useQueryClient()
  // A strong one ready to send; the coach can still type their own.
  const [password, setPassword] = useState(() => (temporary ? generateTempPassword() : ''))
  const [notify, setNotify] = useState(temporary)
  const [error, setError] = useState<string>()
  const reset = useMutation({
    mutationFn: () =>
      api<{ email?: { status: string; to: string } } | null>(`/admin/users/${userId}/password`, {
        method: 'POST',
        body: { password, sendEmail: notify },
      }),
  })
  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={async (e) => {
        e.preventDefault()
        if (password.length < 8) return setError('At least 8 characters')
        setError(undefined)
        try {
          const res = await reset.mutateAsync()
          void queryClient.invalidateQueries({ queryKey: personActivityQuery(userId).queryKey })
          const sent = res?.email
          toast({
            title: temporary ? 'Temporary password set' : 'Password changed',
            description: !temporary
              ? 'Use it next time you sign in.'
              : !sent
                ? 'Tell them the new one.'
                : sent.status === 'sent'
                  ? `Emailed to ${sent.to}.`
                  : sent.status === 'logged'
                    ? 'Email isn’t set up yet, so tell them the new one.'
                    : 'The email failed, so tell them the new one.',
          })
          onDone()
        } catch (err) {
          setError(err instanceof ApiError ? err.message : 'Could not change the password.')
        }
      }}
    >
      <Field
        label={temporary ? 'Temporary password' : 'New password'}
        hint={
          temporary
            ? `Works for ${TEMP_PASSWORD_DAYS} days. They choose their own when they sign in.`
            : 'At least 8 characters'
        }
        error={error}
      >
        {(id) =>
          temporary ? (
            <div className="flex gap-2">
              <Input
                id={id}
                type="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="font-mono"
              />
              <Button
                variant="secondary"
                className="shrink-0"
                icon={<RefreshCw className="size-4" aria-hidden />}
                onClick={() => setPassword(generateTempPassword())}
              >
                New
              </Button>
            </div>
          ) : (
            <Input
              id={id}
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
            />
          )
        }
      </Field>
      {temporary && (
        <label className="flex cursor-pointer items-center gap-3 font-semibold text-[14px]">
          <input
            type="checkbox"
            checked={notify}
            onChange={(e) => setNotify(e.target.checked)}
            className="size-5 accent-[var(--brand)]"
          />
          Email it to them
        </label>
      )}
      <Button type="submit" size="lg" block loading={reset.isPending}>
        Save password
      </Button>
    </form>
  )
}

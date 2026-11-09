import { ApiError, api, coachesQuery, personActivityQuery, usersQuery } from '@project180/client'
import { ACTIVE_NOW_MS, isOwner, isStaff, ROLE_LABELS, type UserSummary } from '@project180/shared'
import {
  Button,
  Card,
  Chip,
  cn,
  Drawer,
  EmptyState,
  Field,
  IconButton,
  Input,
  Select,
  toast,
} from '@project180/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { KeyRound, Plus, UserRoundCog, UsersRound } from 'lucide-react'
import { useId, useState } from 'react'
import { AssignForm } from '../../components/assign-form'
import { ProfileSummary } from '../../components/client-profile'
import { Segmented, Toolbar } from '../../components/controls'
import { NewClientDrawer } from '../../components/new-client-wizard'
import { PageHeader } from '../../components/page-header'
import { ActiveDot, PersonActivityPanel } from '../../components/person-activity'
import { PersonProgressPanel } from '../../components/person-progress'

export const Route = createFileRoute('/_dash/users')({
  beforeLoad: ({ context }) => {
    if (!isStaff(context.me.role)) throw redirect({ to: '/' })
  },
  component: UsersPage,
})

type Sort = 'added' | 'seen' | 'name'

const seenAt = (u: UserSummary) => (u.lastSeenAt ? new Date(u.lastSeenAt).getTime() : 0)
const sorters: Record<Sort, (a: UserSummary, b: UserSummary) => number> = {
  added: () => 0,
  seen: (a, b) => seenAt(b) - seenAt(a),
  name: (a, b) => a.name.localeCompare(b.name),
}

type Panel =
  | { kind: 'add' }
  | { kind: 'assign'; user: UserSummary }
  | { kind: 'password'; user: UserSummary }
  | null

function UsersPage() {
  const { me } = Route.useRouteContext()
  const users = useQuery(usersQuery)
  const owner = isOwner(me.role)
  const [view, setView] = useState<'mine' | 'clients' | 'team'>('mine')
  const [sort, setSort] = useState<Sort>('added')
  const [panel, setPanel] = useState<Panel>(null)
  const close = () => setPanel(null)
  const sortId = useId()

  const all = users.data ?? []
  // Clients only: staff (you included) are on the Team tab, never in a client list.
  const clients = all.filter((u) => u.role === 'member')
  const mine = clients.filter((u) => u.coachId === me.id)
  const team = all.filter((u) => isStaff(u.role))
  const clientCount = (coachId: number) => clients.filter((c) => c.coachId === coachId).length
  const tab = owner ? view : 'mine'
  const shown = [...(tab === 'mine' ? mine : tab === 'clients' ? clients : team)].sort(
    sorters[sort],
  )
  const now = Date.now()

  return (
    <>
      <PageHeader
        title={owner ? 'People' : 'My clients'}
        subtitle={
          owner
            ? 'Your clients, every coach’s clients, and your team.'
            : 'The people you coach, their programs and how they’re going. Only you see them.'
        }
        action={
          <Button
            icon={<Plus className="size-5" aria-hidden />}
            onClick={() => setPanel({ kind: 'add' })}
          >
            {owner ? 'Add person' : 'Add client'}
          </Button>
        }
      />
      <Toolbar>
        {owner && (
          <Segmented
            label="Show"
            value={view}
            onChange={setView}
            options={[
              { value: 'mine', label: 'My clients', count: mine.length },
              { value: 'clients', label: 'All clients', count: clients.length },
              { value: 'team', label: 'Team', count: team.length },
            ]}
          />
        )}
        <label
          htmlFor={sortId}
          className="ml-auto flex items-center gap-2 font-semibold text-[13px] text-ink-muted"
        >
          Sort by
          <Select
            id={sortId}
            compact
            className="w-36"
            value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}
          >
            <option value="added">Date added</option>
            <option value="seen">Last seen</option>
            <option value="name">Name</option>
          </Select>
        </label>
      </Toolbar>
      <div
        className={cn('grid grid-cols-1 items-start gap-5', shown.length > 1 && '2xl:grid-cols-2')}
      >
        {users.isPending &&
          [0, 1].map((i) => (
            <div key={i} className="h-96 animate-pulse rounded-lg bg-surface shadow-card" />
          ))}
        {!users.isPending && shown.length === 0 && (
          <EmptyState
            className="col-span-full"
            icon={<UsersRound className="size-7" aria-hidden />}
            title={tab === 'mine' ? 'No clients yet' : 'No clients on the team yet'}
            action={
              <Button
                icon={<Plus className="size-5" aria-hidden />}
                onClick={() => setPanel({ kind: 'add' })}
              >
                Add a client
              </Button>
            }
          >
            {tab === 'mine'
              ? 'Clients you add are yours: you build their programs and see how they’re going.'
              : 'Clients your coaches add show up here too.'}
          </EmptyState>
        )}
        {shown.map((u) => (
          <Card key={u.id} className="flex flex-col gap-5">
            <div className="flex items-center gap-4">
              <span className="relative grid size-12 shrink-0 place-items-center rounded-full bg-brand-soft font-display font-extrabold text-[20px] text-brand-text">
                {u.name.charAt(0).toUpperCase()}
                <ActiveDot
                  active={!!u.lastSeenAt && now - seenAt(u) < ACTIVE_NOW_MS}
                  className="absolute right-0 bottom-0"
                />
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 font-bold text-[17px]">
                  <span className="truncate">{u.name}</span>
                  {u.id === me.id && (
                    <span className="font-semibold text-[13px] text-ink-muted">(you)</span>
                  )}
                  <Chip tone={isStaff(u.role) ? 'brand' : 'neutral'} className="h-6 text-[12px]">
                    {ROLE_LABELS[u.role]}
                  </Chip>
                </p>
                <p className="truncate font-semibold text-[13px] text-ink-muted">
                  {u.email}
                  {u.role === 'member' && u.coachId !== me.id && (
                    <> · coached by {u.coachName ?? 'nobody yet'}</>
                  )}
                </p>
              </div>
              {owner && u.role === 'member' && <CoachPicker user={u} />}
              {/* Your own password is changed in Settings; owners change their own. */}
              {u.id !== me.id && u.role !== 'owner' && (
                <IconButton
                  label={`Set a temporary password for ${u.name}`}
                  icon={<KeyRound aria-hidden />}
                  size="lg"
                  onClick={() => setPanel({ kind: 'password', user: u })}
                />
              )}
            </div>
            {u.role === 'member' && <ProfileSummary userId={u.id} name={u.name} />}
            <PersonActivityPanel userId={u.id} name={u.name} isMe={u.id === me.id} />
            {u.role === 'member' ? (
              <PersonProgressPanel
                userId={u.id}
                name={u.name}
                onAssign={() => setPanel({ kind: 'assign', user: u })}
              />
            ) : (
              <p className="flex items-center gap-2 rounded-md bg-surface-raised p-4 font-semibold text-[14px] text-ink-muted">
                <UsersRound className="size-4" aria-hidden />
                {clientCount(u.id) === 0
                  ? 'No clients yet'
                  : `Coaches ${clientCount(u.id)} client${clientCount(u.id) === 1 ? '' : 's'}`}
              </p>
            )}
          </Card>
        ))}
      </div>

      <NewClientDrawer open={panel?.kind === 'add'} onClose={close} me={me} />

      <Drawer
        open={panel?.kind === 'assign'}
        onClose={close}
        title="Assign a program"
        description={panel?.kind === 'assign' ? `For ${panel.user.name}` : undefined}
      >
        {panel?.kind === 'assign' && <AssignForm key={panel.user.id} userId={panel.user.id} />}
      </Drawer>

      <Drawer
        open={panel?.kind === 'password'}
        onClose={close}
        title={
          panel?.kind === 'password' && panel.user.id === me.id
            ? 'Change your password'
            : 'Set a temporary password'
        }
        description={
          panel?.kind === 'password'
            ? panel.user.id === me.id
              ? 'Your new password, straight away.'
              : `For ${panel.user.name}. They’re signed out everywhere and choose their own when they next sign in.`
            : undefined
        }
      >
        {panel?.kind === 'password' && (
          <PasswordForm userId={panel.user.id} temporary={panel.user.id !== me.id} onDone={close} />
        )}
      </Drawer>
    </>
  )
}

/** Owners: hand a client to another coach. */
function CoachPicker({ user }: { user: UserSummary }) {
  const queryClient = useQueryClient()
  const coaches = useQuery(coachesQuery)
  const change = useMutation({
    mutationFn: (coachId: number) =>
      api(`/admin/users/${user.id}/coach`, { method: 'PATCH', body: { coachId } }),
    onSuccess: async (_, coachId) => {
      await queryClient.invalidateQueries({ queryKey: usersQuery.queryKey })
      const name = coaches.data?.find((c) => c.id === coachId)?.name
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
      className="hidden items-center gap-2 font-semibold text-[13px] text-ink-muted sm:flex"
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

function PasswordForm({
  userId,
  temporary,
  onDone,
}: {
  userId: number
  temporary: boolean
  onDone: () => void
}) {
  const queryClient = useQueryClient()
  const [password, setPassword] = useState('')
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
          await queryClient.invalidateQueries({ queryKey: personActivityQuery(userId).queryKey })
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
        hint="At least 8 characters"
        error={error}
      >
        {(id) => (
          <Input
            id={id}
            type="text"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
          />
        )}
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

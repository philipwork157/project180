import {
  ApiError,
  adminOverviewQuery,
  api,
  coachesQuery,
  peopleQuery,
  personActivityQuery,
  usersQuery,
} from '@project180/client'
import {
  type DeletePersonResult,
  type DirectoryPerson,
  generateTempPassword,
  isActiveNow,
  isClient,
  isOwner,
  isStaff,
  ROLE_LABELS,
  TEMP_PASSWORD_DAYS,
  timeAgo,
  type UserSummary,
} from '@project180/shared'
import {
  Button,
  buttonClasses,
  Card,
  Chip,
  ConfirmDialog,
  cn,
  Drawer,
  EmptyState,
  Field,
  IconButton,
  Input,
  Select,
  Tooltip,
  toast,
} from '@project180/ui'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import {
  Ban,
  ChartLine,
  ChevronDown,
  KeyRound,
  MessageCircle,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  UserRoundCog,
  UsersRound,
} from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import { AssignForm } from '../../components/assign-form'
import { ProfileSummary } from '../../components/client-profile'
import { Toolbar } from '../../components/controls'
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

type Panel =
  | { kind: 'add' }
  | { kind: 'assign'; user: UserSummary }
  | { kind: 'password'; user: UserSummary }
  | null

/** What you typed, once you've stopped typing for a moment. */
function useSettled<T>(value: T, ms = 250) {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setSettled(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return settled
}

/**
 * The People list: you first (so you can manage your own program), then the clients you coach,
 * searched, sorted and paged on the server, one compact row per person. Every coach's clients
 * and the team (other owners and coaches) aren't listed for now; the API still has those views.
 * A person's details (profile, devices, program) load only when you open them,
 * so the page costs the same with 10 clients or 1,000.
 */
function UsersPage() {
  const { me } = Route.useRouteContext()
  const owner = isOwner(me.role)
  const [sort, setSort] = useState<Sort>('added')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [open, setOpen] = useState<number | null>(null)
  const [panel, setPanel] = useState<Panel>(null)
  const close = () => setPanel(null)
  const sortId = useId()
  const searchId = useId()
  const q = useSettled(search.trim())
  const people = useQuery({
    ...peopleQuery({ view: 'mine', q, sort, page }),
    placeholderData: keepPreviousData,
  })
  // You, pinned above your clients on the first page (hidden when a search doesn't match you).
  const you = useQuery({
    ...peopleQuery({ view: 'me', q, sort: 'added', page: 1 }),
    placeholderData: keepPreviousData,
  })
  const data = people.data
  const clients = data?.people ?? []
  const list = page === 1 ? [...(you.data?.people ?? []), ...clients] : clients
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1
  // A new search or order starts at page 1 with nothing open.
  const reset = () => {
    setPage(1)
    setOpen(null)
  }
  // Searching changes the list: back to page 1.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when the settled search changes
  useEffect(() => reset(), [q])

  return (
    <>
      <PageHeader
        title="My clients"
        subtitle="You and the people you coach: programs, progress and how they’re going."
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
        <label htmlFor={searchId} className="relative w-full sm:w-64">
          <span className="sr-only">Search by name or email</span>
          <Search
            className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-3 size-4 text-ink-muted"
            aria-hidden
          />
          <Input
            id={searchId}
            type="search"
            compact
            value={search}
            maxLength={40}
            placeholder="Search by name or email"
            className="pl-9"
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
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
            onChange={(e) => {
              setSort(e.target.value as Sort)
              reset()
            }}
          >
            <option value="added">Date added</option>
            <option value="seen">Last seen</option>
            <option value="name">Name</option>
          </Select>
        </label>
      </Toolbar>

      {people.isPending ? (
        <Card className="flex flex-col gap-3">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-md bg-surface-raised" />
          ))}
        </Card>
      ) : people.isError ? (
        <Card>
          <p className="text-[14px] text-ink-muted">Couldn’t load people. Try again.</p>
        </Card>
      ) : list.length === 0 ? (
        <Card>
          <p className="text-[14px] text-ink-muted">Nobody matches “{q}”.</p>
        </Card>
      ) : (
        <div className="flex flex-col gap-5">
          <Card
            className={cn(
              // overflow-hidden: a highlighted row keeps the card's rounded corners.
              'overflow-hidden p-0 transition-opacity md:p-0',
              people.isPlaceholderData && 'opacity-60',
            )}
          >
            <ul className="flex flex-col divide-y divide-border">
              {list.map((u) => (
                <PersonRow
                  key={u.id}
                  person={u}
                  isMe={u.id === me.id}
                  owner={owner}
                  meId={me.id}
                  open={open === u.id}
                  onToggle={() => setOpen((id) => (id === u.id ? null : u.id))}
                  onAssign={() => setPanel({ kind: 'assign', user: u })}
                  onPassword={() => setPanel({ kind: 'password', user: u })}
                />
              ))}
            </ul>
          </Card>
          {clients.length === 0 && !q && (
            <EmptyState
              icon={<UsersRound className="size-7" aria-hidden />}
              title="No clients yet"
              action={
                <Button
                  icon={<Plus className="size-5" aria-hidden />}
                  onClick={() => setPanel({ kind: 'add' })}
                >
                  Add a client
                </Button>
              }
            >
              Clients you add are yours: you build their programs and see how they’re going.
            </EmptyState>
          )}
        </div>
      )}

      {data && data.total > data.pageSize && (
        <nav
          aria-label="Pages"
          className="mt-4 flex flex-wrap items-center justify-between gap-3 text-[14px]"
        >
          <span className="tabular font-semibold text-ink-muted">
            {(data.page - 1) * data.pageSize + 1}–{Math.min(data.page * data.pageSize, data.total)}{' '}
            of {data.total}
          </span>
          <span className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              className="h-11 sm:h-9"
              disabled={page <= 1}
              onClick={() => {
                setPage((p) => p - 1)
                setOpen(null)
              }}
            >
              Previous
            </Button>
            <Button
              variant="secondary"
              size="sm"
              className="h-11 sm:h-9"
              disabled={page >= pages}
              onClick={() => {
                setPage((p) => p + 1)
                setOpen(null)
              }}
            >
              Next
            </Button>
          </span>
        </nav>
      )}

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

/**
 * One person: a compact row (who, coach, program, last workout, last seen). Tapping it opens
 * their actions and details underneath, which load only then.
 */
function PersonRow({
  person: u,
  isMe,
  owner,
  meId,
  open,
  onToggle,
  onAssign,
  onPassword,
}: {
  person: DirectoryPerson
  isMe: boolean
  owner: boolean
  meId: number
  open: boolean
  onToggle: () => void
  onAssign: () => void
  onPassword: () => void
}) {
  const client = isClient(u.role)
  // Your own row shows your program too (staff train themselves in the app).
  const trains = client || isMe
  const active = !u.blocked && isActiveNow(u.lastSeenAt, u.signedIn)
  const detailId = `person-${u.id}`
  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={detailId}
        className={cn(
          'flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left transition md:px-5',
          // A light touch on hover; the stronger tint marks the person that's open.
          open ? 'bg-surface-raised' : 'hover:bg-surface-raised/40',
        )}
      >
        <span className="relative grid size-10 shrink-0 place-items-center rounded-full bg-brand-soft font-display font-extrabold text-[17px] text-brand-text">
          {u.name.charAt(0).toUpperCase()}
          <ActiveDot active={active} className="absolute right-0 bottom-0" />
        </span>
        <span className="grid min-w-0 flex-1 grid-cols-1 gap-x-6 gap-y-1 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)] md:items-center">
          <span className="min-w-0">
            <span className="flex items-center gap-2 font-bold text-[15px]">
              <span className="truncate">{u.name}</span>
              {isMe && <span className="font-semibold text-[13px] text-ink-muted">(you)</span>}
              {!client && (
                <Chip tone="brand" className="h-6 shrink-0 text-[12px]">
                  {ROLE_LABELS[u.role]}
                </Chip>
              )}
              {u.blocked && (
                <Chip className="h-6 shrink-0 bg-danger/15 text-[12px] text-danger">Blocked</Chip>
              )}
            </span>
            <span className="block truncate text-[13px] text-ink-muted">
              {u.email}
              {client && u.coachId !== meId && <> · coached by {u.coachName ?? 'nobody yet'}</>}
            </span>
          </span>
          <span className="truncate text-[13px] text-ink-muted md:text-[14px]">
            {trains ? (
              u.programName ? (
                <span className="font-semibold text-ink">{u.programName}</span>
              ) : (
                <span className="font-semibold text-sand-text">No program</span>
              )
            ) : u.clientCount === 0 ? (
              'No clients yet'
            ) : (
              `Coaches ${u.clientCount} client${u.clientCount === 1 ? '' : 's'}`
            )}
          </span>
          <span className="truncate text-[13px] text-ink-muted">
            {trains &&
              (u.lastWorkoutAt
                ? `Trained ${timeAgo(u.lastWorkoutAt).toLowerCase()}`
                : 'No workouts yet')}
            {trains && ' · '}
            {u.blocked
              ? 'can’t sign in'
              : active
                ? 'active now'
                : u.lastSeenAt
                  ? `seen ${timeAgo(u.lastSeenAt).toLowerCase()}`
                  : 'not signed in yet'}
          </span>
        </span>
        <ChevronDown
          className={cn('size-5 shrink-0 text-ink-muted transition', open && 'rotate-180')}
          aria-hidden
        />
      </button>
      {open && (
        <div
          id={detailId}
          className="flex flex-col gap-5 border-border border-t bg-surface px-4 py-5 md:px-5"
        >
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to="/users/$userId"
              params={{ userId: String(u.id) }}
              className={buttonClasses('secondary', 'md')}
            >
              <ChartLine className="size-4" aria-hidden />
              Progress
            </Link>
            {client && (
              <Tooltip label={`Message ${u.name}`}>
                <Link
                  to="/messages"
                  search={{ client: u.id }}
                  aria-label={`Message ${u.name}`}
                  className="grid size-11 shrink-0 place-items-center rounded-sm bg-surface-raised text-ink-muted transition hover:text-ink active:scale-95"
                >
                  <MessageCircle className="size-[18px]" aria-hidden />
                </Link>
              </Tooltip>
            )}
            {owner && client && <CoachPicker user={u} />}
            <span className="ml-auto flex gap-2">
              {/* Your own password is changed in Settings; owners change their own. */}
              {!isMe && u.role !== 'owner' && (
                <IconButton
                  label={`Set a temporary password for ${u.name}`}
                  icon={<KeyRound aria-hidden />}
                  size="lg"
                  onClick={onPassword}
                />
              )}
              {!isMe && u.role !== 'owner' && (owner || client) && <BlockButton user={u} />}
              {owner && !isMe && u.role !== 'owner' && (
                <DeletePersonButton user={u} clients={u.clientCount} />
              )}
            </span>
          </div>
          {client && <ProfileSummary userId={u.id} name={u.name} />}
          <PersonActivityPanel userId={u.id} name={u.name} isMe={isMe} />
          {trains && <PersonProgressPanel userId={u.id} name={u.name} onAssign={onAssign} />}
        </div>
      )}
    </li>
  )
}

/**
 * Block someone's access (or let them back in): they're signed out everywhere and can't sign
 * in, but their account and everything they logged stay. Coaches block their own clients;
 * owners also block coaches.
 */
function BlockButton({ user }: { user: UserSummary }) {
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

/** Owners: hand a client to another coach. */
/** Owners only: delete someone and everything they logged (a coach's clients come to you). */
function DeletePersonButton({ user, clients }: { user: UserSummary; clients: number }) {
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

function CoachPicker({ user }: { user: UserSummary }) {
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

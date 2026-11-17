import { adminChatsQuery, peopleQuery } from '@project180/client'
import { type DirectoryPerson, isActiveNow, isOwner, isStaff, timeAgo } from '@project180/shared'
import { Button, Card, Chip, cn, EmptyState, Input, Select } from '@project180/ui'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import { ChevronRight, MessageCircle, Plus, Search, UsersRound } from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import { Toolbar } from '../../components/controls'
import { NewClientDrawer } from '../../components/new-client-wizard'
import { PageHeader } from '../../components/page-header'
import { ActiveDot } from '../../components/person-activity'

export const Route = createFileRoute('/_dash/clients')({
  beforeLoad: ({ context }) => {
    if (!isStaff(context.me.role)) throw redirect({ to: '/' })
  },
  component: ClientsPage,
})

type Sort = 'added' | 'seen' | 'name'

/** What you typed, once you've stopped typing for a moment. */
function useSettled<T>(value: T, ms = 250) {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setSettled(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return settled
}

const COLUMNS = 'md:grid-cols-[minmax(0,2fr)_minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_96px]'

/**
 * The clients you coach, as a table: searched, sorted and paged on the server, so it costs the
 * same with 10 clients or 1,000. A row opens the client's page. Your own training is under
 * My training, so you're not in this list. On a phone each client is one stacked row.
 */
function ClientsPage() {
  const { me } = Route.useRouteContext()
  const [sort, setSort] = useState<Sort>('added')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [adding, setAdding] = useState(false)
  const sortId = useId()
  const searchId = useId()
  const q = useSettled(search.trim())
  const people = useQuery({
    ...peopleQuery({ view: 'mine', q, sort, page }),
    placeholderData: keepPreviousData,
  })
  const chats = useQuery(adminChatsQuery)
  const unreadOf = (id: number) => chats.data?.find((c) => c.clientId === id)?.unread ?? 0
  const data = people.data
  const list = (data?.people ?? []).filter((p) => p.id !== me.id)
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1
  // A new search starts at page 1.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when the settled search changes
  useEffect(() => setPage(1), [q])

  return (
    <>
      <PageHeader
        title="Clients"
        subtitle="The people you coach. Open one to see their program, progress, food and chat."
        action={
          <Button icon={<Plus className="size-5" aria-hidden />} onClick={() => setAdding(true)}>
            {isOwner(me.role) ? 'Add person' : 'Add client'}
          </Button>
        }
      />
      <Toolbar>
        <label htmlFor={searchId} className="relative w-full sm:w-72">
          <span className="sr-only">Search by name or email</span>
          <Search
            className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-3 size-4 text-ink-muted"
            aria-hidden
          />
          <Input
            id={searchId}
            type="search"
            value={search}
            maxLength={40}
            placeholder="Search by name or email"
            className="pl-9"
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <label
          htmlFor={sortId}
          className="flex items-center gap-2 font-semibold text-[13px] text-ink-muted sm:ml-auto"
        >
          Sort by
          <Select
            id={sortId}
            className="w-40"
            value={sort}
            onChange={(e) => {
              setSort(e.target.value as Sort)
              setPage(1)
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
          <p className="text-[14px] text-ink-muted">Couldn’t load your clients. Try again.</p>
        </Card>
      ) : list.length === 0 ? (
        q ? (
          <Card>
            <p className="text-[14px] text-ink-muted">Nobody matches “{q}”.</p>
          </Card>
        ) : (
          <EmptyState
            icon={<UsersRound className="size-7" aria-hidden />}
            title="No clients yet"
            action={
              <Button
                icon={<Plus className="size-5" aria-hidden />}
                onClick={() => setAdding(true)}
              >
                Add a client
              </Button>
            }
          >
            Clients you add are yours: you build their programs and see how they’re going.
          </EmptyState>
        )
      ) : (
        <Card
          className={cn(
            'overflow-hidden p-0 transition-opacity md:p-0',
            people.isPlaceholderData && 'opacity-60',
          )}
        >
          <div
            className={cn(
              'hidden gap-4 border-border border-b px-5 py-3 font-extrabold text-[11px] text-ink-muted uppercase tracking-[0.08em] md:grid',
              COLUMNS,
            )}
          >
            <span>Client</span>
            <span>Program</span>
            <span>Last workout</span>
            <span>Status</span>
            <span className="text-right">Messages</span>
          </div>
          <ul className="flex w-full flex-col divide-y divide-border">
            {list.map((p) => (
              <ClientRow key={p.id} person={p} meId={me.id} unread={unreadOf(p.id)} />
            ))}
          </ul>
        </Card>
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
              onClick={() => setPage((n) => n - 1)}
            >
              Previous
            </Button>
            <Button
              variant="secondary"
              size="sm"
              className="h-11 sm:h-9"
              disabled={page >= pages}
              onClick={() => setPage((n) => n + 1)}
            >
              Next
            </Button>
          </span>
        </nav>
      )}

      <NewClientDrawer open={adding} onClose={() => setAdding(false)} me={me} />
    </>
  )
}

function ClientRow({
  person: p,
  meId,
  unread,
}: {
  person: DirectoryPerson
  meId: number
  unread: number
}) {
  const active = !p.blocked && isActiveNow(p.lastSeenAt, p.signedIn)
  const status = p.blocked
    ? 'Can’t sign in'
    : active
      ? 'Active now'
      : p.lastSeenAt
        ? `Seen ${timeAgo(p.lastSeenAt).toLowerCase()}`
        : 'Not signed in yet'
  return (
    <li>
      <Link
        to="/clients/$clientId"
        params={{ clientId: String(p.id) }}
        className={cn(
          'grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-4 py-3.5 transition hover:bg-surface-raised/50 active:bg-surface-raised md:gap-x-4 md:px-5',
          // Laptop: the client cell holds the avatar, then one column per detail.
          COLUMNS,
        )}
      >
        <span className="flex min-w-0 items-center gap-3 max-md:contents">
          <span className="relative grid size-10 shrink-0 place-items-center rounded-full bg-brand-soft font-display font-extrabold text-[17px] text-brand-text max-md:row-span-2">
            {p.name.charAt(0).toUpperCase()}
            <ActiveDot active={active} className="absolute right-0 bottom-0" />
          </span>
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="flex min-w-0 items-center gap-2 font-bold text-[15px]">
              <span className="truncate">{p.name}</span>
              {p.blocked && (
                <Chip className="h-6 shrink-0 bg-danger/15 text-[12px] text-danger">Blocked</Chip>
              )}
            </span>
            <span className="truncate text-[13px] text-ink-muted">
              {p.email}
              {p.coachId !== meId && <> · coached by {p.coachName ?? 'nobody yet'}</>}
            </span>
          </span>
        </span>
        {/* Phone: one line under the name with the program and status. */}
        <span className="col-start-2 truncate text-[13px] text-ink-muted md:hidden">
          {p.programName ?? 'No program'} · {status}
        </span>
        <span className="hidden min-w-0 truncate text-[14px] md:block">
          {p.programName ? (
            <span className="font-semibold">{p.programName}</span>
          ) : (
            <span className="font-semibold text-sand-text">No program</span>
          )}
        </span>
        <span className="hidden truncate text-[14px] text-ink-muted md:block">
          {p.lastWorkoutAt ? timeAgo(p.lastWorkoutAt) : 'None yet'}
        </span>
        <span className="hidden min-w-0 items-center gap-2 truncate text-[14px] text-ink-muted md:flex">
          {status}
        </span>
        <span className="col-start-3 row-span-2 row-start-1 flex items-center justify-end gap-2 md:col-auto md:row-auto">
          {unread > 0 && (
            <span className="tabular inline-flex h-6 items-center gap-1 rounded-pill bg-clay px-2 font-extrabold text-[12px] text-on-clay">
              <MessageCircle className="size-3.5" aria-hidden />
              {unread}
              <span className="sr-only"> unread</span>
            </span>
          )}
          <ChevronRight className="size-5 shrink-0 text-ink-muted" aria-hidden />
        </span>
      </Link>
    </li>
  )
}

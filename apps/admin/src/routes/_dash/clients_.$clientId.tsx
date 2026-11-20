import {
  adminChatsQuery,
  personFoodSummaryQuery,
  personProgressQuery,
  personWaterQuery,
  usersQuery,
} from '@project180/client'
import {
  addDays,
  formatWater,
  gramsLabel,
  isActiveNow,
  isOwner,
  isStaff,
  kcalLabel,
  ROLE_LABELS,
  timeAgo,
  todayIn,
  type UserSummary,
} from '@project180/shared'
import { Button, Card, Chip, cn, Drawer } from '@project180/ui'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, redirect, useNavigate } from '@tanstack/react-router'
import {
  ArrowLeft,
  CalendarRange,
  ChevronRight,
  KeyRound,
  MessageCircle,
  UserPlus,
  Utensils,
} from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { AssignForm } from '../../components/assign-form'
import { ClientChat } from '../../components/client-chat'
import { ClientCheckIns } from '../../components/client-check-ins'
import { ProfileDetails, ProfileSummary } from '../../components/client-profile'
import {
  BlockButton,
  CoachPicker,
  DeletePersonButton,
  PasswordForm,
} from '../../components/person-actions'
import { ActiveDot, PersonActivityPanel } from '../../components/person-activity'
import { NutritionCard } from '../../components/person-nutrition'
import { PersonProgressPanel } from '../../components/person-progress'
import { PersonStats } from '../../components/person-stats'
import { QuickWorkoutsSwitch } from '../../components/quick-workouts-switch'

const TABS = ['overview', 'checkins', 'program', 'progress', 'food', 'chat', 'account'] as const
export type ClientTab = (typeof TABS)[number]
const TAB_LABELS: Record<ClientTab, string> = {
  overview: 'Overview',
  checkins: 'Check-ins',
  program: 'Program',
  progress: 'Progress',
  food: 'Food',
  chat: 'Chat',
  account: 'Profile & access',
}

/**
 * Everything about one client on one page, in tabs, so a coach never leaves it: how they're
 * doing, their program, progress, food, the chat and their account. ?tab= keeps the tab in the
 * address, so Back and shared links land on the same one.
 */
export const Route = createFileRoute('/_dash/clients_/$clientId')({
  validateSearch: (search: Record<string, unknown>): { tab?: ClientTab } =>
    TABS.includes(search.tab as ClientTab) ? { tab: search.tab as ClientTab } : {},
  beforeLoad: ({ context, params }) => {
    if (!isStaff(context.me.role)) throw redirect({ to: '/' })
    // Your own page is My training (no chat with yourself, no blocking yourself).
    if (Number(params.clientId) === context.me.id) throw redirect({ to: '/my-training' })
  },
  component: ClientPage,
})

function ClientPage() {
  const { me } = Route.useRouteContext()
  const clientId = Number(Route.useParams().clientId)
  const { tab = 'overview' } = Route.useSearch()
  const navigate = useNavigate()
  const people = useQuery(usersQuery)
  const chats = useQuery(adminChatsQuery)
  const [assigning, setAssigning] = useState(false)
  const person = people.data?.find((u) => u.id === clientId)
  const unread = chats.data?.find((c) => c.clientId === clientId)?.unread ?? 0
  const goTo = (next: ClientTab) =>
    navigate({
      to: '/clients/$clientId',
      params: { clientId: String(clientId) },
      search: next === 'overview' ? {} : { tab: next },
    })

  if (people.isPending)
    return (
      <div className="flex flex-col gap-5">
        <BackLink />
        <div className="h-24 animate-pulse rounded-lg bg-surface" />
        <div className="h-64 animate-pulse rounded-lg bg-surface" />
      </div>
    )
  if (!person)
    return (
      <div className="flex flex-col gap-5">
        <BackLink />
        <Card className="flex flex-col items-start gap-3">
          <p className="font-bold text-[17px]">Client not found</p>
          <p className="text-[14px] text-ink-muted">
            They may have been removed, or they’re coached by someone else.
          </p>
        </Card>
      </div>
    )

  const active = !person.blocked && isActiveNow(person.lastSeenAt, person.signedIn)
  const first = person.name.split(' ')[0] ?? person.name
  const client = !isStaff(person.role)

  return (
    <div className="flex flex-col gap-5">
      <BackLink />
      <header className="flex flex-wrap items-center gap-4">
        <span className="relative grid size-14 shrink-0 place-items-center rounded-full bg-brand-soft font-display font-extrabold text-[22px] text-brand-text">
          {person.name.charAt(0).toUpperCase()}
          <ActiveDot active={active} className="absolute right-0.5 bottom-0.5" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h1 className="flex flex-wrap items-center gap-2 font-display font-extrabold text-[28px] leading-[34px] tracking-tight">
            <span className="min-w-0 break-words">{person.name}</span>
            {!client && (
              <Chip tone="brand" className="h-6 text-[12px]">
                {ROLE_LABELS[person.role]}
              </Chip>
            )}
            {person.blocked && (
              <Chip className="h-6 bg-danger/15 text-[12px] text-danger">Blocked</Chip>
            )}
          </h1>
          <p className="text-[14px] text-ink-muted">
            {person.blocked
              ? 'Can’t sign in'
              : active
                ? 'Active now'
                : person.lastSeenAt
                  ? `Seen ${timeAgo(person.lastSeenAt).toLowerCase()}`
                  : 'Hasn’t signed in yet'}
            {person.coachId !== me.id && ` · coached by ${person.coachName ?? 'nobody yet'}`}
          </p>
        </div>
        <div className="flex w-full gap-2 sm:w-auto">
          {client && (
            <Button
              variant="secondary"
              className="flex-1 sm:flex-none"
              icon={<MessageCircle className="size-4" aria-hidden />}
              onClick={() => goTo('chat')}
            >
              Message
            </Button>
          )}
          <Button
            className="flex-1 sm:flex-none"
            icon={<UserPlus className="size-4" aria-hidden />}
            onClick={() => setAssigning(true)}
          >
            {/* Short on a phone so the two buttons share one line. */}
            <span className="sm:hidden">Assign</span>
            <span className="hidden sm:inline">Assign program</span>
          </Button>
        </div>
      </header>

      <nav
        aria-label={`${first}’s pages`}
        className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto border-border border-b px-4 md:mx-0 md:px-0"
      >
        {TABS.filter((t) => client || (t !== 'chat' && t !== 'checkins')).map((t) => (
          <Link
            key={t}
            to="/clients/$clientId"
            params={{ clientId: String(clientId) }}
            search={t === 'overview' ? {} : { tab: t }}
            aria-current={tab === t ? 'page' : undefined}
            className={cn(
              '-mb-px flex h-11 shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-3 font-bold text-[14px] transition',
              tab === t
                ? 'border-brand text-ink'
                : 'border-transparent text-ink-muted hover:text-ink',
            )}
          >
            {TAB_LABELS[t]}
            {t === 'chat' && unread > 0 && (
              <span className="tabular grid h-5 min-w-5 place-items-center rounded-pill bg-clay px-1.5 font-extrabold text-[11px] text-on-clay">
                {unread}
                <span className="sr-only"> unread</span>
              </span>
            )}
          </Link>
        ))}
      </nav>

      {tab === 'overview' && (
        // Status across the top, then program, food and chat side by side (each with its numbers
        // showing), then their goals. Phones: one column in the same order.
        <div className="flex flex-col gap-5">
          <PersonActivityPanel userId={clientId} name={person.name} isMe={false} />
          <div
            className={cn(
              'grid grid-cols-1 items-stretch gap-5 md:grid-cols-2',
              client && 'xl:grid-cols-3',
            )}
          >
            <ProgramGlance
              userId={clientId}
              onOpen={() => goTo('program')}
              onAssign={() => setAssigning(true)}
            />
            <FoodGlance userId={clientId} onOpen={() => goTo('food')} />
            {client && (
              <ShortcutCard
                className="md:col-span-2 xl:col-span-1"
                icon={<MessageCircle className="size-5" aria-hidden />}
                title={unread > 0 ? `${unread} new message${unread === 1 ? '' : 's'}` : 'Chat'}
                text={
                  unread > 0
                    ? `${first} is waiting for a reply.`
                    : `Send ${first} a message; it reaches their phone.`
                }
                onClick={() => goTo('chat')}
                highlight={unread > 0}
              />
            )}
          </div>
          {client && <ProfileSummary userId={clientId} name={person.name} />}
        </div>
      )}
      {tab === 'checkins' && client && (
        <ClientCheckIns userId={clientId} name={person.name} onOpenFood={() => goTo('food')} />
      )}
      {tab === 'program' && (
        <PersonProgressPanel
          userId={clientId}
          name={person.name}
          onAssign={() => setAssigning(true)}
        />
      )}
      {tab === 'progress' && <PersonStats userId={clientId} name={person.name} />}
      {tab === 'food' && <NutritionCard userId={clientId} name={person.name} />}
      {tab === 'chat' && client && <ClientChat clientId={clientId} name={person.name} me={me} />}
      {tab === 'account' && (
        <AccountTab
          person={person}
          owner={isOwner(me.role)}
          onDeleted={() => navigate({ to: '/clients' })}
        />
      )}

      <Drawer
        open={assigning}
        onClose={() => setAssigning(false)}
        title="Assign a program"
        description={`For ${person.name}`}
      >
        {assigning && <AssignForm key={person.id} userId={person.id} />}
      </Drawer>
    </div>
  )
}

function BackLink() {
  return (
    <Link
      to="/clients"
      className="-mb-1 inline-flex h-11 items-center gap-2 self-start rounded-sm font-bold text-[14px] text-ink-muted hover:text-ink"
    >
      <ArrowLeft className="size-4" aria-hidden />
      Clients
    </Link>
  )
}

/** Their current program at a glance: how far along, and a way into the Program tab. */
function ProgramGlance({
  userId,
  onOpen,
  onAssign,
}: {
  userId: number
  onOpen: () => void
  onAssign: () => void
}) {
  const query = useQuery(personProgressQuery(userId))
  if (query.isPending) return <div className="h-40 animate-pulse rounded-lg bg-surface" />
  const p = query.data?.progress
  if (!p)
    return (
      <Card className="flex flex-col items-start gap-3">
        <p className="font-extrabold text-[11px] text-ink-muted uppercase tracking-[0.08em]">
          Program
        </p>
        <p className="font-bold text-[17px]">No current program</p>
        <Button size="sm" icon={<UserPlus className="size-4" aria-hidden />} onClick={onAssign}>
          Assign program
        </Button>
      </Card>
    )
  const share = p.workoutDays > 0 ? Math.min(1, p.done / p.workoutDays) : 0
  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-surface-raised text-ink">
          <CalendarRange className="size-5" aria-hidden />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="font-extrabold text-[11px] text-ink-muted uppercase tracking-[0.08em]">
            Program · week {p.currentWeek}
          </p>
          <p className="truncate font-bold text-[17px]">{p.plan.enrollment.programName}</p>
        </div>
        <Button variant="ghost" size="sm" onClick={onOpen}>
          Open
          <ChevronRight className="size-4" aria-hidden />
        </Button>
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-3">
          <p className="flex items-baseline gap-1.5">
            <span className="metric text-[28px] leading-none">{p.done}</span>
            <span className="text-[14px] text-ink-muted">of {p.workoutDays} workouts done</span>
          </p>
          <span className="tabular font-bold text-[14px]">{Math.round(share * 100)}%</span>
        </div>
        <div aria-hidden className="h-2 w-full overflow-hidden rounded-pill bg-surface-raised">
          <div className="h-full rounded-pill bg-lime" style={{ width: `${share * 100}%` }} />
        </div>
        <p className="text-[13px] text-ink-muted">
          {p.missed > 0 ? `${p.missed} missed · ` : ''}
          {p.lastWorkoutAt
            ? `Last workout ${timeAgo(p.lastWorkoutAt).toLowerCase()}`
            : 'No workouts yet'}
        </p>
      </div>
    </Card>
  )
}

/** Their food this week against their targets, and water today, with a way into the Food tab. */
function FoodGlance({ userId, onOpen }: { userId: number; onOpen: () => void }) {
  const today = todayIn('Africa/Johannesburg')
  const summary = useQuery(personFoodSummaryQuery(userId, addDays(today, -6), today))
  const water = useQuery(personWaterQuery(userId)).data
  if (summary.isPending) return <div className="h-40 animate-pulse rounded-lg bg-surface" />
  const data = summary.data?.summary
  const targets = data?.targets ?? null
  const days = data?.days ?? []
  const avg = (k: 'kcal' | 'proteinG') =>
    days.length > 0 ? days.reduce((a, d) => a + d[k], 0) / days.length : null
  const kcal = avg('kcal')
  const protein = avg('proteinG')
  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-surface-raised text-ink">
          <Utensils className="size-5" aria-hidden />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="font-extrabold text-[11px] text-ink-muted uppercase tracking-[0.08em]">
            Food · last 7 days
          </p>
          <p className="truncate font-bold text-[17px]">
            {targets ? `${kcalLabel(targets.kcal)} kcal a day target` : 'No daily targets yet'}
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={onOpen}>
          Open
          <ChevronRight className="size-4" aria-hidden />
        </Button>
      </div>
      <div className="flex flex-col gap-2">
        {kcal === null ? (
          <p className="text-[14px] text-ink-muted">Nothing logged this week.</p>
        ) : (
          <p className="flex flex-wrap items-baseline gap-x-1.5">
            <span className="metric text-[28px] leading-none">{kcalLabel(kcal)}</span>
            <span className="text-[14px] text-ink-muted">
              kcal on an average logged day
              {targets
                ? ` · ${gramsLabel(protein ?? 0)} of ${gramsLabel(targets.proteinG)} g protein`
                : ''}
            </span>
          </p>
        )}
        <p className="text-[13px] text-ink-muted">
          Logged {days.length} of 7 days
          {water &&
            ` · water ${formatWater(water.ml)} today${water.goalMl ? ` of ${formatWater(water.goalMl)}` : ''}`}
        </p>
      </div>
    </Card>
  )
}

function ShortcutCard({
  icon,
  title,
  text,
  onClick,
  highlight = false,
  className,
}: {
  icon: ReactNode
  title: string
  text: string
  onClick: () => void
  highlight?: boolean
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-3 rounded-lg bg-surface p-5 text-left shadow-card transition hover:bg-surface-raised/60 active:scale-[0.99] md:p-6',
        className,
      )}
    >
      <span
        className={cn(
          'grid size-10 shrink-0 place-items-center rounded-full',
          highlight ? 'bg-clay/20 text-clay-text' : 'bg-brand-soft text-brand-text',
        )}
      >
        {icon}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="font-bold text-[17px]">{title}</span>
        <span className="text-[13px] text-ink-muted">{text}</span>
      </span>
      <ChevronRight className="size-5 shrink-0 text-ink-muted" aria-hidden />
    </button>
  )
}

/** Their account: who they are, their coach, app features, and the access actions. */
function AccountTab({
  person,
  owner,
  onDeleted,
}: {
  person: UserSummary
  owner: boolean
  onDeleted: () => void
}) {
  const [password, setPassword] = useState(false)
  const client = !isStaff(person.role)
  const first = person.name.split(' ')[0] ?? person.name
  return (
    // Account and app features on the left, their full profile on the right, access underneath.
    <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-2">
      <div className="flex min-w-0 flex-col gap-5">
        <Card className="flex flex-col gap-5">
          <h2 className="font-bold text-[17px]">Account</h2>
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Detail label="Email" value={person.email} />
            <Detail label="Added" value={timeAgo(person.createdAt)} />
            <Detail label="Role" value={ROLE_LABELS[person.role]} />
            <div className="flex flex-col gap-1">
              <dt className="font-extrabold text-[11px] text-ink-muted uppercase tracking-[0.08em]">
                Coach
              </dt>
              <dd className="text-[15px]">
                {owner && client ? <CoachPicker user={person} /> : (person.coachName ?? 'None')}
              </dd>
            </div>
          </dl>
        </Card>
        {client && <QuickWorkoutsSwitch userId={person.id} name={person.name} />}
      </div>
      {client && <ProfileDetails userId={person.id} name={person.name} />}
      {person.role !== 'owner' && (
        <Card className="flex flex-col gap-4 xl:col-span-2">
          <h2 className="font-bold text-[17px]">Access</h2>
          <ul className="flex w-full flex-col divide-y divide-border">
            <AccessRow
              title="Temporary password"
              text={`Signs ${first} out everywhere; they choose their own password at their next sign-in.`}
              action={
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<KeyRound className="size-4" aria-hidden />}
                  onClick={() => setPassword(true)}
                >
                  Set one
                </Button>
              }
            />
            {(owner || client) && (
              <AccessRow
                title={person.blocked ? 'Blocked' : 'Block access'}
                text={
                  person.blocked
                    ? `${first} can’t sign in. Everything they logged is kept.`
                    : `Signs ${first} out and stops sign-ins until you unblock. Nothing is deleted.`
                }
                action={<BlockButton user={person} />}
              />
            )}
            {owner && (
              <AccessRow
                title="Delete for good"
                text={`${first}’s account and everything they logged. This can’t be undone.`}
                action={<DeletePersonButton user={person} clients={0} onDeleted={onDeleted} />}
              />
            )}
          </ul>
        </Card>
      )}
      <Drawer
        open={password}
        onClose={() => setPassword(false)}
        title="Set a temporary password"
        description={`For ${person.name}. They’re signed out everywhere and choose their own when they next sign in.`}
      >
        {password && (
          <PasswordForm userId={person.id} temporary onDone={() => setPassword(false)} />
        )}
      </Drawer>
    </div>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <dt className="font-extrabold text-[11px] text-ink-muted uppercase tracking-[0.08em]">
        {label}
      </dt>
      <dd className="break-words text-[15px]">{value}</dd>
    </div>
  )
}

function AccessRow({ title, text, action }: { title: string; text: string; action: ReactNode }) {
  return (
    <li className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0">
      <div className="flex min-w-0 flex-1 basis-56 flex-col gap-1">
        <p className="font-semibold text-[15px]">{title}</p>
        <p className="text-[13px] text-ink-muted">{text}</p>
      </div>
      {action}
    </li>
  )
}

import { adminOverviewQuery, enrollmentsQuery } from '@project180/client'
import {
  type AdminOverview,
  durationShort,
  formatNumber,
  isOwner,
  timeAgo,
} from '@project180/shared'
import { Button, buttonClasses, Card, cn, Drawer, StatCard, Tooltip } from '@project180/ui'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import {
  ArrowRight,
  CalendarRange,
  CircleAlert,
  Dumbbell,
  KeyRound,
  ListChecks,
  MoonStar,
  UserPlus,
  UsersRound,
} from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { AssignForm } from '../../components/assign-form'
import { PageHeader } from '../../components/page-header'
import { SwapsLine } from '../../components/swaps-line'

export const Route = createFileRoute('/_dash/')({
  component: Overview,
})

const FEELINGS = ['', 'Rough', 'Meh', 'Okay', 'Good', 'Great']

function Overview() {
  const { me } = Route.useRouteContext()
  const overview = useQuery(adminOverviewQuery)
  const [assignOpen, setAssignOpen] = useState(false)
  const o = overview.data

  return (
    <>
      <PageHeader
        title={`Hi, ${me.name.split(' ')[0]}`}
        subtitle={
          isOwner(me.role)
            ? 'How every client is doing over the last 7 days.'
            : 'How your clients are doing over the last 7 days.'
        }
        action={
          <Button
            icon={<UserPlus className="size-5" aria-hidden />}
            onClick={() => setAssignOpen(true)}
          >
            Assign a program
          </Button>
        }
      />

      {!o ? (
        <div className="grid grid-cols-2 gap-3 sm:gap-5 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-32 animate-pulse rounded-lg bg-surface shadow-card" />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {o.clients.total === 0 && <GettingStarted library={o.library} />}

          <section
            aria-label="This week"
            className="grid grid-cols-2 gap-3 sm:gap-5 xl:grid-cols-4"
          >
            <StatCard
              tone="brand"
              label="On plan"
              value={
                o.week.plannedTotal
                  ? Math.round((o.week.plannedDone / o.week.plannedTotal) * 100)
                  : '–'
              }
              unit={o.week.plannedTotal ? '%' : undefined}
              delta={
                o.week.plannedTotal
                  ? `${o.week.plannedDone} of ${o.week.plannedTotal} program workouts done`
                  : 'No program workouts due yet'
              }
            />
            <StatCard
              tone="clay"
              label="Workouts"
              value={o.week.workouts}
              delta={trend(o.week.workouts, o.week.workoutsLastWeek)}
            />
            <StatCard
              label="Clients"
              value={o.clients.total}
              delta={`${o.clients.activeThisWeek} active this week · ${o.clients.onProgram} on a program`}
            />
            <StatCard
              tone="steel"
              label="Time in the app"
              value={
                o.week.appSeconds >= 3600
                  ? Math.floor(o.week.appSeconds / 3600)
                  : Math.round(o.week.appSeconds / 60)
              }
              unit={o.week.appSeconds >= 3600 ? 'h' : 'min'}
              delta={
                o.clients.activeNow > 0
                  ? `${o.clients.activeNow} using it right now`
                  : `${durationShort(o.week.minutes * 60)} spent training`
              }
            />
          </section>

          <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <WorkoutsChart
              daily={o.daily}
              volumeKg={o.week.volumeKg}
              avgFeeling={o.week.avgFeeling}
            />
            <Attention items={o.attention} />
          </div>

          <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-2">
            <RecentWorkouts items={o.recent} />
            <WhoIsOnWhat />
          </div>

          <LibraryStrip library={o.library} />
        </div>
      )}

      <Drawer
        open={assignOpen}
        onClose={() => setAssignOpen(false)}
        title="Assign a program"
        description="Pick the program, the person and day 1."
      >
        <AssignForm />
      </Drawer>
    </>
  )
}

/** "+3 on last week", "Same as last week", "2 fewer than last week". */
function trend(now: number, before: number) {
  if (now === before) return now === 0 ? 'None in the last 2 weeks' : 'Same as the week before'
  const diff = now - before
  return diff > 0 ? `↑ ${diff} more than the week before` : `↓ ${-diff} fewer than the week before`
}

function SectionCard({
  title,
  description,
  action,
  children,
  className,
}: {
  title: string
  description?: string
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <Card className={cn('flex flex-col gap-5', className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="font-bold text-[17px]">{title}</h2>
          {description && <p className="text-[14px] text-ink-muted">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </Card>
  )
}

const weekday = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString('en-ZA', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })

/** Workouts finished per day, last 14 days: one series, so one colour and no legend. */
function WorkoutsChart({
  daily,
  volumeKg,
  avgFeeling,
}: {
  daily: AdminOverview['daily']
  volumeKg: number
  avgFeeling: number | null
}) {
  const most = Math.max(1, ...daily.map((d) => d.workouts))
  const total = daily.reduce((a, d) => a + d.workouts, 0)
  return (
    <SectionCard
      title="Workouts finished"
      description="Every client together, last 14 days."
      action={
        <dl className="flex gap-6 text-right">
          <div className="flex flex-col gap-1">
            <dt className="font-extrabold text-[11px] text-ink-muted uppercase tracking-[0.08em]">
              Volume · 7 days
            </dt>
            <dd className="font-bold text-[15px]">{formatNumber(volumeKg)} kg</dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="font-extrabold text-[11px] text-ink-muted uppercase tracking-[0.08em]">
              Feeling
            </dt>
            <dd className="font-bold text-[15px]">
              {avgFeeling === null ? '–' : FEELINGS[Math.round(avgFeeling)]}
            </dd>
          </div>
        </dl>
      }
    >
      {total === 0 ? (
        <p className="rounded-md bg-surface-raised p-4 text-[14px] text-ink-muted">
          No workouts finished yet. They show up here as soon as clients log them in the app.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          <ol
            className="flex h-40 items-end gap-[2px] border-border border-b"
            aria-label="Workouts per day"
          >
            {daily.map((d) => (
              <li key={d.date} className="flex h-full min-w-0 flex-1 items-end [&>span]:w-full">
                <Tooltip
                  label={`${weekday(d.date)}: ${d.workouts} workout${d.workouts === 1 ? '' : 's'}`}
                >
                  <span
                    // Bigger hit area than the bar itself; focusable so keyboard users get the tooltip.
                    // biome-ignore lint/a11y/noNoninteractiveTabindex: focus shows the tooltip
                    tabIndex={0}
                    className="flex h-40 w-full cursor-default items-end justify-center rounded-t-[4px] px-[3px] outline-none hover:bg-surface-raised focus-visible:bg-surface-raised"
                  >
                    {d.workouts > 0 && (
                      <span
                        className="block w-full max-w-10 rounded-t-[4px] bg-lime"
                        style={{ height: `${(d.workouts / most) * 100}%` }}
                      />
                    )}
                  </span>
                </Tooltip>
              </li>
            ))}
          </ol>
          <div className="flex justify-between font-semibold text-[12px] text-ink-muted">
            <span>{weekday(daily[0]?.date ?? '')}</span>
            <span>Today</span>
          </div>
        </div>
      )}
    </SectionCard>
  )
}

const ATTENTION_ICON: Record<AdminOverview['attention'][number]['reason'], ReactNode> = {
  not_started: <KeyRound className="size-4" aria-hidden />,
  no_program: <CalendarRange className="size-4" aria-hidden />,
  missed: <CircleAlert className="size-4" aria-hidden />,
  quiet: <MoonStar className="size-4" aria-hidden />,
}

function Attention({ items }: { items: AdminOverview['attention'] }) {
  return (
    <SectionCard
      title="Needs a nudge"
      description="Clients who haven't started, have no program, or have gone quiet."
    >
      {items.length === 0 ? (
        <p className="rounded-md bg-surface-raised p-4 text-[14px] text-ink-muted">
          Everyone is on track.
        </p>
      ) : (
        <ul className="-mx-2 flex flex-col">
          {items.slice(0, 8).map((a) => (
            <li key={`${a.userId}-${a.reason}`}>
              <Link
                to="/users"
                className="flex items-center gap-3 rounded-md px-2 py-2.5 transition hover:bg-surface-raised"
              >
                <span
                  className={cn(
                    'grid size-8 shrink-0 place-items-center rounded-full',
                    a.reason === 'missed'
                      ? 'bg-clay/20 text-clay-text'
                      : 'bg-surface-raised text-ink-muted',
                  )}
                >
                  {ATTENTION_ICON[a.reason]}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold text-[14px]">{a.name}</span>
                  <span className="block truncate text-[13px] text-ink-muted">{a.detail}</span>
                </span>
                <ArrowRight className="size-4 shrink-0 text-ink-muted" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  )
}

function RecentWorkouts({ items }: { items: AdminOverview['recent'] }) {
  return (
    <SectionCard title="Latest workouts" description="What clients finished most recently.">
      {items.length === 0 ? (
        <p className="rounded-md bg-surface-raised p-4 text-[14px] text-ink-muted">
          Nothing logged yet.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {items.map((s) => (
            <li key={s.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-soft font-bold text-[14px] text-brand-text">
                {s.name.charAt(0).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-bold text-[14px]">
                  {s.name}{' '}
                  <span className="font-semibold text-ink-muted">
                    · {s.workoutName ?? 'Workout'}
                  </span>
                </span>
                <span className="block truncate text-[13px] text-ink-muted">
                  {timeAgo(s.startedAt)}
                  {s.durationSeconds ? ` · ${durationShort(s.durationSeconds)}` : ''}
                  {s.volumeKg ? ` · ${formatNumber(s.volumeKg)} kg` : ''}
                  {s.feeling ? ` · felt ${FEELINGS[s.feeling]?.toLowerCase()}` : ''}
                </span>
                <SwapsLine swaps={s.swaps} className="mt-1" />
              </span>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  )
}

function WhoIsOnWhat() {
  const enrollments = useQuery(enrollmentsQuery())
  const active = (enrollments.data ?? []).filter((e) => e.status === 'active')
  return (
    <SectionCard title="Who’s on what" description="Everyone's current program.">
      {active.length === 0 ? (
        <p className="rounded-md bg-surface-raised p-4 text-[14px] text-ink-muted">
          Nobody is on a program yet.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {active.map((e) => (
            <li key={e.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-soft font-bold text-[14px] text-brand-text">
                {e.userName.charAt(0).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-bold text-[14px]">{e.userName}</span>
                <span className="block truncate text-[13px] text-ink-muted">
                  {e.programName} · {e.durationWeeks} weeks from {e.startDate}
                </span>
              </span>
              <Link
                to="/programs/$programId"
                params={{ programId: String(e.programId) }}
                className="inline-flex shrink-0 items-center gap-1 font-bold text-[13px] text-brand-text"
              >
                Program <ArrowRight className="size-4" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  )
}

function LibraryStrip({ library }: { library: AdminOverview['library'] }) {
  const items = [
    { to: '/exercises', label: 'exercises', count: library.exercises, icon: Dumbbell },
    { to: '/workouts', label: 'workouts', count: library.workouts, icon: ListChecks },
    { to: '/programs', label: 'programs', count: library.programs, icon: CalendarRange },
  ] as const
  return (
    <nav aria-label="Library" className="flex flex-wrap items-center gap-2">
      <span className="mr-1 font-extrabold text-[11px] text-ink-muted uppercase tracking-[0.08em]">
        Your library
      </span>
      {items.map(({ to, label, count, icon: Icon }) => (
        <Link
          key={to}
          to={to}
          className="inline-flex h-9 items-center gap-2 rounded-pill bg-surface px-3.5 font-semibold text-[13px] shadow-card transition hover:text-brand-text"
        >
          <Icon className="size-4 text-ink-muted" aria-hidden />
          <span className="tabular font-bold">{formatNumber(count)}</span> {label}
        </Link>
      ))}
    </nav>
  )
}

/** Only while there are no clients yet: the three things to do first. */
function GettingStarted({ library }: { library: AdminOverview['library'] }) {
  const step = (done: boolean) =>
    cn(buttonClasses(done ? 'ghost' : 'secondary', 'sm'), done && 'text-ink-muted line-through')
  return (
    <Card className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
      <div className="flex items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-soft text-brand-text">
          <UsersRound className="size-5" aria-hidden />
        </span>
        <div className="flex flex-col gap-0.5">
          <p className="font-bold text-[16px]">No clients yet</p>
          <p className="text-[14px] text-ink-muted">
            These numbers fill up once your clients start training.
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link
          to="/workouts/$workoutId"
          params={{ workoutId: 'new' }}
          className={step(library.workouts > 0)}
        >
          Build a workout
        </Link>
        <Link
          to="/programs/$programId"
          params={{ programId: 'new' }}
          className={step(library.programs > 0)}
        >
          Plan a program
        </Link>
        <Link to="/users" className={step(false)}>
          Add your first client
        </Link>
      </div>
    </Card>
  )
}

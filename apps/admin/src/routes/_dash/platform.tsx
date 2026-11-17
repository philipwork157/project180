import {
  ApiError,
  api,
  platformClaudeQuery,
  platformCoachesQuery,
  platformCostsQuery,
  platformHealthQuery,
  platformPeopleQuery,
  platformStarterQuery,
} from '@project180/client'
import {
  CLAUDE_FEATURE_LABELS,
  CLAUDE_LIMIT_UNITS,
  CLAUDE_MODELS,
  type ClaudeConfig,
  type ClaudeFeature,
  type ClaudeFeatureConfig,
  type ClaudeSpendRow,
  formatUsd,
  isActiveNow,
  MAX_CLAUDE_LIMIT,
  type PlatformCoach,
  ROLE_LABELS,
  type StarterLibrary as StarterLibraryData,
  timeAgo,
} from '@project180/shared'
import { Button, Card, Chip, cn, Field, Input, Select, StatCard, toast } from '@project180/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { Camera, CheckCircle2, CircleAlert, Dumbbell, KeyRound, ListChecks } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { Segmented } from '../../components/controls'
import { EmailSettings } from '../../components/email-settings'
import { PageHeader } from '../../components/page-header'
import {
  ActivityRecord,
  DatabaseCard,
  ErrorsCard,
  SignInsCard,
} from '../../components/platform-records'

/**
 * The platform admin's page (the developer): what Claude costs, each Claude feature's switch,
 * model and hard daily limit, every coach and owner, and the site's keys and email. Nothing
 * here shows anyone's training, food or chats.
 */
export const Route = createFileRoute('/_dash/platform')({
  component: PlatformPage,
})

const FEATURE_ICONS: Record<ClaudeFeature, ReactNode> = {
  food_photo: <Camera aria-hidden />,
  workout_builder: <ListChecks aria-hidden />,
  program_builder: <Dumbbell aria-hidden />,
}

const label = 'font-extrabold text-[11px] text-ink-muted uppercase tracking-[0.08em]'

const sum = (rows: ClaudeSpendRow[], key: 'calls' | 'failed' | 'costMicros') =>
  rows.reduce((a, r) => a + r[key], 0)

function PlatformPage() {
  return (
    <>
      <PageHeader
        title="Platform"
        subtitle="Everyone on the platform, errors, sign-ins, who did what, Claude costs and switches, and how this site is set up."
      />
      <div className="flex flex-col gap-5">
        <PeopleSummary />
        <ErrorsCard />
        <SignInsCard />
        <Signups />
        <Businesses />
        <ActivityRecord />
        <SpendSummary />
        <ClaudeFeatures />
        <StarterLibrary />
        <Coaches />
        <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-2">
          <TopUsers />
          <Failures />
        </div>
        <DatabaseCard />
        <Health />
      </div>
    </>
  )
}

/** Everyone at a glance: businesses, coaches, clients, people on their own. */
function PeopleSummary() {
  const people = useQuery(platformPeopleQuery).data
  if (!people)
    return (
      <div className="grid grid-cols-2 gap-5 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-28 animate-pulse rounded-lg bg-surface" />
        ))}
      </div>
    )
  const t = people.totals
  return (
    <div className="grid grid-cols-2 gap-5 xl:grid-cols-4">
      <StatCard
        label="Businesses"
        value={t.businesses.toLocaleString('en-ZA')}
        delta={`${t.coaches} coach${t.coaches === 1 ? '' : 'es'} and owners`}
      />
      <StatCard
        label="Coaches’ clients"
        value={t.clients.toLocaleString('en-ZA')}
        tone="steel"
        delta="Added by a coach"
      />
      <StatCard
        label="On their own"
        value={t.onOwn.toLocaleString('en-ZA')}
        tone="sand"
        delta={
          t.unconfirmed > 0 ? `${t.unconfirmed} haven’t confirmed their email` : 'All confirmed'
        }
      />
      <StatCard
        label="Active this week"
        value={t.activeWeek.toLocaleString('en-ZA')}
        tone="clay"
        delta="Used an app in the last 7 days"
      />
    </div>
  )
}

const SERIES = [
  { key: 'businesses', label: 'New businesses', bar: 'bg-clay' },
  { key: 'onOwn', label: 'On their own', bar: 'bg-sand' },
  { key: 'clients', label: 'Coaches’ clients', bar: 'bg-steel' },
] as const

const weekLabel = (iso: string) =>
  new Intl.DateTimeFormat('en-ZA', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
    new Date(`${iso}T00:00:00Z`),
  )

/** New accounts per week for 12 weeks, stacked by kind, with the numbers in a table too. */
function Signups() {
  const people = useQuery(platformPeopleQuery).data
  const weeks = people?.weeks ?? []
  const totalOf = (w: (typeof weeks)[number]) => w.businesses + w.onOwn + w.clients
  const max = Math.max(1, ...weeks.map(totalOf))
  const all = weeks.reduce((a, w) => a + totalOf(w), 0)
  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="font-bold text-[17px]">Sign-ups, last 12 weeks</h2>
          <p className="text-[14px] text-ink-muted">
            {people ? `${all} new account${all === 1 ? '' : 's'}, week by week.` : 'Loading…'}
          </p>
        </div>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-ink-muted">
          {SERIES.map((s) => (
            <li key={s.key} className="flex items-center gap-2">
              <span aria-hidden className={cn('size-2.5 rounded-full', s.bar)} />
              {s.label}
            </li>
          ))}
        </ul>
      </div>
      {!people ? (
        <div className="h-48 animate-pulse rounded-md bg-surface-raised" />
      ) : (
        <>
          <div aria-hidden className="flex h-48 w-full items-end gap-1.5 sm:gap-3">
            {weeks.map((w) => (
              <div key={w.week} className="flex h-full min-w-0 flex-1 flex-col items-center gap-2">
                <div className="flex w-full flex-1 flex-col justify-end">
                  <div
                    className="flex w-full flex-col-reverse overflow-hidden rounded-t-sm"
                    style={{ height: `${(totalOf(w) / max) * 100}%` }}
                    title={`${weekLabel(w.week)}: ${w.businesses} businesses, ${w.onOwn} on their own, ${w.clients} clients`}
                  >
                    {SERIES.map((s) => (
                      <div
                        key={s.key}
                        className={s.bar}
                        style={{ flexGrow: w[s.key], flexBasis: 0 }}
                      />
                    ))}
                  </div>
                </div>
                <span className="tabular w-full truncate text-center text-[11px] text-ink-muted">
                  {weekLabel(w.week)}
                </span>
              </div>
            ))}
          </div>
          <details className="text-[14px]">
            <summary className="cursor-pointer font-bold text-brand-text">Show the numbers</summary>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[420px] text-left">
                <thead>
                  <tr className="border-border border-b">
                    {['Week of', ...SERIES.map((s) => s.label)].map((h) => (
                      <th key={h} scope="col" className={cn(label, 'py-2 pr-4')}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {weeks.map((w) => (
                    <tr key={w.week} className="tabular">
                      <td className="py-2 pr-4">{weekLabel(w.week)}</td>
                      <td className="py-2 pr-4">{w.businesses}</td>
                      <td className="py-2 pr-4">{w.onOwn}</td>
                      <td className="py-2 pr-4">{w.clients}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </Card>
  )
}

/** Every business: a table on laptops, stacked rows on phones. */
function Businesses() {
  const people = useQuery(platformPeopleQuery)
  const list = people.data?.businesses ?? []
  return (
    <Card className="flex flex-col gap-4 p-0 md:p-0">
      <div className="flex flex-col gap-1 px-5 pt-5 md:px-6 md:pt-6">
        <h2 className="font-bold text-[17px]">Businesses</h2>
        <p className="text-[14px] text-ink-muted">
          Every coaching business: who owns it, how many coaches and clients, when anyone last used
          it, and its Claude spend this month. Newest first.
        </p>
      </div>
      {!people.data ? (
        <div className="mx-5 mb-5 h-40 animate-pulse rounded-md bg-surface-raised md:mx-6 md:mb-6" />
      ) : list.length === 0 ? (
        <p className="mx-5 mb-5 text-[14px] text-ink-muted md:mx-6 md:mb-6">No businesses yet.</p>
      ) : (
        <>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[880px] text-left text-[14px]">
              <thead>
                <tr className="border-border border-y">
                  {[
                    'Business',
                    'Owner',
                    'Coaches',
                    'Clients',
                    'Last active',
                    'Claude this month',
                    'Started',
                  ].map((h) => (
                    <th key={h} scope="col" className={cn(label, 'px-6 py-3 font-extrabold')}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {list.map((b) => (
                  <tr key={b.id}>
                    <td className="px-6 py-3">
                      <span className="flex items-center gap-2 font-semibold">
                        {b.name}
                        {b.starter && <Chip tone="lime">Starter</Chip>}
                      </span>
                    </td>
                    <td className="px-6 py-3">
                      <p>{b.ownerName ?? '–'}</p>
                      {b.ownerEmail && <p className="text-[13px] text-ink-muted">{b.ownerEmail}</p>}
                    </td>
                    <td className="tabular px-6 py-3 font-semibold">{b.coaches}</td>
                    <td className="tabular px-6 py-3 font-semibold">{b.clients}</td>
                    <td className="px-6 py-3 text-ink-muted">
                      {b.lastActiveAt ? timeAgo(b.lastActiveAt) : 'Never'}
                    </td>
                    <td className="tabular px-6 py-3">
                      <span className="font-semibold">{formatUsd(b.monthCostMicros)}</span>
                      <span className="text-ink-muted"> · {b.monthCalls}</span>
                    </td>
                    <td className="px-6 py-3 text-ink-muted">{timeAgo(b.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="flex w-full flex-col divide-y divide-border border-border border-t md:hidden">
            {list.map((b) => (
              <li key={b.id} className="flex flex-col gap-2 px-5 py-4">
                <div className="flex items-start gap-2">
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <p className="truncate font-semibold text-[15px]">{b.name}</p>
                    <p className="truncate text-[13px] text-ink-muted">
                      {b.ownerName ? `${b.ownerName} · ${b.ownerEmail}` : 'No owner'}
                    </p>
                  </div>
                  {b.starter && <Chip tone="lime">Starter</Chip>}
                </div>
                <p className="tabular flex flex-wrap gap-x-3 gap-y-1 text-[13px] text-ink-muted">
                  <span>
                    <span className="font-bold text-ink">{b.coaches}</span> coaches
                  </span>
                  <span>
                    <span className="font-bold text-ink">{b.clients}</span> clients
                  </span>
                  <span>
                    <span className="font-bold text-ink">{formatUsd(b.monthCostMicros)}</span>{' '}
                    Claude
                  </span>
                  <span>
                    {b.lastActiveAt
                      ? `Active ${timeAgo(b.lastActiveAt).toLowerCase()}`
                      : 'Never active'}
                  </span>
                </p>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  )
}

/** This month's spend at a glance, against last month. */
function SpendSummary() {
  const costs = useQuery(platformCostsQuery).data
  if (!costs)
    return (
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-28 animate-pulse rounded-lg bg-surface" />
        ))}
      </div>
    )
  const month = sum(costs.month, 'costMicros')
  const last = sum(costs.lastMonth, 'costMicros')
  const calls = sum(costs.month, 'calls')
  const failed = sum(costs.month, 'failed')
  const thirty = costs.days.reduce((a, d) => a + d.costMicros, 0)
  const photo = costs.month.find((r) => r.feature === 'food_photo')
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard
        label="Claude this month"
        value={formatUsd(month)}
        delta={last > 0 ? `Last month ${formatUsd(last)}` : 'Nothing last month'}
      />
      <StatCard
        label="Calls this month"
        value={calls.toLocaleString('en-ZA')}
        delta={failed > 0 ? `${failed} failed` : 'None failed'}
        tone={failed > 0 ? 'clay' : 'surface'}
      />
      <StatCard
        label="Per food photo"
        value={photo && photo.calls > 0 ? formatUsd(photo.costMicros / photo.calls) : '–'}
        delta={photo ? `${photo.calls} photos this month` : 'No photos yet'}
        tone="steel"
      />
      <StatCard
        label="Last 30 days"
        value={formatUsd(thirty)}
        delta={`${costs.days.length} days with calls`}
      />
    </div>
  )
}

/** Each Claude feature: on or off, its model, its hard daily limit, and this month's use. */
function ClaudeFeatures() {
  const claude = useQuery(platformClaudeQuery)
  const costs = useQuery(platformCostsQuery).data
  return (
    <Card className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h2 className="font-bold text-[17px]">Claude</h2>
        <p className="text-[14px] text-ink-muted">
          Switch each feature off for everyone, pick its model, and set the most anyone can use a
          day. The limit holds for owners too.
        </p>
      </div>
      {claude.data && !claude.data.configured && (
        <p className="flex items-start gap-3 rounded-md bg-sand/20 p-4 text-[14px]">
          <KeyRound className="mt-0.5 size-5 shrink-0 text-sand-text" aria-hidden />
          This site has no Claude API key (ANTHROPIC_API_KEY), so none of these run yet.
        </p>
      )}
      {claude.isError ? (
        <p className="rounded-md bg-surface-raised p-4 text-[14px] text-ink-muted">
          Couldn’t load the Claude settings. Try again.
        </p>
      ) : !claude.data ? (
        <div className="h-64 animate-pulse rounded-md bg-surface-raised" />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {claude.data.features.map((f) => (
            <FeatureTile
              key={f.feature}
              feature={f}
              spend={costs?.month.find((r) => r.feature === f.feature)}
            />
          ))}
        </div>
      )}
    </Card>
  )
}

function FeatureTile({
  feature: f,
  spend,
}: {
  feature: ClaudeFeatureConfig
  spend: ClaudeSpendRow | undefined
}) {
  const queryClient = useQueryClient()
  const [limit, setLimit] = useState(String(f.limitPerDay))
  const name = CLAUDE_FEATURE_LABELS[f.feature]
  const save = useMutation({
    mutationFn: (change: { enabled?: boolean; model?: string; limitPerDay?: number }) =>
      api<{ claude: ClaudeConfig }>('/platform/claude', {
        method: 'PUT',
        body: { feature: f.feature, ...change },
      }),
    onSuccess: ({ claude }, change) => {
      queryClient.setQueryData(platformClaudeQuery.queryKey, claude)
      toast({
        title:
          change.enabled !== undefined
            ? `${name} turned ${change.enabled ? 'on' : 'off'}`
            : change.model
              ? `${name} now uses ${CLAUDE_MODELS.find((m) => m.id === change.model)?.label ?? change.model}`
              : `${name}: up to ${change.limitPerDay} a day`,
      })
    },
    onError: (err) =>
      toast({
        tone: 'error',
        title: 'Couldn’t save it',
        description: err instanceof ApiError ? err.message : undefined,
      }),
  })
  const n = Number(limit)
  const limitValid = limit !== '' && Number.isInteger(n) && n >= 0 && n <= MAX_CLAUDE_LIMIT
  return (
    <section
      aria-label={name}
      className="flex min-w-0 flex-col gap-4 rounded-md bg-surface-raised p-4"
    >
      <header className="flex items-center gap-3">
        <span
          className={cn(
            'grid size-9 shrink-0 place-items-center rounded-full [&_svg]:size-5',
            f.enabled ? 'bg-brand-soft text-brand-text' : 'bg-surface text-ink-muted',
          )}
        >
          {FEATURE_ICONS[f.feature]}
        </span>
        <h3 className="min-w-0 flex-1 font-bold text-[15px]">{name}</h3>
        <Segmented
          label={`${name} on or off`}
          value={f.enabled ? 'on' : 'off'}
          onChange={(v) => v !== (f.enabled ? 'on' : 'off') && save.mutate({ enabled: v === 'on' })}
          options={[
            { value: 'on', label: 'On' },
            { value: 'off', label: 'Off' },
          ]}
        />
      </header>
      <dl className="grid grid-cols-3 gap-3">
        <div className="flex flex-col gap-1">
          <dt className={label}>This month</dt>
          <dd className="tabular font-bold text-[15px]">{formatUsd(spend?.costMicros ?? 0)}</dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className={label}>Calls</dt>
          <dd className="tabular font-bold text-[15px]">
            {spend?.calls ?? 0}
            {spend && spend.failed > 0 && (
              <span className="font-semibold text-[13px] text-clay-text">
                {' '}
                · {spend.failed} failed
              </span>
            )}
          </dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className={label}>Takes</dt>
          <dd className="tabular font-bold text-[15px]">
            {spend?.avgMs ? `${(spend.avgMs / 1000).toFixed(1)} s` : '–'}
          </dd>
        </div>
      </dl>
      <Field label="Model" hint="Cheaper models answer faster; check the results after a change.">
        {(id) => (
          <Select
            id={id}
            value={f.model}
            disabled={save.isPending}
            onChange={(e) => save.mutate({ model: e.target.value })}
          >
            {!CLAUDE_MODELS.some((m) => m.id === f.model) && (
              <option value={f.model}>{f.model}</option>
            )}
            {CLAUDE_MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label} · ${m.price.input} / ${m.price.output} per M tokens
              </option>
            ))}
          </Select>
        )}
      </Field>
      <form
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (limitValid && n !== f.limitPerDay) save.mutate({ limitPerDay: n })
        }}
      >
        <div className="min-w-0 flex-1">
          <Field
            label="Hard limit"
            hint={`${CLAUDE_LIMIT_UNITS[f.feature]}, 0 to ${MAX_CLAUDE_LIMIT}`}
            error={limit !== '' && !limitValid ? `0 to ${MAX_CLAUDE_LIMIT}` : undefined}
          >
            {(id) => (
              <Input
                id={id}
                inputMode="numeric"
                value={limit}
                onChange={(e) => setLimit(e.target.value.replace(/\D/g, '').slice(0, 3))}
              />
            )}
          </Field>
        </div>
        <Button
          type="submit"
          variant="secondary"
          className="mb-6 shrink-0"
          disabled={!limitValid || n === f.limitPerDay}
          loading={save.isPending && save.variables?.limitPerDay !== undefined}
        >
          Save
        </Button>
      </form>
    </section>
  )
}

/**
 * The starter library: the business whose exercises, recipes and programs people without a coach
 * use, and that every new coach business gets a copy of (exercises and recipes).
 */
function StarterLibrary() {
  const queryClient = useQueryClient()
  const starter = useQuery(platformStarterQuery)
  const save = useMutation({
    mutationFn: (businessId: number | null) =>
      api<{ starter: StarterLibraryData }>('/platform/starter', {
        method: 'PUT',
        body: { businessId },
      }),
    onSuccess: ({ starter: next }) => {
      queryClient.setQueryData(platformStarterQuery.queryKey, next)
      const picked = next.businesses.find((b) => b.id === next.businessId)
      toast({
        title: picked ? `Starter library: ${picked.name}` : 'No starter library',
        description: picked
          ? 'People without a coach and new coach businesses start from it.'
          : undefined,
      })
    },
    onError: (err) =>
      toast({
        tone: 'error',
        title: 'Couldn’t save it',
        description: err instanceof ApiError ? err.message : undefined,
      }),
  })
  const data = starter.data
  const picked = data?.businesses.find((b) => b.id === data.businessId)
  return (
    <Card className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h2 className="font-bold text-[17px]">Starter library</h2>
        <p className="text-[14px] text-ink-muted">
          The business whose exercises, recipes and programs people without a coach use. Every new
          coach who signs up gets their own copy of its exercises and recipes. Build it like any
          business: sign in to the dashboard as one of its coaches.
        </p>
      </div>
      {!data ? (
        <div className="h-24 animate-pulse rounded-md bg-surface-raised" />
      ) : (
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <Field label="Starter business">
            {(id) => (
              <Select
                id={id}
                value={data.businessId ?? ''}
                disabled={save.isPending}
                onChange={(e) => save.mutate(e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">None (people on their own get no library)</option>
                {data.businesses.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          {picked ? (
            <dl className="grid grid-cols-3 gap-3 rounded-md bg-surface-raised p-4">
              {(
                [
                  ['Exercises', picked.exercises],
                  ['Recipes', picked.recipes],
                  ['Programs', picked.programs],
                ] as const
              ).map(([name, n]) => (
                <div key={name} className="flex flex-col gap-1">
                  <dt className={label}>{name}</dt>
                  <dd className="metric text-[24px] leading-none">{n}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="rounded-md bg-sand/20 p-4 text-[14px]">
              Pick one, or people who sign up on their own see no exercises, recipes or programs,
              and new coaches start with an empty library.
            </p>
          )}
        </div>
      )}
    </Card>
  )
}

/** Every coach and owner: a table on laptops, stacked rows on phones. */
function Coaches() {
  const coaches = useQuery(platformCoachesQuery)
  const list = coaches.data ?? []
  return (
    <Card className="flex flex-col gap-4 p-0 md:p-0">
      <div className="flex flex-col gap-1 px-5 pt-5 md:px-6 md:pt-6">
        <h2 className="font-bold text-[17px]">Coaches</h2>
        <p className="text-[14px] text-ink-muted">
          Every coach and owner, by business: how many clients they have, and what Claude cost this
          month for them and their clients.
        </p>
      </div>
      {coaches.isError ? (
        <p className="mx-5 mb-5 rounded-md bg-surface-raised p-4 text-[14px] text-ink-muted md:mx-6 md:mb-6">
          Couldn’t load the coaches. Try again.
        </p>
      ) : !coaches.data ? (
        <div className="mx-5 mb-5 h-40 animate-pulse rounded-md bg-surface-raised md:mx-6 md:mb-6" />
      ) : list.length === 0 ? (
        <p className="mx-5 mb-5 text-[14px] text-ink-muted md:mx-6 md:mb-6">No coaches yet.</p>
      ) : (
        <>
          {/* Laptops: a table; scrolls inside the card if it ever gets too wide. */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[880px] text-left text-[14px]">
              <thead>
                <tr className="border-border border-y">
                  {[
                    'Name',
                    'Business',
                    'Role',
                    'Clients',
                    'Last seen',
                    'Claude this month',
                    '',
                  ].map((h) => (
                    <th key={h} scope="col" className={cn(label, 'px-6 py-3 font-extrabold')}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {list.map((c) => (
                  <tr key={c.id}>
                    <td className="px-6 py-3">
                      <p className="font-semibold">{c.name}</p>
                      <p className="text-[13px] text-ink-muted">{c.email}</p>
                    </td>
                    <td className="px-6 py-3">{c.business ?? '–'}</td>
                    <td className="px-6 py-3">
                      <Chip tone={c.role === 'owner' ? 'brand' : 'neutral'}>
                        {ROLE_LABELS[c.role]}
                      </Chip>
                    </td>
                    <td className="tabular px-6 py-3 font-semibold">{c.clients}</td>
                    <td className="px-6 py-3">
                      <SeenLabel coach={c} />
                    </td>
                    <td className="tabular px-6 py-3">
                      <span className="font-semibold">{formatUsd(c.monthCostMicros)}</span>
                      <span className="text-ink-muted"> · {c.monthCalls} calls</span>
                    </td>
                    <td className="px-6 py-3 text-right">
                      {c.blocked && <Chip className="bg-danger/15 text-danger">Blocked</Chip>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Phones: one stacked row each. */}
          <ul className="flex w-full flex-col divide-y divide-border border-border border-t md:hidden">
            {list.map((c) => (
              <li key={c.id} className="flex flex-col gap-2 px-5 py-4">
                <div className="flex items-start gap-2">
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <p className="truncate font-semibold text-[15px]">{c.name}</p>
                    <p className="truncate text-[13px] text-ink-muted">
                      {c.business ? `${c.business} · ${c.email}` : c.email}
                    </p>
                  </div>
                  <Chip tone={c.role === 'owner' ? 'brand' : 'neutral'}>{ROLE_LABELS[c.role]}</Chip>
                </div>
                <p className="tabular flex flex-wrap gap-x-3 gap-y-1 text-[13px] text-ink-muted">
                  <span>
                    <span className="font-bold text-ink">{c.clients}</span> clients
                  </span>
                  <span>
                    <span className="font-bold text-ink">{formatUsd(c.monthCostMicros)}</span> ·{' '}
                    {c.monthCalls} calls
                  </span>
                  <SeenLabel coach={c} />
                  {c.blocked && <span className="font-bold text-danger">Blocked</span>}
                </p>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  )
}

function SeenLabel({ coach: c }: { coach: PlatformCoach }) {
  if (!c.blocked && isActiveNow(c.lastSeenAt, c.signedIn))
    return <span className="font-semibold text-brand-text">Active now</span>
  return (
    <span className="text-ink-muted">
      {c.lastSeenAt ? `Seen ${timeAgo(c.lastSeenAt).toLowerCase()}` : 'Never signed in'}
    </span>
  )
}

/** Who used Claude the most this month. */
function TopUsers() {
  const costs = useQuery(platformCostsQuery).data
  return (
    <Card className="flex flex-col gap-4">
      <h2 className="font-bold text-[17px]">Top users this month</h2>
      {!costs ? (
        <div className="h-32 animate-pulse rounded-md bg-surface-raised" />
      ) : costs.topUsers.length === 0 ? (
        <p className="text-[14px] text-ink-muted">No Claude calls this month yet.</p>
      ) : (
        <ul className="flex w-full flex-col divide-y divide-border">
          {costs.topUsers.map((u) => (
            <li
              key={u.userId ?? 'deleted'}
              className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
            >
              <span className="min-w-0 flex-1 truncate font-semibold text-[15px]">
                {u.name}
                {u.role && u.role !== 'member' && (
                  <span className="font-normal text-[13px] text-ink-muted">
                    {' '}
                    · {ROLE_LABELS[u.role as keyof typeof ROLE_LABELS] ?? u.role}
                  </span>
                )}
              </span>
              <span className="tabular shrink-0 text-[14px]">
                <span className="font-bold">{formatUsd(u.costMicros)}</span>
                <span className="text-ink-muted"> · {u.calls}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

/** The latest calls that failed, and why. */
function Failures() {
  const costs = useQuery(platformCostsQuery).data
  return (
    <Card className="flex flex-col gap-4">
      <h2 className="font-bold text-[17px]">Failed calls, last 30 days</h2>
      {!costs ? (
        <div className="h-32 animate-pulse rounded-md bg-surface-raised" />
      ) : costs.failures.length === 0 ? (
        <p className="flex items-center gap-2 text-[14px] text-ink-muted">
          <CheckCircle2 className="size-4 text-brand-text" aria-hidden />
          Nothing failed.
        </p>
      ) : (
        <ul className="flex w-full flex-col divide-y divide-border">
          {costs.failures.map((f) => (
            <li
              key={`${f.at}-${f.requestId}`}
              className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0"
            >
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-ink-muted">
                <span className="font-bold text-ink">{CLAUDE_FEATURE_LABELS[f.feature]}</span>
                <span>{timeAgo(f.at)}</span>
                <span>{f.model}</span>
              </p>
              <p className="break-words text-[14px]">{f.reason}</p>
              {f.requestId && (
                <p className="truncate font-mono text-[12px] text-ink-muted">{f.requestId}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

/** Which keys this site has (never their values), the newest migration, and email. */
function Health() {
  const health = useQuery(platformHealthQuery).data
  return (
    <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-2">
      <Card className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="font-bold text-[17px]">Site setup</h2>
          <p className="text-[14px] text-ink-muted">
            Which keys this site has. Values are never shown.
            {health?.migration && ` Database at ${health.migration}.`}
          </p>
        </div>
        {!health ? (
          <div className="h-48 animate-pulse rounded-md bg-surface-raised" />
        ) : (
          <ul className="flex w-full flex-col divide-y divide-border">
            {health.keys.map((k) => (
              <li key={k.name} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                {k.set ? (
                  <CheckCircle2
                    className="mt-0.5 size-5 shrink-0 text-brand-text"
                    aria-label="Set"
                  />
                ) : (
                  <CircleAlert
                    className="mt-0.5 size-5 shrink-0 text-clay-text"
                    aria-label="Missing"
                  />
                )}
                <div className="flex min-w-0 flex-col gap-0.5">
                  <p className="font-semibold text-[15px]">
                    {k.label}
                    <span className="font-mono font-normal text-[12px] text-ink-muted">
                      {' '}
                      {k.name}
                    </span>
                  </p>
                  <p className="text-[13px] text-ink-muted">{k.note}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="font-bold text-[17px]">Email</h2>
          <p className="text-[14px] text-ink-muted">
            Where the app’s emails (new passwords, welcome emails) actually go on this site.
          </p>
        </div>
        <EmailSettings />
      </Card>
    </div>
  )
}

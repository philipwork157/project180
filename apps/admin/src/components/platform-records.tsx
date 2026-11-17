// Platform page: the record of who did what (account changes, sign-ups, invitations, settings)
// and the errors the site ran into, with alert emails when there are many.
import {
  platformAuditQuery,
  platformDatabaseQuery,
  platformErrorsQuery,
  platformSignInsQuery,
} from '@project180/client'
import {
  AUDIT_ACTIONS,
  type AuditEvent,
  ERROR_ALERT_COUNT,
  ERROR_ALERT_MINUTES,
  type ErrorEvent,
  SIGN_IN_OUTCOME_LABELS,
  type SignInEvent,
  timeAgo,
} from '@project180/shared'
import { Button, Card, cn, Input } from '@project180/ui'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { AlertTriangle, CheckCircle2, ChevronRight } from 'lucide-react'
import { useState } from 'react'

const at = new Intl.DateTimeFormat('en-ZA', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Africa/Johannesburg',
})

/**
 * Errors in the last hour and day, and the latest ones. Compact (the Overview): the three
 * newest and a link to System, where all of them are.
 */
export function ErrorsCard({ compact = false }: { compact?: boolean }) {
  const errors = useQuery({ ...platformErrorsQuery, refetchInterval: 60_000 }).data
  const bad = (errors?.lastHour ?? 0) > 0
  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <span
          className={cn(
            'grid size-10 shrink-0 place-items-center rounded-full',
            bad ? 'bg-danger/10 text-danger' : 'bg-lime/25 text-lime-text',
          )}
        >
          {bad ? (
            <AlertTriangle className="size-5" aria-hidden />
          ) : (
            <CheckCircle2 className="size-5" aria-hidden />
          )}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h2 className="font-bold text-[17px]">Errors</h2>
          <p className="text-[14px] text-ink-muted">
            {errors?.alertsOn
              ? `You get an email when there are ${ERROR_ALERT_COUNT} in ${ERROR_ALERT_MINUTES} minutes (at most hourly).`
              : 'Alert emails are off: email isn’t set up on this site.'}
          </p>
        </div>
      </div>
      {!errors ? (
        <div className="h-24 animate-pulse rounded-md bg-surface-raised" />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1 rounded-md bg-surface-raised p-4">
              <span className="font-extrabold text-[11px] text-ink-muted uppercase tracking-[0.08em]">
                Last hour
              </span>
              <span className={cn('metric text-[28px]', bad && 'text-danger')}>
                {errors.lastHour}
              </span>
            </div>
            <div className="flex flex-col gap-1 rounded-md bg-surface-raised p-4">
              <span className="font-extrabold text-[11px] text-ink-muted uppercase tracking-[0.08em]">
                Last 24 hours
              </span>
              <span className="metric text-[28px]">{errors.last24h}</span>
            </div>
          </div>
          {compact && errors.recent.length > 0 && <ErrorList errors={errors.recent.slice(0, 3)} />}
          {compact ? (
            <Link
              to="/platform/system"
              className="inline-flex min-h-11 items-center gap-1 self-start font-bold text-[14px] text-brand-text"
            >
              {errors.recent.length > 3 ? `See all ${errors.recent.length} errors` : 'Open System'}
              <ChevronRight className="size-4" aria-hidden />
            </Link>
          ) : errors.recent.length === 0 ? (
            <p className="text-[14px] text-ink-muted">
              Nothing has gone wrong in the last 30 days.
            </p>
          ) : (
            <ErrorList errors={errors.recent} />
          )}
        </>
      )}
    </Card>
  )
}

function ErrorList({ errors }: { errors: ErrorEvent[] }) {
  return (
    <ul className="flex max-h-96 w-full flex-col divide-y divide-border overflow-y-auto">
      {errors.map((e) => (
        <li key={e.id} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-ink-muted">
            <span className="rounded-sm bg-surface-raised px-1.5 font-bold text-ink uppercase">
              {e.source}
            </span>
            <span className="font-semibold text-ink">{e.where}</span>
            <span>{timeAgo(e.createdAt)}</span>
          </p>
          <p className="break-words font-mono text-[12px]">{e.message}</p>
        </li>
      ))}
    </ul>
  )
}

/** Who did what, newest first, 50 at a time. Names only: no emails, training or food. */
export function ActivityRecord() {
  const [pages, setPages] = useState<Array<number | null>>([null])
  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="font-bold text-[17px]">Who did what</h2>
        <p className="text-[14px] text-ink-muted">
          Sign-ups, invitations, account changes and platform settings, newest first. Kept two
          years. Never anyone’s training, food or chats.
        </p>
      </div>
      <ul className="flex w-full flex-col divide-y divide-border">
        {pages.map((before, i) => (
          <AuditPageRows
            key={before ?? 'first'}
            before={before}
            onMore={i === pages.length - 1 ? (next) => setPages([...pages, next]) : undefined}
          />
        ))}
      </ul>
    </Card>
  )
}

function AuditPageRows({
  before,
  onMore,
}: {
  before: number | null
  onMore?: (next: number) => void
}) {
  const page = useQuery(platformAuditQuery(before))
  if (!page.data)
    return (
      <li className="py-3">
        <div className="h-24 animate-pulse rounded-md bg-surface-raised" />
      </li>
    )
  if (before === null && page.data.events.length === 0)
    return <li className="py-3 text-[14px] text-ink-muted">Nothing recorded yet.</li>
  return (
    <>
      {page.data.events.map((e) => (
        <AuditRow key={e.id} event={e} />
      ))}
      {onMore && page.data.nextBefore !== null && (
        <li className="pt-4">
          <Button variant="secondary" block onClick={() => onMore(page.data.nextBefore as number)}>
            Show older
          </Button>
        </li>
      )}
    </>
  )
}

function AuditRow({ event: e }: { event: AuditEvent }) {
  const label = AUDIT_ACTIONS[e.action] ?? e.action
  return (
    <li className="flex flex-col gap-1 py-3 first:pt-0 sm:flex-row sm:items-start sm:gap-4">
      <span className="tabular w-32 shrink-0 text-[13px] text-ink-muted">
        {at.format(new Date(e.createdAt))}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[14px]">
          <b>{e.actorName ?? 'Someone'}</b> · {label}
          {e.targetName && (
            <>
              {' '}
              <b>{e.targetName}</b>
            </>
          )}
        </span>
        {(e.businessName || e.detail) && (
          <span className="truncate text-[13px] text-ink-muted">
            {[e.businessName, e.detail].filter(Boolean).join(' · ')}
          </span>
        )}
      </span>
    </li>
  )
}

type AppFilter = 'all' | 'app' | 'admin'

/** A filter you can switch on and off (lime when on). */
function FilterChip({
  active,
  className,
  onClick,
  children,
}: {
  active: boolean
  className?: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'h-11 rounded-pill px-4 font-bold text-[14px] transition active:scale-[0.97]',
        active ? 'bg-brand text-on-brand' : 'bg-surface-raised text-ink hover:bg-border',
        className,
      )}
    >
      {children}
    </button>
  )
}

const APP_LABELS: Record<'app' | 'admin', string> = { app: 'Phone app', admin: 'Admin' }

/** Every try to sign in to the app or the admin: who, from where, and what happened. */
export function SignInsCard() {
  const [app, setApp] = useState<AppFilter>('all')
  const [failed, setFailed] = useState(false)
  const [search, setSearch] = useState('')
  const [q, setQ] = useState('')
  const [pages, setPages] = useState<Array<number | null>>([null])
  const filters = { app, failed, q }
  const first = useQuery(platformSignInsQuery({ ...filters, before: null })).data
  const reset = () => setPages([null])

  return (
    <Card className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h2 className="font-bold text-[17px]">Sign-ins</h2>
        <p className="text-[14px] text-ink-muted">
          Every try to sign in to the phone app and the admin, right or wrong. Kept 90 days.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Signed in, 24 h" value={first?.last24h.ok} />
        <Stat
          label="Failed, 24 h"
          value={first?.last24h.failed}
          warn={(first?.last24h.failed ?? 0) > 20}
        />
        <div className="col-span-2 flex flex-col gap-2 rounded-md bg-surface-raised p-4">
          <span className="font-extrabold text-[11px] text-ink-muted uppercase tracking-[0.08em]">
            Most failed tries by network, 24 h
          </span>
          {!first ? (
            <div className="h-10 animate-pulse rounded-sm bg-surface" />
          ) : first.topFailing.length === 0 ? (
            <span className="text-[14px] text-ink-muted">None</span>
          ) : (
            <ul className="flex flex-col gap-1">
              {first.topFailing.map((t) => (
                <li key={t.ip} className="flex items-center gap-2 text-[13px]">
                  <span className="min-w-0 flex-1 truncate font-mono">
                    {t.ip}
                    {t.country && ` · ${t.country}`}
                  </span>
                  <span className="tabular shrink-0 text-ink-muted">
                    {t.failed} tries · {t.emails} email{t.emails === 1 ? '' : 's'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="no-scrollbar flex gap-2 overflow-x-auto">
          {(['all', 'app', 'admin'] as const).map((a) => (
            <FilterChip
              key={a}
              active={app === a}
              className="shrink-0 whitespace-nowrap"
              onClick={() => {
                setApp(a)
                reset()
              }}
            >
              {a === 'all' ? 'Both apps' : APP_LABELS[a]}
            </FilterChip>
          ))}
          <FilterChip
            active={failed}
            className="shrink-0 whitespace-nowrap"
            onClick={() => {
              setFailed(!failed)
              reset()
            }}
          >
            Only failed
          </FilterChip>
        </div>
        <form
          className="md:ml-auto md:w-72"
          onSubmit={(e) => {
            e.preventDefault()
            setQ(search.trim())
            reset()
          }}
        >
          <Input
            type="search"
            value={search}
            placeholder="Search an email, press Enter"
            aria-label="Search an email"
            onChange={(e) => {
              setSearch(e.target.value)
              if (!e.target.value) {
                setQ('')
                reset()
              }
            }}
          />
        </form>
      </div>

      <ul className="flex w-full flex-col divide-y divide-border">
        {pages.map((before, i) => (
          <SignInPageRows
            key={before ?? 'first'}
            filters={{ ...filters, before }}
            onMore={i === pages.length - 1 ? (next) => setPages([...pages, next]) : undefined}
          />
        ))}
      </ul>
    </Card>
  )
}

function Stat({
  label,
  value,
  warn,
}: {
  label: string
  value: number | undefined
  warn?: boolean
}) {
  return (
    <div className="flex flex-col gap-1 rounded-md bg-surface-raised p-4">
      <span className="font-extrabold text-[11px] text-ink-muted uppercase tracking-[0.08em]">
        {label}
      </span>
      {value === undefined ? (
        <span className="h-8 w-12 animate-pulse rounded-sm bg-surface" />
      ) : (
        <span className={cn('metric text-[28px]', warn && 'text-danger')}>{value}</span>
      )}
    </div>
  )
}

function SignInPageRows({
  filters,
  onMore,
}: {
  filters: { app: AppFilter; failed: boolean; q: string; before: number | null }
  onMore?: (next: number) => void
}) {
  const page = useQuery(platformSignInsQuery(filters))
  if (!page.data)
    return (
      <li className="py-3">
        <div className="h-24 animate-pulse rounded-md bg-surface-raised" />
      </li>
    )
  if (filters.before === null && page.data.events.length === 0)
    return <li className="py-3 text-[14px] text-ink-muted">No sign-in tries match.</li>
  return (
    <>
      {page.data.events.map((e) => (
        <SignInRow key={e.id} event={e} />
      ))}
      {onMore && page.data.nextBefore !== null && (
        <li className="pt-4">
          <Button variant="secondary" block onClick={() => onMore(page.data.nextBefore as number)}>
            Show older
          </Button>
        </li>
      )}
    </>
  )
}

function SignInRow({ event: e }: { event: SignInEvent }) {
  const ok = e.outcome === 'ok'
  return (
    <li className="flex flex-col gap-1 py-3 first:pt-0 md:flex-row md:items-center md:gap-4">
      <span className="tabular w-32 shrink-0 text-[13px] text-ink-muted">
        {at.format(new Date(e.createdAt))}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex min-w-0 items-center gap-2">
          <span
            aria-hidden
            className={cn('size-2 shrink-0 rounded-full', ok ? 'bg-lime' : 'bg-danger')}
          />
          <span className="truncate font-semibold text-[14px]">
            {e.name ? `${e.name} · ` : ''}
            {e.email}
          </span>
        </span>
        <span className="truncate text-[13px] text-ink-muted">
          {[
            SIGN_IN_OUTCOME_LABELS[e.outcome] ?? e.outcome,
            APP_LABELS[e.app],
            e.device,
            e.ip && `${e.ip}${e.country ? ` (${e.country})` : ''}`,
          ]
            .filter(Boolean)
            .join(' · ')}
        </span>
      </span>
    </li>
  )
}

const bytes = (n: number) =>
  n >= 1024 ** 3
    ? `${(n / 1024 ** 3).toFixed(2)} GB`
    : n >= 1024 ** 2
      ? `${(n / 1024 ** 2).toFixed(1)} MB`
      : `${Math.max(1, Math.round(n / 1024))} KB`

/** Every table with its row count, and the size against D1's limit. Never the rows. */
export function DatabaseCard() {
  const db = useQuery(platformDatabaseQuery).data
  const share = db?.sizeBytes ? db.sizeBytes / db.limitBytes : 0
  return (
    <Card className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h2 className="font-bold text-[17px]">Database</h2>
        <p className="text-[14px] text-ink-muted">
          How many rows each table has. To look at rows, use the Cloudflare dashboard (D1 →
          project180-db), behind your Cloudflare sign-in.
        </p>
      </div>
      {!db ? (
        <div className="h-40 animate-pulse rounded-md bg-surface-raised" />
      ) : (
        <>
          <div className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-3 text-[14px]">
              <span>
                <span className="metric text-[24px]">
                  {db.sizeBytes === null ? 'Unknown' : bytes(db.sizeBytes)}
                </span>{' '}
                <span className="text-ink-muted">of {bytes(db.limitBytes)}</span>
              </span>
              {db.migration && (
                <span className="truncate font-mono text-[12px] text-ink-muted">
                  {db.migration}
                </span>
              )}
            </div>
            <div aria-hidden className="h-2 w-full overflow-hidden rounded-pill bg-surface-raised">
              <div
                className={cn('h-full rounded-pill', share > 0.8 ? 'bg-danger' : 'bg-steel')}
                style={{ width: `${Math.max(share * 100, 1)}%` }}
              />
            </div>
          </div>
          <ul className="grid grid-cols-1 gap-x-8 sm:grid-cols-2 xl:grid-cols-4">
            {db.tables.map((t) => (
              <li
                key={t.name}
                className="flex items-center justify-between gap-3 border-border border-b py-2 text-[13px]"
              >
                <span className="truncate font-mono">{t.name}</span>
                <span className="tabular shrink-0 font-semibold">
                  {new Intl.NumberFormat('en-ZA').format(t.rows)}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  )
}

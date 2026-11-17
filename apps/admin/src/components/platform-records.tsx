// Platform page: the record of who did what (account changes, sign-ups, invitations, settings)
// and the errors the site ran into, with alert emails when there are many.
import { platformAuditQuery, platformErrorsQuery } from '@project180/client'
import {
  AUDIT_ACTIONS,
  type AuditEvent,
  ERROR_ALERT_COUNT,
  ERROR_ALERT_MINUTES,
  timeAgo,
} from '@project180/shared'
import { Button, Card, cn } from '@project180/ui'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import { useState } from 'react'

const at = new Intl.DateTimeFormat('en-ZA', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Africa/Johannesburg',
})

/** Errors in the last hour and day, and the latest ones. */
export function ErrorsCard() {
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
          {errors.recent.length === 0 ? (
            <p className="text-[14px] text-ink-muted">
              Nothing has gone wrong in the last 30 days.
            </p>
          ) : (
            <ul className="flex max-h-96 w-full flex-col divide-y divide-border overflow-y-auto">
              {errors.recent.map((e) => (
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
          )}
        </>
      )}
    </Card>
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

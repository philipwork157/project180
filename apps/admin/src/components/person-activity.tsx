import { ApiError, api, personActivityQuery, usersQuery } from '@project180/client'
import { durationShort, type SignedInDevice, timeAgo } from '@project180/shared'
import { Button, Chip, ConfirmDialog, cn, IconButton, toast } from '@project180/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Ban, ChevronDown, LogOut, MonitorSmartphone } from 'lucide-react'
import { useState } from 'react'

const LABEL = 'font-bold text-[11px] text-ink-muted uppercase tracking-[0.12em]'
const dateShort = (iso: string) =>
  new Date(iso).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })
const weekday = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString('en-ZA', { weekday: 'short' })

/** A green dot when they're using it right now. */
export function ActiveDot({ active, className }: { active: boolean; className?: string }) {
  if (!active) return null
  return (
    <span className={cn('relative flex size-3', className)} title="Active now">
      <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-40" />
      <span className="relative inline-flex size-3 rounded-full bg-success ring-2 ring-surface" />
    </span>
  )
}

/**
 * On a person's card: when they were last seen, time in the app over the last 7 days, and
 * the devices they're signed in on, with sign-out for one or all of them.
 */
export function PersonActivityPanel({
  userId,
  name,
  isMe,
  defaultOpen = false,
}: {
  userId: number
  name: string
  isMe: boolean
  /** Show the device list straight away (the settings page). */
  defaultOpen?: boolean
}) {
  const query = useQuery(personActivityQuery(userId))
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(defaultOpen)
  const [confirm, setConfirm] = useState<
    { kind: 'all' } | { kind: 'one'; device: SignedInDevice } | null
  >(null)
  const first = name.split(' ')[0] ?? name

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: personActivityQuery(userId).queryKey }),
      queryClient.invalidateQueries({ queryKey: usersQuery.queryKey }),
    ])
  const failed = (err: unknown) =>
    toast({
      tone: 'error',
      title: 'Couldn’t sign out',
      description: err instanceof ApiError ? err.message : undefined,
    })
  const signOutOne = useMutation({
    mutationFn: (sessionId: number) =>
      api(`/admin/users/${userId}/sessions/${sessionId}`, { method: 'DELETE' }),
    onSuccess: () => {
      void refresh()
      setConfirm(null)
      toast({
        title: 'Signed out',
        description: isMe ? 'That device is signed out.' : `${first} is signed out on that device.`,
      })
    },
    onError: failed,
  })
  const signOutAll = useMutation({
    mutationFn: () =>
      api<{ signedOut: number }>(`/admin/users/${userId}/sign-out-everywhere`, { method: 'POST' }),
    onSuccess: ({ signedOut }) => {
      void refresh()
      setConfirm(null)
      toast({
        title: 'Signed out everywhere',
        description: `${signedOut} device${signedOut === 1 ? '' : 's'} signed out.`,
      })
    },
    onError: failed,
  })

  const a = query.data
  if (!a)
    return query.isPending ? (
      <div className="h-[74px] animate-pulse rounded-md bg-surface-raised" />
    ) : null
  const total = a.days.reduce((n, d) => n + d.seconds, 0)
  const activeDays = a.days.filter((d) => d.seconds > 0).length
  const most = Math.max(60, ...a.days.map((d) => d.seconds))
  const others = a.devices.filter((d) => !d.current)

  return (
    <div className="flex flex-col gap-3 rounded-md bg-surface-raised p-4">
      <div className="grid grid-cols-1 items-center gap-x-8 gap-y-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
        <div className="min-w-0">
          <p className={LABEL}>Status</p>
          <p className="mt-1 flex items-center gap-2 font-bold text-[15px]">
            {a.blocked ? (
              <span className="flex items-center gap-2 text-danger">
                <Ban className="size-4" aria-hidden />
                Blocked: can’t sign in
              </span>
            ) : a.activeNow ? (
              <>
                <ActiveDot active />
                Active now
              </>
            ) : a.lastSeenAt ? (
              <span className="truncate">Seen {timeAgo(a.lastSeenAt).toLowerCase()}</span>
            ) : (
              <span className="text-ink-muted">Not signed in yet</span>
            )}
          </p>
          {a.mustChangePassword && a.lastSeenAt && (
            <p className="mt-0.5 font-semibold text-[12px] text-sand-text">
              Still on the temporary password
            </p>
          )}
        </div>

        <div className="min-w-0">
          <p className={LABEL}>Time in the app · 7 days</p>
          {total === 0 ? (
            <p className="mt-1 font-bold text-[15px] text-ink-muted">None yet</p>
          ) : (
            <div className="mt-1 flex flex-wrap items-end gap-x-4 gap-y-2">
              <p className="font-bold text-[15px] leading-6">
                {total > 0 && total < 60 ? '<1 m' : durationShort(total)}
                <span className="ml-1.5 font-semibold text-[13px] text-ink-muted">
                  on {activeDays} day{activeDays === 1 ? '' : 's'}
                </span>
              </p>
              {/* One bar per day, oldest first; taller = more time. */}
              <ol className="flex items-end gap-1" aria-hidden>
                {a.days.map((d) => (
                  <li
                    key={d.date}
                    className="flex flex-col items-center gap-1"
                    title={`${weekday(d.date)}: ${durationShort(d.seconds)}`}
                  >
                    <span className="flex h-6 w-2 items-end overflow-hidden rounded-full bg-border">
                      {d.seconds > 0 && (
                        <span
                          className="w-full rounded-full bg-lime"
                          style={{ height: `${Math.max(25, (d.seconds / most) * 100)}%` }}
                        />
                      )}
                    </span>
                    <span className="font-semibold text-[9px] text-ink-muted leading-none">
                      {weekday(d.date).charAt(0)}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>

        <Button
          variant="ghost"
          size="sm"
          className="justify-self-start sm:justify-self-end"
          icon={<MonitorSmartphone className="size-4" aria-hidden />}
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          {a.devices.length === 0
            ? 'No devices'
            : `${a.devices.length} device${a.devices.length === 1 ? '' : 's'}`}
          <ChevronDown className={cn('size-4 transition', open && 'rotate-180')} aria-hidden />
        </Button>
      </div>

      {open && (
        <div className="flex flex-col gap-2 border-border border-t pt-3">
          {a.devices.length === 0 && (
            <p className="text-[13px] text-ink-muted">Not signed in anywhere right now.</p>
          )}
          <ul className="flex flex-col divide-y divide-border">
            {a.devices.map((d) => (
              <li key={d.id} className="flex items-center gap-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 font-semibold text-[14px]">
                    <span className="truncate">{d.label}</span>
                    {d.app && (
                      <Chip className="h-5 text-[11px]">{d.app === 'admin' ? 'Admin' : 'App'}</Chip>
                    )}
                    {d.current && (
                      <Chip tone="brand" className="h-5 text-[11px]">
                        This device
                      </Chip>
                    )}
                  </p>
                  <p className="text-[12px] text-ink-muted">
                    Signed in {dateShort(d.signedInAt)} · last used{' '}
                    {timeAgo(d.lastActiveAt).toLowerCase()}
                  </p>
                </div>
                {!d.current && (
                  <IconButton
                    label={`Sign out on ${d.label}`}
                    icon={<LogOut aria-hidden />}
                    size="sm"
                    tone="danger"
                    onClick={() => setConfirm({ kind: 'one', device: d })}
                  />
                )}
              </li>
            ))}
          </ul>
          {(isMe ? others.length > 0 : a.devices.length > 0) && (
            <Button
              variant="secondary"
              size="sm"
              className="self-start"
              icon={<LogOut className="size-4" aria-hidden />}
              onClick={() => setConfirm({ kind: 'all' })}
            >
              {isMe ? 'Sign out of all other devices' : 'Sign out of all devices'}
            </Button>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirm !== null}
        title={
          confirm?.kind === 'one'
            ? `Sign out on ${confirm.device.label}?`
            : isMe
              ? 'Sign out of all other devices?'
              : `Sign ${first} out everywhere?`
        }
        confirmLabel="Sign out"
        loading={signOutOne.isPending || signOutAll.isPending}
        onConfirm={() =>
          confirm?.kind === 'one' ? signOutOne.mutate(confirm.device.id) : signOutAll.mutate()
        }
        onClose={() => setConfirm(null)}
      >
        {isMe
          ? 'You’ll need to sign in again on those devices. This one stays signed in.'
          : `${first} will need to sign in again with their password. Nothing they’ve logged is lost.`}
      </ConfirmDialog>
    </div>
  )
}

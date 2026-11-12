import { planQuery } from '@project180/client'
import { type AppNotification, appNotifications } from '@project180/shared'
import { cn, IconButton } from '@project180/ui'
import { useQuery } from '@tanstack/react-query'
import { Bell, BellOff, ChevronRight, Dumbbell, Scale } from 'lucide-react'
import { useState } from 'react'
import { Sheet } from './sheet'
import { useWeighInStatus } from './weigh-in-card'

const SEEN_KEY = 'project180-seen-notifications'

function loadSeen(): string[] {
  try {
    const raw = localStorage.getItem(SEEN_KEY)
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch {
    return []
  }
}

/** What's waiting today (weigh-in, today's workout), worked out from the plan. */
export function useAppNotifications(): AppNotification[] {
  const plan = useQuery(planQuery).data
  const { status, today } = useWeighInStatus()
  if (!plan?.plan || !today) return []
  const day = plan.plan.days.find((d) => d.isToday) ?? null
  return appNotifications({
    today,
    weighIn: status,
    todayWorkout: day,
    workoutInProgress: plan.activeSession != null,
  })
}

/** The bell on the Today screen: a badge for anything new, and a sheet listing it all. */
export function NotificationsButton({
  onAction,
}: {
  /** Tapped a notification: do the thing (open the weigh-in, start the workout…). */
  onAction: (n: AppNotification) => void
}) {
  const list = useAppNotifications()
  const [open, setOpen] = useState(false)
  const [seen, setSeen] = useState(loadSeen)
  const unseen = list.filter((n) => !seen.includes(n.id)).length

  function openSheet() {
    setOpen(true)
    // Only remember what's still listed, so the stored list never grows.
    const ids = list.map((n) => n.id)
    setSeen(ids)
    try {
      localStorage.setItem(SEEN_KEY, JSON.stringify(ids))
    } catch {
      // Private mode: the badge just comes back next time.
    }
  }

  return (
    <>
      <div className="relative">
        <IconButton
          label={unseen ? `Notifications, ${unseen} new` : 'Notifications'}
          icon={<Bell aria-hidden />}
          size="lg"
          className="[&_svg]:size-[22px]"
          onClick={openSheet}
        />
        {unseen > 0 && (
          <span
            aria-hidden
            className="tabular pointer-events-none absolute -top-1 -right-1 grid h-5 min-w-5 place-items-center rounded-pill bg-clay px-1 font-extrabold text-[11px] text-on-clay ring-2 ring-bg"
          >
            {unseen}
          </span>
        )}
      </div>

      <Sheet open={open} onClose={() => setOpen(false)} label="Notifications">
        <div className="flex flex-col gap-4 pb-6">
          <h2 className="font-display font-extrabold text-[24px] leading-7">Notifications</h2>
          {list.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-lg bg-surface-raised p-6 text-center">
              <BellOff className="size-6 text-ink-muted" aria-hidden />
              <p className="font-bold">You’re all caught up</p>
              <p className="text-[14px] text-ink-muted">
                Weigh-in days and today’s workout show up here.
              </p>
            </div>
          ) : (
            <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
              {list.map((n) => {
                const Icon = n.kind === 'weigh_in' ? Scale : Dumbbell
                return (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setOpen(false)
                        onAction(n)
                      }}
                      className="flex min-h-16 w-full items-center gap-3 rounded-lg bg-surface-raised p-3 text-left transition active:scale-[0.98]"
                    >
                      <span
                        className={cn(
                          'grid size-11 shrink-0 place-items-center rounded-full',
                          n.kind === 'weigh_in'
                            ? 'bg-sand/25 text-sand-text'
                            : 'bg-brand-soft text-brand-text',
                        )}
                      >
                        <Icon className="size-5" aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-bold text-[15px]">{n.title}</span>
                        <span className="mt-0.5 block text-[13px] text-ink-muted">{n.body}</span>
                      </span>
                      <ChevronRight className="size-5 shrink-0 text-ink-muted" aria-hidden />
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </Sheet>
    </>
  )
}

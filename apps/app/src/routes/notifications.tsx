import { meQuery } from '@project180/client'
import type { AppNotification } from '@project180/shared'
import { cn, IconButton } from '@project180/ui'
import { createFileRoute, redirect, useNavigate, useRouter } from '@tanstack/react-router'
import {
  ArrowLeft,
  BellOff,
  CalendarDays,
  ChevronRight,
  Dumbbell,
  Heart,
  MessageCircle,
  Scale,
} from 'lucide-react'
import { motion } from 'motion/react'
import { useEffect, useState } from 'react'
import {
  loadSeenNotifications,
  saveSeenNotifications,
  useAppNotifications,
} from '../components/notifications'
import { PushSettings } from '../components/push-settings'
import { useWeighInStatus, WeighInSheet } from '../components/weigh-in-card'
import { useHeartbeat } from '../lib/use-heartbeat'

/** Notifications, full screen: everything that's waiting, with Back to where you came from. */
export const Route = createFileRoute('/notifications')({
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData(meQuery)
    if (!me) throw redirect({ to: '/login' })
    if (me.mustChangePassword) throw redirect({ to: '/choose-password' })
    return { me }
  },
  component: NotificationsPage,
})

const LOOK: Record<AppNotification['kind'], { icon: typeof Scale; tint: string }> = {
  weigh_in: { icon: Scale, tint: 'bg-sand/25 text-sand-text' },
  workout: { icon: Dumbbell, tint: 'bg-brand-soft text-brand-text' },
  program: { icon: CalendarDays, tint: 'bg-steel/20 text-steel-text' },
  feedback: { icon: Heart, tint: 'bg-brand-soft text-brand-text' },
  chat: { icon: MessageCircle, tint: 'bg-brand-soft text-brand-text' },
}

function NotificationsPage() {
  const router = useRouter()
  const navigate = useNavigate()
  useHeartbeat()
  const list = useAppNotifications()
  const weighIn = useWeighInStatus()
  const [weighing, setWeighing] = useState(false)
  // What was already seen before this visit: the rest are marked "new" while you look.
  const [seenBefore] = useState(loadSeenNotifications)
  const ids = list.map((n) => n.id).join('|')
  useEffect(() => {
    if (ids) saveSeenNotifications(ids.split('|'))
  }, [ids])

  // Back to the screen they came from; opened directly (a link), back to Today.
  const back = () =>
    router.history.canGoBack() ? router.history.back() : void navigate({ to: '/', replace: true })

  function open(n: AppNotification) {
    if (n.kind === 'weigh_in') return setWeighing(true)
    // A message from your coach: open the chat.
    if (n.kind === 'chat') return void navigate({ to: '/chat' })
    // A new or updated program: the calendar shows the whole plan.
    if (n.kind === 'program') return void navigate({ to: '/calendar' })
    // A like or comment from your coach: open that workout.
    if (n.kind === 'feedback' && n.sessionId)
      return void navigate({ to: '/progress', search: { workout: n.sessionId } })
    void navigate({ to: '/', hash: 'today-workout' })
  }

  return (
    <motion.main
      initial={{ opacity: 0.4, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
      className="flex min-h-dvh w-full flex-col gap-6 bg-bg px-4 pt-safe pb-safe md:px-8 lg:px-12"
    >
      <header className="flex items-center gap-3 pt-4">
        <IconButton label="Back" icon={<ArrowLeft aria-hidden />} size="lg" onClick={back} />
        <h1 className="font-display font-extrabold text-[30px] leading-[34px] tracking-tight">
          Notifications
        </h1>
      </header>

      {list.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 pb-24 text-center">
          <span className="grid size-14 place-items-center rounded-full bg-surface-raised text-ink-muted">
            <BellOff className="size-6" aria-hidden />
          </span>
          <p className="mt-2 font-bold text-[17px]">You’re all caught up</p>
          <p className="max-w-xs text-[14px] text-ink-muted">
            Messages from your coach, weigh-in days, today’s workout, news about your program and
            your coach’s feedback show up here.
          </p>
        </div>
      ) : (
        // One full-width row each: two columns leave half the screen empty.
        <ul className="flex w-full flex-col gap-2 md:gap-3">
          {list.map((n, i) => {
            const { icon: Icon, tint } = LOOK[n.kind]
            const isNew = !seenBefore.includes(n.id)
            return (
              <motion.li
                key={n.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.24, delay: 0.04 * i, ease: [0.16, 1, 0.3, 1] }}
              >
                <button
                  type="button"
                  onClick={() => open(n)}
                  className="flex min-h-[72px] w-full items-center gap-3 rounded-lg bg-surface p-4 text-left shadow-card transition active:scale-[0.98] md:gap-4 md:p-5"
                >
                  <span
                    className={cn('grid size-11 shrink-0 place-items-center rounded-full', tint)}
                  >
                    <Icon className="size-5" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="font-bold text-[15px]">{n.title}</span>
                      {isNew && (
                        <span className="shrink-0 rounded-pill bg-clay/20 px-2 py-0.5 font-extrabold text-[11px] text-clay-text">
                          New
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 block text-[14px] text-ink-muted">{n.body}</span>
                  </span>
                  <ChevronRight className="size-5 shrink-0 text-ink-muted" aria-hidden />
                </button>
              </motion.li>
            )
          })}
        </ul>
      )}

      {/* Turn push on (or off) for this phone, right where notifications are read. */}
      <PushSettings heading="On this phone" />

      {weighIn.today && (
        <WeighInSheet
          open={weighing}
          date={weighIn.today}
          status={weighIn.status}
          onClose={() => setWeighing(false)}
        />
      )}
    </motion.main>
  )
}

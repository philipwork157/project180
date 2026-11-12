import { meQuery, planQuery } from '@project180/client'
import { cn } from '@project180/ui'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, Outlet, redirect, useLocation } from '@tanstack/react-router'
import { CalendarDays, ChevronUp, Flame, TrendingUp, UserRound } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { Elapsed } from '../components/elapsed'
import { useWeighInStatus } from '../components/weigh-in-card'
import { useHeartbeat } from '../lib/use-heartbeat'

/** Signed-in phone layout: the screen, then a bottom tab bar. */
export const Route = createFileRoute('/_app')({
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData(meQuery)
    if (!me) throw redirect({ to: '/login' })
    if (me.mustChangePassword) throw redirect({ to: '/choose-password' })
    return { me }
  },
  component: AppLayout,
})

const tabs = [
  { to: '/', label: 'Today', icon: Flame },
  { to: '/calendar', label: 'Calendar', icon: CalendarDays },
  { to: '/progress', label: 'Progress', icon: TrendingUp },
  { to: '/profile', label: 'Profile', icon: UserRound },
] as const

function AppLayout() {
  const { pathname } = useLocation()
  useHeartbeat()
  const active = useQuery(planQuery).data?.activeSession ?? null
  // Today has its own big banner; everywhere else gets the mini bar.
  const showMini = active !== null && pathname !== '/'
  // A weigh-in waiting: a dot on Today from every other tab.
  const weighIn = useWeighInStatus().status
  const weighInDue = weighIn !== null && !weighIn.done
  return (
    <div className="flex min-h-dvh w-full flex-col bg-bg">
      {/* New tab shows at once with a short slide in; no waiting for the old one to leave. */}
      <motion.main
        key={pathname}
        initial={{ opacity: 0.4, x: 12 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
        className={cn('w-full flex-1 px-4 pt-safe md:px-8 lg:px-12', showMini ? 'pb-44' : 'pb-28')}
      >
        <Outlet />
      </motion.main>
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-10 border-border border-t bg-surface/95 px-2 pt-2 pb-safe backdrop-blur"
      >
        <AnimatePresence initial={false}>
          {showMini && active && (
            <motion.div
              key="mini"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 400, damping: 34 }}
              className="overflow-hidden"
            >
              <Link
                to="/workout/$sessionId"
                params={{ sessionId: String(active.id) }}
                className="mb-2 flex items-center gap-3 rounded-lg bg-clay px-4 py-2.5 text-on-clay shadow-float transition active:scale-[0.98]"
              >
                <span className="relative flex size-2.5 shrink-0">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-on-clay opacity-50" />
                  <span className="relative inline-flex size-2.5 rounded-full bg-on-clay" />
                </span>
                <span className="min-w-0 flex-1 truncate font-bold text-[15px]">
                  {active.workoutName ?? 'Workout'}
                </span>
                <Elapsed
                  since={active.startedAt}
                  className="tabular font-display font-extrabold text-[17px]"
                />
                <ChevronUp className="size-5" aria-label="Open workout" />
              </Link>
            </motion.div>
          )}
        </AnimatePresence>
        <ul className="grid w-full grid-cols-4">
          {tabs.map(({ to, label, icon: Icon }) => {
            const active = to === '/' ? pathname === '/' : pathname.startsWith(to)
            return (
              <li key={to}>
                <Link
                  to={to}
                  className={cn(
                    'flex flex-col items-center gap-1 rounded-md py-1.5 font-bold text-[12px] transition',
                    active ? 'text-ink' : 'text-ink-muted',
                  )}
                >
                  <span
                    className={cn(
                      'relative grid h-8 w-14 place-items-center rounded-pill transition',
                      active && 'bg-brand-soft text-brand-text',
                    )}
                  >
                    <Icon className="size-6" strokeWidth={2.2} aria-hidden />
                    {to === '/' && active && (
                      <span className="absolute top-1 right-3 size-2.5 rounded-full bg-clay ring-2 ring-surface" />
                    )}
                    {to === '/' && !active && weighInDue && (
                      <span className="absolute top-0.5 right-2.5 size-2.5 rounded-full bg-sand ring-2 ring-surface" />
                    )}
                  </span>
                  {label}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>
    </div>
  )
}

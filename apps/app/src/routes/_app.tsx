import { meQuery, myChatUnreadQuery, planQuery } from '@project180/client'
import { isClient } from '@project180/shared'
import { cn } from '@project180/ui'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, Outlet, redirect, useLocation } from '@tanstack/react-router'
import {
  CalendarDays,
  ChevronUp,
  Flame,
  MessageCircle,
  TrendingUp,
  UserRound,
  Utensils,
} from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { Elapsed } from '../components/elapsed'
import { useWeighInStatus } from '../components/weigh-in-card'
import { claimPushForMe } from '../lib/push'
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
  // What you eat: food log, photo estimates and your coach's targets.
  { to: '/fuel', label: 'Fuel', icon: Utensils },
  { to: '/progress', label: 'Progress', icon: TrendingUp },
  // Chat with your coach (clients only): opens full screen, Back returns here.
  { to: '/chat', label: 'Coach', icon: MessageCircle },
  { to: '/profile', label: 'Profile', icon: UserRound },
] as const

function AppLayout() {
  const { me } = Route.useRouteContext()
  const { pathname } = useLocation()
  const client = isClient(me.role)
  const shown = tabs.filter((t) => t.to !== '/chat' || client)
  const unreadChat = useQuery({ ...myChatUnreadQuery, enabled: client }).data?.unread ?? 0
  useHeartbeat()
  // Once per app start: ties this phone's notifications to the current sign-in (older phones
  // were turned on before that was recorded; afterwards it changes nothing).
  useEffect(() => {
    void claimPushForMe()
  }, [])
  const active = useQuery(planQuery).data?.activeSession ?? null
  // Today has its own big banner; everywhere else gets the mini bar.
  const showMini = active !== null && pathname !== '/'
  // A weigh-in waiting: a dot on Today from every other tab.
  const weighIn = useWeighInStatus().status
  const weighInDue = weighIn !== null && !weighIn.done
  // Chat: the messages fill the screen above the tab bar (measured, as the mini workout bar
  // changes its height), and the bar tucks away while the keyboard is up on a phone.
  const inChat = pathname === '/chat'
  const nav = useRef<HTMLElement>(null)
  const [navHeight, setNavHeight] = useState(0)
  const [typing, setTyping] = useState(false)
  useEffect(() => {
    const el = nav.current
    if (!el) return
    const observer = new ResizeObserver(() => setNavHeight(el.offsetHeight))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    if (!inChat || !window.matchMedia('(pointer: coarse)').matches) return setTyping(false)
    const isField = (t: EventTarget | null) =>
      t instanceof HTMLTextAreaElement || t instanceof HTMLInputElement
    const onIn = (e: FocusEvent) => isField(e.target) && setTyping(true)
    const onOut = (e: FocusEvent) => isField(e.target) && setTyping(false)
    document.addEventListener('focusin', onIn)
    document.addEventListener('focusout', onOut)
    return () => {
      document.removeEventListener('focusin', onIn)
      document.removeEventListener('focusout', onOut)
    }
  }, [inChat])
  const hideNav = inChat && typing
  return (
    // Chat is exactly one screen tall (the messages scroll inside it); every other tab grows
    // with its content and the page scrolls.
    <div
      className={cn('flex w-full flex-col bg-bg', inChat ? 'h-dvh overflow-hidden' : 'min-h-dvh')}
    >
      {/* New tab shows at once with a short slide in; no waiting for the old one to leave. */}
      <motion.main
        key={pathname}
        initial={{ opacity: 0.4, x: 12 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
        className={cn(
          'w-full px-4 pt-safe md:px-8 lg:px-12',
          // Chat: a fixed height, not flex-1, or the column grows to fit every message and
          // pushes the box to type in under the tab bar.
          inChat
            ? 'flex h-dvh min-h-0 flex-none flex-col overflow-hidden'
            : cn('flex-1', showMini ? 'pb-44' : 'pb-28'),
        )}
        style={inChat ? { paddingBottom: hideNav ? 0 : navHeight } : undefined}
      >
        <Outlet />
      </motion.main>
      <nav
        ref={nav}
        aria-label="Main"
        aria-hidden={hideNav || undefined}
        className={cn(
          'fixed inset-x-0 bottom-0 z-10 border-border border-t bg-surface/95 px-2 pt-2 pb-safe backdrop-blur transition-transform duration-200',
          hideNav && 'pointer-events-none translate-y-full',
        )}
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
        <ul
          className={cn(
            'grid w-full',
            shown.length === 6 ? 'grid-cols-6' : shown.length === 5 ? 'grid-cols-5' : 'grid-cols-4',
          )}
        >
          {shown.map(({ to, label, icon: Icon }) => {
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
                      // Six tabs on a 375px phone: a slightly narrower pill keeps a gap between them.
                      'relative grid h-8 place-items-center rounded-pill transition',
                      shown.length === 6 ? 'w-12' : 'w-14',
                      active && 'bg-brand-soft text-brand-text',
                    )}
                  >
                    <Icon className="size-6" strokeWidth={2.2} aria-hidden />
                    {to === '/' && active && (
                      <span className="absolute top-1 right-3 size-2.5 rounded-full bg-clay ring-2 ring-surface" />
                    )}
                    {to === '/chat' && unreadChat > 0 && (
                      <span className="tabular absolute -top-1 right-1.5 grid h-5 min-w-5 place-items-center rounded-pill bg-clay px-1 font-extrabold text-[11px] text-on-clay ring-2 ring-surface">
                        {unreadChat > 9 ? '9+' : unreadChat}
                        <span className="sr-only"> unread</span>
                      </span>
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

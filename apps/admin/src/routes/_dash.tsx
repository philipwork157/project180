import { adminChatUnreadQuery, authClient, forgetLocalData, meQuery } from '@project180/client'
import { isStaff, type Me } from '@project180/shared'
import { cn, IconButton, Logo, LogoMark, Tooltip } from '@project180/ui'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createFileRoute,
  Link,
  Outlet,
  redirect,
  useLocation,
  useNavigate,
} from '@tanstack/react-router'
import {
  CalendarRange,
  Dumbbell,
  LayoutGrid,
  ListChecks,
  Menu,
  MessageCircle,
  PanelLeftClose,
  PanelLeftOpen,
  UsersRound,
  X,
} from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { Avatar, UserMenu } from '../components/user-menu'

/** Dashboard for building the library. Users section is admin-only. */
export const Route = createFileRoute('/_dash')({
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData(meQuery)
    if (!me) throw redirect({ to: '/login' })
    if (me.mustChangePassword) throw redirect({ to: '/choose-password' })
    return { me }
  },
  component: AdminLayout,
})

type NavItem = {
  to: string
  label: string
  icon: typeof Dumbbell
  adminOnly?: boolean
  exact?: boolean
  /** Show the unread message count. */
  unread?: boolean
}

const sections: Array<{ title?: string; items: NavItem[] }> = [
  { items: [{ to: '/', label: 'Overview', icon: LayoutGrid, exact: true }] },
  {
    title: 'Library',
    items: [
      { to: '/exercises', label: 'Exercises', icon: Dumbbell },
      { to: '/workouts', label: 'Workouts', icon: ListChecks },
      { to: '/programs', label: 'Programs', icon: CalendarRange },
    ],
  },
  {
    title: 'People',
    items: [
      { to: '/users', label: 'Users', icon: UsersRound, adminOnly: true },
      { to: '/messages', label: 'Messages', icon: MessageCircle, unread: true },
    ],
  },
]

const COLLAPSED_KEY = 'project180-sidebar-collapsed'

function readCollapsed() {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === '1'
  } catch {
    return false
  }
}

function Sidebar({
  me,
  pathname,
  collapsed,
  onToggle,
  onSignOut,
}: {
  me: Me
  pathname: string
  collapsed: boolean
  /** Desktop only: collapse to icons. Not shown in the phone drawer. */
  onToggle?: () => void
  onSignOut: () => void
}) {
  const isAdmin = isStaff(me.role)
  const unread = useQuery({ ...adminChatUnreadQuery, enabled: isAdmin }).data ?? 0
  return (
    <nav
      aria-label="Dashboard"
      className={cn('flex h-full flex-col gap-1 py-5', collapsed ? 'px-2' : 'px-3')}
    >
      <div
        className={cn(
          'flex items-center pb-4',
          collapsed ? 'flex-col gap-3' : 'justify-between pl-3',
        )}
      >
        <Link to="/" aria-label="Overview" className="rounded-sm">
          {collapsed ? (
            <LogoMark className="size-9 text-ink" title="Project 180" />
          ) : (
            <Logo size="sm" />
          )}
        </Link>
        {onToggle && (
          <IconButton
            size="sm"
            label={collapsed ? 'Expand the sidebar' : 'Collapse the sidebar'}
            icon={collapsed ? <PanelLeftOpen aria-hidden /> : <PanelLeftClose aria-hidden />}
            onClick={onToggle}
            className="text-ink-muted"
          />
        )}
      </div>

      {sections.map((section) => {
        const items = section.items.filter((i) => isAdmin || !i.adminOnly)
        if (items.length === 0) return null
        return (
          <div key={section.title ?? 'main'} className="flex flex-col gap-1">
            {section.title &&
              (collapsed ? (
                <span aria-hidden className="mx-3 my-3 h-px bg-border" />
              ) : (
                <p className="px-3 pt-4 pb-2 font-extrabold text-[11px] text-ink-muted uppercase tracking-[0.08em]">
                  {section.title}
                </p>
              ))}
            {items.map(({ to, label, icon: Icon, exact, unread: counts }) => {
              const active = exact ? pathname === to : pathname.startsWith(to)
              const badge = counts && unread > 0 ? (unread > 99 ? '99+' : String(unread)) : null
              const link = (
                <Link
                  key={to}
                  to={to}
                  aria-current={active ? 'page' : undefined}
                  aria-label={collapsed ? (badge ? `${label}, ${badge} unread` : label) : undefined}
                  className={cn(
                    'relative flex h-11 items-center gap-3 rounded-md font-bold text-[15px] transition',
                    collapsed ? 'w-11 justify-center self-center' : 'px-3',
                    active
                      ? 'bg-brand-soft text-brand-text'
                      : 'text-ink-muted hover:bg-surface-raised hover:text-ink',
                  )}
                >
                  {active && !collapsed && (
                    <span
                      aria-hidden
                      className="-left-3 absolute inset-y-2 w-1 rounded-r-full bg-lime"
                    />
                  )}
                  <Icon className="size-5 shrink-0" strokeWidth={2.2} aria-hidden />
                  {!collapsed && label}
                  {badge && (
                    <span
                      className={cn(
                        'tabular grid h-5 min-w-5 place-items-center rounded-pill bg-clay px-1.5 font-extrabold text-[11px] text-on-clay',
                        collapsed ? 'absolute -top-1 -right-1 ring-2 ring-surface' : 'ml-auto',
                      )}
                    >
                      {badge}
                      {!collapsed && <span className="sr-only"> unread</span>}
                    </span>
                  )}
                </Link>
              )
              return collapsed ? (
                <span key={to} className="flex justify-center">
                  <Tooltip label={label} side="right">
                    {link}
                  </Tooltip>
                </span>
              ) : (
                link
              )
            })}
          </div>
        )
      })}

      <div className="mt-auto border-border border-t pt-3">
        <UserMenu me={me} collapsed={collapsed} onSignOut={onSignOut} />
      </div>
    </nav>
  )
}

function AdminLayout() {
  const { me } = Route.useRouteContext()
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  // The name can change on the settings page: follow the cached "me", not the route context.
  const current = useQuery(meQuery).data ?? me

  async function signOut() {
    await authClient.signOut()
    queryClient.clear()
    forgetLocalData()
    await navigate({ to: '/login' })
  }

  function toggle() {
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSED_KEY, c ? '0' : '1')
      } catch {
        // Not remembered in private mode; fine.
      }
      return !c
    })
  }

  // Close the phone drawer after navigating.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs on route change
  useEffect(() => setOpen(false), [pathname])

  return (
    <div className="min-h-dvh bg-bg lg:flex">
      <motion.aside
        initial={false}
        animate={{ width: collapsed ? 76 : 264 }}
        transition={{ type: 'spring', stiffness: 380, damping: 38 }}
        className="sticky top-0 hidden h-dvh shrink-0 overflow-hidden border-border border-r bg-surface lg:block"
      >
        <Sidebar
          me={current}
          pathname={pathname}
          collapsed={collapsed}
          onToggle={toggle}
          onSignOut={signOut}
        />
      </motion.aside>

      <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-border border-b bg-surface/95 px-4 pt-safe pb-3 backdrop-blur lg:hidden">
        <Logo size="sm" />
        <div className="flex items-center gap-2">
          <Link to="/settings" aria-label="Settings" className="rounded-full">
            <Avatar name={current.name} />
          </Link>
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Open menu"
            className="grid size-11 place-items-center rounded-sm bg-surface-raised"
          >
            <Menu className="size-5" aria-hidden />
          </button>
        </div>
      </header>

      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-30 lg:hidden">
            <motion.button
              type="button"
              aria-label="Close menu"
              className="absolute inset-0 bg-scrim"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
            />
            <motion.aside
              className="absolute inset-y-0 left-0 w-[280px] bg-surface pt-safe pb-safe shadow-float"
              initial={{ x: -300 }}
              animate={{ x: 0 }}
              exit={{ x: -300 }}
              transition={{ type: 'spring', stiffness: 320, damping: 32 }}
            >
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close menu"
                className="absolute top-4 right-3 z-10 grid size-10 place-items-center rounded-sm text-ink-muted"
              >
                <X className="size-5" aria-hidden />
              </button>
              <Sidebar me={current} pathname={pathname} collapsed={false} onSignOut={signOut} />
            </motion.aside>
          </div>
        )}
      </AnimatePresence>

      <main className="w-full min-w-0 flex-1 px-4 py-6 md:px-8 lg:px-12 lg:py-10">
        <Outlet />
      </main>
    </div>
  )
}

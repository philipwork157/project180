import { getThemePreference, setThemePreference, type ThemePreference } from '@project180/client'
import { type Me, ROLE_LABELS } from '@project180/shared'
import { cn } from '@project180/ui'
import { Link } from '@tanstack/react-router'
import { ChevronsUpDown, LogOut, Monitor, Moon, Settings, Smartphone, Sun } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { APP_URL } from '../urls'

const THEMES: Array<{ value: ThemePreference; label: string; icon: typeof Sun }> = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
]

/** Light / dark / follow the computer. Remembered on this device. */
export function ThemeSwitch({ compact = false }: { compact?: boolean }) {
  const [theme, setTheme] = useState(getThemePreference)
  return (
    <fieldset
      aria-label="Theme"
      className="grid grid-cols-3 gap-1 rounded-md bg-surface-raised p-1"
    >
      {THEMES.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          aria-pressed={theme === value}
          onClick={() => {
            setTheme(value)
            setThemePreference(value)
          }}
          className={cn(
            'flex min-w-0 items-center justify-center rounded-sm font-bold transition',
            compact ? 'h-9 flex-col gap-0.5 text-[11px] leading-none' : 'h-10 gap-1.5 text-[14px]',
            theme === value ? 'bg-surface text-ink shadow-card' : 'text-ink-muted hover:text-ink',
          )}
        >
          <Icon className={compact ? 'size-3.5' : 'size-4'} aria-hidden />
          {label}
        </button>
      ))}
    </fieldset>
  )
}

export function Avatar({ name, className }: { name: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'grid size-9 shrink-0 place-items-center rounded-full bg-brand-soft font-display font-extrabold text-[15px] text-brand-text',
        className,
      )}
    >
      {name.charAt(0).toUpperCase()}
    </span>
  )
}

const menuItem =
  'flex h-10 w-full items-center gap-3 rounded-sm px-3 text-left font-semibold text-[14px] text-ink transition hover:bg-surface-raised'

/**
 * The signed-in person at the bottom of the sidebar. Opens a menu upwards with settings,
 * the theme, the phone app and sign out.
 */
export function UserMenu({
  me,
  collapsed,
  onSignOut,
}: {
  me: Me
  collapsed: boolean
  onSignOut: () => void
}) {
  const [open, setOpen] = useState(false)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const button = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node
      if (!button.current?.contains(t) && !menu.current?.contains(t)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    const close = () => setOpen(false)
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('resize', close)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', close)
    }
  }, [open])

  return (
    <div>
      {createPortal(
        <AnimatePresence>
          {open && rect && (
            <motion.div
              ref={menu}
              role="menu"
              // Fixed to the page so the (clipped, animating) sidebar never cuts it off.
              style={{
                position: 'fixed',
                bottom: window.innerHeight - rect.top + 8,
                left: collapsed ? rect.right + 8 : rect.left,
                width: collapsed ? 256 : rect.width,
              }}
              initial={{ opacity: 0, y: 8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              transition={{ duration: 0.16, ease: 'easeOut' }}
              className="z-50 flex flex-col gap-1 rounded-lg border border-border bg-surface p-2 shadow-float"
            >
              <div className="flex items-center gap-3 px-2 pt-1 pb-3">
                <Avatar name={me.name} />
                <div className="min-w-0">
                  <p className="truncate font-bold text-[14px]">{me.name}</p>
                  <p className="truncate text-[12px] text-ink-muted">{me.email}</p>
                </div>
              </div>
              <div className="px-1 pb-2">
                <ThemeSwitch compact />
              </div>
              <div className="border-border border-t pt-1">
                <Link
                  to="/settings"
                  role="menuitem"
                  className={menuItem}
                  onClick={() => setOpen(false)}
                >
                  <Settings className="size-4 text-ink-muted" aria-hidden />
                  Settings
                </Link>
                <a href={APP_URL} role="menuitem" className={menuItem}>
                  <Smartphone className="size-4 text-ink-muted" aria-hidden />
                  Open the phone app
                </a>
                <button
                  type="button"
                  role="menuitem"
                  onClick={onSignOut}
                  className={cn(menuItem, 'text-danger hover:bg-danger/10')}
                >
                  <LogOut className="size-4" aria-hidden />
                  Sign out
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}

      <button
        ref={button}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={collapsed ? `${me.name}: open menu` : undefined}
        onClick={() => {
          setRect(button.current?.getBoundingClientRect() ?? null)
          setOpen((v) => !v)
        }}
        className={cn(
          'flex w-full items-center gap-3 rounded-md p-2 text-left transition hover:bg-surface-raised',
          open && 'bg-surface-raised',
          collapsed && 'justify-center',
        )}
      >
        <Avatar name={me.name} />
        {!collapsed && (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-bold text-[14px] leading-5">{me.name}</span>
              <span className="block truncate text-[12px] text-ink-muted leading-4">
                {ROLE_LABELS[me.role]} · Admin
              </span>
            </span>
            <ChevronsUpDown className="size-4 shrink-0 text-ink-muted" aria-hidden />
          </>
        )}
      </button>
    </div>
  )
}

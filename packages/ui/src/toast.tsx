import { Check, CircleAlert, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useSyncExternalStore } from 'react'
import { cn } from './cn'

export interface ToastOptions {
  title: string
  description?: string
  tone?: 'success' | 'error' | 'info'
  /** ms before it hides itself. */
  duration?: number
  /** One button, e.g. Undo. Gives the toast more time (7 seconds). */
  action?: { label: string; onClick: () => void }
}

interface ToastItem extends Required<Omit<ToastOptions, 'description' | 'action'>> {
  id: number
  description?: string
  action?: ToastOptions['action']
}

let items: ToastItem[] = []
let nextId = 1
const listeners = new Set<() => void>()
const emit = () => {
  for (const l of listeners) l()
}

/** Show a toast in the bottom-right corner. Needs one <Toaster /> on the page. */
export function toast(options: ToastOptions | string) {
  const o = typeof options === 'string' ? { title: options } : options
  const item: ToastItem = { id: nextId++, tone: 'success', duration: o.action ? 7000 : 3200, ...o }
  items = [...items.slice(-3), item]
  emit()
  return item.id
}

export function dismissToast(id: number) {
  items = items.filter((t) => t.id !== id)
  emit()
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

const TONE = {
  success: { badge: 'bg-lime text-on-lime', bar: 'bg-lime', icon: Check },
  error: { badge: 'bg-danger text-on-danger', bar: 'bg-danger', icon: CircleAlert },
  info: { badge: 'bg-brand text-on-brand', bar: 'bg-brand', icon: Check },
} as const

/** Mount once near the root. Bottom-right on wide screens, bottom-centre on phones. */
export function Toaster() {
  const list = useSyncExternalStore(
    subscribe,
    () => items,
    () => items,
  )
  return (
    <section
      aria-label="Notifications"
      className="pointer-events-none fixed inset-x-4 bottom-4 z-[70] flex flex-col items-center gap-2 sm:inset-x-auto sm:right-6 sm:bottom-6 sm:items-end"
    >
      <AnimatePresence initial={false}>
        {list.map((t) => (
          <ToastCard key={t.id} item={t} />
        ))}
      </AnimatePresence>
    </section>
  )
}

function ToastCard({ item }: { item: ToastItem }) {
  useEffect(() => {
    const id = setTimeout(() => dismissToast(item.id), item.duration)
    return () => clearTimeout(id)
  }, [item.id, item.duration])
  const tone = TONE[item.tone]
  const Icon = tone.icon
  return (
    <motion.div
      layout
      role={item.tone === 'error' ? 'alert' : 'status'}
      initial={{ opacity: 0, x: 40, scale: 0.95 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 40, scale: 0.95, transition: { duration: 0.18 } }}
      transition={{ type: 'spring', stiffness: 480, damping: 34 }}
      className="pointer-events-auto relative flex w-full max-w-sm items-start gap-3 overflow-hidden rounded-lg bg-surface p-4 pr-3 shadow-float ring-1 ring-border sm:w-96"
    >
      <motion.span
        initial={{ scale: 0.4 }}
        animate={{ scale: [0.4, 1.15, 1] }}
        transition={{ duration: 0.4, delay: 0.05 }}
        className={cn('grid size-8 shrink-0 place-items-center rounded-full', tone.badge)}
      >
        <Icon className="size-[18px]" strokeWidth={3} aria-hidden />
      </motion.span>
      <div className="min-w-0 flex-1 pt-1">
        <p className="font-bold text-[15px] leading-5">{item.title}</p>
        {item.description && (
          <p className="mt-0.5 text-[14px] text-ink-muted">{item.description}</p>
        )}
      </div>
      {item.action && (
        <button
          type="button"
          onClick={() => {
            item.action?.onClick()
            dismissToast(item.id)
          }}
          className="h-8 shrink-0 self-center rounded-sm px-3 font-bold text-[14px] text-brand-text transition hover:bg-brand-soft"
        >
          {item.action.label}
        </button>
      )}
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => dismissToast(item.id)}
        className="grid size-8 shrink-0 place-items-center rounded-sm text-ink-muted transition hover:bg-surface-raised hover:text-ink"
      >
        <X className="size-4" aria-hidden />
      </button>
      <motion.span
        aria-hidden
        className={cn('absolute bottom-0 left-0 h-[3px] w-full origin-left', tone.bar)}
        initial={{ scaleX: 1 }}
        animate={{ scaleX: 0 }}
        transition={{ duration: item.duration / 1000, ease: 'linear' }}
      />
    </motion.div>
  )
}

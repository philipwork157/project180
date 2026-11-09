import { X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { type ReactNode, useEffect } from 'react'

/**
 * A panel that slides in from the right for adding or editing one thing,
 * so the list behind it keeps the full width. Escape or the scrim closes it.
 */
export function Drawer({
  open,
  onClose,
  title,
  description,
  footer,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  footer?: ReactNode
  children: ReactNode
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <div
          className="fixed inset-0 z-50 flex justify-end"
          role="dialog"
          aria-modal
          aria-label={title}
        >
          <motion.button
            type="button"
            aria-label="Close panel"
            className="absolute inset-0 bg-scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.aside
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 38 }}
            className="relative flex h-full w-full max-w-[480px] flex-col bg-surface shadow-float"
          >
            <header className="flex items-start gap-3 border-border border-b px-6 pt-6 pb-5">
              <div className="min-w-0 flex-1">
                <h2 className="font-display font-extrabold text-[24px] leading-7 tracking-tight">
                  {title}
                </h2>
                {description && <p className="mt-1 text-[14px] text-ink-muted">{description}</p>}
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="grid size-10 shrink-0 place-items-center rounded-sm text-ink-muted transition hover:bg-surface-raised hover:text-ink"
              >
                <X className="size-5" aria-hidden />
              </button>
            </header>
            <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
            {footer && (
              <footer className="flex items-center justify-end gap-3 border-border border-t px-6 py-4">
                {footer}
              </footer>
            )}
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  )
}

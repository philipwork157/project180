import { cn, IconButton } from '@project180/ui'
import { X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { type ReactNode, useEffect, useState } from 'react'

/**
 * A bottom sheet that rises with a spring over a scrim. Closes with the round button in its
 * top-right corner, a tap outside, or Esc.
 *
 * The handle and close button sit in their own bar that never scrolls; only the content below it
 * scrolls, so nothing ever slides under the close button. A hairline shows under the bar once
 * the content has scrolled.
 */
export function Sheet({
  open,
  onClose,
  label,
  children,
}: {
  open: boolean
  onClose: () => void
  label: string
  children: ReactNode
}) {
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    if (!open) setScrolled(false)
  }, [open])
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
          className="fixed inset-0 z-40 flex items-end justify-center"
          role="dialog"
          aria-modal
          aria-label={label}
        >
          {/* Tapping outside closes too; the round button is the one screen readers get. */}
          <motion.button
            type="button"
            aria-hidden
            tabIndex={-1}
            className="absolute inset-0 bg-scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="relative flex max-h-[88dvh] w-full flex-col overflow-hidden rounded-t-xl bg-surface shadow-float"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 36 }}
          >
            <div
              className={cn(
                'relative flex shrink-0 items-start justify-end border-b px-5 pt-2 pb-1 transition-colors md:px-8 lg:px-12',
                scrolled ? 'border-border' : 'border-transparent',
              )}
            >
              <div className="-translate-x-1/2 absolute top-2 left-1/2 h-1.5 w-10 rounded-full bg-border" />
              <IconButton
                label="Close"
                icon={<X aria-hidden />}
                size="lg"
                className="rounded-full [&_svg]:size-5"
                onClick={onClose}
              />
            </div>
            <div
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-safe md:px-8 lg:px-12"
              onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 0)}
            >
              {children}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}

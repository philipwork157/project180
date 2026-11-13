import { IconButton } from '@project180/ui'
import { X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { type ReactNode, useEffect } from 'react'

/**
 * A bottom sheet that rises with a spring over a scrim. Closes with the round button in its
 * top-right corner, a tap outside, or Esc.
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
            className="relative max-h-[88dvh] w-full overflow-y-auto rounded-t-xl bg-surface px-5 pt-3 pb-safe shadow-float md:px-8 lg:px-12"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 36 }}
          >
            {/* Takes no room, and stays in the corner while the sheet's content scrolls. */}
            <div className="sticky top-3 z-10 h-0">
              <div className="absolute top-0 right-0">
                <IconButton
                  label="Close"
                  icon={<X aria-hidden />}
                  size="lg"
                  className="rounded-full [&_svg]:size-5"
                  onClick={onClose}
                />
              </div>
            </div>
            <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-border" />
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}

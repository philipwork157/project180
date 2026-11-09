import { AnimatePresence, motion } from 'motion/react'
import type { ReactNode } from 'react'

/** A bottom sheet that rises with a spring over a scrim. */
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
  return (
    <AnimatePresence>
      {open && (
        <div
          className="fixed inset-0 z-40 flex items-end justify-center"
          role="dialog"
          aria-modal
          aria-label={label}
        >
          <motion.button
            type="button"
            aria-label="Close"
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
            <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-border" />
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}

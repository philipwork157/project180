import { AnimatePresence, motion } from 'motion/react'
import { type ReactNode, useEffect } from 'react'
import { Button } from './button'

/** A centred "are you sure?" for actions that can't be undone. */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  cancelLabel = 'Cancel',
  tone = 'danger',
  loading = false,
  confirmDisabled = false,
  hideConfirm = false,
  extraAction,
  onConfirm,
  onClose,
}: {
  open: boolean
  title: string
  children?: ReactNode
  confirmLabel: string
  cancelLabel?: string
  tone?: 'danger' | 'primary'
  loading?: boolean
  confirmDisabled?: boolean
  /** Only a close button: for "you can't do this yet, here's why". */
  hideConfirm?: boolean
  /** e.g. an "Archive instead" button. */
  extraAction?: ReactNode
  onConfirm: () => void
  onClose: () => void
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
          className="fixed inset-0 z-[60] grid place-items-center p-4"
          role="alertdialog"
          aria-modal
          aria-label={title}
        >
          <motion.button
            type="button"
            aria-label="Cancel"
            className="absolute inset-0 bg-scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ type: 'spring', stiffness: 420, damping: 32 }}
            className="relative w-full max-w-md rounded-xl bg-surface p-6 shadow-float"
          >
            <h2 className="font-display font-extrabold text-[22px] leading-7">{title}</h2>
            {children && <div className="mt-2 text-[15px] text-ink-muted">{children}</div>}
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <Button variant="ghost" onClick={onClose}>
                {cancelLabel}
              </Button>
              {extraAction}
              {!hideConfirm && (
                <Button
                  variant={tone}
                  loading={loading}
                  disabled={confirmDisabled}
                  onClick={onConfirm}
                >
                  {confirmLabel}
                </Button>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}

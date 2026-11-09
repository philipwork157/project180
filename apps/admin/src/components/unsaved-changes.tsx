import { ConfirmDialog } from '@project180/ui'
import { useBlocker } from '@tanstack/react-router'
import { useRef } from 'react'

/**
 * Asks before leaving a page with unsaved changes, in our own dialog (links, the back button,
 * the sidebar). Closing or reloading the tab can only show the browser's own warning.
 * Returns `allowLeave()`: call it right before navigating away on purpose (after delete or archive).
 */
export function useUnsavedChangesGuard(dirty: boolean, what: string) {
  const leaving = useRef(false)
  const dirtyRef = useRef(dirty)
  dirtyRef.current = dirty
  const blocker = useBlocker({
    // Saving a new item moves from /new to its own page: that is not leaving.
    shouldBlockFn: ({ current, next }) =>
      dirtyRef.current &&
      !leaving.current &&
      !(current.pathname.endsWith('/new') && next.routeId === current.routeId),
    enableBeforeUnload: () => dirtyRef.current && !leaving.current,
    withResolver: true,
  })
  const dialog = (
    <ConfirmDialog
      open={blocker.status === 'blocked'}
      title="Leave without saving?"
      confirmLabel="Leave without saving"
      cancelLabel="Keep editing"
      onConfirm={() => blocker.proceed?.()}
      onClose={() => blocker.reset?.()}
    >
      You have changes to this {what} that aren’t saved yet. If you leave now, they’re lost.
    </ConfirmDialog>
  )
  return {
    dialog,
    allowLeave: () => {
      leaving.current = true
    },
  }
}

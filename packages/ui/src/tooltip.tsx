import { type ReactNode, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

const GAP = 8
const EDGE = 8

/**
 * A short label shown on hover or keyboard focus. It renders at the top level
 * of the page so no card or scroll area can clip it, flips below when there's
 * no room above, and slides inwards at the window edges.
 */
export function Tooltip({
  label,
  side = 'top',
  children,
}: {
  label: string
  side?: 'top' | 'bottom' | 'right'
  children: ReactNode
}) {
  const trigger = useRef<HTMLSpanElement>(null)
  const tip = useRef<HTMLSpanElement>(null)
  const id = useId()
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  // `label` is listed on purpose: a new label changes the tip's size, so it must be measured again.
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-measure when the label changes
  useLayoutEffect(() => {
    if (!open || !trigger.current || !tip.current) return
    const r = trigger.current.getBoundingClientRect()
    const t = tip.current.getBoundingClientRect()
    if (side === 'right') {
      // Beside the control (collapsed sidebar), vertically centred.
      setPos({ top: r.top + r.height / 2 - t.height / 2, left: r.right + GAP })
      return
    }
    let place = side
    if (place === 'top' && r.top - t.height - GAP < EDGE) place = 'bottom'
    else if (place === 'bottom' && r.bottom + t.height + GAP > window.innerHeight - EDGE)
      place = 'top'
    const top = place === 'top' ? r.top - t.height - GAP : r.bottom + GAP
    const centred = r.left + r.width / 2 - t.width / 2
    const left = Math.max(EDGE, Math.min(centred, window.innerWidth - t.width - EDGE))
    setPos({ top, left })
  }, [open, side, label])

  // Hide while scrolling or resizing; it would otherwise float away from its button.
  useEffect(() => {
    if (!open) return
    const hide = () => setOpen(false)
    window.addEventListener('scroll', hide, true)
    window.addEventListener('resize', hide)
    return () => {
      window.removeEventListener('scroll', hide, true)
      window.removeEventListener('resize', hide)
    }
  }, [open])

  const show = () => {
    setPos(null)
    setOpen(true)
  }
  const hide = () => setOpen(false)

  return (
    // The wrapper only listens for hover/focus bubbling up from the real control inside it.
    // biome-ignore lint/a11y/noStaticElementInteractions: the focusable child is the control
    <span
      ref={trigger}
      className="inline-flex"
      onPointerEnter={show}
      onPointerLeave={hide}
      onFocus={show}
      onBlur={hide}
      aria-describedby={open ? id : undefined}
    >
      {children}
      {open &&
        createPortal(
          <span
            ref={tip}
            id={id}
            role="tooltip"
            style={{ position: 'fixed', top: pos?.top ?? -9999, left: pos?.left ?? -9999 }}
            className="pointer-events-none z-[100] max-w-xs rounded-sm bg-ink px-2.5 py-1.5 font-bold text-[12px] text-bg leading-4 shadow-float"
          >
            {label}
          </span>,
          document.body,
        )}
    </span>
  )
}

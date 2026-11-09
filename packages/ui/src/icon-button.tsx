import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from './cn'
import { Tooltip } from './tooltip'

/**
 * The only way to make an icon-only action. Square, always visible, with a
 * tooltip on hover/focus and the same words as its aria-label.
 */
export function IconButton({
  label,
  icon,
  size = 'md',
  tone = 'default',
  active = false,
  className,
  type = 'button',
  ...rest
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  /** What it does, e.g. "Archive exercise". Shown as the tooltip. */
  label: string
  icon: ReactNode
  /** sm = 36px (in dense rows), md = 40px, lg = 44px (page headers). */
  size?: 'sm' | 'md' | 'lg'
  tone?: 'default' | 'danger'
  active?: boolean
}) {
  return (
    <Tooltip label={label}>
      <button
        type={type}
        aria-label={label}
        className={cn(
          'grid shrink-0 place-items-center rounded-sm text-ink-muted transition active:scale-95',
          'hover:bg-surface-raised hover:text-ink disabled:pointer-events-none disabled:opacity-40',
          '[&_svg]:size-[18px]',
          size === 'sm' && 'size-9',
          size === 'md' && 'size-10',
          size === 'lg' && 'size-11 bg-surface-raised',
          tone === 'danger' && 'hover:bg-danger/10 hover:text-danger',
          active && 'bg-brand-soft text-brand-text',
          className,
        )}
        {...rest}
      >
        {icon}
      </button>
    </Tooltip>
  )
}

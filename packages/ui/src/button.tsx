import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from './cn'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'lime' | 'danger'
export type ButtonSize = 'sm' | 'md' | 'lg'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** primary = the one main action on a screen; lime = finish / complete. */
  variant?: ButtonVariant
  size?: ButtonSize
  block?: boolean
  icon?: ReactNode
  loading?: boolean
}

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-brand text-on-brand shadow-brand hover:bg-brand-pressed',
  secondary:
    'bg-surface text-ink ring-[1.5px] ring-inset ring-border-strong hover:bg-surface-raised',
  ghost: 'bg-transparent text-brand-text hover:bg-brand-soft',
  lime: 'bg-lime text-on-lime',
  danger: 'bg-danger text-on-danger',
}

const sizes: Record<ButtonSize, string> = {
  sm: 'h-9 px-4 text-sm rounded-sm',
  md: 'h-11 px-5 text-[15px] rounded-md',
  lg: 'h-14 px-6 text-[17px] rounded-lg',
}

export function buttonClasses(
  variant: ButtonVariant = 'primary',
  size: ButtonSize = 'md',
  block = false,
): string {
  return cn(
    'inline-flex select-none items-center justify-center gap-2 font-bold tracking-[-0.005em] transition',
    'duration-150 active:scale-[0.96] disabled:pointer-events-none disabled:opacity-45',
    variants[variant],
    sizes[size],
    block && 'w-full',
  )
}

export function Button({
  variant = 'primary',
  size = 'md',
  block = false,
  icon,
  loading = false,
  className,
  children,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(buttonClasses(variant, size, block), className)}
      {...rest}
    >
      {loading ? <Spinner /> : icon}
      {children}
    </button>
  )
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-block size-4 animate-spin rounded-full border-2 border-current border-r-transparent',
        className,
      )}
    />
  )
}

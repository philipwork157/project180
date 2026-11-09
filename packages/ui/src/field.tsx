import { Eye, EyeOff } from 'lucide-react'
import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react'
import { useId, useState } from 'react'
import { cn } from './cn'

const control =
  'w-full rounded-sm bg-surface-raised px-3 text-[15px] text-ink outline-none ring-1 ring-inset ' +
  'ring-border-strong transition placeholder:text-ink-muted focus:ring-2 focus:ring-brand'

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string
  hint?: string
  error?: string
  children: (id: string) => ReactNode
}) {
  const id = useId()
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="font-bold text-[13px] text-ink">
        {label}
      </label>
      {children(id)}
      {error ? (
        <p role="alert" className="font-semibold text-[13px] text-danger">
          {error}
        </p>
      ) : hint ? (
        <p className="font-semibold text-[13px] text-ink-muted">{hint}</p>
      ) : null}
    </div>
  )
}

/** `compact` = 40px, for dense rows such as the workout builder. Default is 44px. */
export function Input({
  className,
  compact = false,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { compact?: boolean }) {
  return <input className={cn(control, compact ? 'h-10' : 'h-11', className)} {...rest} />
}

/**
 * A password field with an eye button to show or hide what's typed.
 * The button is a 44px target inside the right edge and keeps focus in the field.
 */
export function PasswordInput({
  className,
  compact = false,
  ...rest
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { compact?: boolean }) {
  const [visible, setVisible] = useState(false)
  return (
    <span className="relative block">
      <input
        type={visible ? 'text' : 'password'}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        className={cn(
          control,
          compact ? 'h-10' : 'h-11',
          'pr-12 [&::-ms-reveal]:hidden',
          className,
        )}
        {...rest}
      />
      <button
        type="button"
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
        title={visible ? 'Hide password' : 'Show password'}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setVisible((v) => !v)}
        className={cn(
          'absolute top-0 right-0 grid place-items-center rounded-r-sm text-ink-muted transition hover:text-ink',
          'focus-visible:outline-offset-[-3px]',
          compact ? 'size-10' : 'size-11',
        )}
      >
        {visible ? (
          <EyeOff className="size-[18px]" aria-hidden />
        ) : (
          <Eye className="size-[18px]" aria-hidden />
        )}
      </button>
    </span>
  )
}

/**
 * A native select with the browser's arrow removed and our own chevron drawn
 * inside the field: 16px, 12px from the right edge, with 40px of right padding
 * so long option text never runs under it.
 */
export function Select({
  className,
  compact = false,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & { compact?: boolean }) {
  return (
    <span className="relative block">
      <select
        className={cn(
          control,
          compact ? 'h-10' : 'h-11',
          'cursor-pointer appearance-none pr-10',
          className,
        )}
        {...rest}
      />
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
        className="-translate-y-1/2 pointer-events-none absolute top-1/2 right-3 size-4 text-ink-muted"
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </span>
  )
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(control, 'min-h-24 py-2.5', className)} {...rest} />
}

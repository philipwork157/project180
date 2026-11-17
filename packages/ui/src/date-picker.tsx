import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useId, useRef, useState } from 'react'
import { DayPicker, type DropdownProps } from 'react-day-picker'
import { cn } from './cn'
import { Select } from './field'

/** 'YYYY-MM-DD' ↔ a local Date at midnight (no time-zone drift). */
function Chevron({ orientation }: { orientation?: 'up' | 'down' | 'left' | 'right' }) {
  return orientation === 'left' ? (
    <ChevronLeft className="size-5" aria-hidden />
  ) : (
    <ChevronRight className="size-5" aria-hidden />
  )
}

/** Month and year jumps in the calendar use our Select (chevron drawn inside, no browser arrow). */
function CalendarDropdown({ options, className, ...rest }: DropdownProps) {
  return (
    <span className={className}>
      <Select compact {...rest} className="font-bold">
        {options?.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
      </Select>
    </span>
  )
}

function fromIso(value: string | null | undefined): Date | undefined {
  if (!value) return undefined
  const [y, m, d] = value.split('-').map(Number)
  return y && m && d ? new Date(y, m - 1, d) : undefined
}

function toIso(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function todayDate() {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate())
}

/** The coming Monday, or today if it is Monday. */
function nextMonday() {
  const d = todayDate()
  d.setDate(d.getDate() + ((8 - d.getDay()) % 7))
  return d
}

const birthFormat = new Intl.DateTimeFormat('en-ZA', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})
const shortMonth = new Intl.DateTimeFormat('en-ZA', { month: 'short' })

function ageOn(birth: Date, today: Date) {
  const before =
    today.getMonth() < birth.getMonth() ||
    (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())
  return today.getFullYear() - birth.getFullYear() - (before ? 1 : 0)
}

/** Calendar settings for a date of birth: dropdowns, newest year first, nothing after today. */
function birthOptions(today: Date) {
  return {
    captionLayout: 'dropdown' as const,
    reverseYears: true,
    startMonth: new Date(today.getFullYear() - 100, 0, 1),
    endMonth: today,
    disabled: { after: today },
    formatters: { formatMonthDropdown: (d: Date) => shortMonth.format(d) },
  }
}

const longFormat = new Intl.DateTimeFormat('en-ZA', {
  weekday: 'short',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

/**
 * A date field that opens a calendar. Value is a 'YYYY-MM-DD' string.
 * Weeks start on Monday; Today and Next Monday are one tap away.
 * `birth`: for dates of birth. Month and year dropdowns (years back are one pick away), no
 * future dates, opens around 30 years ago, and the field shows the age. `onClear` adds Clear.
 */
export function DatePicker({
  id,
  value,
  onChange,
  placeholder = 'Pick a date',
  compact = false,
  birth = false,
  onClear,
  className,
}: {
  id?: string
  value: string | null
  onChange: (value: string) => void
  placeholder?: string
  compact?: boolean
  birth?: boolean
  onClear?: () => void
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const wrapper = useRef<HTMLDivElement>(null)
  const dialogId = useId()
  const selected = fromIso(value)
  const today = todayDate()
  const startAt = () =>
    selected ?? (birth ? new Date(today.getFullYear() - 30, today.getMonth(), 1) : today)
  const [month, setMonth] = useState<Date>(startAt)

  // Close on outside click and Escape.
  useEffect(() => {
    if (!open) return
    const onPointer = (e: PointerEvent) => {
      if (wrapper.current && !wrapper.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  function pick(date: Date) {
    onChange(toIso(date))
    setMonth(date)
    setOpen(false)
  }

  const quick =
    'h-8 rounded-pill px-3 font-bold text-[13px] bg-brand-soft text-brand-text hover:ring-2 hover:ring-brand'

  return (
    <div ref={wrapper} className={cn('relative', className)}>
      <button
        id={id}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={dialogId}
        onClick={() => {
          setMonth(startAt())
          setOpen(!open)
        }}
        className={cn(
          'flex w-full items-center gap-3 rounded-sm bg-surface-raised px-3 text-left text-[15px] outline-none ring-1 ring-border-strong ring-inset transition focus-visible:ring-2 focus-visible:ring-brand',
          compact ? 'h-10' : 'h-11',
          open && 'ring-2 ring-brand',
        )}
      >
        <CalendarDays className="size-4 shrink-0 text-ink-muted" aria-hidden />
        <span className={cn('flex-1 truncate', selected ? 'text-ink' : 'text-ink-muted')}>
          {selected ? (birth ? birthFormat : longFormat).format(selected) : placeholder}
        </span>
        {birth && selected && (
          <span className="tabular shrink-0 font-semibold text-[13px] text-ink-muted">
            {ageOn(selected, today)} yrs
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            id={dialogId}
            role="dialog"
            aria-label="Choose a date"
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 left-0 z-40 mt-2 min-w-[300px] rounded-lg bg-surface p-3 shadow-float ring-1 ring-border"
          >
            <DayPicker
              mode="single"
              required
              selected={selected}
              onSelect={pick}
              month={month}
              onMonthChange={setMonth}
              weekStartsOn={1}
              {...(birth ? birthOptions(today) : {})}
              showOutsideDays
              fixedWeeks
              classNames={{
                root: 'relative w-full',
                months: 'w-full',
                month: 'w-full',
                month_caption: cn('flex items-center', birth ? 'h-10 pr-20' : 'h-9 px-2'),
                dropdowns: 'flex min-w-0 items-center gap-2',
                months_dropdown: 'w-[6.5rem]',
                years_dropdown: 'w-[6rem]',
                caption_label: 'font-display font-extrabold text-[17px] text-ink',
                nav: cn('absolute right-0 flex gap-1', birth ? 'top-0.5' : 'top-0'),
                button_previous:
                  'grid size-9 place-items-center rounded-sm text-ink-muted hover:bg-surface-raised hover:text-ink disabled:opacity-40',
                button_next:
                  'grid size-9 place-items-center rounded-sm text-ink-muted hover:bg-surface-raised hover:text-ink disabled:opacity-40',
                month_grid: 'mt-2 w-full border-collapse',
                weekdays: '',
                weekday:
                  'pb-1 text-center font-extrabold text-[11px] text-ink-muted uppercase tracking-wide',
                week: '',
                day: 'p-0.5 text-center',
                day_button:
                  'tabular mx-auto grid size-10 place-items-center rounded-full font-bold text-[14px] text-ink transition hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-brand',
                today:
                  'text-brand-text [&>button]:ring-2 [&>button]:ring-brand [&>button]:ring-inset',
                selected:
                  '[&>button]:bg-brand [&>button]:text-on-brand [&>button]:hover:bg-brand-pressed',
                outside: '[&>button]:text-ink-muted/50',
                disabled: '[&>button]:opacity-40 [&>button]:pointer-events-none',
                hidden: 'invisible',
              }}
              components={{ Chevron, Dropdown: CalendarDropdown }}
            />
            {birth ? (
              <div className="mt-2 flex items-center gap-3 border-border border-t pt-3">
                <p className="flex-1 text-[13px] text-ink-muted">
                  Pick the year and month, then the day.
                </p>
                {onClear && selected && (
                  <button
                    type="button"
                    className={quick}
                    onClick={() => {
                      onClear()
                      setOpen(false)
                    }}
                  >
                    Clear
                  </button>
                )}
              </div>
            ) : (
              <div className="mt-2 flex gap-2 border-border border-t pt-3">
                <button type="button" className={quick} onClick={() => pick(todayDate())}>
                  Today
                </button>
                <button type="button" className={quick} onClick={() => pick(nextMonday())}>
                  Next Monday
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

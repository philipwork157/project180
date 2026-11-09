import { cn } from './cn'

/**
 * The Project 180 mark: a forward-leaning P whose bowl is a 180° arc in lime.
 * The stem takes the text colour, so it works on light and dark grounds.
 */
export function LogoMark({ className, title }: { className?: string; title?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={cn('size-9 shrink-0', className)}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <g transform="translate(9.5 0) skewX(-12)">
        <rect x="10" y="8" width="11" height="48" rx="2.5" fill="currentColor" />
        <path
          fill="var(--lime)"
          d="M23.5 8 H30 A16 16 0 0 1 30 40 H28 L24 30 H30 A6 6 0 0 0 30 18 H23.5 Z"
        />
      </g>
    </svg>
  )
}

/** The app icon: the mark on a charcoal tile. Same in both themes. */
export function AppIcon({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'grid size-10 shrink-0 place-items-center rounded-[28%] bg-[#202321] text-[#f5f3ed]',
        className,
      )}
    >
      <LogoMark className="size-[78%]" />
    </span>
  )
}

/** "PROJECT" tracked small over a heavy italic 180. */
export function Wordmark({
  className,
  size = 'md',
}: {
  className?: string
  size?: 'sm' | 'md' | 'xl'
}) {
  return (
    <span className={cn('inline-flex flex-col font-display leading-none', className)}>
      <span
        className={cn(
          'font-bold uppercase',
          size === 'sm' && 'text-[8px] tracking-[0.42em]',
          size === 'md' && 'text-[10px] tracking-[0.44em]',
          size === 'xl' && 'text-[15px] tracking-[0.5em] md:text-[18px]',
        )}
      >
        Project
      </span>
      <span
        className={cn(
          'font-black italic tracking-[-0.04em]',
          size === 'sm' && 'mt-0.5 text-[20px]',
          size === 'md' && 'mt-0.5 text-[26px]',
          size === 'xl' && 'mt-1 text-[88px] md:text-[112px]',
        )}
      >
        180
      </span>
    </span>
  )
}

/** Mark | divider | wordmark. The everyday lockup for headers and the sidebar. */
export function Logo({ className, size = 'md' }: { className?: string; size?: 'sm' | 'md' }) {
  return (
    <span
      className={cn('inline-flex items-center gap-3 text-ink', className)}
      aria-label="Project 180"
      role="img"
    >
      <LogoMark className={size === 'sm' ? 'size-8' : 'size-10'} />
      <span
        aria-hidden
        className={cn('w-px self-stretch bg-current opacity-25', size === 'sm' ? 'my-1' : 'my-0.5')}
      />
      <Wordmark size={size} />
    </span>
  )
}

export const TAGLINE = ['Train', 'Fuel', 'Feel', 'Live'] as const

/** TRAIN. FUEL. FEEL. LIVE. with lime full stops. */
export function Tagline({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex flex-wrap gap-x-3 font-display font-extrabold text-[13px] uppercase tracking-[0.24em]',
        className,
      )}
    >
      {TAGLINE.map((word) => (
        <span key={word}>
          {word}
          <span className="text-lime">.</span>
        </span>
      ))}
    </span>
  )
}

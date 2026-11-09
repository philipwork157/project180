// Calendar days are plain 'YYYY-MM-DD' strings in the user's time zone.
// All arithmetic happens in UTC so daylight saving never shifts a day.

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/

export function isIsoDay(value: string): boolean {
  if (!ISO_DAY.test(value)) return false
  const d = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(value)
}

export function addDays(day: string, amount: number): string {
  if (!isIsoDay(day)) throw new Error(`Not a calendar day: ${day}`)
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + amount)
  return d.toISOString().slice(0, 10)
}

export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`)
  const b = Date.parse(`${to}T00:00:00Z`)
  return Math.round((b - a) / 86_400_000)
}

/** Today's date as 'YYYY-MM-DD' in an IANA time zone, e.g. 'Africa/Johannesburg'. */
const DEFAULT_ZONE = 'Africa/Johannesburg'
function safeZone(tz: string) {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz })
    return tz
  } catch {
    return DEFAULT_ZONE
  }
}

export function todayIn(timeZone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    // A bad stored zone must not break the plan (or a coach's overview of all clients).
    timeZone: safeZone(timeZone),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

/** 0 = Monday … 6 = Sunday. */
export function weekdayIndex(day: string): number {
  const jsDay = new Date(`${day}T00:00:00Z`).getUTCDay()
  return (jsDay + 6) % 7
}

import { formatDuration } from '@project180/shared'
import { useEffect, useState } from 'react'

/** A live "m:ss" (or "h:mm:ss") clock counting up from `since`. */
export function Elapsed({ since, className }: { since: string; className?: string }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])
  return (
    <span className={className ?? 'tabular'}>
      {formatDuration(Math.max(0, (now - Date.parse(since)) / 1000))}
    </span>
  )
}

import type { WeightUnit } from './enums'

const KG_PER_LB = 0.45359237

export function kgToLb(kg: number): number {
  return kg / KG_PER_LB
}

export function lbToKg(lb: number): number {
  return lb * KG_PER_LB
}

/** 42.5 → "42.5", 40 → "40". Stored values are kg; converts for display. */
export function formatWeight(kg: number, unit: WeightUnit = 'kg'): string {
  const value = unit === 'kg' ? kg : kgToLb(kg)
  const rounded = Math.round(value * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}

/** 2892 → "48:12", 3725 → "1:02:05". */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat('en-ZA', { maximumFractionDigits: 1 }).format(n)
}

/** A readable name for a browser's user agent: "iPhone · Safari", "Mac · Chrome", "Android · Chrome". */
export function deviceLabel(userAgent: string | null | undefined): string {
  const ua = userAgent ?? ''
  if (!ua) return 'Unknown device'
  const device = /iPhone/.test(ua)
    ? 'iPhone'
    : /iPad/.test(ua)
      ? 'iPad'
      : /Android/.test(ua)
        ? /Mobile/.test(ua)
          ? 'Android phone'
          : 'Android tablet'
        : /Macintosh|Mac OS X/.test(ua)
          ? 'Mac'
          : /Windows/.test(ua)
            ? 'Windows'
            : /CrOS/.test(ua)
              ? 'Chromebook'
              : /Linux/.test(ua)
                ? 'Linux'
                : 'Device'
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /SamsungBrowser/.test(ua)
      ? 'Samsung Internet'
      : /Firefox|FxiOS/.test(ua)
        ? 'Firefox'
        : /CriOS|Chrome\//.test(ua)
          ? 'Chrome'
          : /Safari\//.test(ua)
            ? 'Safari'
            : null
  return browser ? `${device} · ${browser}` : device
}

/** "Just now", "12 min ago", "3 h ago", "Yesterday", "4 days ago", or a date. */
export function timeAgo(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return 'Never'
  const ms = now.getTime() - new Date(iso).getTime()
  const min = Math.floor(ms / 60000)
  if (min < 2) return 'Just now'
  if (min < 60) return `${min} min ago`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h} h ago`
  const d = Math.floor(h / 24)
  if (d === 1) return 'Yesterday'
  if (d < 7) return `${d} days ago`
  return new Date(iso).toLocaleDateString('en-ZA', {
    day: 'numeric',
    month: 'short',
    year: d > 300 ? 'numeric' : undefined,
  })
}

/** Seconds as "1 h 25 m", "40 m", or "0 m". */
export function durationShort(seconds: number): string {
  const m = Math.round(seconds / 60)
  if (m < 60) return `${m} m`
  const h = Math.floor(m / 60)
  return m % 60 ? `${h} h ${m % 60} m` : `${h} h`
}

/** "Active now" means seen within this window. */
export const ACTIVE_NOW_MS = 5 * 60 * 1000

/**
 * Exercise search: every word typed must appear in the name, its keywords (other names and
 * muscles) or its muscle group. "seated hamstring" finds "Seated Leg Curl".
 */
export function matchesExercise(
  e: { name: string; keywords?: string | null; muscleGroup?: string },
  query: string,
): boolean {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return true
  const haystack = `${e.name} ${e.keywords ?? ''} ${e.muscleGroup ?? ''}`
    .toLowerCase()
    .replace(/[-–]/g, ' ')
  return words.every((w) => haystack.includes(w.replace(/s$/, '')))
}

/** "12 · 10 · 10 · 8" for per-set reps, "8–12" for a range, "10" for one number, "max" for none. */
export function repsLabel(e: {
  targetRepsPerSet?: number[] | null
  targetRepsMin: number | null
  targetRepsMax: number | null
}): string {
  if (e.targetRepsPerSet?.length) return e.targetRepsPerSet.join(' · ')
  const { targetRepsMin: min, targetRepsMax: max } = e
  if (min != null && max != null && max !== min) return `${min}–${max}`
  // No reps given: as many as they can.
  return min != null || max != null ? String(min ?? max) : 'max'
}

/**
 * Photo URLs for an exercise (start position, then end position), or [] when it has none.
 * Stock photos are bundled in the phone app at /exercise-images/<id>/; pass the app's address as
 * `base` when showing them somewhere else (the admin). Uploaded photos come from /api/media/ in either app.
 */
export function exercisePhotos(imageKey: string | null | undefined, base = ''): string[] {
  if (!imageKey) return []
  if (imageKey.startsWith('exercise-images/')) {
    const root = `${base.replace(/\/$/, '')}/${imageKey}`
    return [`${root}/0.webp`, `${root}/1.webp`]
  }
  // Uploaded by a coach: `uploads/…:<count>`, served by the API in both apps.
  if (imageKey.startsWith('uploads/')) {
    const [key, count] = imageKey.split(':')
    return Array.from({ length: Number(count) || 1 }, (_, i) => `/api/media/${key}/${i}`)
  }
  // 'none': photos removed on purpose.
  return []
}

/**
 * A YouTube search for how to do an exercise, for exercises without their own video link.
 * We link to search results, never copy videos.
 */
export function exerciseVideoSearchUrl(name: string, muscleGroup?: string): string {
  const extra = muscleGroup === 'pelvic_floor' ? 'pelvic floor physio' : 'exercise proper form'
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(`how to do ${name} ${extra}`)}`
}

/** The video id in a YouTube link (watch, youtu.be, shorts, embed), or null for anything else. */
export function youtubeId(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    const u = new URL(url)
    const host = u.hostname.replace(/^www\.|^m\./, '')
    if (host === 'youtu.be') return u.pathname.slice(1).split('/')[0] || null
    if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
      if (u.pathname === '/watch') return u.searchParams.get('v')
      const m = u.pathname.match(/^\/(?:shorts|embed|live)\/([\w-]{6,})/)
      return m?.[1] ?? null
    }
  } catch {
    // Not a URL.
  }
  return null
}

/** YouTube's privacy-enhanced player for one video, ready for an <iframe>. */
export function youtubeEmbedUrl(videoId: string): string {
  return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?autoplay=1&playsinline=1&rel=0&modestbranding=1`
}

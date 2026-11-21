// Endurance numbers: a client's heart rate, threshold pace and FTP turned into real targets,
// plus race times and paces for goal times and PBs.
import {
  ENDURANCE_GOALS,
  type Goal,
  HR_ZONES,
  RACE_DISTANCE_M,
  RACE_KIND_LABELS,
  type RaceKind,
  TIMED_RACES,
} from './enums'

/** Lower and upper percent of maximum heart rate for each zone (matches HR_ZONES). */
const ZONE_PERCENT: Record<1 | 2 | 3 | 4 | 5, [number, number]> = {
  1: [0.5, 0.6],
  2: [0.6, 0.7],
  3: [0.7, 0.8],
  4: [0.8, 0.9],
  5: [0.9, 1],
}

/**
 * A heart-rate zone in beats a minute for one person. With a resting heart rate it uses
 * heart-rate reserve (Karvonen), which fits fitter people better; without, percent of max.
 */
export function hrZoneBpm(
  zone: number | null | undefined,
  maxHr: number | null | undefined,
  restingHr?: number | null,
): { low: number; high: number } | null {
  if (!zone || !(zone in HR_ZONES) || !maxHr) return null
  const [lo, hi] = ZONE_PERCENT[zone as 1 | 2 | 3 | 4 | 5]
  const rest = restingHr && restingHr < maxHr ? restingHr : 0
  const at = (p: number) => Math.round(rest + (maxHr - rest) * p)
  return { low: at(lo), high: at(hi) }
}

/** "142–155 bpm", or null when the zone or max heart rate is missing. */
export function hrZoneLabel(
  zone: number | null | undefined,
  maxHr: number | null | undefined,
  restingHr?: number | null,
): string | null {
  const z = hrZoneBpm(zone, maxHr, restingHr)
  return z ? `${z.low}–${z.high} bpm` : null
}

/** A rough maximum heart rate from age (Tanaka: 208 − 0.7 × age), for a starting point only. */
export function estimateMaxHr(age: number | null | undefined): number | null {
  if (!age || age < 10 || age > 100) return null
  return Math.round(208 - 0.7 * age)
}

/** Watts for a percent of FTP: 250 W at 90% → 225. */
export function wattsAt(ftpWatts: number | null | undefined, percent: number): number | null {
  if (!ftpWatts || percent <= 0) return null
  return Math.round((ftpWatts * percent) / 100)
}

/** Does this mix of focus areas want heart rate, pace and power numbers? */
export function wantsEnduranceNumbers(goals: (Goal | null | undefined)[]): boolean {
  return goals.some((g) => g != null && ENDURANCE_GOALS.includes(g))
}

/** Is this race judged on the clock (so a goal time and PB make sense)? */
export function isTimedRace(kind: RaceKind | null | undefined): boolean {
  return kind != null && TIMED_RACES.includes(kind)
}

/**
 * A typed time as seconds: "1:45:00" (h:mm:ss), "45:30" (mm:ss) or "52" (minutes). Null for
 * anything else, so a half-typed value never saves as a wrong time.
 */
export function parseRaceTime(text: string | null | undefined): number | null {
  const v = (text ?? '').trim()
  if (!v) return null
  if (/^\d+$/.test(v)) {
    const min = Number(v)
    return min > 0 ? min * 60 : null
  }
  const parts = v.split(':')
  if (parts.length < 2 || parts.length > 3 || !parts.every((p) => /^\d+$/.test(p))) return null
  const nums = parts.map(Number)
  const [h = 0, m = 0, s = 0] = nums.length === 3 ? nums : [0, ...nums]
  if (m >= 60 && nums.length === 3) return null
  if (s >= 60) return null
  const total = h * 3600 + m * 60 + s
  return total > 0 ? total : null
}

/** 6300 → "1:45:00", 1530 → "25:30". */
export function formatRaceTime(seconds: number | null | undefined): string {
  if (!seconds || seconds <= 0) return ''
  const s = Math.round(seconds)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`
}

/** Seconds per km as "5:00 /km". */
export function formatPacePerKm(secondsPerKm: number | null | undefined): string {
  if (!secondsPerKm || secondsPerKm <= 0) return ''
  const s = Math.round(secondsPerKm)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} /km`
}

/** The pace per km a time needs over a fixed race distance (5 km, 10 km, half, marathon). */
export function racePacePerKm(
  kind: RaceKind | null | undefined,
  seconds: number | null | undefined,
): number | null {
  const distance = kind ? RACE_DISTANCE_M[kind] : undefined
  if (!distance || !seconds) return null
  return Math.round(seconds / (distance / 1000))
}

/**
 * One line for a race goal: "Half marathon · Two Oceans · goal 1:45:00 · PB 1:52:10". Null
 * when there's no race or event.
 */
export function raceSummary(p: {
  raceKind: RaceKind | null
  targetEvent: string | null
  goalTimeSeconds: number | null
  bestTimeSeconds: number | null
}): string | null {
  const timed = isTimedRace(p.raceKind)
  const parts = [
    p.raceKind && p.raceKind !== 'other' ? RACE_KIND_LABELS[p.raceKind] : null,
    p.targetEvent?.trim() || null,
    timed && p.goalTimeSeconds ? `goal ${formatRaceTime(p.goalTimeSeconds)}` : null,
    timed && p.bestTimeSeconds ? `PB ${formatRaceTime(p.bestTimeSeconds)}` : null,
  ].filter(Boolean)
  return parts.length > 0 ? parts.join(' · ') : null
}

/** "Max HR 188 · resting 52 · threshold 4:30 /km · FTP 240 W", or null when none are set. */
export function enduranceSummary(p: {
  maxHr: number | null
  restingHr: number | null
  thresholdPaceSeconds: number | null
  ftpWatts: number | null
}): string | null {
  const parts = [
    p.maxHr ? `Max HR ${p.maxHr}` : null,
    p.restingHr ? `resting ${p.restingHr}` : null,
    p.thresholdPaceSeconds ? `threshold ${formatPacePerKm(p.thresholdPaceSeconds)}` : null,
    p.ftpWatts ? `FTP ${p.ftpWatts} W` : null,
  ].filter(Boolean)
  if (parts.length === 0) return null
  const line = parts.join(' · ')
  return line.charAt(0).toUpperCase() + line.slice(1)
}

/** The client's own numbers that make targets personal. All optional. */
export interface EnduranceNumbers {
  maxHr: number | null
  restingHr: number | null
  ftpWatts: number | null
}

/**
 * A workout row's endurance and effort targets as short labels, made personal with the
 * client's numbers when they're known: "5:30 /km", "Zone 2 · 134–148 bpm", "90% FTP · 216 W",
 * "90 rpm", "RPE 7", "↑ 350 m".
 */
export function enduranceTargets(
  ex: {
    targetPaceSeconds: number | null
    targetHrZone: number | null
    targetPowerPct?: number | null
    targetCadence?: number | null
    targetRpe?: number | null
    targetElevationM?: number | null
  },
  me: EnduranceNumbers | null = null,
): string[] {
  const zone = ex.targetHrZone ? HR_ZONES[ex.targetHrZone as 1 | 2 | 3 | 4 | 5] : null
  const bpm = hrZoneLabel(ex.targetHrZone, me?.maxHr, me?.restingHr)
  const watts = ex.targetPowerPct ? wattsAt(me?.ftpWatts, ex.targetPowerPct) : null
  return [
    ex.targetPaceSeconds ? formatPacePerKm(ex.targetPaceSeconds) : null,
    zone ? `Zone ${ex.targetHrZone} · ${bpm ?? zone.name.toLowerCase()}` : null,
    ex.targetPowerPct ? `${ex.targetPowerPct}% FTP${watts ? ` · ${watts} W` : ''}` : null,
    ex.targetCadence ? `${ex.targetCadence} rpm` : null,
    ex.targetRpe ? `RPE ${ex.targetRpe}` : null,
    ex.targetElevationM ? `↑ ${ex.targetElevationM} m` : null,
  ].filter((v): v is string => Boolean(v))
}

/** Effort (RPE 1–10) in words, for the builder's picker and the phone. */
export const RPE_LABELS: Record<number, string> = {
  1: 'Very easy',
  2: 'Easy',
  3: 'Easy',
  4: 'Steady',
  5: 'Steady',
  6: 'Moderately hard',
  7: 'Hard',
  8: 'Very hard',
  9: 'Almost all-out',
  10: 'All-out',
}

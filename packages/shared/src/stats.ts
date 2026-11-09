export interface SetForStats {
  weightKg: number | null
  reps: number | null
  isWarmup?: boolean
}

function working<T extends SetForStats>(sets: T[]): T[] {
  return sets.filter((s) => !s.isWarmup)
}

/** Total kg lifted: weight × reps over working sets. */
export function totalVolume(sets: SetForStats[]): number {
  let sum = 0
  for (const s of working(sets)) {
    if (s.weightKg && s.reps) sum += s.weightKg * s.reps
  }
  return Math.round(sum * 10) / 10
}

/** Estimated one-rep max (Epley). Returns null when it can't be estimated. */
export function estimatedOneRepMax(weightKg: number, reps: number): number | null {
  if (weightKg <= 0 || reps <= 0) return null
  if (reps === 1) return weightKg
  return Math.round(weightKg * (1 + reps / 30) * 10) / 10
}

/** Best estimated one-rep max across working sets. */
export function bestOneRepMax(sets: SetForStats[]): number | null {
  let best: number | null = null
  for (const s of working(sets)) {
    if (!s.weightKg || !s.reps) continue
    const e = estimatedOneRepMax(s.weightKg, s.reps)
    if (e !== null && (best === null || e > best)) best = e
  }
  return best
}

export function heaviestSet(sets: SetForStats[]): number | null {
  let max: number | null = null
  for (const s of working(sets)) {
    if (s.weightKg && (max === null || s.weightKg > max)) max = s.weightKg
  }
  return max
}

export function average(values: Array<number | null | undefined>): number | null {
  const nums = values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
  if (nums.length === 0) return null
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

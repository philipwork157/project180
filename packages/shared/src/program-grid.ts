// The program editor's grid: one cell per week and day. Pure logic, so it can be tested.

/** One day in the editor: its workout (null = rest) and whether it's a weigh-in day. */
export interface ProgramCell {
  workoutId: number | null
  checkinRequired: boolean
}

export const EMPTY_CELL: ProgramCell = { workoutId: null, checkinRequired: false }

/** The key of a day in the grid: "week:day". */
export const cellKey = (week: number, day: number) => `${week}:${day}`

/**
 * Swap two days: each takes the other's workout and weigh-in (dragging a day onto another).
 * A day that isn't listed is a rest day. Returns the same object when nothing changes.
 */
export function swapCells(
  cells: Record<string, ProgramCell>,
  a: string,
  b: string,
): Record<string, ProgramCell> {
  if (a === b) return cells
  const first = cells[a] ?? EMPTY_CELL
  const second = cells[b] ?? EMPTY_CELL
  if (first.workoutId === second.workoutId && first.checkinRequired === second.checkinRequired)
    return cells
  return { ...cells, [a]: { ...second }, [b]: { ...first } }
}

/**
 * Swap two whole weeks, day by day (workouts and weigh-ins). Returns the same object when
 * nothing changes.
 */
export function swapWeeks(
  cells: Record<string, ProgramCell>,
  a: number,
  b: number,
): Record<string, ProgramCell> {
  if (a === b) return cells
  let out = cells
  for (let day = 1; day <= 7; day++) out = swapCells(out, cellKey(a, day), cellKey(b, day))
  return out
}

/** Make every day of a week a rest day with no weigh-in. */
export function clearWeek(
  cells: Record<string, ProgramCell>,
  week: number,
): Record<string, ProgramCell> {
  const out = { ...cells }
  for (let day = 1; day <= 7; day++) delete out[cellKey(week, day)]
  return out
}

/** Put one day (its workout and weigh-in) on the same day of every week. */
export function copyDayToAllWeeks(
  cells: Record<string, ProgramCell>,
  weeks: number,
  week: number,
  day: number,
): Record<string, ProgramCell> {
  const source = cells[cellKey(week, day)] ?? EMPTY_CELL
  const out = { ...cells }
  for (let w = 1; w <= weeks; w++) out[cellKey(w, day)] = { ...source }
  return out
}

/** How many days of a week have a workout or a weigh-in (0 = nothing to clear). */
export const weekFilled = (cells: Record<string, ProgramCell>, week: number) =>
  Array.from({ length: 7 }, (_, i) => cells[cellKey(week, i + 1)]).filter(
    (c) => c && (c.workoutId !== null || c.checkinRequired),
  ).length

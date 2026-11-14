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

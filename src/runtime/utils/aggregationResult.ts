// Turning aggregation rows into table columns and cell text. Rows are plain JSON (the server sends
// no extended-JSON wrappers for aggregation results), but their shape is arbitrary: every `$group`
// or `$project` produces its own keys.

const MAX_COLUMNS = 100
const MAX_ROWS_FOR_COLUMNS = 200
const MAX_CELL_LENGTH = 80

// Union of the keys of the first rows in order of appearance, `_id` first (it is the group key of
// a `$group`), capped so one pathological result cannot create thousands of columns.
export function resultColumns(rows: Record<string, unknown>[]): string[] {
  const keys = new Set<string>()
  for (const row of rows.slice(0, MAX_ROWS_FOR_COLUMNS)) {
    for (const key of Object.keys(row)) {
      keys.add(key)
      if (keys.size >= MAX_COLUMNS) break
    }
  }
  return keys.has('_id') ? ['_id', ...[...keys].filter(key => key !== '_id')] : [...keys]
}

// The full text of a value and a shortened one for the cell (objects and arrays as compact JSON).
export function formatCell(value: unknown): { text: string, full: string } {
  const full = value === undefined
    ? ''
    : typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value)
  return { text: full.length > MAX_CELL_LENGTH ? `${full.slice(0, MAX_CELL_LENGTH - 1)}…` : full, full }
}

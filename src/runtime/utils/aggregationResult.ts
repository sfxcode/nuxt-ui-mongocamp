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

// Keys the server adds to the result of a stats stage (`$collStats`, `$indexStats`) that must never reach the UI:
// `host` is the database server's `<container>:27017` address, `ns` its `<database>.<collection>` name
// (brain/project/mongocamp-server-1-6-3-caveat-recheck.md).
const SERVER_ONLY_KEYS = ['host', 'ns']

/**
 * Drops the server-only keys from the top level of every row. Meant for the results of a stats stage — a user document
 * may legitimately have a `host` field, so this is not applied to ordinary aggregation results.
 */
export function stripServerFields(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  return rows.map(row => Object.fromEntries(Object.entries(row).filter(([key]) => !SERVER_ONLY_KEYS.includes(key))))
}

import { unwrapExtendedJson } from '../composables/useMongocampExtendedJson'
import { flattenDocument } from './documentPaths'
import type { FlattenResult, PathValueType } from './documentPaths'

export type CompareStatus = 'same' | 'changed' | 'added' | 'removed'

export interface CompareRow {
  path: string
  status: CompareStatus
  /** Plain (unwrapped) values; absent on the side that lacks the path */
  left?: unknown
  right?: unknown
  leftType?: PathValueType
  rightType?: PathValueType
  /** Same text on both sides but a different BSON type (`1` vs `"1"`, long vs int) */
  typeDiffers?: boolean
}

export interface CompareResult {
  rows: CompareRow[]
  counts: Record<CompareStatus, number>
  /** One of the documents was larger than the path limit */
  truncated: boolean
}

// same reading as documentDiff: a timestamp with an explicit zone is the same instant however it is written
const FULL_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})$/

/** A leaf as a plain value: wrappers unwrapped, Date → ISO text, BigInt → digits. */
export function plainValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'bigint') return value.toString()
  return unwrapExtendedJson(value)
}

const WRAPPED_AS_TEXT = new Set<PathValueType>(['objectId', 'date', 'long', 'decimal'])
const NUMERIC = new Set<PathValueType>(['number', 'int', 'long', 'double', 'decimal'])

const EXACT_NUMERIC = new Set<PathValueType>(['int', 'long', 'double', 'decimal'])

// A plain read gives wrapper types as plain text/numbers, so a wrapper type next to its plain form is not a difference. Two
// EXACT numeric types (both sides read with their types, `extendedJson=canonical`) are: an int 5 and a long 5 differ.
function typesAgree(a: PathValueType, b: PathValueType): boolean {
  if (a === b) return true
  if (NUMERIC.has(a) && NUMERIC.has(b)) return !(EXACT_NUMERIC.has(a) && EXACT_NUMERIC.has(b))
  return (a === 'string' && WRAPPED_AS_TEXT.has(b)) || (b === 'string' && WRAPPED_AS_TEXT.has(a))
}

function leafEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a === 'string' && typeof b === 'string') {
    return FULL_TIMESTAMP.test(a) && FULL_TIMESTAMP.test(b) && Date.parse(a) === Date.parse(b)
  }
  // empty containers are leaves; two empty arrays (or objects) are equal
  if (Array.isArray(a) && Array.isArray(b)) return a.length === 0 && b.length === 0
  if (typeof a === 'object' && typeof b === 'object' && a && b && !Array.isArray(a) && !Array.isArray(b)) {
    return Object.keys(a).length === 0 && Object.keys(b).length === 0
  }
  return false
}

function withoutEmptyRoot(result: FlattenResult): FlattenResult {
  return { ...result, entries: result.entries.filter(e => e.path !== '' || (e.type !== 'object' && e.type !== 'array')) }
}

/**
 * Path-level comparison of two documents. Both are flattened (arrays by index, an extended-JSON wrapper is one leaf),
 * so `{ $oid }`/`{ $date }`/`{ $numberLong }` compare as the plain values the table shows. Rows follow the left
 * document's order, paths only the right one has come after. A key's order inside an object is not a difference.
 */
export function compareDocuments(left: unknown, right: unknown, options: { maxEntries?: number } = {}): CompareResult {
  // an empty document flattens to one empty-path leaf, which is not a field to report
  const a = withoutEmptyRoot(flattenDocument(left, { maxEntries: options.maxEntries }))
  const b = withoutEmptyRoot(flattenDocument(right, { maxEntries: options.maxEntries }))
  const rightByPath = new Map(b.entries.map(e => [e.path, e]))
  const seen = new Set<string>()
  const rows: CompareRow[] = []

  for (const entry of a.entries) {
    seen.add(entry.path)
    const other = rightByPath.get(entry.path)
    const l = plainValue(entry.value)
    if (!other) {
      rows.push({ path: entry.path, status: 'removed', left: l, leftType: entry.type })
      continue
    }
    const r = plainValue(other.value)
    const equal = leafEqual(l, r)
    // the same text under another stored type (1 vs "1") is a change; a wrapper vs its plain form is not
    const typeDiffers = !typesAgree(entry.type, other.type) && String(l) === String(r)
    rows.push({
      path: entry.path,
      status: equal && !typeDiffers ? 'same' : 'changed',
      left: l,
      right: r,
      leftType: entry.type,
      rightType: other.type,
      typeDiffers,
    })
  }
  for (const entry of b.entries) {
    if (seen.has(entry.path)) continue
    rows.push({ path: entry.path, status: 'added', right: plainValue(entry.value), rightType: entry.type })
  }

  const counts: Record<CompareStatus, number> = { same: 0, changed: 0, added: 0, removed: 0 }
  for (const row of rows) counts[row.status]++
  return { rows, counts, truncated: a.truncated || b.truncated }
}

/** Short text of a leaf for a table cell. */
export function compareText(value: unknown): string {
  if (value === null) return 'null'
  if (typeof value === 'string') return value
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

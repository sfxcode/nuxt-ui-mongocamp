import { unwrapExtendedJson } from '../composables/useMongocampExtendedJson'

// What `PATCH …/documents/{id}/partial` has to be told to turn one document into another. The endpoint is a
// MongoDB `$set` (+ `$unset`) — verified on server 1.6.3 (brain/project/mongocamp-server-1-6-3-endpoints.md):
// a nested object sent as a value REPLACES the stored one, a dotted key (`nested.y`) sets just that leaf, arrays
// are replaced whole and `$unset` removes a field.
export interface DocumentChanges {
  /** dotted path → new value (already in the wire shape the caller built, e.g. `{ $date }` wrappers kept) */
  set: Record<string, unknown>
  /** dotted paths to remove */
  unset: string[]
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Date)
}

// `{ $oid }`, `{ $date }`, `{ $numberLong }` … — one value, never a sub-document to descend into.
function isWrapper(value: Record<string, unknown>): boolean {
  const keys = Object.keys(value)
  return keys.length === 1 && keys[0]!.startsWith('$')
}

// A key that cannot be addressed as one segment of a dotted path.
function isUnsafeKey(key: string): boolean {
  return key === '' || key.includes('.') || key.startsWith('$')
}

function normalize(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString()
  return unwrapExtendedJson(value)
}

// The server reads a date back as an ISO string and drops a zero millisecond part (`…12:00:00Z`), while the form
// rewraps it as `{ $date: '…' }` which normalises to `…12:00:00.000Z` — the same instant, so not a change.
// Only full timestamps with an explicit zone count: a bare date (`2025-05-05`) is stored as plain text by the server while
// a timestamp becomes a real date, and a timestamp without a zone is read in the browser's time zone — neither is "the same".
const FULL_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})$/

function sameInstant(a: string, b: string): boolean {
  return FULL_TIMESTAMP.test(a) && FULL_TIMESTAMP.test(b) && Date.parse(a) === Date.parse(b)
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a === 'string' && typeof b === 'string') return sameInstant(a, b)
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((item, i) => deepEqual(item, b[i]))
  if (isPlainObject(a) && isPlainObject(b)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)])
    return [...keys].every(key => deepEqual(a[key], b[key]))
  }
  return false
}

function canDescend(original: unknown, edited: unknown): original is Record<string, unknown> {
  if (!isPlainObject(original) || !isPlainObject(edited)) return false
  if (isWrapper(original) || isWrapper(edited)) return false
  return ![...Object.keys(original), ...Object.keys(edited)].some(isUnsafeKey)
}

function walk(original: Record<string, unknown>, edited: Record<string, unknown>, prefix: string, changes: DocumentChanges): boolean {
  for (const key of new Set([...Object.keys(original), ...Object.keys(edited)])) {
    if (prefix === '' && key === '_id') continue
    if (isUnsafeKey(key)) return false // only reachable at the top level, nested objects with such keys are never descended into
    const path = prefix + key
    const hadIt = key in original
    const next = edited[key]
    if (next === undefined) {
      if (hadIt) changes.unset.push(path)
      continue
    }
    if (!hadIt) {
      changes.set[path] = next
      continue
    }
    const before = original[key]
    // compared as plain values, so a field the form merely round-tripped (a date as `{ $date }` vs its ISO string,
    // a `$numberLong` vs a number) is not a change and is never sent
    if (deepEqual(normalize(before), normalize(next))) continue
    if (canDescend(before, next)) {
      if (!walk(before, next as Record<string, unknown>, `${path}.`, changes)) return false
      continue
    }
    changes.set[path] = next
  }
  return true
}

/**
 * The minimal changes that turn `original` into `edited` (both whole documents, `_id` ignored): changed leaves as
 * dotted keys, whole values for arrays and anything that is not a plain object on both sides, removed fields as
 * unsets. Returns `null` when the change cannot be expressed as a partial update (a top-level field name that
 * contains a dot or starts with `$`) — the caller then falls back to a full replace.
 */
export function diffDocument(original: Record<string, unknown>, edited: Record<string, unknown>): DocumentChanges | null {
  const changes: DocumentChanges = { set: {}, unset: [] }
  return walk(original, edited, '', changes) ? changes : null
}

export function hasChanges(changes: DocumentChanges): boolean {
  return Object.keys(changes.set).length > 0 || changes.unset.length > 0
}

/**
 * The request body for `updateDocumentPartial`. Plain fields and `$unset` may be mixed (verified). Never returns
 * an empty body — the server answers an empty partial update with a 500 — so callers check `hasChanges` first.
 */
export function buildPartialBody(changes: DocumentChanges): Record<string, unknown> {
  const body: Record<string, unknown> = { ...changes.set }
  if (changes.unset.length > 0) body.$unset = Object.fromEntries(changes.unset.map(path => [path, '']))
  return body
}

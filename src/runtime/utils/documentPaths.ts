// Dotted-path tools for MongoDB documents: list every leaf with its path and type, read and set one by path. Used by the
// JSON/tree viewer, the compare view and the column picker. Works on documents as the module holds them: plain JSON,
// optionally with extended-JSON wrappers (`{ $oid }`, `{ $date }`, `{ $numberLong }` …), Date and BigInt values.
//
// Path syntax = MongoDB's: segments joined by `.`, an array element is its index (`items.0.price`). A key that itself
// contains a `.` or a `\` is written with a backslash (`a\.b`), so every path can be addressed and split back exactly
// (MongoDB cannot update such a key by dotted path at all — documentDiff falls back to a full replace for those).

export type PathValueType
  = | 'null' | 'string' | 'boolean' | 'number' | 'int' | 'long' | 'double' | 'decimal'
    | 'objectId' | 'date' | 'array' | 'object'

export interface FlatEntry {
  path: string
  type: PathValueType
  /** The leaf as stored: a wrapper stays one value (`{ $oid }` is not descended into); empty arrays/objects are leaves. */
  value: unknown
}

export interface FlattenOptions {
  /** Deeper structures are returned as one `object`/`array` leaf (default 32). */
  maxDepth?: number
  /** Stops after this many entries (default 10 000); `truncated` tells. */
  maxEntries?: number
}

export interface FlattenResult {
  entries: FlatEntry[]
  truncated: boolean
}

const DEFAULT_MAX_DEPTH = 32
const DEFAULT_MAX_ENTRIES = 10_000
// a segment that would reach the prototype chain is refused, never walked or created
const FORBIDDEN_SEGMENTS = new Set(['__proto__', 'constructor', 'prototype'])

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Date)
}

const WRAPPER_TYPES: Record<string, PathValueType> = {
  $oid: 'objectId',
  $date: 'date',
  $numberLong: 'long',
  $numberInt: 'int',
  $numberDouble: 'double',
  $numberDecimal: 'decimal',
  // text that looks like a date, marked as text by the server in a typed read
  $string: 'string',
}

/** The wrapper's type when `value` is exactly one extended-JSON wrapper, else `undefined`. */
function wrapperType(value: Record<string, unknown>): PathValueType | undefined {
  const keys = Object.keys(value)
  return keys.length === 1 ? WRAPPER_TYPES[keys[0]!] : undefined
}

/**
 * What a value is, with extended-JSON wrappers recognised as their BSON type. Read a document with `extendedJson=canonical`
 * (server 1.8.1) to get the types: `_id` and nested ids are `{ $oid }`, dates `{ $date }`, numbers `{ $numberInt }` /
 * `{ $numberLong }` / `{ $numberDouble }` / `{ $numberDecimal }`, date-looking text `{ $string }`. A document read as plain
 * JSON has no wrappers (ids and dates are strings) and is typed as what JSON says — the module no longer guesses.
 */
export function typeOf(value: unknown): PathValueType {
  if (value === null || value === undefined) return 'null'
  if (Array.isArray(value)) return 'array'
  if (value instanceof Date) return 'date'
  switch (typeof value) {
    case 'string':
      return 'string'
    case 'boolean': return 'boolean'
    case 'number': return 'number'
    case 'bigint': return 'long'
    case 'object': return wrapperType(value as Record<string, unknown>) ?? 'object'
    default: return 'string' // functions and symbols never come out of JSON
  }
}

function escapeSegment(key: string): string {
  return key.replace(/[\\.]/g, m => `\\${m}`)
}

/** Splits a path at its unescaped dots; `''` is the empty path (no segments). */
export function splitPath(path: string): string[] {
  if (path === '') return []
  const segments: string[] = []
  let current = ''
  for (let i = 0; i < path.length; i++) {
    const char = path[i]!
    if (char === '\\' && i + 1 < path.length) {
      current += path[++i]
    }
    else if (char === '.') {
      segments.push(current)
      current = ''
    }
    else {
      current += char
    }
  }
  segments.push(current)
  return segments
}

export function joinPath(segments: Array<string | number>): string {
  return segments.map(s => escapeSegment(String(s))).join('.')
}

/**
 * Every leaf of `doc` as `{ path, type, value }`, depth-first in key order. Arrays are walked by index, a wrapper is one
 * leaf, an empty array/object is a leaf. The document is never changed.
 */
export function flattenDocument(doc: unknown, options: FlattenOptions = {}): FlattenResult {
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH
  const maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES
  const entries: FlatEntry[] = []
  let truncated = false

  const visit = (value: unknown, segments: string[], depth: number): void => {
    if (truncated) return
    const type = typeOf(value)
    const container = type === 'object' || type === 'array'
    const children = container ? (Array.isArray(value) ? value.map((v, i) => [String(i), v] as const) : Object.entries(value as Record<string, unknown>)) : []
    // the root of a scalar (or empty) document is reported under the empty path
    if (!container || children.length === 0 || depth >= maxDepth) {
      if (entries.length >= maxEntries) {
        truncated = true
        return
      }
      entries.push({ path: joinPath(segments), type, value })
      return
    }
    for (const [key, child] of children) {
      visit(child, [...segments, key], depth + 1)
      if (truncated) return
    }
  }

  visit(doc, [], 0)
  return { entries, truncated }
}

function childOf(container: unknown, segment: string): { found: boolean, value?: unknown } {
  if (Array.isArray(container)) {
    if (!/^(?:0|[1-9]\d*)$/.test(segment)) return { found: false }
    const index = Number(segment)
    return index < container.length ? { found: true, value: container[index] } : { found: false }
  }
  if (isPlainObject(container) && Object.hasOwn(container, segment) && !FORBIDDEN_SEGMENTS.has(segment)) {
    return { found: true, value: container[segment] }
  }
  return { found: false }
}

/** The value at `path`, or `undefined` when any part of it is missing. Never reads inherited properties. */
export function getPath(doc: unknown, path: string): unknown {
  let current = doc
  for (const segment of splitPath(path)) {
    const next = childOf(current, segment)
    if (!next.found) return undefined
    current = next.value
  }
  return current
}

export function hasPath(doc: unknown, path: string): boolean {
  let current = doc
  for (const segment of splitPath(path)) {
    const next = childOf(current, segment)
    if (!next.found) return false
    current = next.value
  }
  return true
}

function setIn(container: unknown, segments: string[], value: unknown): unknown {
  const [segment, ...rest] = segments
  if (segment === undefined) return value
  if (FORBIDDEN_SEGMENTS.has(segment)) throw new TypeError(`Refusing to set a path through "${segment}"`)

  if (Array.isArray(container)) {
    if (!/^(?:0|[1-9]\d*)$/.test(segment)) throw new TypeError(`"${segment}" is not an array index`)
    const index = Number(segment)
    if (index > container.length) throw new RangeError(`Index ${index} is beyond the end of an array of ${container.length}`)
    const copy = [...container]
    copy[index] = setIn(index < container.length ? container[index] : undefined, rest, value)
    return copy
  }
  const base = isPlainObject(container) ? container : {}
  const own = Object.hasOwn(base, segment) ? base[segment] : undefined
  // Object.fromEntries/defineProperty-style copy: a plain assignment of a key like `__proto__` is already refused above
  return { ...base, [segment]: setIn(own, rest, value) }
}

/**
 * A copy of `doc` with `value` at `path`; only the objects/arrays along the path are copied, the rest is shared. Missing
 * intermediate objects are created, an array may be appended to at index `length`. Throws for a path through
 * `__proto__`/`constructor`/`prototype`, a non-index segment in an array or an index beyond its end.
 */
export function setPath<T extends Record<string, unknown>>(doc: T, path: string, value: unknown): T {
  const segments = splitPath(path)
  if (segments.length === 0) throw new TypeError('A path is needed')
  return setIn(doc, segments, value) as T
}

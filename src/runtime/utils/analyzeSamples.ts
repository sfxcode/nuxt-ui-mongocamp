import { isIsoDateTimeString } from './isoDate'

// Field statistics computed from sample documents already in memory — what the real server's
// schema-analysis endpoint would give, without its state leak (it accumulates every earlier analysis
// across collections). Input is plain JSON as an aggregation returns it: dates are ISO strings,
// there are no extended-JSON wrappers.

export type ValueKind = 'string' | 'number' | 'boolean' | 'date' | 'object' | 'array' | 'null'

export interface FieldStatistic {
  // nested fields as `a.b`, fields of objects inside arrays as `items[].sku`
  path: string
  // sampled documents that have the field (a `null` value counts as present)
  present: number
  share: number
  // the kinds of value seen, by number of documents, most frequent first
  types: { type: ValueKind, count: number }[]
  // the most frequent values of a field with few distinct ones (scalars only)
  topValues?: { value: string, count: number }[]
}

export interface SampleAnalysis {
  sampled: number
  fields: FieldStatistic[]
  // more fields than `maxFields` exist; the rest were left out
  truncated: boolean
}

export interface AnalyzeOptions {
  maxDepth?: number
  maxFields?: number
  topValues?: number
  maxDistinctForTop?: number
}

const DEFAULTS: Required<AnalyzeOptions> = { maxDepth: 3, maxFields: 200, topValues: 5, maxDistinctForTop: 20 }
const MAX_VALUE_LENGTH = 40

interface Accumulator {
  present: number
  types: Map<ValueKind, number>
  values: Map<string, number>
  // too many different values to list the common ones
  highCardinality: boolean
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function kindOf(value: unknown): ValueKind {
  if (value === null || value === undefined) return 'null'
  if (Array.isArray(value)) return 'array'
  if (typeof value === 'string') return isIsoDateTimeString(value) ? 'date' : 'string'
  if (typeof value === 'number' || typeof value === 'bigint') return 'number'
  if (typeof value === 'boolean') return 'boolean'
  return 'object'
}

function shorten(text: string): string {
  return text.length > MAX_VALUE_LENGTH ? `${text.slice(0, MAX_VALUE_LENGTH - 1)}…` : text
}

function comparePaths(a: string, b: string): number {
  if (a === '_id') return b === '_id' ? 0 : -1
  if (b === '_id') return 1
  const left = a.split('.')
  const right = b.split('.')
  for (let i = 0; i < Math.min(left.length, right.length); i++) {
    const order = left[i]!.localeCompare(right[i]!)
    if (order !== 0) return order
  }
  return left.length - right.length
}

export function analyzeSamples(rows: unknown[], options: AnalyzeOptions = {}): SampleAnalysis {
  const { maxDepth, maxFields, topValues, maxDistinctForTop } = { ...DEFAULTS, ...options }
  // Maps, not plain objects: a field called `__proto__` or `constructor` must be just a field
  const stats = new Map<string, Accumulator>()
  let sampled = 0

  // collects what one document has at one path, so a field that appears in several array elements of
  // the same document still counts once for that document
  function visit(value: unknown, path: string, depth: number, seen: Map<string, Map<ValueKind, Set<string>>>) {
    const kind = kindOf(value)
    let entry = seen.get(path)
    if (!entry) {
      entry = new Map()
      seen.set(path, entry)
    }
    const values = entry.get(kind) ?? new Set<string>()
    entry.set(kind, values)
    if (kind === 'string' || kind === 'number' || kind === 'boolean' || kind === 'date') values.add(String(value))

    if (depth >= maxDepth) return
    if (isPlainObject(value)) {
      for (const [key, inner] of Object.entries(value)) visit(inner, `${path}.${key}`, depth + 1, seen)
    }
    else if (Array.isArray(value)) {
      for (const item of value) if (isPlainObject(item)) {
        for (const [key, inner] of Object.entries(item)) visit(inner, `${path}[].${key}`, depth + 1, seen)
      }
    }
  }

  for (const row of rows) {
    if (!isPlainObject(row)) continue
    sampled++
    const seen = new Map<string, Map<ValueKind, Set<string>>>()
    for (const [key, value] of Object.entries(row)) visit(value, key, 1, seen)
    for (const [path, kinds] of seen) {
      let acc = stats.get(path)
      if (!acc) {
        acc = { present: 0, types: new Map(), values: new Map(), highCardinality: false }
        stats.set(path, acc)
      }
      acc.present++
      for (const [kind, values] of kinds) {
        acc.types.set(kind, (acc.types.get(kind) ?? 0) + 1)
        for (const text of values) {
          if (acc.highCardinality) break
          acc.values.set(text, (acc.values.get(text) ?? 0) + 1)
          if (acc.values.size > maxDistinctForTop) {
            acc.highCardinality = true
            acc.values.clear()
          }
        }
      }
    }
  }

  const paths = [...stats.keys()].sort(comparePaths)
  const fields: FieldStatistic[] = paths.slice(0, maxFields).map((path) => {
    const acc = stats.get(path)!
    const field: FieldStatistic = {
      path,
      present: acc.present,
      share: sampled === 0 ? 0 : acc.present / sampled,
      types: [...acc.types].map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count || a.type.localeCompare(b.type)),
    }
    if (!acc.highCardinality && acc.values.size > 0) {
      field.topValues = [...acc.values]
        .map(([value, count]) => ({ value: shorten(value), count }))
        .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
        .slice(0, topValues)
    }
    return field
  })
  return { sampled, fields, truncated: paths.length > maxFields }
}

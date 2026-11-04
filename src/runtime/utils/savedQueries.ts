// Pure part of useMongocampSavedQueries: what a saved query is, how one is validated (anything read back from storage or
// from an imported file is untrusted), and the list rules (dedupe, caps, import/export envelope).
import type { FilterCondition, FilterGroup, FilterOperator } from './filterBuilder'

export interface SavedQuery {
  /** The visual builder's state, so it can be restored and edited, not only the string. */
  filterGroup?: FilterGroup
  /** A Lucene string (a quick search, or what the builder produced). */
  lucene?: string
  sort?: string[]
  projection?: string[]
}

export interface SavedQueryEntry {
  name: string
  query: SavedQuery
}

export const MAX_SAVED = 50
export const MAX_RECENT = 20
export const MAX_NAME_LENGTH = 80
export const MAX_LUCENE_LENGTH = 2000
export const MAX_CONDITIONS = 50
export const MAX_FIELDS = 100
export const MAX_FIELD_LENGTH = 200
export const MAX_VALUE_LENGTH = 500
/** Largest stored store / imported file, serialised. */
export const MAX_STORE_BYTES = 128 * 1024
export const EXPORT_FORMAT = 'nuxt-ui-mongocamp-saved-queries'

const OPERATORS: readonly FilterOperator[] = ['contains', 'equals', 'notEquals', 'startsWith', 'endsWith', 'oneOf', 'gte', 'lte', 'between', 'isTrue', 'isFalse', 'isEmpty', 'isNotEmpty']

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function sanitizeStrings(value: unknown, maxItems: number): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const out = value.filter((v): v is string => typeof v === 'string' && v !== '' && v.length <= MAX_FIELD_LENGTH).slice(0, maxItems)
  return out.length > 0 ? out : undefined
}

function sanitizeCondition(value: unknown): FilterCondition | undefined {
  if (!isRecord(value)) return undefined
  const { id, field, operator, value: v, value2 } = value
  if (typeof id !== 'string' || id === '' || id.length > MAX_FIELD_LENGTH) return undefined
  if (typeof field !== 'string' || field === '' || field.length > MAX_FIELD_LENGTH) return undefined
  if (typeof operator !== 'string' || !OPERATORS.includes(operator as FilterOperator)) return undefined
  const condition: FilterCondition = { id, field, operator: operator as FilterOperator }
  for (const [key, raw] of [['value', v], ['value2', value2]] as const) {
    if (raw === undefined) continue
    if (typeof raw !== 'string' || raw.length > MAX_VALUE_LENGTH) return undefined
    condition[key] = raw
  }
  return condition
}

function sanitizeGroup(value: unknown): FilterGroup | undefined {
  if (!isRecord(value) || (value.match !== 'all' && value.match !== 'any') || !Array.isArray(value.conditions)) return undefined
  if (value.conditions.length > MAX_CONDITIONS) return undefined
  const conditions: FilterCondition[] = []
  for (const raw of value.conditions) {
    const condition = sanitizeCondition(raw)
    if (!condition) return undefined // a half-valid group would mean something else than what was saved
    conditions.push(condition)
  }
  if (conditions.length === 0) return undefined
  const group: FilterGroup = { match: value.match, conditions }
  if (value.negate === true) group.negate = true
  return group
}

/**
 * A clean copy of `value` holding only the known, bounded fields, or `undefined` when nothing usable is left (an empty
 * query is not worth saving). Unknown keys are dropped; an invalid filter group is dropped whole.
 */
export function sanitizeQuery(value: unknown): SavedQuery | undefined {
  if (!isRecord(value)) return undefined
  const query: SavedQuery = {}
  const filterGroup = sanitizeGroup(value.filterGroup)
  if (filterGroup) query.filterGroup = filterGroup
  if (typeof value.lucene === 'string' && value.lucene.trim() !== '' && value.lucene.length <= MAX_LUCENE_LENGTH) query.lucene = value.lucene
  const sort = sanitizeStrings(value.sort, 10)
  if (sort) query.sort = sort
  const projection = sanitizeStrings(value.projection, MAX_FIELDS)
  if (projection) query.projection = projection
  return Object.keys(query).length > 0 ? query : undefined
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable)
  if (isRecord(value)) return Object.fromEntries(Object.keys(value).sort().map(k => [k, stable(value[k])]))
  return value
}

/** Same query ⇒ same key, whatever the key order; condition ids are ignored (they are only UI identity). */
export function queryKey(query: SavedQuery): string {
  const copy = stable({
    ...query,
    filterGroup: query.filterGroup && { ...query.filterGroup, conditions: query.filterGroup.conditions.map(({ id: _id, ...rest }) => rest) },
  })
  return JSON.stringify(copy)
}

export function sanitizeName(name: unknown): string | undefined {
  if (typeof name !== 'string') return undefined
  const trimmed = name.trim()
  return trimmed !== '' && trimmed.length <= MAX_NAME_LENGTH ? trimmed : undefined
}

/** `query` first, an equal earlier one removed, at most `max` kept. */
export function pushRecent(list: SavedQuery[], query: SavedQuery, max = MAX_RECENT): SavedQuery[] {
  const key = queryKey(query)
  return [query, ...list.filter(q => queryKey(q) !== key)].slice(0, max)
}

export type SaveFailure = 'invalid-name' | 'invalid-query' | 'limit'

/** Adds or replaces (name compared case-insensitively) an entry; keeps the list sorted as given, new names last. */
export function upsertSaved(list: SavedQueryEntry[], name: unknown, query: unknown, max = MAX_SAVED): { ok: true, list: SavedQueryEntry[] } | { ok: false, reason: SaveFailure } {
  const cleanName = sanitizeName(name)
  if (!cleanName) return { ok: false, reason: 'invalid-name' }
  const cleanQuery = sanitizeQuery(query)
  if (!cleanQuery) return { ok: false, reason: 'invalid-query' }
  const index = list.findIndex(e => e.name.toLowerCase() === cleanName.toLowerCase())
  if (index === -1) {
    if (list.length >= max) return { ok: false, reason: 'limit' }
    return { ok: true, list: [...list, { name: cleanName, query: cleanQuery }] }
  }
  return { ok: true, list: list.map((e, i) => i === index ? { name: cleanName, query: cleanQuery } : e) }
}

export function sanitizeSavedList(value: unknown, max = MAX_SAVED): SavedQueryEntry[] {
  if (!Array.isArray(value)) return []
  let list: SavedQueryEntry[] = []
  for (const raw of value) {
    if (!isRecord(raw)) continue
    const result = upsertSaved(list, raw.name, raw.query, max)
    if (result.ok) list = result.list
  }
  return list
}

export function sanitizeRecentList(value: unknown, max = MAX_RECENT): SavedQuery[] {
  if (!Array.isArray(value)) return []
  const out: SavedQuery[] = []
  const seen = new Set<string>()
  for (const raw of value) {
    const query = sanitizeQuery(raw)
    if (!query || seen.has(queryKey(query))) continue
    seen.add(queryKey(query))
    out.push(query)
    if (out.length >= max) break
  }
  return out
}

export function serializeSaved(list: SavedQueryEntry[]): string {
  return JSON.stringify({ format: EXPORT_FORMAT, version: 1, queries: list }, null, 2)
}

export type ImportFailure = 'too-large' | 'not-json' | 'foreign-format'

/**
 * Reads a file written by `serializeSaved`. Foreign, oversized or non-JSON input is refused whole; single bad entries
 * are skipped and counted. Names that already exist are replaced by the imported query (upsert).
 */
export function parseSavedImport(text: string, existing: SavedQueryEntry[], max = MAX_SAVED):
{ ok: true, list: SavedQueryEntry[], imported: number, skipped: number } | { ok: false, reason: ImportFailure } {
  if (text.length > MAX_STORE_BYTES) return { ok: false, reason: 'too-large' }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  }
  catch {
    return { ok: false, reason: 'not-json' }
  }
  if (!isRecord(parsed) || parsed.format !== EXPORT_FORMAT || parsed.version !== 1 || !Array.isArray(parsed.queries)) {
    return { ok: false, reason: 'foreign-format' }
  }
  let list = existing
  let imported = 0
  let skipped = 0
  for (const raw of parsed.queries) {
    const result = isRecord(raw) ? upsertSaved(list, raw.name, raw.query, max) : undefined
    if (result?.ok) {
      list = result.list
      imported++
    }
    else {
      skipped++
    }
  }
  return { ok: true, list, imported, skipped }
}

// Pure rules of the index manager: how to show an index the server lists, and how a create form becomes a request.
// Server facts (live on 1.8.1, brain/project/mongocamp-server-1-8-1-endpoints.md): `index/details` lists the keys as an
// ORDERED array `{ field, direction }` (direction is the text `1`, `-1` or `text`) together with `unique`, `sparse`, `hidden`,
// `weights`, `defaultLanguage`, `expireAfterSeconds` and `collation`; creating takes the same ordered keys plus options.
// A direction other than 1/-1/text is a 400 (code 4006), sparse together with a partial filter a 400 (code 67), a unique
// index over duplicate data a 409 (code 11000), re-creating an identical index a no-op. The listed
// `partialFilterExpression` is garbled by the server (`{ "n": { "underlying": null } }`) — only its presence is shown.

/** An index as `GET …/index/details` lists it (the parts this module reads). */
export interface IndexDetailLike {
  name: string
  keys?: Array<{ field: string, direction: string }>
  unique?: boolean
  sparse?: boolean
  hidden?: boolean
  partialFilterExpression?: unknown
  collation?: unknown
  weights?: Record<string, unknown>
  defaultLanguage?: string
  expireAfterSeconds?: number | null
}

export interface IndexKey {
  field: string
  /** 1, -1, or `text` for a field of a text index. */
  direction: 1 | -1 | 'text' | 'other'
}

export const MAX_INDEX_FIELDS = 8

/** The fields of an index in index order, straight from the server's ordered listing. */
export function indexKeys(index: Pick<IndexDetailLike, 'keys'>): IndexKey[] {
  return (index.keys ?? []).map(({ field, direction }) => ({
    field,
    direction: direction === '1' ? 1 : direction === '-1' ? -1 : direction === 'text' ? 'text' : 'other',
  }))
}

/** Whether the index is a text index (any key is `text`). */
export function isTextIndex(index: Pick<IndexDetailLike, 'keys'>): boolean {
  return indexKeys(index).some(key => key.direction === 'text')
}

/** Whether the index expires documents (a TTL index). */
export function isExpiringIndex(index: Pick<IndexDetailLike, 'expireAfterSeconds'>): boolean {
  return typeof index.expireAfterSeconds === 'number'
}

export function describeKey(key: IndexKey): string {
  if (key.direction === 'text') return `${key.field} (text)`
  return `${key.field}: ${key.direction === 1 ? '↑' : key.direction === -1 ? '↓' : '?'}`
}

export { formatBytes } from './formatBytes'

// seconds, minutes, hours, days — `3600s` and `1d` are verified on the server, the others are the same duration syntax
const DURATION = /^[1-9]\d{0,8}[smhd]$/

export function isValidExpireAfter(text: string): boolean {
  return DURATION.test(text.trim())
}

export type IndexKind = 'standard' | 'unique' | 'text' | 'expiring'

export interface IndexForm {
  kind: IndexKind
  /** One row per field; an expiring index uses the first, a text index all of them (the direction is ignored). */
  fields: Array<{ field: string, descending: boolean }>
  /** Optional name (every kind but expiring). */
  name: string
  expireAfter: string
  /** Index only the documents that have the field (not together with a partial filter). */
  sparse: boolean
  /** Created but not used by queries until unhidden. */
  hidden: boolean
  /** A MongoDB filter as JSON text: only the documents it matches are indexed. Empty = none. */
  partialFilter: string
}

export type IndexFormProblem = 'no-field' | 'empty-field' | 'duplicate-field' | 'too-many-fields' | 'bad-duration' | 'bad-name' | 'bad-partial-filter' | 'sparse-and-partial'

/** The partial filter text as an object: `undefined` for empty, `null` when it is not a JSON object. */
export function parsePartialFilter(text: string): Record<string, unknown> | null | undefined {
  if (text.trim() === '') return undefined
  try {
    const value: unknown = JSON.parse(text)
    return typeof value === 'object' && value !== null && !Array.isArray(value) && Object.keys(value).length > 0 ? value as Record<string, unknown> : null
  }
  catch {
    return null
  }
}

/** Kinds that go through the ordered create (`createIndex` with `orderedKeys` and options); an expiring index has its own call. */
const takesOptions = (kind: IndexKind) => kind !== 'expiring'

export function validateIndexForm(form: IndexForm): IndexFormProblem[] {
  const problems: IndexFormProblem[] = []
  const rows = form.kind === 'expiring' ? form.fields.slice(0, 1) : form.fields
  if (rows.length === 0) return ['no-field']
  const names = rows.map(r => r.field.trim())
  if (names.includes('')) problems.push('empty-field')
  if (new Set(names.filter(Boolean)).size !== names.filter(Boolean).length) problems.push('duplicate-field')
  if (rows.length > MAX_INDEX_FIELDS) problems.push('too-many-fields')
  if (form.kind === 'expiring' && !isValidExpireAfter(form.expireAfter)) problems.push('bad-duration')
  if (takesOptions(form.kind) && form.name.trim().length > 100) problems.push('bad-name')
  if (takesOptions(form.kind)) {
    const partial = parsePartialFilter(form.partialFilter)
    if (partial === null) problems.push('bad-partial-filter')
    // MongoDB refuses both options together (server 400, code 67)
    else if (partial !== undefined && form.sparse) problems.push('sparse-and-partial')
  }
  return problems
}

export interface IndexCreateOptions {
  unique?: boolean
  name?: string
  sparse?: boolean
  hidden?: boolean
  partialFilterExpression?: Record<string, unknown>
}

export type IndexRequest
  = | { call: 'createOrderedIndex', keys: Array<{ field: string, direction: '1' | '-1' | 'text' }>, options?: IndexCreateOptions }
    | { call: 'createExpiringIndex', field: string, duration: string }

/**
 * The call a valid form stands for. Every kind but expiring goes through the ordered create, which keeps the field order of
 * a compound index and accepts a text index over several fields (server 1.8.1, verified live).
 */
export function buildIndexRequest(form: IndexForm): IndexRequest {
  const rows = form.fields.map(r => ({ field: r.field.trim(), descending: r.descending }))
  if (form.kind === 'expiring') return { call: 'createExpiringIndex', field: rows[0]!.field, duration: form.expireAfter.trim() }
  const keys = rows.map(row => ({ field: row.field, direction: form.kind === 'text' ? 'text' as const : row.descending ? '-1' as const : '1' as const }))
  const options: IndexCreateOptions = {}
  if (form.kind === 'unique') options.unique = true
  if (form.name.trim() !== '') options.name = form.name.trim()
  if (form.sparse) options.sparse = true
  if (form.hidden) options.hidden = true
  const partial = parsePartialFilter(form.partialFilter)
  if (partial) options.partialFilterExpression = partial
  return Object.keys(options).length > 0 ? { call: 'createOrderedIndex', keys, options } : { call: 'createOrderedIndex', keys }
}

export type IndexErrorKind = 'duplicate-values' | 'conflict' | 'empty-keys' | 'other'

/** What a create/drop failure means, from the server's message (MongoDB error codes 11000, 85/86 and 67). */
export function classifyIndexError(message: string): IndexErrorKind {
  if (/11000|duplicate key|E11000/i.test(message)) return 'duplicate-values'
  if (/equivalent index already exists|IndexOptionsConflict|IndexKeySpecsConflict|already exists with a different name/i.test(message)) return 'conflict'
  if (/keys cannot be empty/i.test(message)) return 'empty-keys'
  return 'other'
}

/** Never used since the counter started — a hint, not proof (counters restart with the server). `_id_` is never flagged. */
export function isUnusedIndex(name: string, ops: number | undefined): boolean {
  return name !== '_id_' && ops === 0
}

export function canDropIndex(name: string): boolean {
  return name !== '_id_'
}

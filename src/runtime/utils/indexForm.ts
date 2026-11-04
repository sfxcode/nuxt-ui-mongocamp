// Pure rules of the index manager: how to show an index the server lists, and how a create form becomes a request.
// Server facts (live on 1.6.3, brain/project/mongocamp-server-1-6-3-endpoints.md): the listing is an unordered map, so the
// order of a compound index only survives in its name; a text index lists internal keys (`_fts`) and its fields as
// `weights`; the server accepts any number as a direction (`z_5`), so only 1 and -1 are offered; an empty key list and a
// unique index over duplicate data are a 500; identical re-creation is a no-op.

export interface IndexLike {
  name: string
  keys?: Record<string, unknown>
  weights?: Record<string, unknown>
  text?: boolean
  unique?: boolean
  expire?: boolean
  expireAfterSeconds?: number
}

export interface IndexKey {
  field: string
  /** 1, -1, or `text` for a field of a text index. */
  direction: 1 | -1 | 'text' | 'other'
}

export const MAX_INDEX_FIELDS = 8

/**
 * The fields of an index in index order. A text index shows its `weights` fields. For others the key order the server lists
 * is not reliable, so the standard name (`a_1_b_-1`) is used when it spells out exactly these keys; else the listed order.
 */
export function indexKeys(index: IndexLike): IndexKey[] {
  return indexKeysWithOrder(index).keys
}

/**
 * `indexKeys` plus whether the order is **known**: always for one key or a text index, for a compound index only when its
 * standard name spells out the keys. A custom-named compound index is listed in an arbitrary order, so the order is not
 * known and must not be copied onto another collection.
 */
export function indexKeysWithOrder(index: IndexLike): { keys: IndexKey[], orderKnown: boolean } {
  if (index.text && index.weights && Object.keys(index.weights).length > 0) {
    return { keys: Object.keys(index.weights).map(field => ({ field, direction: 'text' as const })), orderKnown: true }
  }
  const entries = Object.entries(index.keys ?? {}).map(([field, value]) => ({ field, direction: (value === 1 || value === -1 ? value : 'other') as IndexKey['direction'], value }))
  if (entries.length <= 1) return { keys: entries.map(e => ({ field: e.field, direction: e.direction })), orderKnown: true }
  const positions = entries.map(e => ({ e, at: index.name.indexOf(`${e.field}_${String(e.value)}`) }))
  if (positions.every(p => p.at >= 0)) {
    const sorted = [...positions].sort((a, b) => a.at - b.at)
    if (sorted.map(p => `${p.e.field}_${String(p.e.value)}`).join('_') === index.name) {
      return { keys: sorted.map(p => ({ field: p.e.field, direction: p.e.direction })), orderKnown: true }
    }
  }
  return { keys: entries.map(e => ({ field: e.field, direction: e.direction })), orderKnown: false }
}

export function describeKey(key: IndexKey): string {
  if (key.direction === 'text') return `${key.field} (text)`
  return `${key.field}: ${key.direction === 1 ? '↑' : key.direction === -1 ? '↓' : '?'}`
}

/** `1.5 KB` style size; `0 B` for nothing. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  return `${unit === 0 ? value : value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`
}

// seconds, minutes, hours, days — `3600s` and `1d` are verified on the server, the others are the same duration syntax
const DURATION = /^[1-9]\d{0,8}[smhd]$/

export function isValidExpireAfter(text: string): boolean {
  return DURATION.test(text.trim())
}

export type IndexKind = 'standard' | 'unique' | 'text' | 'expiring'

export interface IndexForm {
  kind: IndexKind
  /** One row per field; a text or expiring index uses the first. */
  fields: Array<{ field: string, descending: boolean }>
  /** Optional name (standard and unique only). */
  name: string
  expireAfter: string
}

export type IndexFormProblem = 'no-field' | 'empty-field' | 'duplicate-field' | 'too-many-fields' | 'bad-duration' | 'bad-name'

export function validateIndexForm(form: IndexForm): IndexFormProblem[] {
  const problems: IndexFormProblem[] = []
  const rows = form.kind === 'text' || form.kind === 'expiring' ? form.fields.slice(0, 1) : form.fields
  if (rows.length === 0) return ['no-field']
  const names = rows.map(r => r.field.trim())
  if (names.includes('')) problems.push('empty-field')
  if (new Set(names.filter(Boolean)).size !== names.filter(Boolean).length) problems.push('duplicate-field')
  if (rows.length > MAX_INDEX_FIELDS) problems.push('too-many-fields')
  if (form.kind === 'expiring' && !isValidExpireAfter(form.expireAfter)) problems.push('bad-duration')
  if ((form.kind === 'standard' || form.kind === 'unique') && form.name.trim().length > 100) problems.push('bad-name')
  return problems
}

export type IndexRequest
  = | { call: 'createIndex', keys: Record<string, 1 | -1>, options?: { unique?: boolean, name?: string } }
    | { call: 'createTextIndex', field: string }
    | { call: 'createExpiringIndex', field: string, duration: string }

/** The call a valid form stands for. Compound standard and unique indexes go through `createIndex` (verified live). */
export function buildIndexRequest(form: IndexForm): IndexRequest {
  const rows = form.fields.map(r => ({ field: r.field.trim(), descending: r.descending }))
  if (form.kind === 'text') return { call: 'createTextIndex', field: rows[0]!.field }
  if (form.kind === 'expiring') return { call: 'createExpiringIndex', field: rows[0]!.field, duration: form.expireAfter.trim() }
  const keys: Record<string, 1 | -1> = {}
  for (const row of rows) keys[row.field] = row.descending ? -1 : 1
  const options: { unique?: boolean, name?: string } = {}
  if (form.kind === 'unique') options.unique = true
  if (form.name.trim() !== '') options.name = form.name.trim()
  return Object.keys(options).length > 0 ? { call: 'createIndex', keys, options } : { call: 'createIndex', keys }
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

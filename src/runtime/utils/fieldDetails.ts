// What `GET …/fields/detail` (server 1.8.1) says about the fields of a collection: one entry per path (`address.city`,
// the elements of an array as `tags[]`) with the MongoDB `$type` names of the values found in a sample and how often. Pure.
import type { ValueKind } from './analyzeSamples'
import type { BsonType, TypeHints } from './bsonTypes'
import type { FilterFieldType } from './filterBuilder'
import type { ImportColumnType } from './importRows'

export interface FieldDetail {
  path: string
  types?: Array<{ type: string, count: number }>
}

/**
 * The value kind a `$type` name stands for: the numeric types are `number`, `bool` is `boolean`, an `objectId` is shown as
 * text (its values are hex ids), `null` stays `null`. Anything else (`binData`, `regex`, `timestamp`, …) has no chart or
 * filter of its own and gives `undefined`.
 */
export function valueKindOfType(type: string): ValueKind | undefined {
  switch (type) {
    case 'string': case 'objectId': return 'string'
    case 'int': case 'long': case 'double': case 'decimal': return 'number'
    case 'bool': return 'boolean'
    case 'date': return 'date'
    case 'object': return 'object'
    case 'array': return 'array'
    case 'null': return 'null'
    default: return undefined
  }
}

/**
 * The most frequent kind of one field, ignoring `null` and types without a kind (several `$type` names of one kind add up —
 * `int` and `long` are both numbers). `undefined` for a field the sample did not contain or that only held nulls.
 */
export function dominantKindOfField(details: readonly FieldDetail[], path: string): ValueKind | undefined {
  const counts = new Map<ValueKind, number>()
  for (const { type, count } of details.find(d => d.path === path)?.types ?? []) {
    const kind = valueKindOfType(type)
    if (kind && kind !== 'null') counts.set(kind, (counts.get(kind) ?? 0) + count)
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
}

/** The paths a pipeline stage can name, sorted: the elements of arrays (`tags[]`) are not a path one can type. */
export function fieldPathsOf(details: readonly FieldDetail[]): string[] {
  return [...new Set(details.map(d => d.path).filter(path => path !== '' && !path.includes('[')))].sort((a, b) => a.localeCompare(b))
}

// ---- one entry per path, in the module's own type systems ---------------------------------------------------------

/** What one path of a collection holds, from the server's sample. */
export interface FieldTypeInfo {
  path: string
  /** The scalar BSON types found (never `null`), most frequent first; empty for a path that only holds objects/arrays/nulls. */
  types: BsonType[]
  /** The most frequent scalar type. */
  dominant?: BsonType
  /** `object` / `array` when the path holds containers (a field that is only that has no `types`). */
  container?: 'object' | 'array'
  /** More than one kind of value (text and numbers, say). Several numeric types alone (`int` + `long`) are not "mixed". */
  mixed: boolean
  /** The path of an array's element (`tags[]`): typed, but not a field one can select or filter on. */
  element: boolean
}

const BSON_OF_TYPE: Record<string, BsonType> = {
  string: 'string', int: 'int', long: 'long', double: 'double', decimal: 'decimal', bool: 'bool', date: 'date', objectId: 'objectId', null: 'null',
}

const NUMERIC: readonly BsonType[] = ['int', 'long', 'double', 'decimal']
const familyOf = (type: BsonType): string => (NUMERIC.includes(type) ? 'number' : type)

/** The BSON type of a MongoDB `$type` name; `undefined` for object, array and the types without an editor (`binData`, `regex`, …). */
export function bsonOfType(typeName: string): BsonType | undefined {
  return Object.hasOwn(BSON_OF_TYPE, typeName) ? BSON_OF_TYPE[typeName] : undefined
}

/** `fields/detail` as one `FieldTypeInfo` per path, in the server's order. Never throws; a malformed entry is skipped. */
export function toFieldTypeInfos(details: readonly FieldDetail[]): FieldTypeInfo[] {
  const out: FieldTypeInfo[] = []
  for (const detail of details) {
    if (!detail || typeof detail.path !== 'string' || detail.path === '') continue
    const counts = new Map<BsonType, number>()
    let container: FieldTypeInfo['container']
    for (const { type, count } of detail.types ?? []) {
      if (type === 'object' || type === 'array') {
        container ??= type
        continue
      }
      const bson = bsonOfType(type)
      if (bson && bson !== 'null') counts.set(bson, (counts.get(bson) ?? 0) + (Number.isFinite(count) ? count : 0))
    }
    const types = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([type]) => type)
    out.push({
      path: detail.path,
      types,
      dominant: types[0],
      container,
      mixed: new Set(types.map(familyOf)).size > 1,
      element: detail.path.includes('['),
    })
  }
  return out
}

/** The filter builder's field type of a field, or `undefined` when it has no editor (only nulls, binary data, …). */
export function filterTypeOf(info: FieldTypeInfo): FilterFieldType | undefined {
  if (info.path === '_id') return 'objectId'
  if (info.dominant === undefined) return info.container
  switch (familyOf(info.dominant)) {
    case 'number': return 'number'
    case 'string': return 'string'
    case 'bool': return 'boolean'
    case 'date': return 'date-time'
    case 'objectId': return 'objectId'
    default: return undefined
  }
}

/** The import/bulk-edit column type of a field (`json` for containers, `string` when unknown). */
export function columnTypeOf(info: FieldTypeInfo): ImportColumnType {
  if (info.dominant === undefined) return info.container ? 'json' : 'string'
  switch (familyOf(info.dominant)) {
    case 'number': return 'number'
    case 'bool': return 'boolean'
    case 'date': return 'date-time'
    default: return 'string'
  }
}

/**
 * Write hints for typing a value without an original document: a scalar path with exactly **one** type found. A path with
 * several types (`int` + `long`, or text + numbers) is left unhinted so the server decides as it would for plain JSON.
 */
export function toTypeHints(infos: readonly FieldTypeInfo[]): TypeHints {
  const hints: TypeHints = {}
  for (const info of infos) if (info.types.length === 1 && info.container === undefined) hints[info.path] = info.types[0]!
  return hints
}

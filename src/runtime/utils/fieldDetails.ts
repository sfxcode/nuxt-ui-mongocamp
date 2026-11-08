// What `GET …/fields/detail` (server 1.8.1) says about the fields of a collection: one entry per path (`address.city`,
// the elements of an array as `tags[]`) with the MongoDB `$type` names of the values found in a sample and how often. Pure.
import type { ValueKind } from './analyzeSamples'

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

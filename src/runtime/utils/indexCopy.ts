// How the indexes of one collection are recreated on another (a backup that keeps the same indexes). Pure.
// Only what the API can express is copied; anything else is reported as skipped with the reason, never approximated:
// the listing has no partial filter, sparse flag, collation or text weights, a compound text index cannot be created, and
// the key order of a custom-named compound index is not known (see `indexKeysWithOrder`).
import { indexKeysWithOrder } from './indexForm'
import type { IndexLike } from './indexForm'

export type IndexCopySkipReason = 'multi-field-text' | 'unsupported-key' | 'unknown-key-order' | 'custom-weights'

export type IndexCopyPlan
  = | { call: 'createIndex', name: string, keys: Record<string, 1 | -1>, options: { name: string, unique?: boolean, expireAfter?: string } }
    | { call: 'createTextIndex', name: string, field: string }
    | { call: 'skip', name: string, reason: IndexCopySkipReason }

/** The index MongoDB creates by itself on every collection; never copied. */
export const DEFAULT_INDEX_NAME = '_id_'

/** What recreating `index` takes: a `createIndex` with name, `unique` and `expireAfter`, a text index, or a skip with the reason. */
export function planIndexCopy(index: IndexLike): IndexCopyPlan {
  const { keys, orderKnown } = indexKeysWithOrder(index)
  if (index.text) {
    // a text index lists internal keys (`_fts`, `_ftsx`) and its fields as weights: one field only, default weight only
    const weights = Object.entries(index.weights ?? {})
    if (weights.length !== 1) return { call: 'skip', name: index.name, reason: 'multi-field-text' }
    if (weights[0]![1] !== 1) return { call: 'skip', name: index.name, reason: 'custom-weights' }
    return { call: 'createTextIndex', name: index.name, field: weights[0]![0] }
  }
  if (keys.length === 0 || keys.some(k => k.direction !== 1 && k.direction !== -1)) return { call: 'skip', name: index.name, reason: 'unsupported-key' }
  if (!orderKnown) return { call: 'skip', name: index.name, reason: 'unknown-key-order' }
  const orderedKeys: Record<string, 1 | -1> = {}
  for (const key of keys) orderedKeys[key.field] = key.direction as 1 | -1
  const options: { name: string, unique?: boolean, expireAfter?: string } = { name: index.name }
  if (index.unique) options.unique = true
  if (index.expire && typeof index.expireAfterSeconds === 'number' && index.expireAfterSeconds >= 0) options.expireAfter = `${index.expireAfterSeconds}s`
  return { call: 'createIndex', name: index.name, keys: orderedKeys, options }
}

/** The plans for every index of a collection, without the default `_id_` index. */
export function planIndexCopies(indexes: IndexLike[]): IndexCopyPlan[] {
  return indexes.filter(i => i.name !== DEFAULT_INDEX_NAME).map(planIndexCopy)
}

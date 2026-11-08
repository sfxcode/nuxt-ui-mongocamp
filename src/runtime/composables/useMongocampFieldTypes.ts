import { useMongocampClientApi, useState } from '#imports'
import { filterTypeOf, toFieldTypeInfos, toTypeHints } from '../utils/fieldDetails'
import type { FieldTypeInfo } from '../utils/fieldDetails'
import type { TypeHints } from '../utils/bsonTypes'
import type { FilterFieldType } from '../utils/filterBuilder'

const REQUEST_TIMEOUT_MS = 15_000

// requests in flight, shared by every caller so two components asking at once make one request
const inFlight = new Map<string, Promise<void>>()

export type FieldTypesStatus = 'idle' | 'loading' | 'ready' | 'failed'

interface CacheEntry {
  status: FieldTypesStatus
  fields: FieldTypeInfo[]
}

/**
 * The fields of a collection with the types of their values, from the server's own sample (`GET …/fields/detail`, server
 * 1.8.1) — one request per collection, shared by every component that asks (a `useState` cache), instead of guessing from the
 * rows of the page on screen. Components call `load()` (also after a reload that may have changed the data: `load(true)`) and
 * read `fields` / `typeOf` / `filterFields` / `hints`; while nothing is loaded, or when the request failed, they are empty and
 * the caller keeps its own fallback. Never throws.
 */
export function useMongocampFieldTypes(collection: string | (() => string)) {
  const { collectionApi } = useMongocampClientApi()
  const cache = useState<Record<string, CacheEntry>>('mongocamp-field-types', () => ({}))
  const name = () => (typeof collection === 'function' ? collection() : collection)
  const entry = (): CacheEntry => cache.value[name()] ?? { status: 'idle', fields: [] }

  async function load(force = false): Promise<void> {
    const key = name()
    if (!key) return
    if (!force && (cache.value[key]?.status === 'ready' || inFlight.has(key))) return inFlight.get(key)
    const run = (async () => {
      cache.value = { ...cache.value, [key]: { status: 'loading', fields: cache.value[key]?.fields ?? [] } }
      try {
        const details = await collectionApi.getFieldDetails({ collectionName: key }, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
        cache.value = { ...cache.value, [key]: { status: 'ready', fields: toFieldTypeInfos(details) } }
      }
      catch {
        // callers fall back to what the page shows
        cache.value = { ...cache.value, [key]: { status: 'failed', fields: [] } }
      }
      finally {
        inFlight.delete(key)
      }
    })()
    inFlight.set(key, run)
    return run
  }

  /** Forgets one collection (default: the current one) so the next `load()` asks again. */
  function invalidate(target: string = name()) {
    const { [target]: _dropped, ...rest } = cache.value
    cache.value = rest
  }

  const status = (): FieldTypesStatus => entry().status
  /** Every path, array elements included. */
  const fields = (): FieldTypeInfo[] => entry().fields
  /** The paths one can select, filter and edit: no array elements. */
  const selectable = (): FieldTypeInfo[] => entry().fields.filter(f => !f.element)
  const typeOf = (path: string): FieldTypeInfo | undefined => entry().fields.find(f => f.path === path)

  /** The filter builder's fields: every selectable path that has an editor, with its filter type. */
  function filterFields(): { key: string, type: FilterFieldType }[] {
    return selectable().flatMap((f) => {
      const type = filterTypeOf(f)
      return type ? [{ key: f.path, type }] : []
    })
  }

  /** Write hints for `wrapExtendedJson` (see `utils/bsonTypes.ts`). */
  const hints = (): TypeHints => toTypeHints(entry().fields)

  return { load, invalidate, status, fields, selectable, typeOf, filterFields, hints }
}

import { computed, toValue } from 'vue'
import type { ComputedRef, MaybeRefOrGetter } from 'vue'
import { MAX_STORE_BYTES, parseSavedImport, pushRecent, sanitizeRecentList, sanitizeSavedList, serializeSaved, upsertSaved } from '../utils/savedQueries'
import type { ImportFailure, SaveFailure, SavedQuery, SavedQueryEntry } from '../utils/savedQueries'
import { useMongocampPersistedState } from './useMongocampPersistedState'
import type { PersistedStateOptions } from './useMongocampPersistedState'

type Store = {
  saved: SavedQueryEntry[]
  recent: SavedQuery[]
}

export type SavedQueriesSaveResult = { ok: true } | { ok: false, reason: SaveFailure | 'too-large' }
export type SavedQueriesImportResult = { ok: true, imported: number, skipped: number } | { ok: false, reason: ImportFailure | 'too-large' }

/**
 * Saved queries and a short history for one collection, kept in this browser only (`localStorage`, through
 * `useMongocampPersistedState`; nothing is sent to the server). A query is `{ filterGroup?, lucene?, sort?, projection? }`.
 * Everything read back — from storage or an imported file — is validated and bounded: 50 saved, 20 recent.
 */
export function useMongocampSavedQueries(collection: MaybeRefOrGetter<string>, options: Pick<PersistedStateOptions<Store>, 'storage'> = {}) {
  const { state } = useMongocampPersistedState<Store>(
    () => `savedQueries:${toValue(collection)}`,
    { saved: [], recent: [] },
    { ...options, maxBytes: MAX_STORE_BYTES },
  )

  // storage is untrusted (hand-edited, another build): cleaned on every read
  const saved: ComputedRef<SavedQueryEntry[]> = computed(() => sanitizeSavedList(state.value.saved))
  const recent: ComputedRef<SavedQuery[]> = computed(() => sanitizeRecentList(state.value.recent))

  function fits(next: Store): boolean {
    return JSON.stringify(next).length <= MAX_STORE_BYTES
  }

  /** Saves under `name` (an existing name, compared case-insensitively, is replaced). */
  function save(name: string, query: SavedQuery): SavedQueriesSaveResult {
    const result = upsertSaved(saved.value, name, query)
    if (!result.ok) return result
    const next = { saved: result.list, recent: recent.value }
    if (!fits(next)) return { ok: false, reason: 'too-large' }
    state.value = next
    return { ok: true }
  }

  function remove(name: string) {
    const lower = name.toLowerCase()
    state.value = { saved: saved.value.filter(e => e.name.toLowerCase() !== lower), recent: recent.value }
  }

  /** Puts a query that was run at the top of the history (an equal one moves up; an empty or invalid one is ignored). */
  function record(query: SavedQuery): boolean {
    const clean = sanitizeRecentList([query])[0]
    if (!clean) return false
    const next = { saved: saved.value, recent: pushRecent(recent.value, clean) }
    if (!fits(next)) return false
    state.value = next
    return true
  }

  function clearRecent() {
    state.value = { saved: saved.value, recent: [] }
  }

  function exportJson(): string {
    return serializeSaved(saved.value)
  }

  /** Merges a file written by `exportJson`; foreign, oversized or non-JSON input changes nothing. */
  function importJson(text: string): SavedQueriesImportResult {
    const result = parseSavedImport(text, saved.value)
    if (!result.ok) return result
    const next = { saved: result.list, recent: recent.value }
    if (!fits(next)) return { ok: false, reason: 'too-large' }
    state.value = next
    return { ok: true, imported: result.imported, skipped: result.skipped }
  }

  return { saved, recent, save, remove, record, clearRecent, exportJson, importJson }
}

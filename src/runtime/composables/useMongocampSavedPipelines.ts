import { computed, toValue } from 'vue'
import type { ComputedRef, MaybeRefOrGetter } from 'vue'
import type { RequestStage } from '../utils/aggregationPipeline'
import { MAX_PIPELINE_BYTES, MAX_SAVED, sanitizePipelineList, upsertPipeline } from '../utils/savedPipelines'
import type { SavePipelineFailure, SavedPipelineEntry } from '../utils/savedPipelines'
import { useMongocampPersistedState } from './useMongocampPersistedState'
import type { PersistedStateOptions } from './useMongocampPersistedState'

type Store = { pipelines: SavedPipelineEntry[] }

export type SavedPipelinesSaveResult = { ok: true } | { ok: false, reason: SavePipelineFailure | 'too-large' }

/**
 * Saved aggregation pipelines of one collection, kept in this browser only (`localStorage` through
 * `useMongocampPersistedState`; nothing is sent to the server). Up to 50 per collection. Everything read back is checked like
 * a pipeline typed into the JSON tab — a stored `$out`, `$function` or `$lookup` is dropped — so edited storage cannot smuggle
 * a denied operator past the builder.
 */
export function useMongocampSavedPipelines(collection: MaybeRefOrGetter<string>, options: Pick<PersistedStateOptions<Store>, 'storage'> = {}) {
  const { state } = useMongocampPersistedState<Store>(
    () => `savedPipelines:${toValue(collection)}`,
    { pipelines: [] },
    { ...options, maxBytes: MAX_PIPELINE_BYTES * MAX_SAVED },
  )

  const saved: ComputedRef<SavedPipelineEntry[]> = computed(() => sanitizePipelineList(state.value.pipelines))

  /** Saves under `name` (an existing name, compared ignoring case, is replaced). */
  function save(name: string, pipeline: RequestStage[]): SavedPipelinesSaveResult {
    const result = upsertPipeline(saved.value, name, pipeline)
    if (!result.ok) return result
    if (JSON.stringify({ pipelines: result.list }).length > MAX_PIPELINE_BYTES * MAX_SAVED) return { ok: false, reason: 'too-large' }
    state.value = { pipelines: result.list }
    return { ok: true }
  }

  function remove(name: string) {
    const lower = name.toLowerCase()
    state.value = { pipelines: saved.value.filter(e => e.name.toLowerCase() !== lower) }
  }

  return { saved, save, remove }
}

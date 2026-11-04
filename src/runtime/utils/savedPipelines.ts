// Saved aggregation pipelines, kept in this browser per collection. Everything read back is untrusted (hand-edited storage,
// another build): a pipeline must pass the same checks as one typed into the JSON tab, so a stored `$out` or `$function` can
// never come back to life. Names follow the saved-query rules.
import { findForbidden } from './aggregationPipeline'
import type { RequestStage } from './aggregationPipeline'
import { MAX_NAME_LENGTH, MAX_SAVED, sanitizeName } from './savedQueries'

export interface SavedPipelineEntry {
  name: string
  pipeline: RequestStage[]
}

export const MAX_PIPELINE_STAGES = 50
/** Serialised size of one saved pipeline. */
export const MAX_PIPELINE_BYTES = 20_000
export { MAX_NAME_LENGTH, MAX_SAVED }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** A clean copy of a request pipeline, or `undefined` when it is empty, malformed, too large or uses a denied operator. */
export function sanitizePipeline(value: unknown): RequestStage[] | undefined {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_PIPELINE_STAGES) return undefined
  const pipeline: RequestStage[] = []
  for (const item of value) {
    if (!isRecord(item) || typeof item.stage !== 'string' || !item.stage.startsWith('$') || !('value' in item)) return undefined
    pipeline.push({ stage: item.stage, value: item.value })
  }
  let size: number
  try {
    size = JSON.stringify(pipeline).length
  }
  catch {
    return undefined
  }
  if (size > MAX_PIPELINE_BYTES) return undefined
  return findForbidden(pipeline).length > 0 ? undefined : pipeline
}

export type SavePipelineFailure = 'invalid-name' | 'invalid-pipeline' | 'limit'

/** Adds or replaces (name compared ignoring case) an entry; a full list still allows replacing. */
export function upsertPipeline(list: SavedPipelineEntry[], name: unknown, pipeline: unknown, max = MAX_SAVED): { ok: true, list: SavedPipelineEntry[] } | { ok: false, reason: SavePipelineFailure } {
  const cleanName = sanitizeName(name)
  if (!cleanName) return { ok: false, reason: 'invalid-name' }
  const clean = sanitizePipeline(pipeline)
  if (!clean) return { ok: false, reason: 'invalid-pipeline' }
  const index = list.findIndex(e => e.name.toLowerCase() === cleanName.toLowerCase())
  if (index === -1) {
    if (list.length >= max) return { ok: false, reason: 'limit' }
    return { ok: true, list: [...list, { name: cleanName, pipeline: clean }] }
  }
  return { ok: true, list: list.map((e, i) => i === index ? { name: cleanName, pipeline: clean } : e) }
}

export function sanitizePipelineList(value: unknown, max = MAX_SAVED): SavedPipelineEntry[] {
  if (!Array.isArray(value)) return []
  let list: SavedPipelineEntry[] = []
  for (const raw of value) {
    if (!isRecord(raw)) continue
    const result = upsertPipeline(list, raw.name, raw.pipeline, max)
    if (result.ok) list = result.list
  }
  return list
}

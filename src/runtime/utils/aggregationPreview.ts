// What a per-stage preview runs: the pipeline up to and including one stage, cut to a few documents.
import { buildPipeline } from './aggregationPipeline'
import type { AggregationStage, RequestStage } from './aggregationPipeline'

/** Documents shown under a stage. */
export const PREVIEW_LIMIT = 5
/** Wait after the last keystroke before a preview is run again. */
export const PREVIEW_DEBOUNCE_MS = 500

/**
 * The request pipeline for the preview after stage `upTo` (0-based): every stage up to it, with stages that have nothing in
 * them yet left out (as when running), then a `$limit` so the server never builds more than a few documents. A stage that
 * is itself a `$limit` is kept as it is — the appended one only ever makes the result shorter.
 */
export function previewPipeline(stages: AggregationStage[], upTo: number, limit = PREVIEW_LIMIT): RequestStage[] {
  const prefix = buildPipeline(stages.slice(0, upTo + 1))
  return [...prefix, { stage: '$limit', value: Math.max(1, Math.floor(limit)) }]
}

/** A stable text for a pipeline, to tell whether a preview is out of date. */
export function pipelineKey(pipeline: RequestStage[]): string {
  return JSON.stringify(pipeline)
}

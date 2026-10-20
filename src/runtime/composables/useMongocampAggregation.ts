import { useMongocampClientApi, useI18n } from '#imports'
import type { PipelineStage } from '@sfxcode/nuxt-mongocamp-server'
import { useMongocampError } from './useMongocampError'
import { findForbidden } from '../utils/aggregationPipeline'
import type { RequestStage } from '../utils/aggregationPipeline'
import { ForbiddenPipelineError, parseServerError } from '../utils/aggregationErrors'

const AGGREGATE_TIMEOUT_MS = 30000
const REQUEST_TIMEOUT_MS = 15000
const DEFAULT_SAMPLE_SIZE = 500
const MAX_SAMPLE_SIZE = 1000
const DEFAULT_DISTINCT_LIMIT = 100

// The generated API client has no built-in request timeout, so a hung server leaves callers'
// promises pending forever; an AbortSignal bounds every call here.
function withTimeout(ms: number): RequestInit {
  return { signal: AbortSignal.timeout(ms) }
}

export interface AggregationPaging {
  page?: number
  rowsPerPage?: number
}

export interface AggregationResult {
  rows: Record<string, unknown>[]
  // totals as the server reports them for the whole result, not just this page
  total: number
  pages: number
  page: number
}

export type DistinctValue = string | number | boolean

export interface DistinctResult {
  values: DistinctValue[]
  total: number
  truncated: boolean
}

export type AggregationErrorKind = 'forbidden' | 'retryable' | 'mongo' | 'network' | 'unauthorized' | 'forbidden-access' | 'other'

export interface DescribedAggregationError {
  kind: AggregationErrorKind
  message: string
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function headerNumber(headers: { get: (name: string) => string | null } | undefined, name: string): number | undefined {
  const parsed = Number.parseInt(headers?.get(name) ?? '', 10)
  return Number.isNaN(parsed) ? undefined : parsed
}

async function responseMessage(error: unknown): Promise<string | undefined> {
  const response = (error as { response?: Response } | null)?.response
  if (!response) return undefined
  try {
    const body = await response.clone().json() as { msg?: unknown }
    return typeof body?.msg === 'string' ? body.msg : undefined
  }
  catch {
    return undefined
  }
}

async function isEmptyResultError(error: unknown): Promise<boolean> {
  const status = (error as { response?: Response } | null)?.response?.status
  if (status !== 500) return false
  const message = await responseMessage(error)
  return message !== undefined && parseServerError(message).kind === 'empty-result'
}

// Aggregation and sampling over `collectionApi.aggregate`/`distinct`. Results are plain JSON: dates
// come back as ISO strings without milliseconds and 64-bit numbers beyond 2^53 are already rounded
// by JSON parsing. `getSchemaAnalysis` is deliberately not used — the real server returns an
// accumulation of every earlier analysis across collections (see
// brain/project/mongocamp-aggregation-server-behavior.md).
export function useMongocampAggregation() {
  const { collectionApi } = useMongocampClientApi()
  const { describeError } = useMongocampError()
  const { t } = useI18n()

  // Refuses a pipeline using a deny-listed operator (`$function` ran JavaScript on the real server)
  // before anything is sent — this is the gate the visual editor and the raw JSON tab both go through.
  async function runAggregation(collectionName: string, pipeline: RequestStage[], paging: AggregationPaging = {}): Promise<AggregationResult> {
    const findings = findForbidden(pipeline)
    if (findings.length > 0) throw new ForbiddenPipelineError(findings)

    const page = paging.page ?? 1
    let response
    try {
      response = await collectionApi.aggregateRaw({
        collectionName,
        // the generated type says string values; the server takes any JSON. allowDiskUse is required.
        mongoAggregateRequest: { pipeline: pipeline as unknown as PipelineStage[], allowDiskUse: false },
        rowsPerPage: paging.rowsPerPage,
        page,
      }, withTimeout(AGGREGATE_TIMEOUT_MS))
    }
    catch (error) {
      // an aggregation with no result at all is answered with a 500 (the server reads the first element
      // of an empty list) — that is "no results", not a failure; a page past the end is a normal empty page
      if (await isEmptyResultError(error)) return { rows: [], total: 0, pages: 0, page }
      throw error
    }
    const value: unknown = await response.value()
    const rows = Array.isArray(value) ? value.filter(isPlainObject) : []
    const headers = response.raw?.headers
    return {
      rows,
      total: headerNumber(headers, 'x-pagination-count-rows') ?? rows.length,
      pages: headerNumber(headers, 'x-pagination-count-pages') ?? 1,
      page: headerNumber(headers, 'x-pagination-current-page') ?? page,
    }
  }

  // The values arrive as native JSON, unordered, one page of them. Only strings, numbers and booleans
  // are returned: `null` (a field nobody has), arrays (not unwound by the server) and objects are not
  // something to suggest.
  async function listDistinct(collectionName: string, field: string, limit = DEFAULT_DISTINCT_LIMIT): Promise<DistinctResult> {
    const response = await collectionApi.distinctRaw({ collectionName, field, rowsPerPage: limit, page: 1 }, withTimeout(REQUEST_TIMEOUT_MS))
    const value: unknown = await response.value()
    const values = (Array.isArray(value) ? value : [])
      .filter((v): v is DistinctValue => typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean')
    const total = headerNumber(response.raw?.headers, 'x-pagination-count-rows') ?? values.length
    return { values, total, truncated: total > values.length }
  }

  // A random sample of documents in one page, for client-side statistics.
  async function sampleDocuments(collectionName: string, size = DEFAULT_SAMPLE_SIZE): Promise<AggregationResult> {
    const clamped = Math.min(Math.max(Math.floor(size) || DEFAULT_SAMPLE_SIZE, 1), MAX_SAMPLE_SIZE)
    return runAggregation(collectionName, [{ stage: '$sample', value: { size: clamped } }], { page: 1, rowsPerPage: clamped })
  }

  // Turns whatever a call threw into one showable message. The server's own text for a failed command
  // names the database server's host and port, so only the quoted MongoDB message is ever shown.
  async function describeAggregationError(error: unknown): Promise<DescribedAggregationError> {
    if (error instanceof ForbiddenPipelineError) {
      return { kind: 'forbidden', message: t('nuxtUiMongocamp.aggregation.errors.forbidden', { operator: error.findings[0]?.operator ?? '' }) }
    }
    const response = (error as { response?: Response } | null)?.response
    const status = response?.status
    if (status === 405) return { kind: 'retryable', message: t('nuxtUiMongocamp.aggregation.errors.retryable') }
    if (response && status !== undefined && status >= 400 && status !== 401 && status !== 403) {
      try {
        const body = await response.clone().json() as { msg?: unknown }
        if (typeof body?.msg === 'string' && body.msg) {
          const info = parseServerError(body.msg)
          // an empty result never gets here (runAggregation turns it into an empty page)
          if (info.kind !== 'empty-result' && info.message) return { kind: info.kind, message: info.message }
        }
      }
      catch {
        // body already read or not JSON — use the generic description
      }
    }
    const described = describeError(error)
    return { kind: described.kind === 'forbidden' ? 'forbidden-access' : described.kind, message: described.message }
  }

  return { runAggregation, listDistinct, sampleDocuments, describeAggregationError }
}

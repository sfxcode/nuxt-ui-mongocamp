import { useMongocampClientApi, useI18n } from '#imports'
import type { PipelineStage } from '@sfxcode/nuxt-mongocamp-server'
import { useMongocampError } from './useMongocampError'
import { findForbidden, STATS_OPERATORS } from '../utils/aggregationPipeline'
import type { RequestStage } from '../utils/aggregationPipeline'
import { ForbiddenPipelineError } from '../utils/aggregationErrors'
import { stripServerFields } from '../utils/aggregationResult'
import { readJsonKeepingLongs } from '../utils/bigIntJson'
import { unwrapExtendedJson } from './useMongocampExtendedJson'
import { notAllowedOperator, OPERATOR_NOT_ALLOWED_CODE, readServerError } from '../utils/serverError'

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

export interface AggregationOptions {
  /**
   * Lets the pipeline use `$collStats` / `$indexStats` (storage and index-usage numbers) — and nothing else from the
   * deny-list. Their results carry the database server's address, so `host` and `ns` are removed from every row.
   * For the module's own stats calls; the aggregation builder never sets it.
   */
  allowStatsStages?: boolean
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

// Aggregation and sampling over `collectionApi.aggregate`/`distinct`. Results are plain JSON: dates
// come back as ISO strings without milliseconds and 64-bit numbers beyond 2^53 are already rounded
// by JSON parsing. `getSchemaAnalysis` is deliberately not used — the server's own analysis
// is replaced by a client-side one over a `$sample` (see brain/project/mongocamp-aggregation-server-behavior.md).
export function useMongocampAggregation() {
  const { collectionApi } = useMongocampClientApi()
  const { describeError } = useMongocampError()
  const { t } = useI18n()

  // Refuses a pipeline using a deny-listed operator before anything is sent (server 1.6.3 refuses `$function`, `$out`
  // and friends itself with 403 / 4031, but still accepts `$lookup`, `$unionWith`, `$graphLookup`, `$collStats` and
  // `$indexStats`) — this is the gate the visual editor and the raw JSON tab both go through.
  async function runAggregation(collectionName: string, pipeline: RequestStage[], paging: AggregationPaging = {}, options: AggregationOptions = {}): Promise<AggregationResult> {
    const findings = findForbidden(pipeline, options.allowStatsStages ? STATS_OPERATORS : [])
    if (findings.length > 0) throw new ForbiddenPipelineError(findings)

    const page = paging.page ?? 1
    // no result at all is a normal `200 []`
    const response = await collectionApi.aggregateRaw({
      collectionName,
      // the generated type says string values; the server takes any JSON. allowDiskUse is required.
      mongoAggregateRequest: { pipeline: pipeline as unknown as PipelineStage[], allowDiskUse: false },
      rowsPerPage: paging.rowsPerPage,
      page,
    }, withTimeout(AGGREGATE_TIMEOUT_MS))
    // read from the response text so integers beyond 2^53 stay exact; they (and the decimal/int wrappers the server
    // writes) come out of unwrapExtendedJson as an exact digit string / a number
    const value = await readJsonKeepingLongs(response)
    const unwrapped = Array.isArray(value) ? value.filter(isPlainObject).map(row => unwrapExtendedJson(row) as Record<string, unknown>) : []
    // a stats stage's rows carry the database server's address: never hand it on
    const rows = options.allowStatsStages ? stripServerFields(unwrapped) : unwrapped
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
    const value = unwrapExtendedJson(await readJsonKeepingLongs(response))
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
    // The server refuses these operators itself (403, code 4031) — shown like a deny-list hit, not as a missing permission.
    const server = await readServerError(error)
    if (server.code === OPERATOR_NOT_ALLOWED_CODE) {
      const operator = notAllowedOperator(server.message)
      return { kind: 'forbidden', message: operator ? t('nuxtUiMongocamp.aggregation.errors.forbidden', { operator }) : t('nuxtUiMongocamp.errors.notAllowed') }
    }
    const status = server.status
    if (status === 405) return { kind: 'retryable', message: t('nuxtUiMongocamp.aggregation.errors.retryable') }
    // the hosted server's front proxy rewrites upstream errors into a body-less 503
    if (status === 503) return { kind: 'retryable', message: t('nuxtUiMongocamp.aggregation.errors.unavailable') }
    if (status !== undefined && status >= 400 && status !== 401 && status !== 403 && server.message) {
      return { kind: server.kind ?? 'other', message: server.message }
    }
    const described = describeError(error)
    const kind: AggregationErrorKind = described.kind === 'forbidden' ? 'forbidden-access' : (described.kind === 'notAllowed' || described.kind === 'invalid') ? 'other' : described.kind
    return { kind, message: described.message }
  }

  return { runAggregation, listDistinct, sampleDocuments, describeAggregationError }
}

// What MongocampCollectionCharts asks the server and how the answer becomes chart data. Pure.
// The aggregations were run on server 1.6.3 (live, 2026-11-04): for a `$group` + `$sort` the pagination total is the number
// of groups, so one page of 10 gives the top 10 values and the number of distinct values at once; a missing or null field is
// the group `_id: null`; `$dateToString` needs the field to be a date and `$bucketAuto` is thrown off by a text value in a number
// field, so both are preceded by a `$type` match; a number beyond 2^53 comes back with every digit.
import type { RequestStage } from './aggregationPipeline'
import { DATE_FORMATS, isTemplateField } from './aggregationTemplates'
import type { DateUnit } from './aggregationTemplates'
import type { FieldStatistic, SampleAnalysis, ValueKind } from './analyzeSamples'

export type ChartKind = 'values' | 'dates' | 'numbers'

export interface ChartPoint {
  label: string
  count: number
}

export const DEFAULT_TOP = 10
export const DEFAULT_BUCKETS = 10
/** Periods of a date histogram that are drawn; more are cut (the first ones are kept) and the chart says so. */
export const MAX_PERIODS = 100
/** Up to this many bars a date histogram is a bar chart, beyond it an area chart reads better. */
export const MAX_BAR_PERIODS = 36

/** The chart a field of this (dominant) value kind gets, or `undefined` when none makes sense (objects, arrays, only nulls). */
export function chartKindFor(kind: ValueKind | undefined): ChartKind | undefined {
  switch (kind) {
    case 'string': case 'boolean': return 'values'
    case 'date': return 'dates'
    case 'number': return 'numbers'
    default: return undefined
  }
}

/** The most frequent value kind of a field in a sample analysis, ignoring `null`; `undefined` for an unknown field. */
export function dominantKind(analysis: SampleAnalysis, field: string): ValueKind | undefined {
  const stat: FieldStatistic | undefined = analysis.fields.find(f => f.path === field)
  return stat?.types.find(t => t.type !== 'null')?.type
}

export interface ChartRequest {
  pipeline: RequestStage[]
  /** How many rows the single page holds. */
  rowsPerPage: number
}

export interface ChartOptions {
  top?: number
  buckets?: number
  unit?: DateUnit
}

/** The request for a chart, or `undefined` when the field name cannot be used in a pipeline. */
export function chartRequest(kind: ChartKind, field: string, options: ChartOptions = {}): ChartRequest | undefined {
  if (!isTemplateField(field)) return undefined
  const name = field.trim()
  const path = `$${name}`
  if (kind === 'values') {
    return {
      pipeline: [{ stage: '$group', value: { _id: path, count: { $sum: 1 } } }, { stage: '$sort', value: { count: -1, _id: 1 } }],
      rowsPerPage: options.top ?? DEFAULT_TOP,
    }
  }
  if (kind === 'dates') {
    return {
      pipeline: [
        { stage: '$match', value: { [name]: { $type: 'date' } } },
        { stage: '$group', value: { _id: { $dateToString: { format: DATE_FORMATS[options.unit ?? 'month'], date: path } }, count: { $sum: 1 } } },
        { stage: '$sort', value: { _id: 1 } },
      ],
      rowsPerPage: MAX_PERIODS,
    }
  }
  return {
    pipeline: [
      { stage: '$match', value: { [name]: { $type: 'number' } } },
      { stage: '$bucketAuto', value: { groupBy: path, buckets: options.buckets ?? DEFAULT_BUCKETS } },
    ],
    rowsPerPage: options.buckets ?? DEFAULT_BUCKETS,
  }
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value)
}

function countOf(row: Record<string, unknown>): number {
  const n = Number(row.count)
  return Number.isFinite(n) ? n : 0
}

/** Rows of the aggregation as chart points. `noneLabel` names the group of documents without a value. */
export function rowsToPoints(kind: ChartKind, rows: Record<string, unknown>[], noneLabel: string): ChartPoint[] {
  return rows.map((row) => {
    const id = row._id
    if (kind === 'numbers') {
      const range = (typeof id === 'object' && id !== null ? id : {}) as { min?: unknown, max?: unknown }
      // an exact digit string (a number beyond 2^53) stays text
      return { label: `${text(range.min)}–${text(range.max)}`, count: countOf(row) }
    }
    return { label: id === null || id === undefined ? noneLabel : text(id), count: countOf(row) }
  })
}

/** Which UChart type draws it. */
export function chartTypeFor(kind: ChartKind, points: number): 'bar' | 'area' {
  return kind === 'dates' && points > MAX_BAR_PERIODS ? 'area' : 'bar'
}

/** The highest point (the first one on a tie), for the text description of a chart. */
export function highestPoint(points: ChartPoint[]): ChartPoint | undefined {
  return points.reduce<ChartPoint | undefined>((best, p) => (!best || p.count > best.count ? p : best), undefined)
}

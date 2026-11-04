// Deciding how to chart the rows an aggregation already returned: which column labels the bars, which hold the numbers.
// Rows are arbitrary (every `$group`/`$project` makes its own keys), so everything here is defensive.

export const MAX_CHART_ROWS = 100
export const MAX_SERIES = 6
export const LABEL_KEY = '__label'

export type ResultChartKind = 'bar' | 'area' | 'donut'

const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * A row's label as text: a `$bucketAuto` range `{ min, max }` becomes `min–max`, any other object (a compound `_id`)
 * is flattened to `key=value` pairs, `null` is `(none)`.
 */
export function labelText(value: unknown): string {
  if (value === null || value === undefined) return '(none)'
  if (isRecord(value)) {
    const keys = Object.keys(value)
    if (keys.length === 2 && 'min' in value && 'max' in value) return `${labelText(value.min)}–${labelText(value.max)}`
    return keys.map(key => `${key}=${isRecord(value[key]) ? JSON.stringify(value[key]) : labelText(value[key])}`).join(', ')
  }
  return Array.isArray(value) ? JSON.stringify(value) : String(value)
}

/** Columns that hold at least one number and may be drawn (the label column is never one). */
export function valueColumns(rows: Record<string, unknown>[], columns: string[], labelKey?: string): string[] {
  const sample = rows.slice(0, MAX_CHART_ROWS)
  return columns.filter(key => key !== labelKey && sample.some(row => isNumber(row[key])))
}

/** The column that names the rows: `_id` when present, else the first column with a non-number value. */
export function defaultLabelKey(rows: Record<string, unknown>[], columns: string[]): string | undefined {
  if (columns.includes('_id')) return '_id'
  const sample = rows.slice(0, MAX_CHART_ROWS)
  return columns.find(key => sample.some(row => row[key] !== undefined && !isNumber(row[key]))) ?? columns[0]
}

const DATE_LIKE = /^\d{4}-\d{2}(?:-\d{2})?/

/** Chart type for these labels/values: a donut for a few non-negative slices, an area for dates, else bars. */
export function defaultKind(labels: string[], series: number, allNonNegative: boolean): ResultChartKind {
  if (series === 1 && allNonNegative && labels.length >= 2 && labels.length <= 6) return 'donut'
  if (labels.length >= 3 && labels.every(label => DATE_LIKE.test(label))) return 'area'
  return 'bar'
}

export interface ResultChart {
  kind: ResultChartKind
  labelKey: string
  valueKeys: string[]
  /** One object per chart row: `{ __label, <valueKey>: number … }` */
  data: Record<string, unknown>[]
  /** The result had more rows than were charted */
  cut: boolean
  /** Rows without a number in any chosen column are left out; how many */
  skipped: number
}

/** `null` when there is nothing to chart (no rows, no numeric column). */
export function buildResultChart(
  rows: Record<string, unknown>[],
  columns: string[],
  choice: { labelKey?: string, valueKeys?: string[], kind?: ResultChartKind } = {},
): ResultChart | null {
  const labelKey = choice.labelKey && columns.includes(choice.labelKey) ? choice.labelKey : defaultLabelKey(rows, columns)
  if (!labelKey || rows.length === 0) return null
  const available = valueColumns(rows, columns, labelKey)
  const chosen = (choice.valueKeys ?? []).filter(key => available.includes(key))
  const valueKeys = (chosen.length ? chosen : available).slice(0, MAX_SERIES)
  if (valueKeys.length === 0) return null

  const data: Record<string, unknown>[] = []
  let skipped = 0
  for (const row of rows.slice(0, MAX_CHART_ROWS)) {
    if (!valueKeys.some(key => isNumber(row[key]))) {
      skipped++
      continue
    }
    const point: Record<string, unknown> = { [LABEL_KEY]: labelText(row[labelKey]) }
    for (const key of valueKeys) point[key] = isNumber(row[key]) ? row[key] : 0
    data.push(point)
  }
  if (data.length === 0) return null

  const labels = data.map(point => point[LABEL_KEY] as string)
  const nonNegative = data.every(point => valueKeys.every(key => (point[key] as number) >= 0))
  return {
    kind: choice.kind ?? defaultKind(labels, valueKeys.length, nonNegative),
    labelKey,
    valueKeys,
    data,
    cut: rows.length > MAX_CHART_ROWS,
    skipped,
  }
}

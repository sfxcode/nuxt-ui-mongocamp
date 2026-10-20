// Glue between the raw text of an import file and rows ready for `insertMany`: parse, (CSV)
// type-coerce, (JSON) unwrap extended JSON, validate — with every error traced back to the row
// number in the user's file. Pure, so the import dialog stays a thin view over it.
import { unwrapExtendedJson } from '../composables/useMongocampExtendedJson'
import { DEFAULT_IMPORT_LIMITS, coerceRow, inferColumnTypes, parseCsvRows, parseJsonRows, validateRows } from './importRows'
import type { CoerceOptions, ImportColumnType, ImportError, ImportLimits } from './importRows'

export type ImportFormat = 'json' | 'csv'

export interface PrepareImportInput {
  format: ImportFormat
  text: string
  delimiter?: string
  // CSV only; inferred from the data when omitted
  columnTypes?: Record<string, ImportColumnType>
  emptyCells?: CoerceOptions['emptyCells']
  limits?: ImportLimits
}

export interface PreparedImport {
  rows: Record<string, unknown>[]
  // index in the file of each entry of `rows` (0-based data rows; the CSV header is not counted)
  sourceIndexes: number[]
  columns: string[]
  columnTypes: Record<string, ImportColumnType>
  // `rowIndex` is the file row; -1 means the whole file
  errors: ImportError[]
  truncated: boolean
  // rows the file contained that were readable as rows at all (kept + dropped)
  sourceRowCount: number
}

const PREVIEW_KEY_ROWS = 100

export function detectImportFormat(fileName: string, text: string): ImportFormat {
  const lower = fileName.toLowerCase()
  if (lower.endsWith('.json')) return 'json'
  if (lower.endsWith('.csv') || lower.endsWith('.tsv')) return 'csv'
  const first = text.replace(/^\uFEFF/, '').trimStart()[0]
  return first === '[' || first === '{' ? 'json' : 'csv'
}

function collectKeys(rows: Record<string, unknown>[]): string[] {
  const keys = new Set<string>()
  for (const row of rows.slice(0, PREVIEW_KEY_ROWS)) for (const key of Object.keys(row)) keys.add(key)
  return [...keys]
}

export function prepareImport(input: PrepareImportInput): PreparedImport {
  const limits = input.limits ?? DEFAULT_IMPORT_LIMITS
  const parsed = input.format === 'json'
    ? parseJsonRows(input.text, limits)
    : parseCsvRows(input.text, input.delimiter, limits)
  const errors: ImportError[] = [...parsed.errors]
  const parsedSources = parsed.sourceIndexes ?? parsed.rows.map((_, i) => i)
  const columns = parsed.columns ?? collectKeys(parsed.rows)
  const sourceRowCount = parsed.rows.length + parsed.errors.filter(e => e.rowIndex >= 0).length

  let columnTypes: Record<string, ImportColumnType> = {}
  let candidates: Record<string, unknown>[] = []
  let candidateSources: number[] = []

  if (input.format === 'csv') {
    columnTypes = input.columnTypes ?? inferColumnTypes(parsed.rows, columns)
    parsed.rows.forEach((row, i) => {
      const { row: typed, errors: cellErrors } = coerceRow(row, columnTypes, { emptyCells: input.emptyCells })
      if (cellErrors.length > 0) {
        for (const e of cellErrors) errors.push({ rowIndex: parsedSources[i]!, ...e })
        return
      }
      candidates.push(typed)
      candidateSources.push(parsedSources[i]!)
    })
  }
  else {
    candidates = parsed.rows.map(row => unwrapExtendedJson(row) as Record<string, unknown>)
    candidateSources = parsedSources
  }

  const validated = validateRows(candidates, limits)
  for (const e of validated.errors) errors.push(e.rowIndex >= 0 ? { ...e, rowIndex: candidateSources[e.rowIndex]! } : e)

  return {
    rows: validated.rows,
    sourceIndexes: (validated.sourceIndexes ?? []).map(i => candidateSources[i]!),
    columns,
    columnTypes,
    errors,
    truncated: validated.truncated,
    sourceRowCount,
  }
}

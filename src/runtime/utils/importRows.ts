// Plain helpers for importing documents from a JSON or CSV file: parsing, per-column type
// coercion and validation. No API calls and no DOM, so they behave the same in session and
// server-proxy mode and run in plain Node. `rowIndex` is always the 0-based index of the data row
// in the list the function was given (CSV: header excluded); -1 means the whole file.
import { isIsoDateTimeString } from './isoDate'
import { isObjectIdHex } from './objectId'

export type ImportColumnType = 'string' | 'number' | 'boolean' | 'date-time' | 'json'

export type ImportErrorCode
  = 'file-too-large'
    | 'invalid-json'
    | 'not-array'
    | 'not-object'
    | 'invalid-delimiter'
    | 'invalid-csv'
    | 'invalid-header'
    | 'field-count'
    | 'too-many-rows'
    | 'empty-row'
    | 'forbidden-key'
    | 'too-deep'
    | 'invalid-number'
    | 'unsafe-integer'
    | 'invalid-id'
    | 'invalid-boolean'
    | 'invalid-date'
    | 'invalid-json-value'

export interface ImportError {
  rowIndex: number
  column?: string
  code: ImportErrorCode
  message: string
}

export interface ImportLimits {
  maxRows: number
  maxBytes: number
}

export interface ImportReport<T = Record<string, unknown>> {
  rows: T[]
  columns?: string[]
  errors: ImportError[]
  truncated: boolean
  // for each entry of `rows`, its index in the input — rows get dropped, so this keeps errors
  // and kept rows traceable to the line the user sees in their file
  sourceIndexes?: number[]
}

export interface CoerceOptions {
  // Empty CSV cells are always omitted for non-string columns; this decides string columns.
  emptyCells?: 'omit' | 'empty-string'
}

export interface CoerceResult {
  row: Record<string, unknown>
  errors: { column: string, code: ImportErrorCode, message: string }[]
}

export const DEFAULT_IMPORT_LIMITS: ImportLimits = { maxRows: 10_000, maxBytes: 5 * 1024 * 1024 }

const MAX_DEPTH = 64

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text
}

function fileError(code: ImportErrorCode, message: string): ImportReport {
  return { rows: [], errors: [{ rowIndex: -1, code, message }], truncated: false }
}

export function parseJsonRows(text: string, limits: ImportLimits = DEFAULT_IMPORT_LIMITS): ImportReport {
  if (text.length > limits.maxBytes) return fileError('file-too-large', `File is larger than ${limits.maxBytes} bytes`)
  let parsed: unknown
  try {
    parsed = JSON.parse(stripBom(text))
  }
  catch (e) {
    return fileError('invalid-json', `Invalid JSON: ${e instanceof Error ? e.message : String(e)}`)
  }
  if (!Array.isArray(parsed)) return fileError('not-array', 'Expected a JSON array of objects')
  const report: ImportReport = { rows: [], errors: [], truncated: false, sourceIndexes: [] }
  parsed.forEach((item, rowIndex) => {
    if (isPlainObject(item)) {
      report.rows.push(item)
      report.sourceIndexes!.push(rowIndex)
    }
    else report.errors.push({ rowIndex, code: 'not-object', message: 'Row is not an object' })
  })
  return report
}

// RFC 4180 state machine: quoted fields may hold delimiters, quotes ("") and line breaks; any of
// CRLF/LF/CR ends a record; a quote inside an unquoted field is kept literally (lenient).
function splitCsv(text: string, delimiter: string): string[][] | null {
  const records: string[][] = []
  let record: string[] = []
  let field = ''
  let inQuotes = false
  let fieldStart = true
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        }
        else {
          inQuotes = false
        }
      }
      else {
        field += ch
      }
      continue
    }
    if (ch === '"' && fieldStart) {
      inQuotes = true
      fieldStart = false
    }
    else if (ch === delimiter) {
      record.push(field)
      field = ''
      fieldStart = true
    }
    else if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      record.push(field)
      records.push(record)
      record = []
      field = ''
      fieldStart = true
    }
    else {
      field += ch
      fieldStart = false
    }
  }
  if (inQuotes) return null
  if (field !== '' || record.length > 0) {
    record.push(field)
    records.push(record)
  }
  // blank lines carry no data
  return records.filter(r => !(r.length === 1 && r[0] === ''))
}

export function parseCsvRows(
  text: string,
  delimiter = ',',
  limits: ImportLimits = DEFAULT_IMPORT_LIMITS,
): ImportReport<Record<string, string>> {
  const fail = (code: ImportErrorCode, message: string): ImportReport<Record<string, string>> =>
    ({ rows: [], errors: [{ rowIndex: -1, code, message }], truncated: false })
  if (delimiter.length !== 1 || /["\r\n]/.test(delimiter)) return fail('invalid-delimiter', 'Delimiter must be a single character other than a quote or line break')
  if (text.length > limits.maxBytes) return fail('file-too-large', `File is larger than ${limits.maxBytes} bytes`)
  const records = splitCsv(stripBom(text), delimiter)
  if (!records) return fail('invalid-csv', 'A quoted field is not closed')
  const [headerRecord, ...dataRecords] = records
  if (!headerRecord) return fail('invalid-csv', 'The file has no header row')
  const columns = headerRecord.map(name => name.trim())
  if (columns.includes('')) return fail('invalid-header', 'The header row has an empty column name')
  const duplicate = columns.find((name, i) => columns.indexOf(name) !== i)
  if (duplicate !== undefined) return fail('invalid-header', `Duplicate column name "${duplicate}"`)

  const report: ImportReport<Record<string, string>> = { rows: [], columns, errors: [], truncated: false, sourceIndexes: [] }
  dataRecords.forEach((fields, rowIndex) => {
    if (fields.length > columns.length) {
      report.errors.push({ rowIndex, code: 'field-count', message: `Row has ${fields.length} fields, expected ${columns.length}` })
      return
    }
    const row: Record<string, string> = {}
    columns.forEach((name, i) => {
      row[name] = fields[i] ?? ''
    })
    report.rows.push(row)
    report.sourceIndexes!.push(rowIndex)
  })
  return report
}

function forbiddenKeyPath(value: unknown, path: string, depth: number): { path: string, tooDeep: boolean } | undefined {
  if (depth > MAX_DEPTH) return { path, tooDeep: true }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const found = forbiddenKeyPath(value[i], `${path}[${i}]`, depth + 1)
      if (found) return found
    }
    return undefined
  }
  if (!isPlainObject(value)) return undefined
  for (const [key, inner] of Object.entries(value)) {
    const keyPath = path ? `${path}.${key}` : key
    if (key === '__proto__' || key.startsWith('$')) return { path: keyPath, tooDeep: false }
    const found = forbiddenKeyPath(inner, keyPath, depth + 1)
    if (found) return found
  }
  return undefined
}

// Caps the row count, drops empty rows, rows carrying operator-like keys and rows with an `_id` the
// server would reject (it must be a 24-hex string). Any key starting with "$" (and "__proto__")
// is refused at every level — an import must only ever add plain data, and the server stores
// extended-JSON wrappers as literal sub-documents. Run JSON rows through `unwrapExtendedJson`
// first so `{ $date }` / `{ $oid }` become plain values.
export function validateRows<T extends Record<string, unknown>>(rows: T[], limits: ImportLimits = DEFAULT_IMPORT_LIMITS): ImportReport<T> {
  const report: ImportReport<T> = { rows: [], errors: [], truncated: false, sourceIndexes: [] }
  rows.forEach((row, rowIndex) => {
    if (rowIndex >= limits.maxRows) return
    if (Object.keys(row).length === 0) {
      report.errors.push({ rowIndex, code: 'empty-row', message: 'Row has no fields' })
      return
    }
    if ('_id' in row && !isObjectIdHex(row._id)) {
      report.errors.push({ rowIndex, column: '_id', code: 'invalid-id', message: '_id must be a 24-character hex string' })
      return
    }
    const bad = forbiddenKeyPath(row, '', 0)
    if (bad) {
      report.errors.push(bad.tooDeep
        ? { rowIndex, column: bad.path, code: 'too-deep', message: `Row is nested deeper than ${MAX_DEPTH} levels` }
        : { rowIndex, column: bad.path, code: 'forbidden-key', message: `Key "${bad.path}" is not allowed` })
      return
    }
    report.rows.push(row)
    report.sourceIndexes!.push(rowIndex)
  })
  if (rows.length > limits.maxRows) {
    report.truncated = true
    report.errors.push({ rowIndex: -1, code: 'too-many-rows', message: `Only the first ${limits.maxRows} of ${rows.length} rows are kept` })
  }
  return report
}

const TRUE_VALUES = ['true', '1', 'yes']
const FALSE_VALUES = ['false', '0', 'no']
const NUMBER_PATTERN = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i
const INTEGER_PATTERN = /^[+-]?\d+$/

// Dates are stored as ISO-8601 strings: the server keeps `{ $date }` wrappers as literal
// sub-documents, so a string is the only form that displays and filters sanely. Dates without an
// offset are read as UTC (a bare date is midnight UTC), so the same file imports identically
// wherever the browser runs.
function coerceDate(text: string): string {
  if (!isIsoDateTimeString(text)) throw new Error('not an ISO date')
  let iso = text.replace(' ', 'T')
  const timePart = iso.split('T')[1]
  if (timePart === undefined) iso += 'T00:00:00Z'
  else if (!/(?:Z|[+-]\d{2}:?\d{2})$/.test(timePart)) iso += 'Z'
  return new Date(iso).toISOString()
}

function coerceValue(text: string, type: ImportColumnType): { value?: unknown, error?: { code: ImportErrorCode, message: string } } {
  try {
    switch (type) {
      case 'number': {
        if (!NUMBER_PATTERN.test(text)) return { error: { code: 'invalid-number', message: 'Not a number' } }
        const asNumber = Number(text)
        if (!Number.isFinite(asNumber)) return { error: { code: 'invalid-number', message: 'Number out of range' } }
        // beyond 2^53 a JSON number silently rounds; refuse instead and let the user pick a text column
        if (INTEGER_PATTERN.test(text) && !Number.isSafeInteger(asNumber)) {
          return { error: { code: 'unsafe-integer', message: 'Integer is beyond ±(2^53 − 1) and would lose precision; import it as text' } }
        }
        return { value: asNumber }
      }
      case 'boolean': {
        const lower = text.toLowerCase()
        if (TRUE_VALUES.includes(lower)) return { value: true }
        if (FALSE_VALUES.includes(lower)) return { value: false }
        return { error: { code: 'invalid-boolean', message: 'Expected true/false, 1/0 or yes/no' } }
      }
      case 'date-time':
        return { value: coerceDate(text) }
      case 'json':
        return { value: JSON.parse(text) }
      default:
        return { value: text }
    }
  }
  catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    const code: ImportErrorCode = type === 'date-time' ? 'invalid-date' : 'invalid-json-value'
    return { error: { code, message } }
  }
}

// Turns the strings of one CSV row into typed values. Columns without a type stay strings; values
// that are not strings (a JSON import) pass through untouched. A cell that fails to convert is
// reported and left out of the row.
export function coerceRow(
  row: Record<string, unknown>,
  columnTypes: Record<string, ImportColumnType>,
  options: CoerceOptions = {},
): CoerceResult {
  const result: CoerceResult = { row: {}, errors: [] }
  for (const [column, value] of Object.entries(row)) {
    if (typeof value !== 'string') {
      result.row[column] = value
      continue
    }
    const type = columnTypes[column] ?? 'string'
    const text = type === 'string' ? value : value.trim()
    if (text === '') {
      if (type === 'string' && options.emptyCells === 'empty-string') result.row[column] = ''
      continue
    }
    const { value: converted, error } = coerceValue(text, type)
    if (error) result.errors.push({ column, ...error })
    else result.row[column] = converted
  }
  return result
}

// Suggests a type per CSV column from its non-empty values, so the preview starts sensible and the
// user only corrects exceptions. Integers with a leading zero ("007") and integers beyond the safe
// range stay text — converting them would change or lose digits.
export function inferColumnTypes(rows: Record<string, unknown>[], columns: string[]): Record<string, ImportColumnType> {
  const types: Record<string, ImportColumnType> = {}
  for (const column of columns) {
    const values = rows
      .map(row => row[column])
      .filter((value): value is string => typeof value === 'string' && value.trim() !== '')
      .map(value => value.trim())
    if (values.length === 0) types[column] = 'string'
    else if (values.every(v => /^(?:true|false|yes|no)$/i.test(v))) types[column] = 'boolean'
    else if (values.every(isPlainNumberText)) types[column] = 'number'
    else if (values.every(isIsoDateTimeString)) types[column] = 'date-time'
    else types[column] = 'string'
  }
  return types
}

function isPlainNumberText(text: string): boolean {
  if (!NUMBER_PATTERN.test(text)) return false
  if (/^[+-]?0\d/.test(text)) return false
  return !INTEGER_PATTERN.test(text) || Number.isSafeInteger(Number(text))
}

import { unwrapExtendedJson } from '../composables/useMongocampExtendedJson'
import { rowsToCsv } from './exportRows'

// Turning documents into the text of an export file. Pure: no API calls, no DOM.

export type ExportFormat = 'json' | 'ndjson' | 'csv'

export const EXPORT_MIME_TYPES: Record<ExportFormat, string> = {
  json: 'application/json',
  ndjson: 'application/x-ndjson',
  csv: 'text/csv',
}

/** More documents than this are not read into one browser file unless the caller raises the cap on purpose. */
export const DEFAULT_EXPORT_MAX_ROWS = 50_000

const INTEGER_TEXT = /^-?\d+$/

// An integer beyond ±(2^53 − 1) arrives as `{ $numberLong: 'digits' }` (see utils/bigIntJson.ts). It becomes a BigInt here,
// so that `unwrapExtendedJson` leaves it alone and the JSON writer can emit its exact digits as a bare number — the
// same integer the server sent — instead of a string (which would change its type) or a rounded number.
function longsToBigInt(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(longsToBigInt)
  if (typeof value !== 'object' || value === null) return value
  const entries = Object.entries(value as Record<string, unknown>)
  const only = entries.length === 1 ? entries[0]! : undefined
  if (only && only[0] === '$numberLong' && typeof only[1] === 'string' && INTEGER_TEXT.test(only[1]) && !Number.isSafeInteger(Number(only[1]))) {
    return BigInt(only[1])
  }
  return Object.fromEntries(entries.map(([key, inner]) => [key, longsToBigInt(inner)]))
}

/**
 * One document as it is written to a file: extended-JSON wrappers become plain values (`$oid` → text, `$date` → ISO text,
 * `$numberInt` → number), and an integer beyond 2^53 is kept exact as a BigInt (a bare number in JSON, digits in CSV).
 * A `$numberDecimal` becomes a JS number, like in the table (rounded past ~15 significant digits).
 */
export function toExportRow(row: Record<string, unknown>): Record<string, unknown> {
  return unwrapExtendedJson(longsToBigInt(row)) as Record<string, unknown>
}

// JSON.stringify cannot write a BigInt; the replacer swaps it for a token that is then rewritten as the bare digits. The
// token is random per call, so no document text can collide with it.
function jsonText(value: unknown, space?: number): string {
  const token = `\u0000LONG${Math.random().toString(36).slice(2)}:`
  const text = JSON.stringify(value, (_key, inner) => (typeof inner === 'bigint' ? `${token}${inner}` : inner), space)
  // JSON.stringify writes the NUL as the six characters \u0000
  return text.replaceAll(new RegExp(`"\\\\u0000${token.slice(1)}(-?\\d+)"`, 'g'), '$1')
}

/**
 * The columns of a CSV export: the keys of **all** rows in order of first appearance (a later row with a new key is not
 * lost), `_id` first. Nested objects and arrays become one cell of JSON text.
 */
export function exportColumns(rows: Record<string, unknown>[]): string[] {
  const keys = new Set<string>()
  for (const row of rows) for (const key of Object.keys(row)) keys.add(key)
  return keys.has('_id') ? ['_id', ...[...keys].filter(key => key !== '_id')] : [...keys]
}

export interface FormatOptions {
  /** `json` only: 2-space indentation instead of one document per line. */
  pretty?: boolean
  /** `csv` only: the columns, in this order (default: `exportColumns`). */
  columns?: string[]
}

/**
 * The text of an export file for rows already passed through `toExportRow`.
 * - `json`: an array, one document per line (`pretty: true`: indented);
 * - `ndjson`: one compact document per line (what `mongoimport` and most tools read);
 * - `csv`: a header row and one row per document, RFC 4180 quoting, `\r\n` line ends.
 */
export function formatDocuments(rows: Record<string, unknown>[], format: ExportFormat, options: FormatOptions = {}): string {
  if (format === 'ndjson') return rows.length === 0 ? '' : `${rows.map(row => jsonText(row)).join('\n')}\n`
  if (format === 'csv') {
    const columns = options.columns ?? exportColumns(rows)
    return columns.length === 0 ? '' : rowsToCsv(rows, columns)
  }
  if (options.pretty) return jsonText(rows, 2)
  return rows.length === 0 ? '[]\n' : `[\n${rows.map(row => `  ${jsonText(row)}`).join(',\n')}\n]\n`
}

/** `customers-20241231-2359.csv`: the collection name made safe for a file name, a local timestamp and the extension. */
export function exportFilename(collectionName: string, format: ExportFormat, now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`
  const safe = collectionName.replace(/[^\w.-]+/g, '_') || 'export'
  return `${safe}-${stamp}.${format}`
}

// The BSON types a value can be written as, and how each one is spelled in the request body (extended JSON).
// The server honours every wrapper on insert, update, partial update and `updateMany` (verified live on 1.8.1), so a value
// written with its wrapper keeps its type; a plain JSON value leaves the choice (long vs int vs double, date vs text) to
// the server. Pure.
export type BsonType = 'string' | 'int' | 'long' | 'double' | 'decimal' | 'bool' | 'date' | 'objectId' | 'null'

/** Dotted path of a field → the type to write it as (array elements as `tags[]`). */
export type TypeHints = Record<string, BsonType>

export const BSON_TYPES: readonly BsonType[] = ['string', 'int', 'long', 'double', 'decimal', 'bool', 'date', 'objectId', 'null']

const INT32_MIN = -(2 ** 31)
const INT32_MAX = 2 ** 31 - 1
const INTEGER_TEXT = /^-?\d+$/
const DECIMAL_TEXT = /^-?\d+(?:\.\d+)?(?:e[+-]?\d+)?$/i
const OBJECT_ID_TEXT = /^[0-9a-f]{24}$/i
// Only a full timestamp with an explicit zone is a date for the server: a bare date (`2025-05-05`) is stored as text, and a
// timestamp without a zone would be read in the browser's time zone — neither is wrapped.
const FULL_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})$/
const isFullTimestamp = (value: string) => FULL_TIMESTAMP.test(value) && !Number.isNaN(Date.parse(value))

/** A number from a number or a numeric text; `undefined` for anything else (empty, NaN, Infinity). */
function toNumber(value: unknown): number | undefined {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : Number.NaN
  return Number.isFinite(n) ? n : undefined
}

/**
 * `value` written as `type`. A value that does not fit the type (2.5 as an int, text that is no id as an objectId, a long
 * beyond 2^53 given as a number) is returned **unchanged** — the server then picks the type, which is what a plain value
 * would have got anyway. Never throws.
 */
export function wireValue(type: BsonType, value: unknown): unknown {
  switch (type) {
    case 'int': {
      const n = toNumber(value)
      return n !== undefined && Number.isInteger(n) && n >= INT32_MIN && n <= INT32_MAX ? { $numberInt: String(n) } : value
    }
    case 'long': {
      // a digit string keeps every digit (a long beyond 2^53 cannot be a JS number)
      if (typeof value === 'string' && INTEGER_TEXT.test(value.trim())) return { $numberLong: value.trim() }
      const n = toNumber(value)
      return n !== undefined && Number.isSafeInteger(n) ? { $numberLong: String(n) } : value
    }
    case 'double': {
      const n = toNumber(value)
      return n !== undefined ? { $numberDouble: String(n) } : value
    }
    case 'decimal': {
      // the text is kept as typed, so `2.50` stays `2.50`
      if (typeof value === 'string' && DECIMAL_TEXT.test(value.trim())) return { $numberDecimal: value.trim() }
      const n = toNumber(value)
      return n !== undefined ? { $numberDecimal: String(n) } : value
    }
    case 'date':
      return typeof value === 'string' && isFullTimestamp(value) ? { $date: value } : value
    case 'objectId':
      return typeof value === 'string' && OBJECT_ID_TEXT.test(value) ? { $oid: value } : value
    case 'string':
      // the server stores a timestamp-shaped string as a DATE unless it is wrapped as text
      return typeof value === 'string' && isFullTimestamp(value) ? { $string: value } : value
    default:
      return value
  }
}

import { isIsoDateTimeString } from '../utils/isoDate'
import { wireValue } from '../utils/bsonTypes'
import type { TypeHints } from '../utils/bsonTypes'

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const NUMBER_WRAPPER_KEYS = ['$numberInt', '$numberLong', '$numberDouble', '$numberDecimal']

function unwrapDateTime(raw: Record<string, unknown>): unknown {
  const inner = raw.$date
  if (typeof inner === 'string' || typeof inner === 'number') return new Date(inner).toISOString()
  if (isPlainObject(inner) && typeof inner.$numberLong === 'string') return new Date(Number(inner.$numberLong)).toISOString()
  return raw
}

const INTEGER_TEXT = /^-?\d+$/

// `$numberLong` beyond ±(2^53 − 1) cannot be a JS number without changing digits, so it stays the exact digit string
// (`exactLongs`, the default). `$numberDecimal` still becomes a JS number: past ~15 significant digits it is rounded.
function unwrapNumber(raw: Record<string, unknown>, exactLongs: boolean): number | string | undefined {
  for (const key of NUMBER_WRAPPER_KEYS) {
    const wrapped = raw[key]
    if (typeof wrapped === 'string' || typeof wrapped === 'number') {
      const parsed = Number(wrapped)
      if (Number.isNaN(parsed)) continue
      if (key === '$numberLong' && exactLongs && typeof wrapped === 'string' && INTEGER_TEXT.test(wrapped) && !Number.isSafeInteger(parsed)) return wrapped
      return parsed
    }
  }
  return undefined
}

export interface UnwrapOptions {
  /** Keep a `$numberLong` outside the safe-integer range as its exact digit string (default `true`). `false` gives the rounded number, e.g. for type inference. */
  exactLongs?: boolean
}

// Converts a raw MongoDB document (possibly containing extended-JSON wrappers) into plain JS
// values — both a usable live form value and valid schema-inference input for
// useFormKitAutoForm's inferFormSchemaFromSamples, which has no notion of $oid/$date/$number*.
export function unwrapExtendedJson(value: unknown, options: UnwrapOptions = {}): unknown {
  if (Array.isArray(value)) return value.map(item => unwrapExtendedJson(item, options))
  if (!isPlainObject(value)) return value
  if (typeof value.$oid === 'string') return value.$oid
  // text that looks like a date but is stored as text (the server marks it so in a typed read)
  if (typeof value.$string === 'string' && Object.keys(value).length === 1) return value.$string
  if ('$date' in value) return unwrapDateTime(value)
  const number = unwrapNumber(value, options.exactLongs ?? true)
  if (number !== undefined) return number
  const result: Record<string, unknown> = {}
  for (const [key, v] of Object.entries(value)) result[key] = unwrapExtendedJson(v, options)
  return result
}

const INT32_MIN = -(2 ** 31)
const INT32_MAX = 2 ** 31 - 1

// A number goes back as the wrapper its original had, so editing an int does not turn it into a long and an edited decimal
// stays a decimal. A value that no longer fits the type (2.5 for an int) is sent plain and the server picks the type.
function rewrapNumber(value: number, original: Record<string, unknown>): unknown {
  if (!Number.isFinite(value)) return value
  if ('$numberInt' in original && Number.isInteger(value) && value >= INT32_MIN && value <= INT32_MAX) return { $numberInt: String(value) }
  if ('$numberLong' in original && Number.isSafeInteger(value)) return { $numberLong: String(value) }
  if ('$numberDouble' in original) return { $numberDouble: String(value) }
  if ('$numberDecimal' in original) return { $numberDecimal: String(value) }
  return value
}

// `{ $oid }`, `{ $numberInt }`, `{ $string }` … — one wrapper, i.e. a typed original
function isWrapper(value: unknown): value is Record<string, unknown> {
  if (!isPlainObject(value)) return false
  const keys = Object.keys(value)
  return keys.length === 1 && keys[0]!.startsWith('$')
}

const joinKey = (path: string, key: string) => (path === '' ? key : `${path}.${key}`)

function rewrapValue(value: unknown, originalValue: unknown, path: string, hints?: TypeHints): unknown {
  // a hint types a scalar that has no typed original (insert, a new field of an edit); a typed original always wins
  const hint = hints?.[path]
  if (hint !== undefined && !isWrapper(originalValue) && value !== null && typeof value !== 'object') return wireValue(hint, value)
  // an exact long (kept as its digit string by unwrapExtendedJson) goes back as the wrapper, so it stays a 64-bit integer
  if (typeof value === 'string' && INTEGER_TEXT.test(value) && isPlainObject(originalValue) && typeof originalValue.$numberLong === 'string') {
    return { $numberLong: value }
  }
  if (typeof value === 'number' && isPlainObject(originalValue)) {
    const wrapped = rewrapNumber(value, originalValue)
    if (wrapped !== value) return wrapped
  }
  // the server stores a string that looks like a timestamp as a DATE unless it is wrapped as text — text that was text stays text
  if (typeof value === 'string' && isPlainObject(originalValue) && typeof originalValue.$string === 'string') {
    return { $string: value }
  }
  if (typeof value === 'string' && isIsoDateTimeString(value)) {
    return { $date: value }
  }
  if (typeof value === 'string' && isPlainObject(originalValue) && typeof originalValue.$oid === 'string') {
    return { $oid: value }
  }
  if (Array.isArray(value)) {
    const originalArray = Array.isArray(originalValue) ? originalValue : []
    return value.map((item, index) => rewrapValue(item, originalArray[index], `${path}[]`, hints))
  }
  if (isPlainObject(value)) {
    const originalObject = isPlainObject(originalValue) ? originalValue : undefined
    const nested: Record<string, unknown> = {}
    for (const [key, v] of Object.entries(value)) nested[key] = rewrapValue(v, originalObject?.[key], joinKey(path, key), hints)
    return nested
  }
  return value
}

// Converts the plain-object shape a FUAutoForm-generated form emits back into a document
// payload safe for documentApi.insert/update. Date-time (-> $date) and originally-$oid string
// fields are rewrapped; with a typed original (a canonical read, server 1.8.1) so are text that
// looks like a date (`$string`) and numbers that were int/long/double/decimal — the server honours
// every wrapper on insert, update, partial update and updateMany (verified live). Everything else
// round-trips as a plain JS value.
// When originalDoc is given (the edit case), the result starts as a clone of it, so any field
// present on the real document but never touched by the form survives untouched —
// documentApi.update is full-replace, so reconstructing the payload purely from the form's own
// output would silently delete it.
// `hints` (dotted path → BSON type, see utils/bsonTypes.ts) types the fields that have no typed original: an insert, or a
// field the edited document did not have. Without a hint the old guessing applies (a timestamp-shaped string is a date).
export function wrapExtendedJson(
  formData: Record<string, unknown>,
  originalDoc?: Record<string, unknown>,
  hints?: TypeHints,
): Record<string, unknown> {
  const result: Record<string, unknown> = originalDoc ? { ...originalDoc } : {}

  for (const [key, value] of Object.entries(formData)) {
    result[key] = rewrapValue(value, originalDoc?.[key], key, hints)
  }

  delete result._id
  return result
}

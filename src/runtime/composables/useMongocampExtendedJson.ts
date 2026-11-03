import { isIsoDateTimeString } from '../utils/isoDate'

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
  if ('$date' in value) return unwrapDateTime(value)
  const number = unwrapNumber(value, options.exactLongs ?? true)
  if (number !== undefined) return number
  const result: Record<string, unknown> = {}
  for (const [key, v] of Object.entries(value)) result[key] = unwrapExtendedJson(v, options)
  return result
}

function rewrapValue(value: unknown, originalValue: unknown): unknown {
  // an exact long (kept as its digit string by unwrapExtendedJson) goes back as the wrapper, so it stays a 64-bit integer
  if (typeof value === 'string' && INTEGER_TEXT.test(value) && isPlainObject(originalValue) && typeof originalValue.$numberLong === 'string') {
    return { $numberLong: value }
  }
  if (typeof value === 'string' && isIsoDateTimeString(value)) {
    return { $date: value }
  }
  if (typeof value === 'string' && isPlainObject(originalValue) && typeof originalValue.$oid === 'string') {
    return { $oid: value }
  }
  if (Array.isArray(value)) {
    const originalArray = Array.isArray(originalValue) ? originalValue : []
    return value.map((item, index) => rewrapValue(item, originalArray[index]))
  }
  if (isPlainObject(value)) {
    const originalObject = isPlainObject(originalValue) ? originalValue : undefined
    const nested: Record<string, unknown> = {}
    for (const [key, v] of Object.entries(value)) nested[key] = rewrapValue(v, originalObject?.[key])
    return nested
  }
  return value
}

// Converts the plain-object shape a FUAutoForm-generated form emits back into a document
// payload safe for documentApi.insert/update. Only date-time (-> $date) and originally-$oid
// string fields need rewrapping; everything else round-trips as a plain JS value, since the
// server accepts plain shapes on write (only reads return the extended-JSON wrapped form).
// When originalDoc is given (the edit case), the result starts as a clone of it, so any field
// present on the real document but never touched by the form survives untouched —
// documentApi.update is full-replace, so reconstructing the payload purely from the form's own
// output would silently delete it.
export function wrapExtendedJson(
  formData: Record<string, unknown>,
  originalDoc?: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = originalDoc ? { ...originalDoc } : {}

  for (const [key, value] of Object.entries(formData)) {
    result[key] = rewrapValue(value, originalDoc?.[key])
  }

  delete result._id
  return result
}

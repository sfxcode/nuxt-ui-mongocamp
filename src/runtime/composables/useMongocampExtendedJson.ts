function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const NUMBER_WRAPPER_KEYS = ['$numberInt', '$numberLong', '$numberDouble', '$numberDecimal']

// Mirrors useFormKitAutoForm's own ISO-detection regex so a field this composable rewraps as
// a date is exactly the set of fields FUAutoForm's inference rendered as a date input in the
// first place — nuxtUIInputDate with valueType: 'iso' always emits a full ISO string back.
const ISO_DATE_TIME_REGEX = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/

function isIsoDateTimeString(value: string): boolean {
  return ISO_DATE_TIME_REGEX.test(value) && !Number.isNaN(Date.parse(value))
}

function unwrapDateTime(raw: Record<string, unknown>): unknown {
  const inner = raw.$date
  if (typeof inner === 'string' || typeof inner === 'number') return new Date(inner).toISOString()
  if (isPlainObject(inner) && typeof inner.$numberLong === 'string') return new Date(Number(inner.$numberLong)).toISOString()
  return raw
}

function unwrapNumber(raw: Record<string, unknown>): number | undefined {
  for (const key of NUMBER_WRAPPER_KEYS) {
    const wrapped = raw[key]
    if (typeof wrapped === 'string' || typeof wrapped === 'number') {
      const parsed = Number(wrapped)
      if (!Number.isNaN(parsed)) return parsed
    }
  }
  return undefined
}

// Converts a raw MongoDB document (possibly containing extended-JSON wrappers) into plain JS
// values — both a usable live form value and valid schema-inference input for
// useFormKitAutoForm's inferFormSchemaFromSamples, which has no notion of $oid/$date/$number*.
export function unwrapExtendedJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(unwrapExtendedJson)
  if (!isPlainObject(value)) return value
  if (typeof value.$oid === 'string') return value.$oid
  if ('$date' in value) return unwrapDateTime(value)
  const number = unwrapNumber(value)
  if (number !== undefined) return number
  const result: Record<string, unknown> = {}
  for (const [key, v] of Object.entries(value)) result[key] = unwrapExtendedJson(v)
  return result
}

function rewrapValue(value: unknown, originalValue: unknown): unknown {
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

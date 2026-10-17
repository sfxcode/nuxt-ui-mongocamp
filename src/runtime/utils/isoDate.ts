// Mirrors useFormKitAutoForm's own ISO-detection regex so a field this composable rewraps as
// a date is exactly the set of fields FUAutoForm's inference rendered as a date input in the
// first place — nuxtUIInputDate with valueType: 'iso' always emits a full ISO string back.
const ISO_DATE_TIME_REGEX = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/

export function isIsoDateTimeString(value: string): boolean {
  return ISO_DATE_TIME_REGEX.test(value) && !Number.isNaN(Date.parse(value))
}

import type { FilterFieldType, FilterOperator } from './filterBuilder'

// Suggestions only make sense where the user types a value that should be one of the field's real
// values: an exact match (or its negation) or a list of them, on text fields. "contains" and the
// like take free text, numbers and dates have their own inputs.
const SUGGESTION_OPERATORS: FilterOperator[] = ['equals', 'notEquals', 'oneOf']

export interface SuggestionOption {
  // what the input receives when the option is chosen
  value: string
  label: string
}

// The server's text match is not a literal comparison: `: * ? ( )` and a backslash act as query syntax
// even inside quotes and escaped (the filter fails or matches nothing/too much — verified live, no
// escaping form helps), so a value containing one can never be filtered on reliably and is not
// offered. In a list a comma would also split the value in two.
const UNFILTERABLE = /[:*?()\\]/

export function isSuggestable(value: string, operator: FilterOperator): boolean {
  if (value.trim() === '' || UNFILTERABLE.test(value)) return false
  return operator !== 'oneOf' || !value.includes(',')
}

export function wantsSuggestions(type: FilterFieldType, operator: FilterOperator): boolean {
  return type === 'string' && SUGGESTION_OPERATORS.includes(operator)
}

// Options for a native `<datalist>`, which filters them against the whole input text. For a list
// ("is one of") the option carries the entries already typed in front of it, so choosing it extends
// the list instead of replacing it, and entries already in the list are not offered again.
export function suggestionOptions(values: string[], operator: FilterOperator, text: string): SuggestionOption[] {
  const unique = [...new Set(values)].filter(value => isSuggestable(value, operator))
  if (operator !== 'oneOf') return unique.map(value => ({ value, label: value }))
  const entered = text.split(',').slice(0, -1).map(item => item.trim()).filter(item => item.length > 0)
  return unique
    .filter(value => !entered.includes(value))
    .map(value => ({ value: [...entered, value].join(', '), label: value }))
}

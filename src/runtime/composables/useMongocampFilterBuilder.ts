import { isIsoDateTimeString } from './useMongocampExtendedJson'
import { useMongocampQuery } from './useMongocampQuery'

// Pure logic behind the visual filter builder: turns a list of "field · operator · value" rows into
// one Lucene query string. No Nuxt context, no UI — the component only edits `FilterGroup` data.

export type FilterFieldType = 'string' | 'number' | 'date-time' | 'boolean' | 'array' | 'object'

export type FilterOperator
  = | 'contains' | 'equals' | 'notEquals' | 'startsWith' | 'endsWith' | 'oneOf'
    | 'gte' | 'lte' | 'between'
    | 'isTrue' | 'isFalse'
    | 'isEmpty' | 'isNotEmpty'

export interface FilterCondition {
  id: string
  field: string
  operator: FilterOperator
  /** Raw text from the input. Numbers/dates are validated here, not by the UI. */
  value?: string
  /** Upper bound of `between`. */
  value2?: string
}

export interface FilterGroup {
  match: 'all' | 'any'
  conditions: FilterCondition[]
}

// `isEmpty` / `isNotEmpty` mean "field is absent / present" (Lucene `_exists_`) — for arrays and
// objects that is the only sensible test, and the UI labels them "exists" / "does not exist" there.
export const FILTER_OPERATORS_BY_TYPE: Record<FilterFieldType, FilterOperator[]> = {
  'string': ['contains', 'equals', 'notEquals', 'startsWith', 'endsWith', 'oneOf', 'isEmpty', 'isNotEmpty'],
  'number': ['equals', 'notEquals', 'gte', 'lte', 'between', 'oneOf', 'isEmpty', 'isNotEmpty'],
  'date-time': ['gte', 'lte', 'between', 'isEmpty', 'isNotEmpty'],
  'boolean': ['isTrue', 'isFalse', 'isEmpty', 'isNotEmpty'],
  'array': ['isNotEmpty', 'isEmpty'],
  'object': ['isNotEmpty', 'isEmpty'],
}

export function operatorsFor(type: FilterFieldType): FilterOperator[] {
  return FILTER_OPERATORS_BY_TYPE[type] ?? FILTER_OPERATORS_BY_TYPE.string
}

/** How many value inputs an operator needs (0 = none, 2 = a range). */
export function valueCountFor(operator: FilterOperator): 0 | 1 | 2 {
  if (operator === 'between') return 2
  if (operator === 'isTrue' || operator === 'isFalse' || operator === 'isEmpty' || operator === 'isNotEmpty') return 0
  return 1
}

// Lucene field names need the same escaping as values (a name like "first name" would otherwise
// split into two tokens); the helpers in useMongocampQuery only escape values.
function escapeFieldName(name: string): string {
  return name.replace(/[+\-&|!(){}[\]^"~:\\/ *?]/g, '\\$&')
}

function parseNumber(raw: string): number | null {
  if (raw === '') return null
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : null
}

// `useMongocampQuery().inRange` copies its bounds into the query unescaped, so anything that reaches
// it must already be a number or an ISO date — free text there could smuggle in query syntax.
function parseRangeBound(type: FilterFieldType, raw: string): string | null {
  if (type === 'number') {
    const parsed = parseNumber(raw)
    return parsed === null ? null : String(parsed)
  }
  if (type === 'date-time') return isIsoDateTimeString(raw) ? raw : null
  return null
}

function splitList(raw: string): string[] {
  return raw.split(',').map(item => item.trim()).filter(item => item.length > 0)
}

/** Lucene for one row, or `''` when the row is incomplete/invalid (so it is simply not applied). */
export function buildCondition(condition: FilterCondition, type: FilterFieldType): string {
  if (!condition.field || !operatorsFor(type).includes(condition.operator)) return ''

  const h = useMongocampQuery()
  const field = escapeFieldName(condition.field)
  const value = (condition.value ?? '').trim()
  const value2 = (condition.value2 ?? '').trim()

  switch (condition.operator) {
    // exists/notExists escape the name themselves, so they get the raw one
    case 'isEmpty': return h.notExists(condition.field)
    case 'isNotEmpty': return h.exists(condition.field)
    case 'isTrue': return `${field}:true`
    case 'isFalse': return `${field}:false`

    case 'gte': {
      const from = parseRangeBound(type, value)
      return from === null ? '' : h.inRange(field, from, null)
    }
    case 'lte': {
      const to = parseRangeBound(type, value)
      return to === null ? '' : h.inRange(field, null, to)
    }
    case 'between': {
      const from = parseRangeBound(type, value)
      const to = parseRangeBound(type, value2)
      return from === null || to === null ? '' : h.inRange(field, from, to)
    }

    case 'contains': return value ? h.like(field, value) : ''
    case 'startsWith': return value ? h.startsWith(field, value) : ''
    case 'endsWith': return value ? h.endsWith(field, value) : ''

    case 'equals':
    case 'notEquals': {
      const negate = condition.operator === 'notEquals'
      if (type === 'number') {
        const parsed = parseNumber(value)
        if (parsed === null) return ''
        // numbers stay unquoted (what inClause does for numbers) so Lucene treats them as numeric
        const expression = h.inClause(field, [parsed])
        return negate ? `-${expression}` : expression
      }
      return negate ? h.notEquals(field, value) : h.equals(field, value)
    }

    case 'oneOf': {
      const items = splitList(value)
      if (items.length === 0) return ''
      if (type === 'number') {
        const numbers = items.map(parseNumber)
        // one bad entry makes the whole row invalid rather than silently dropping it
        return numbers.includes(null) ? '' : h.inClause(field, numbers as number[])
      }
      return h.inClause(field, items)
    }
  }
  return ''
}

/** Combines every valid row with AND (`match: 'all'`) or OR (`'any'`). `''` means "no filter". */
export function buildFilterQuery(group: FilterGroup, fieldTypes: Record<string, FilterFieldType>): string {
  const h = useMongocampQuery()
  const parts = group.conditions.map(c => buildCondition(c, fieldTypes[c.field] ?? 'string'))
  return group.match === 'any' ? h.or(...parts) : h.and(...parts)
}

/** Rows that actually contribute to the query — what a "Filters (n)" badge should show. */
export function countActiveConditions(group: FilterGroup, fieldTypes: Record<string, FilterFieldType>): number {
  return group.conditions.filter(c => buildCondition(c, fieldTypes[c.field] ?? 'string') !== '').length
}

export function useMongocampFilterBuilder() {
  return { operatorsFor, valueCountFor, buildCondition, buildFilterQuery, countActiveConditions }
}

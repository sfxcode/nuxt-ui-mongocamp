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

// Only what was checked against a real MongoCamp server is offered. `isEmpty` / `isNotEmpty` (written
// `-field:*` / `field:*`) work for text fields; `_exists_:field` matched nothing, and `field:*` matched
// nothing on a date, so existence tests are text-only. Arrays and objects therefore have no operators.
export const FILTER_OPERATORS_BY_TYPE: Record<FilterFieldType, FilterOperator[]> = {
  'string': ['contains', 'equals', 'notEquals', 'startsWith', 'endsWith', 'oneOf', 'isEmpty', 'isNotEmpty'],
  'number': ['equals', 'notEquals', 'gte', 'lte', 'between', 'oneOf'],
  'date-time': ['gte', 'lte', 'between'],
  'boolean': ['isTrue', 'isFalse'],
  'array': [],
  'object': [],
}

export function operatorsFor(type: FilterFieldType): FilterOperator[] {
  // own-property check: a stray type like 'constructor' must not resolve to an Object.prototype member
  return Object.hasOwn(FILTER_OPERATORS_BY_TYPE, type) ? FILTER_OPERATORS_BY_TYPE[type] : FILTER_OPERATORS_BY_TYPE.string
}

/** Maps the type names `useMongocampSchema` infers onto the ones the builder understands. */
export function toFilterFieldType(columnType: string): FilterFieldType {
  if (columnType === 'integer') return 'number'
  return Object.hasOwn(FILTER_OPERATORS_BY_TYPE, columnType) ? columnType as FilterFieldType : 'string'
}

/** i18n key for an operator's label; date fields read "on or after" instead of "at least". */
export function operatorLabelKey(operator: FilterOperator, type: FilterFieldType): string {
  const dateWording = type === 'date-time' && (operator === 'gte' || operator === 'lte' || operator === 'between')
  return `nuxtUiMongocamp.filterBuilder.operators.${operator}${dateWording ? 'Date' : ''}`
}

/** The value part of a row as text for a summary chip: `''`, `a`, or `a – b` for a range. */
export function conditionValueText(condition: FilterCondition): string {
  const count = valueCountFor(condition.operator)
  if (count === 0) return ''
  const value = (condition.value ?? '').trim()
  return count === 2 ? `${value} – ${(condition.value2 ?? '').trim()}` : value
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

const PLAIN_NUMBER_REGEX = /^-?(?:\d+(?:\.\d+)?|\.\d+)$/

// Returns the digits as typed rather than a JS number: ids and account numbers beyond 2^53 would
// otherwise be silently rounded to a different value. Exponent notation (1e3) is not accepted.
function parseNumber(raw: string): string | null {
  return PLAIN_NUMBER_REGEX.test(raw) ? raw : null
}

// `field:v` for one value, `field:(a OR b)` for several — numbers stay unquoted so Lucene treats them as numeric
function numericTerm(field: string, values: string[]): string {
  return values.length === 1 ? `${field}:${values[0]}` : `${field}:(${values.join(' OR ')})`
}

// `useMongocampQuery().inRange` copies its bounds into the query unescaped, so anything that reaches
// it must already be a number or an ISO date — free text there could smuggle in query syntax.
// Checked against a real MongoCamp server: `[x TO *]` (an open end) makes the request fail, while a closed
// range works. So "at least"/"at most" use these far-away bounds instead of `*`. The number bounds are the
// 64-bit integer limits, the date bounds the earliest/latest year.
const FAR_BOUND: Partial<Record<FilterFieldType, { from: string, to: string }>> = {
  'number': { from: '-9223372036854775808', to: '9223372036854775807' },
  'date-time': { from: '0001-01-01T00:00:00Z', to: '9999-12-31T23:59:59.999Z' },
}

const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/

// A bare date is widened to a full UTC timestamp — start of day for the lower bound, end of day for the
// upper — so "on or before 2018-01-01" includes that whole day. Closed ranges with timestamps like this
// work against a real MongoCamp server.
function parseRangeBound(type: FilterFieldType, raw: string, edge: 'from' | 'to'): string | null {
  if (type === 'number') return parseNumber(raw)
  if (type === 'date-time') {
    if (!isIsoDateTimeString(raw)) return null
    return DATE_ONLY_REGEX.test(raw) ? `${raw}${edge === 'from' ? 'T00:00:00Z' : 'T23:59:59.999Z'}` : raw
  }
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
    // `field:*` = "has a value"; only offered for text fields (see FILTER_OPERATORS_BY_TYPE)
    case 'isEmpty': return `-${field}:*`
    case 'isNotEmpty': return `${field}:*`
    case 'isTrue': return `${field}:true`
    case 'isFalse': return `${field}:false`

    case 'gte': {
      const from = parseRangeBound(type, value, 'from')
      return from === null ? '' : h.inRange(field, from, FAR_BOUND[type]?.to ?? null)
    }
    case 'lte': {
      const to = parseRangeBound(type, value, 'to')
      return to === null ? '' : h.inRange(field, FAR_BOUND[type]?.from ?? null, to)
    }
    case 'between': {
      const from = parseRangeBound(type, value, 'from')
      const to = parseRangeBound(type, value2, 'to')
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
        const expression = numericTerm(field, [parsed])
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
        return numbers.includes(null) ? '' : numericTerm(field, numbers as string[])
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
  return { operatorsFor, valueCountFor, toFilterFieldType, operatorLabelKey, conditionValueText, buildCondition, buildFilterQuery, countActiveConditions }
}

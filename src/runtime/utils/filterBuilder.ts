import { useMongocampQuery } from '../composables/useMongocampQuery'
import type { ExistsFieldType } from '../composables/useMongocampQuery'
import { escapeFieldName } from './escapeFieldName'
import { isIsoDateTimeString } from './isoDate'

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

// Only what was checked against a real MongoCamp server is offered (see useMongocampQuery for how the
// existence and open-ended range cases are written). Booleans have no existence test: none was verified.
// Arrays and objects have no operators at all.
export const FILTER_OPERATORS_BY_TYPE: Record<FilterFieldType, FilterOperator[]> = {
  'string': ['contains', 'equals', 'notEquals', 'startsWith', 'endsWith', 'oneOf', 'isEmpty', 'isNotEmpty'],
  'number': ['equals', 'notEquals', 'gte', 'lte', 'between', 'oneOf', 'isEmpty', 'isNotEmpty'],
  'date-time': ['gte', 'lte', 'between', 'isEmpty', 'isNotEmpty'],
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

// Only a plain number or an ISO date may become a range bound — what the user typed is validated here,
// and `useMongocampQuery().inRange` then supplies the far bound for an open end and widens a bare date
// to the whole UTC day.
function parseRangeBound(type: FilterFieldType, raw: string): string | null {
  if (type === 'number') return parseNumber(raw)
  if (type === 'date-time') return isIsoDateTimeString(raw) ? raw : null
  return null
}

// the existence queries pick the shortest form that works for the field's type
function existsType(type: FilterFieldType): ExistsFieldType | undefined {
  if (type === 'string') return 'text'
  if (type === 'number') return 'number'
  if (type === 'date-time') return 'date'
  return undefined
}

function splitList(raw: string): string[] {
  return raw.split(',').map(item => item.trim()).filter(item => item.length > 0)
}

/** Lucene for one row, or `''` when the row is incomplete/invalid (so it is simply not applied). */
export function buildCondition(condition: FilterCondition, type: FilterFieldType): string {
  if (!condition.field || !operatorsFor(type).includes(condition.operator)) return ''

  const h = useMongocampQuery()
  // the query helpers escape the name themselves; only the terms written here need it done by hand
  const field = condition.field
  const escapedField = escapeFieldName(condition.field)
  const value = (condition.value ?? '').trim()
  const value2 = (condition.value2 ?? '').trim()

  switch (condition.operator) {
    case 'isEmpty': return h.notExists(field, existsType(type))
    case 'isNotEmpty': return h.exists(field, existsType(type))
    case 'isTrue': return `${escapedField}:true`
    case 'isFalse': return `${escapedField}:false`

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
        const expression = numericTerm(escapedField, [parsed])
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
        return numbers.includes(null) ? '' : numericTerm(escapedField, numbers as string[])
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

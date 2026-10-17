import { escapeFieldName } from '../utils/escapeFieldName'
import { isIsoDateTimeString } from '../utils/isoDate'
import { useMongocampQueryBuilder } from './useMongocampQueryBuilder'

/** Scalar value accepted by all query helpers. `null` and `undefined` produce an empty (no-op) expression. */
export type QueryValue = string | number | boolean | null | undefined

/**
 * What kind of values a field holds, when you know it. It only selects a shorter query for
 * `exists`/`notExists`: `text` → `field:*`, `number` and `date` → a closed range over every possible value.
 */
export type ExistsFieldType = 'text' | 'number' | 'date'

export interface MongocampQueryHelper {
  /**
   * Matches documents where the field has a value. Without `type` this ORs a text wildcard with a
   * full-range number and a full-range date clause, so it works for any of those types.
   *
   * MongoCamp 1.5 does not understand `_exists_:field` (it matches nothing), and `field:*` only matches text,
   * which is why this is not just a wildcard.
   */
  exists: (fieldName: string, type?: ExistsFieldType) => string
  /**
   * Matches documents where the field is absent: every `exists` clause negated and ANDed (negating the
   * whole group is silently ignored by the server).
   */
  notExists: (fieldName: string, type?: ExistsFieldType) => string
  /** Alias for `notExists`. */
  isEmpty: (fieldName: string, type?: ExistsFieldType) => string
  /** Alias for `exists`. */
  isNotEmpty: (fieldName: string, type?: ExistsFieldType) => string
  /**
   * `field:"value"` — exact match.
   * Returns `''` when value is `null`, `undefined`, or an empty string.
   */
  equals: (fieldName: string, value: QueryValue) => string
  /**
   * `-field:"value"` — excluded match.
   * Returns `''` when value is `null`, `undefined`, or an empty string.
   */
  notEquals: (fieldName: string, value: QueryValue) => string
  /**
   * `field:[from TO to]` — inclusive range.
   *
   * Pass `null` (or `'*'`) for an open end. MongoCamp 1.5 rejects `[x TO *]`, so the open end is replaced by
   * the far bound of the other bound's type: the 64-bit integer limits for numbers, year 0001 / 9999 for
   * dates. Both ends open means "has a value" and returns `exists(field)`. An open end next to a *text*
   * bound can't be expressed and still becomes `*`, which the server rejects.
   *
   * A date without a time is widened to the whole UTC day (`T00:00:00Z` as lower, `T23:59:59.999Z` as
   * upper bound) — the server matches nothing for a bare date. Characters that would break out of the
   * range (brackets, quotes, whitespace…) in a bound are escaped.
   */
  inRange: (fieldName: string, from: QueryValue, to: QueryValue) => string
  /**
   * `-field:[from TO to]` — excluded range. Open ends behave as in `inRange`; with both open it is
   * `notExists(field)`.
   */
  notInRange: (fieldName: string, from: QueryValue, to: QueryValue) => string
  /** Alias for `inRange`. */
  between: (fieldName: string, from: QueryValue, to: QueryValue) => string
  /**
   * `field:*value*` — contains substring (leading and trailing wildcard).
   * Falls back to `field:*` when value is `null` or empty.
   */
  like: (fieldName: string, value: QueryValue) => string
  /** `-field:*value*` — does not contain substring. */
  notLike: (fieldName: string, value: QueryValue) => string
  /**
   * `field:value*` — prefix match.
   * Falls back to `field:*` when value is `null` or empty.
   */
  startsWith: (fieldName: string, value: QueryValue) => string
  /** `-field:value*` — not a prefix match. */
  notStartsWith: (fieldName: string, value: QueryValue) => string
  /**
   * `field:*value` — suffix match (leading wildcard).
   * Falls back to `field:*` when value is `null` or empty.
   */
  endsWith: (fieldName: string, value: QueryValue) => string
  /** `-field:*value` — not a suffix match. */
  notEndsWith: (fieldName: string, value: QueryValue) => string
  /**
   * `field:("v1" OR "v2" ...)` — matches any one of the values (OR semantics).
   * Numbers are left unquoted; strings are quoted and escaped.
   * Returns `''` for an empty array.
   */
  inClause: (fieldName: string, parameter: QueryValue[]) => string
  /**
   * `-field:"v1" AND -field:"v2" ...` — excludes all listed values (AND of negations).
   * Returns `''` for an empty array.
   */
  notInClause: (fieldName: string, parameter: QueryValue[]) => string
  /**
   * `(field:"v1" AND field:"v2" ...)` — all values must match (AND semantics).
   * Returns `''` for an empty array.
   */
  containsAll: (fieldName: string, parameter: QueryValue[]) => string
  /**
   * Joins non-empty parts with `AND`, wrapping the result in `()`.
   * Filters out `null`, `undefined`, and empty-string parts automatically.
   * A single surviving part is returned unwrapped (no outer parens).
   */
  and: (...queryParts: (string | null | undefined)[]) => string
  /**
   * Joins non-empty parts with `OR`, wrapping the result in `()`.
   * Filters out `null`, `undefined`, and empty-string parts automatically.
   * A single surviving part is returned unwrapped (no outer parens).
   */
  or: (...queryParts: (string | null | undefined)[]) => string
}

/**
 * High-level Lucene query helpers for MongoCamp collection filters.
 *
 * All helpers return a Lucene expression string. A return value of `''` means "no filter"
 * and is safe to pass directly to `and`/`or` — they filter it out automatically.
 *
 * @example
 * const h = useMongocampQuery()
 * h.and(
 *   h.or(h.like('name', 'alice'), h.like('email', 'alice')),
 *   h.inClause('role', ['admin', 'user']),
 *   h.between('createdAt', '2024-01-01', null),
 * )
 * // => '((name:*alice* OR email:*alice*) AND role:("admin" OR "user") AND createdAt:[2024-01-01 TO *])'
 */
// Closed ranges that cover every possible value of a type. Checked against a real MongoCamp server, where
// these work (and compose with AND/OR) while `[x TO *]`, `_exists_:f` and `f:*` on numbers/dates do not.
const NUMBER_BOUNDS = { from: '-9223372036854775808', to: '9223372036854775807' }
const DATE_BOUNDS = { from: '0001-01-01T00:00:00Z', to: '9999-12-31T23:59:59.999Z' }

const PLAIN_NUMBER_REGEX = /^-?(?:\d+(?:\.\d+)?|\.\d+)$/
const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/

type BoundKind = 'number' | 'date' | 'other'

function boundKind(value: string): BoundKind {
  if (PLAIN_NUMBER_REGEX.test(value)) return 'number'
  if (isIsoDateTimeString(value)) return 'date'
  return 'other'
}

// null / '' / '*' all mean "open end"
function boundText(value: QueryValue): string | null {
  if (value == null) return null
  const text = value.toString().trim()
  return text === '' || text === '*' ? null : text
}

// Keeps ':' (timestamps) and the sign of a number, escapes what could end the range or start a new clause.
function escapeBound(value: string): string {
  return value.replace(/[\s[\]{}()"\\^~!&|]/g, '\\$&')
}

function widenDate(value: string, edge: 'from' | 'to'): string {
  return DATE_ONLY_REGEX.test(value) ? `${value}${edge === 'from' ? 'T00:00:00Z' : 'T23:59:59.999Z'}` : value
}

function farBound(kind: BoundKind, edge: 'from' | 'to'): string {
  if (kind === 'number') return NUMBER_BOUNDS[edge]
  if (kind === 'date') return DATE_BOUNDS[edge]
  return '*'
}

export function useMongocampQuery(): MongocampQueryHelper {
  const { q } = useMongocampQueryBuilder()

  // every helper that takes a field name goes through here, so names are escaped in one place
  function fieldTerm(fieldName: string, value: string): string {
    return q.field(escapeFieldName(fieldName), value)
  }

  function existsClauses(fieldName: string, type?: ExistsFieldType): string[] {
    const clauses: string[] = []
    if (!type || type === 'text') clauses.push(fieldTerm(fieldName, '*'))
    if (!type || type === 'number') clauses.push(fieldTerm(fieldName, q.range(NUMBER_BOUNDS.from, NUMBER_BOUNDS.to)))
    if (!type || type === 'date') clauses.push(fieldTerm(fieldName, q.range(DATE_BOUNDS.from, DATE_BOUNDS.to)))
    return clauses
  }

  function exists(fieldName: string, type?: ExistsFieldType): string {
    const clauses = existsClauses(fieldName, type)
    return clauses.length === 1 ? clauses[0]! : `(${clauses.join(' OR ')})`
  }

  function notExists(fieldName: string, type?: ExistsFieldType): string {
    const clauses = existsClauses(fieldName, type).map(clause => `-${clause}`)
    return clauses.length === 1 ? clauses[0]! : and(...clauses)
  }

  function isEmpty(fieldName: string, type?: ExistsFieldType): string {
    return notExists(fieldName, type)
  }

  function isNotEmpty(fieldName: string, type?: ExistsFieldType): string {
    return exists(fieldName, type)
  }

  function equals(fieldName: string, value: QueryValue): string {
    if (value == null || value.toString().length === 0) return ''
    return fieldTerm(fieldName, q.terms(value.toString()))
  }

  function notEquals(fieldName: string, value: QueryValue): string {
    const expr = equals(fieldName, value)
    return expr ? `-${expr}` : ''
  }

  function inRange(fieldName: string, from: QueryValue, to: QueryValue): string {
    const lower = boundText(from)
    const upper = boundText(to)
    if (lower === null && upper === null) return exists(fieldName)

    // an open end borrows its type from the bound that was given
    const kind = boundKind((lower ?? upper)!)
    const fromStr = lower === null ? farBound(kind, 'from') : escapeBound(boundKind(lower) === 'date' ? widenDate(lower, 'from') : lower)
    const toStr = upper === null ? farBound(kind, 'to') : escapeBound(boundKind(upper) === 'date' ? widenDate(upper, 'to') : upper)
    return fieldTerm(fieldName, q.range(fromStr, toStr))
  }

  function notInRange(fieldName: string, from: QueryValue, to: QueryValue): string {
    if (boundText(from) === null && boundText(to) === null) return notExists(fieldName)
    return `-${inRange(fieldName, from, to)}`
  }

  function between(fieldName: string, from: QueryValue, to: QueryValue): string {
    return inRange(fieldName, from, to)
  }

  function like(fieldName: string, value: QueryValue): string {
    const term = value != null && value.toString().length !== 0 ? q.phrase(`*${value}*`) : '*'
    return fieldTerm(fieldName, term)
  }

  function notLike(fieldName: string, value: QueryValue): string {
    return `-${like(fieldName, value)}`
  }

  function startsWith(fieldName: string, value: QueryValue): string {
    const term = value != null && value.toString().length !== 0 ? q.phrase(`${value}*`) : '*'
    return fieldTerm(fieldName, term)
  }

  function notStartsWith(fieldName: string, value: QueryValue): string {
    return `-${startsWith(fieldName, value)}`
  }

  function endsWith(fieldName: string, value: QueryValue): string {
    const term = value != null && value.toString().length !== 0 ? q.phrase(`*${value}`) : '*'
    return fieldTerm(fieldName, term)
  }

  function notEndsWith(fieldName: string, value: QueryValue): string {
    return `-${endsWith(fieldName, value)}`
  }

  function toTerms(value: QueryValue): string {
    // Numbers are not quoted so Lucene treats them as numeric, not string tokens
    if (typeof value === 'number') return String(value)
    return q.terms(String(value ?? ''))
  }

  function inClause(fieldName: string, parameter: QueryValue[]): string {
    if (parameter.length === 0) return ''
    const fields = parameter.map(toTerms)
    const inner = fields.length === 1 ? fields[0]! : `(${fields.join(' OR ')})`
    return fieldTerm(fieldName, inner)
  }

  function notInClause(fieldName: string, parameter: QueryValue[]): string {
    if (parameter.length === 0) return ''
    return and(...parameter.map(v => notEquals(fieldName, v)))
  }

  function containsAll(fieldName: string, parameter: QueryValue[]): string {
    if (parameter.length === 0) return ''
    return and(...parameter.map(v => equals(fieldName, v)))
  }

  function logicalOperators(operator: string, queryParts: (string | null | undefined)[]): string {
    const parts = queryParts.filter((x): x is string => x != null && x.length > 0 && x !== '()')
    if (parts.length === 0) return ''
    if (parts.length === 1) return parts[0]!
    // Negated terms (-fieldName:value) must be wrapped in parens when combined
    return '(' + parts.map(x => x.startsWith('-') ? `(${x})` : x).join(` ${operator} `) + ')'
  }

  function and(...queryParts: (string | null | undefined)[]): string {
    return logicalOperators('AND', queryParts)
  }

  function or(...queryParts: (string | null | undefined)[]): string {
    return logicalOperators('OR', queryParts)
  }

  return {
    exists,
    notExists,
    isEmpty,
    isNotEmpty,
    equals,
    notEquals,
    inRange,
    notInRange,
    between,
    like,
    notLike,
    startsWith,
    notStartsWith,
    endsWith,
    notEndsWith,
    inClause,
    notInClause,
    containsAll,
    and,
    or,
  }
}

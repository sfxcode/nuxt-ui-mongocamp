import { useMongocampQueryBuilder } from './useMongocampQueryBuilder'

/** Scalar value accepted by all query helpers. `null` and `undefined` produce an empty (no-op) expression. */
export type QueryValue = string | number | boolean | null | undefined

export interface MongocampQueryHelper {
  /** `_exists_:fieldName` — matches documents where the field exists. */
  exists: (fieldName: string) => string
  /** `-_exists_:fieldName` — matches documents where the field is absent. */
  notExists: (fieldName: string) => string
  /** Alias for `notExists`. */
  isEmpty: (fieldName: string) => string
  /** Alias for `exists`. */
  isNotEmpty: (fieldName: string) => string
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
   * Pass `null` for an open-ended bound: `null` lower → `[* TO to]`, `null` upper → `[from TO *]`.
   */
  inRange: (fieldName: string, from: QueryValue, to: QueryValue) => string
  /**
   * `-field:[from TO to]` — excluded range.
   * Pass `null` for an open-ended bound (same semantics as `inRange`).
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
export function useMongocampQuery(): MongocampQueryHelper {
  const { q } = useMongocampQueryBuilder()

  function exists(fieldName: string): string {
    return q.field('_exists_', q.phrase(fieldName))
  }

  function notExists(fieldName: string): string {
    return `-${exists(fieldName)}`
  }

  function isEmpty(fieldName: string): string {
    return notExists(fieldName)
  }

  function isNotEmpty(fieldName: string): string {
    return exists(fieldName)
  }

  function equals(fieldName: string, value: QueryValue): string {
    if (value == null || value.toString().length === 0) return ''
    return q.field(fieldName, q.terms(value.toString()))
  }

  function notEquals(fieldName: string, value: QueryValue): string {
    const expr = equals(fieldName, value)
    return expr ? `-${expr}` : ''
  }

  function inRange(fieldName: string, from: QueryValue, to: QueryValue): string {
    const fromStr = from != null ? from.toString() : '*'
    const toStr = to != null ? to.toString() : '*'
    return q.field(fieldName, q.range(fromStr, toStr))
  }

  function notInRange(fieldName: string, from: QueryValue, to: QueryValue): string {
    return `-${inRange(fieldName, from, to)}`
  }

  function between(fieldName: string, from: QueryValue, to: QueryValue): string {
    return inRange(fieldName, from, to)
  }

  function like(fieldName: string, value: QueryValue): string {
    const term = value != null && value.toString().length !== 0 ? q.phrase(`*${value}*`) : '*'
    return q.field(fieldName, term)
  }

  function notLike(fieldName: string, value: QueryValue): string {
    return `-${like(fieldName, value)}`
  }

  function startsWith(fieldName: string, value: QueryValue): string {
    const term = value != null && value.toString().length !== 0 ? q.phrase(`${value}*`) : '*'
    return q.field(fieldName, term)
  }

  function notStartsWith(fieldName: string, value: QueryValue): string {
    return `-${startsWith(fieldName, value)}`
  }

  function endsWith(fieldName: string, value: QueryValue): string {
    const term = value != null && value.toString().length !== 0 ? q.phrase(`*${value}`) : '*'
    return q.field(fieldName, term)
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
    return q.field(fieldName, inner)
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

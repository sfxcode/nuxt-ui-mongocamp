const SPECIAL_CHARS = new Set([
  '+', '-', '&', '|', '!', '(', ')', '{', '}',
  '[', ']', '^', '"', '~', ':', '\\', '/', ' ',
])

function escape(value: string, wildcards = false): string {
  return [...value].map((char) => {
    if (SPECIAL_CHARS.has(char)) return `\\${char}`
    if (!wildcards && (char === '*' || char === '?')) return `\\${char}`
    return char
  }).join('')
}

class QueryBuilder {
  private parts: string[]

  constructor(...initial: string[]) {
    this.parts = initial.filter(Boolean)
  }

  field(name: string, value: string): this {
    this.parts.push(`${name}:${value}`)
    return this
  }

  /** No args: insert AND connector. With args: join expressions with AND. */
  and(...exprs: string[]): this {
    if (exprs.length === 0) {
      this.parts.push('AND')
    }
    else {
      this.parts.push(exprs.join(' AND '))
    }
    return this
  }

  /** No args: insert OR connector. With args: join expressions with OR. */
  or(...exprs: string[]): this {
    if (exprs.length === 0) {
      this.parts.push('OR')
    }
    else {
      this.parts.push(exprs.join(' OR '))
    }
    return this
  }

  not(expr: string): this {
    this.parts.push(`NOT ${expr}`)
    return this
  }

  group(inner: string | QueryBuilder): this {
    const str = typeof inner === 'string' ? inner : inner.build()
    this.parts.push(`(${str})`)
    return this
  }

  raw(expr: string): this {
    this.parts.push(expr)
    return this
  }

  build(): string {
    return this.parts.join(' ')
  }

  toString(): string {
    return this.build()
  }
}

export function useMongocampQueryBuilder() {
  /** Exact-match term — value is escaped and quoted. Negative integers are preserved as-is. */
  function terms(value: string): string {
    if (/^-\d+$/.test(value)) return `"${value}"`
    return `"${escape(value)}"`
  }

  /** Phrase / wildcard-aware escape — wildcards * and ? are kept. */
  function phrase(value: string): string {
    return escape(value, true)
  }

  /** Wildcard pattern — * and ? are preserved, everything else is escaped. */
  function wildcard(pattern: string): string {
    return escape(pattern, true)
  }

  /** Fuzzy match. similarity is 0–1; omit for default (~). */
  function fuzzy(term: string, similarity?: number): string {
    return similarity !== undefined ? `${term}~${similarity}` : `${term}~`
  }

  /** Proximity search — matches two words within distance tokens of each other. */
  function proximity(first: string, second: string, distance: number): string {
    return `"${first} ${second}"~${distance}`
  }

  /**
   * Range query. Both bounds default to inclusive ([]).
   * Pass includeLeft/includeRight = false for exclusive ({}) bounds.
   */
  function range(from: string, to: string, includeLeft = true, includeRight = true): string {
    return `${includeLeft ? '[' : '{'}${from} TO ${to}${includeRight ? ']' : '}'}`
  }

  /** Boost a term or expression by factor. */
  function boost(term: string, factor: number): string {
    return `${term}^${factor}`
  }

  /** Required term (+term). */
  function required(term: string): string {
    return `+${term}`
  }

  /** Unary NOT. */
  function not(term: string): string {
    return `NOT ${term}`
  }

  /** Field query: name:value */
  function field(name: string, value: string): string {
    return `${name}:${value}`
  }

  /** Value helpers — produce Lucene syntax strings. */
  const q = { terms, phrase, wildcard, fuzzy, proximity, range, boost, required, not, field }

  /**
   * Factory for a chainable QueryBuilder.
   *
   * @example
   * // Connector style
   * Q().field('name', q.terms('Alice')).and().field('active', q.terms('true')).build()
   * // => 'name:"Alice" AND active:"true"'
   *
   * @example
   * // Joiner style
   * Q().and(q.field('name', q.terms('Alice')), q.field('age', q.range('20', '30'))).build()
   * // => 'name:"Alice" AND age:[20 TO 30]'
   *
   * @example
   * // Nested groups
   * Q()
   *   .field('name', q.terms('Alice'))
   *   .and()
   *   .group(Q().or(q.field('status', q.terms('active')), q.field('status', q.terms('pending'))))
   *   .build()
   * // => 'name:"Alice" AND (status:"active" OR status:"pending")'
   */
  function Q(...initial: string[]): QueryBuilder {
    return new QueryBuilder(...initial)
  }

  return { q, Q }
}

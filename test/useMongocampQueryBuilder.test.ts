import { describe, it, expect } from 'vitest'
import { useMongocampQueryBuilder } from '../src/runtime/composables/useMongocampQueryBuilder'

const { q, Q } = useMongocampQueryBuilder()

describe('q — value helpers', () => {
  describe('terms', () => {
    it('wraps a plain word in quotes', () => {
      expect(q.terms('Alice')).toBe('"Alice"')
    })

    it('escapes special Lucene characters', () => {
      expect(q.terms('hello world')).toBe('"hello\\ world"')
      expect(q.terms('foo:bar')).toBe('"foo\\:bar"')
      expect(q.terms('a+b')).toBe('"a\\+b"')
    })

    it('escapes wildcards inside terms', () => {
      expect(q.terms('foo*')).toBe('"foo\\*"')
      expect(q.terms('foo?')).toBe('"foo\\?"')
    })

    it('preserves negative integers as-is (quoted but unescaped)', () => {
      expect(q.terms('-42')).toBe('"-42"')
    })
  })

  describe('phrase', () => {
    it('escapes special chars but preserves wildcards', () => {
      expect(q.phrase('foo bar')).toBe('foo\\ bar')
      expect(q.phrase('foo*')).toBe('foo*')
      expect(q.phrase('foo?')).toBe('foo?')
    })
  })

  describe('wildcard', () => {
    it('escapes special chars but keeps * and ?', () => {
      expect(q.wildcard('foo*')).toBe('foo*')
      expect(q.wildcard('foo?bar')).toBe('foo?bar')
      expect(q.wildcard('foo*:bar')).toBe('foo*\\:bar')
    })
  })

  describe('fuzzy', () => {
    it('appends ~ without similarity', () => {
      expect(q.fuzzy('roam')).toBe('roam~')
    })

    it('appends ~similarity when provided', () => {
      expect(q.fuzzy('roam', 0.8)).toBe('roam~0.8')
    })
  })

  describe('proximity', () => {
    it('builds proximity expression', () => {
      expect(q.proximity('jakarta', 'apache', 10)).toBe('"jakarta apache"~10')
    })
  })

  describe('range', () => {
    it('defaults to inclusive bounds []', () => {
      expect(q.range('20', '30')).toBe('[20 TO 30]')
    })

    it('exclusive left bound uses {', () => {
      expect(q.range('20', '30', false, true)).toBe('{20 TO 30]')
    })

    it('exclusive right bound uses }', () => {
      expect(q.range('20', '30', true, false)).toBe('[20 TO 30}')
    })

    it('both exclusive uses { }', () => {
      expect(q.range('20', '30', false, false)).toBe('{20 TO 30}')
    })
  })

  describe('boost', () => {
    it('appends ^factor', () => {
      expect(q.boost('jakarta', 2)).toBe('jakarta^2')
    })
  })

  describe('required', () => {
    it('prepends +', () => {
      expect(q.required('term')).toBe('+term')
    })
  })

  describe('not', () => {
    it('prepends NOT', () => {
      expect(q.not('inactive')).toBe('NOT inactive')
    })
  })

  describe('field', () => {
    it('produces name:value', () => {
      expect(q.field('status', q.terms('active'))).toBe('status:"active"')
    })
  })
})

describe('Q — chainable builder', () => {
  describe('field()', () => {
    it('appends a field expression', () => {
      expect(Q().field('name', q.terms('Alice')).build()).toBe('name:"Alice"')
    })
  })

  describe('and()', () => {
    it('connector style — inserts AND token between chained calls', () => {
      const result = Q()
        .field('name', q.terms('Alice'))
        .and()
        .field('active', q.terms('true'))
        .build()
      expect(result).toBe('name:"Alice" AND active:"true"')
    })

    it('joiner style — joins multiple expressions with AND', () => {
      const result = Q()
        .and(q.field('name', q.terms('Alice')), q.field('age', q.range('20', '30')))
        .build()
      expect(result).toBe('name:"Alice" AND age:[20 TO 30]')
    })

    it('single expression joiner appends expression', () => {
      const result = Q().and(q.field('name', q.terms('Alice'))).build()
      expect(result).toBe('name:"Alice"')
    })
  })

  describe('or()', () => {
    it('connector style — inserts OR token between chained calls', () => {
      const result = Q()
        .field('status', q.terms('active'))
        .or()
        .field('status', q.terms('pending'))
        .build()
      expect(result).toBe('status:"active" OR status:"pending"')
    })

    it('joiner style — joins multiple expressions with OR', () => {
      const result = Q()
        .or(q.field('status', q.terms('active')), q.field('status', q.terms('pending')))
        .build()
      expect(result).toBe('status:"active" OR status:"pending"')
    })
  })

  describe('not()', () => {
    it('appends NOT expression', () => {
      const result = Q().field('name', q.terms('Alice')).and().not(q.field('status', q.terms('deleted'))).build()
      expect(result).toBe('name:"Alice" AND NOT status:"deleted"')
    })
  })

  describe('group()', () => {
    it('wraps a string in parentheses', () => {
      const result = Q().group('status:"active" OR status:"pending"').build()
      expect(result).toBe('(status:"active" OR status:"pending")')
    })

    it('accepts a nested QueryBuilder', () => {
      const inner = Q().or(q.field('status', q.terms('active')), q.field('status', q.terms('pending')))
      const result = Q().field('name', q.terms('Alice')).and().group(inner).build()
      expect(result).toBe('name:"Alice" AND (status:"active" OR status:"pending")')
    })
  })

  describe('raw()', () => {
    it('appends a raw expression unchanged', () => {
      const result = Q().raw('_id:*').build()
      expect(result).toBe('_id:*')
    })
  })

  describe('toString()', () => {
    it('is an alias for build()', () => {
      const qb = Q().field('name', q.terms('Alice'))
      expect(qb.toString()).toBe(qb.build())
    })
  })

  describe('constructor seed values', () => {
    it('accepts initial expressions', () => {
      const result = Q(q.field('name', q.terms('Alice'))).and().field('age', q.range('20', '30')).build()
      expect(result).toBe('name:"Alice" AND age:[20 TO 30]')
    })
  })
})

describe('combined examples', () => {
  it('multi-field AND with nested OR group', () => {
    const result = Q()
      .field('name', q.terms('Alice'))
      .and()
      .group(
        Q().or(
          q.field('status', q.terms('active')),
          q.field('status', q.terms('pending')),
        ),
      )
      .build()
    expect(result).toBe('name:"Alice" AND (status:"active" OR status:"pending")')
  })

  it('fuzzy field with boost', () => {
    const result = Q()
      .field('name', q.boost(q.fuzzy('Alice', 0.8), 2))
      .build()
    expect(result).toBe('name:Alice~0.8^2')
  })

  it('date range query', () => {
    const result = Q()
      .field('createdAt', q.range('2024-01-01', '2024-12-31'))
      .build()
    expect(result).toBe('createdAt:[2024-01-01 TO 2024-12-31]')
  })

  it('required term combined with NOT', () => {
    const result = Q()
      .raw(q.required(q.field('role', q.terms('admin'))))
      .and()
      .not(q.field('status', q.terms('deleted')))
      .build()
    expect(result).toBe('+role:"admin" AND NOT status:"deleted"')
  })
})

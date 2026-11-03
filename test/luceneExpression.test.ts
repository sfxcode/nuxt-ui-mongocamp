import { describe, it, expect } from 'vitest'
import { parseLuceneExpression, UnsupportedExpressionError } from '../src/runtime/utils/luceneExpression'

describe('parseLuceneExpression', () => {
  it('returns null for an empty expression', () => {
    expect(parseLuceneExpression('')).toBeNull()
    expect(parseLuceneExpression('  ')).toBeNull()
    expect(parseLuceneExpression('()')).toBeNull()
  })

  it('reads single clauses, including ones with their own parentheses, ranges and quotes', () => {
    expect(parseLuceneExpression('a:1')).toEqual({ kind: 'clause', text: 'a:1' })
    expect(parseLuceneExpression('-a:1')).toEqual({ kind: 'clause', text: '-a:1' })
    expect(parseLuceneExpression('role:("admin" OR "user")')).toEqual({ kind: 'clause', text: 'role:("admin" OR "user")' })
    expect(parseLuceneExpression('n:[1 TO 3]')).toEqual({ kind: 'clause', text: 'n:[1 TO 3]' })
    expect(parseLuceneExpression('s:"a AND b"')).toEqual({ kind: 'clause', text: 's:"a AND b"' })
    expect(parseLuceneExpression('s:a\\ AND\\ b')).toEqual({ kind: 'clause', text: 's:a\\ AND\\ b' })
  })

  it('reads AND and OR groups, with or without outer parentheses', () => {
    expect(parseLuceneExpression('(a:1 AND b:2)')).toEqual({ kind: 'and', parts: [{ kind: 'clause', text: 'a:1' }, { kind: 'clause', text: 'b:2' }] })
    expect(parseLuceneExpression('a:1 OR b:2')).toEqual({ kind: 'or', parts: [{ kind: 'clause', text: 'a:1' }, { kind: 'clause', text: 'b:2' }] })
  })

  it('reads nested groups and parenthesised single clauses', () => {
    expect(parseLuceneExpression('(a:1 AND (b:2 OR (-c:3)))')).toEqual({
      kind: 'and',
      parts: [{ kind: 'clause', text: 'a:1' }, { kind: 'or', parts: [{ kind: 'clause', text: 'b:2' }, { kind: 'clause', text: '-c:3' }] }],
    })
    expect(parseLuceneExpression('(a:1) AND (b:2)')).toEqual({ kind: 'and', parts: [{ kind: 'clause', text: 'a:1' }, { kind: 'clause', text: 'b:2' }] })
  })

  it('reads a negated group', () => {
    expect(parseLuceneExpression('-(a:1 AND b:2)')).toEqual({
      kind: 'not',
      node: { kind: 'and', parts: [{ kind: 'clause', text: 'a:1' }, { kind: 'clause', text: 'b:2' }] },
    })
    expect(parseLuceneExpression('-(a:1)')).toEqual({ kind: 'not', node: { kind: 'clause', text: 'a:1' } })
  })

  it('throws for what it cannot read instead of guessing', () => {
    expect(() => parseLuceneExpression('NOT (a:1 AND b:2)')).toThrow(UnsupportedExpressionError)
    expect(() => parseLuceneExpression('a:1 AND b:2 OR c:3')).toThrow('AND and OR mixed')
    expect(() => parseLuceneExpression('(a:1 AND b:2')).toThrow('unbalanced')
  })
})
